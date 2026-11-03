import { LAWS, LAW_NAMES, RESTART_NAMES, ROLE_STATS, RULES } from './config';
import { formationPieces } from './formations';
import {
  NEIGHBOURS,
  cellName,
  dist,
  goalTargets,
  inOwnBox,
  key,
  line,
  onBoard,
  opponent,
  progress,
  sameCell,
} from './geometry';
import type {
  Action,
  Cell,
  EventKind,
  GameEvent,
  GameState,
  MatchSetup,
  Piece,
  Restart,
  RestartType,
  Side,
} from './types';

/**
 * SYNOCHÍ rules engine.
 *
 * Fully deterministic: nothing in a match is random, so the same setup and the
 * same list of actions always produce the same result. A server can therefore
 * replay a match's action log to verify the score before granting rewards.
 * States are treated as immutable: every action returns a new state.
 *
 * Two rule modes:
 *  - quick: simplified casual rules (no offside, the ball never goes out).
 *  - laws:  follows the Laws of the Game where a board allows: offside (Law 11),
 *           ball out of play (Law 9), throw-ins (15), goal kicks (16), corners (17),
 *           indirect free kicks (13), and keepers who may leave the box but only
 *           handle inside it (12).
 */

export class IllegalActionError extends Error {}

export const TEAM_NAMES: Record<Side, string> = { home: 'Blue', away: 'Red' };

// ---------------------------------------------------------------- helpers

export function cloneState(s: GameState): GameState {
  return {
    ...s,
    pieces: s.pieces.map((p) => ({ ...p, pos: { ...p.pos } })),
    ball: { pos: { ...s.ball.pos }, carrier: s.ball.carrier },
    score: { ...s.score },
    formations: { ...s.formations },
    restart: s.restart ? { ...s.restart, spot: { ...s.restart.spot } } : null,
    offsideWatch: s.offsideWatch ? { side: s.offsideWatch.side, ids: s.offsideWatch.ids.slice() } : null,
    events: s.events.slice(),
  };
}

export const getPiece = (s: GameState, id: string) => s.pieces.find((p) => p.id === id);

export function pieceAt(s: GameState, c: Cell): Piece | undefined {
  for (const p of s.pieces) if (p.pos.c === c.c && p.pos.r === c.r) return p;
  return undefined;
}

export const carrierOf = (s: GameState) => (s.ball.carrier ? getPiece(s, s.ball.carrier) : undefined);

export const pieceLabel = (p: Piece) => `${TEAM_NAMES[p.side]} ${p.role}`;

export const stats = (p: Piece) => ROLE_STATS[p.role];

const lawsMode = (s: GameState) => s.mode === 'laws';

export function overallTurn(s: GameState) {
  return (s.half - 1) * RULES.turnsPerHalf + s.turnsPlayed + 1;
}

/** Match clock in minutes, for display. */
export function matchMinute(s: GameState) {
  if (s.phase === 'finished') return 90;
  return Math.round(((s.half - 1) * RULES.turnsPerHalf + s.turnsPlayed) * (45 / RULES.turnsPerHalf));
}

function log(s: GameState, kind: EventKind, side: Side, text: string, law?: string) {
  const e: GameEvent = { kind, side, text, turn: overallTurn(s), half: s.half };
  if (law) e.law = law;
  s.events.push(e);
}

function resetFlags(s: GameState) {
  for (const p of s.pieces) {
    p.moved = false;
    p.tackled = false;
  }
}

// ---------------------------------------------------------------- setup

export function createMatch(setup: MatchSetup): GameState {
  const first = setup.firstKickoff ?? 'home';
  const s: GameState = {
    mode: setup.mode ?? 'quick',
    restart: null,
    offsideWatch: null,
    pieces: [],
    ball: { pos: { c: 7, r: 11 }, carrier: null },
    turn: first,
    actionsLeft: RULES.actionsPerTurn,
    turnsPlayed: 0,
    half: 1,
    score: { home: 0, away: 0 },
    phase: 'playing',
    formations: { home: setup.homeFormation, away: setup.awayFormation },
    firstKickoff: first,
    events: [],
  };
  kickoff(s, first);
  return s;
}

/** Reset both teams to their formations and give the ball to `side` at the centre spot. */
function kickoff(s: GameState, side: Side) {
  s.pieces = [...formationPieces('home', s.formations.home), ...formationPieces('away', s.formations.away)];
  const own = s.pieces.filter((p) => p.side === side);
  const taker =
    own.find((p) => p.role === 'FW') ??
    own.reduce((a, b) => (progress(side, b.pos.r) > progress(side, a.pos.r) ? b : a));
  taker.pos = side === 'home' ? { c: 7, r: 11 } : { c: 8, r: 12 };
  s.ball = { pos: { ...taker.pos }, carrier: taker.id };
  s.turn = side;
  s.actionsLeft = RULES.actionsPerTurn;
  s.restart = null;
  s.offsideWatch = null;
  log(s, 'kickoff', side, `${TEAM_NAMES[side]} kick off`, lawsMode(s) ? LAW_NAMES.start : undefined);
}

// ---------------------------------------------------------------- Laws: offside, out of play, restarts

/** True for the ring of cells just outside the pitch where a pass leaves play (not the goal mouth). */
export function isOutCell(c: Cell): boolean {
  const touchline = (c.c === -1 || c.c === RULES.cols) && c.r >= 0 && c.r < RULES.rows;
  const goalLine =
    (c.r === -1 || c.r === RULES.rows) &&
    c.c >= 0 &&
    c.c < RULES.cols &&
    (c.c < RULES.goalCols[0] || c.c > RULES.goalCols[1]);
  return touchline || goalLine;
}

/**
 * The offside line for `attacking`, as a progress value (rows advanced toward the
 * opponent's goal). An attacker is in an offside position when its progress is
 * greater than this: nearer the goal line than both the ball and the second-last
 * opponent, and in the opponent's half. Level counts as onside.
 */
export function offsideLine(s: GameState, attacking: Side): number {
  const defenders = s.pieces
    .filter((q) => q.side !== attacking)
    .map((q) => progress(attacking, q.pos.r))
    .sort((a, b) => b - a);
  const secondLast = defenders.length >= 2 ? defenders[1] : RULES.rows - 1;
  const halfway = RULES.rows / 2 - 1; // must be in the opponent's half
  return Math.max(secondLast, progress(attacking, s.ball.pos.r), halfway);
}

/** Teammates of the passer standing in an offside position right now. */
export function offsidePositions(s: GameState, passer: Piece): Piece[] {
  const lineP = offsideLine(s, passer.side);
  return s.pieces.filter((q) => q.side === passer.side && q.id !== passer.id && progress(passer.side, q.pos.r) > lineP);
}

/** Which restart the Laws give when the ball leaves the pitch at `out`, last touched by `lastTouch`. */
export function restartForOut(lastTouch: Side, out: Cell): { type: RestartType; side: Side; spot: Cell } {
  const other = opponent(lastTouch);
  if (out.c < 0 || out.c >= RULES.cols)
    return { type: 'throwIn', side: other, spot: { c: out.c < 0 ? 0 : RULES.cols - 1, r: Math.min(Math.max(out.r, 0), RULES.rows - 1) } };
  const lineOwner: Side = out.r < 0 ? 'home' : 'away'; // home defends row 1
  const goalRow = out.r < 0 ? 0 : RULES.rows - 1;
  if (lineOwner === lastTouch) return { type: 'corner', side: other, spot: { c: out.c < RULES.cols / 2 ? 0 : RULES.cols - 1, r: goalRow } };
  return { type: 'goalKick', side: lineOwner, spot: { c: lineOwner === 'home' ? 7 : 8, r: goalRow } };
}

/** Cells the defending side may not occupy while a restart is pending. */
export function restartForbidden(rs: Restart, c: Cell): boolean {
  switch (rs.type) {
    case 'throwIn':
      return sameCell(c, rs.spot);
    case 'goalKick':
      return inOwnBox(rs.side, c);
    default:
      return dist(c, rs.spot) < LAWS.restartDistance;
  }
}

function nearestFree(s: GameState, from: Cell, ok: (c: Cell) => boolean): Cell {
  const seen = new Set<number>([key(from)]);
  let frontier: Cell[] = [from];
  while (frontier.length) {
    const next: Cell[] = [];
    for (const cur of frontier)
      for (const [dc, dr] of NEIGHBOURS) {
        const n = { c: cur.c + dc, r: cur.r + dr };
        if (!onBoard(n)) continue;
        const k = key(n);
        if (seen.has(k)) continue;
        seen.add(k);
        if (!pieceAt(s, n) && ok(n)) return n;
        next.push(n);
      }
    frontier = next;
  }
  return from;
}

function awardRestart(s: GameState, type: RestartType, side: Side, spot: Cell) {
  const own = s.pieces.filter((p) => p.side === side);
  const outfield = own.filter((p) => p.role !== 'GK');
  const closest = (list: Piece[]) => list.reduce((a, b) => (dist(b.pos, spot) < dist(a.pos, spot) ? b : a));
  const taker = type === 'goalKick' ? own.find((p) => p.role === 'GK') ?? closest(own) : closest(outfield.length ? outfield : own);
  const rs: Restart = { type, side, spot: { ...spot }, takerId: taker.id };

  const occupant = pieceAt(s, spot);
  if (occupant && occupant.id !== taker.id)
    occupant.pos = nearestFree(s, spot, (c) => occupant.side === side || !restartForbidden(rs, c));
  taker.pos = { ...spot };
  s.ball = { pos: { ...spot }, carrier: taker.id };
  s.restart = rs;
  s.offsideWatch = null;
  log(s, 'restart', side, `${RESTART_NAMES[type]} to ${TEAM_NAMES[side]} at ${cellName(spot)}, taken by ${taker.role}`, LAW_NAMES[type]);

  const retreated: string[] = [];
  for (const q of s.pieces) {
    if (q.side === side || !restartForbidden(rs, q.pos)) continue;
    q.pos = nearestFree(s, q.pos, (c) => !restartForbidden(rs, c));
    retreated.push(q.role);
  }
  if (retreated.length) {
    const where =
      type === 'goalKick' ? 'outside the penalty area' : type === 'throwIn' ? 'off the throw-in spot' : `${LAWS.restartDistance} squares (9.15 m) away`;
    log(s, 'encroach', opponent(side), `${TEAM_NAMES[opponent(side)]} ${retreated.join(', ')} must stand ${where}`, LAW_NAMES[type]);
  }
}

function offsideOffence(s: GameState, offender: Piece) {
  log(
    s,
    'offside',
    offender.side,
    `Offside! ${pieceLabel(offender)} was beyond the second-last defender when the pass was played`,
    LAW_NAMES.offside,
  );
  awardRestart(s, 'indirectFreeKick', opponent(offender.side), { ...offender.pos });
}

// ---------------------------------------------------------------- movement

function reachable(s: GameState, p: Piece, carrying: boolean): Cell[] {
  const st = stats(p);
  const range = carrying ? Math.max(1, st.move - RULES.dribblePenalty) : st.move;
  const blocked = new Set<number>();
  for (const q of s.pieces) if (q.id !== p.id) blocked.add(key(q.pos));
  const looseBall = s.ball.carrier === null ? key(s.ball.pos) : -1;
  const rs = s.restart && s.restart.side !== p.side ? s.restart : null;
  const boxOnly = p.role === 'GK' && !lawsMode(s);

  const seen = new Set<number>([key(p.pos)]);
  const out: Cell[] = [];
  let frontier: Cell[] = [p.pos];
  for (let step = 0; step < range; step++) {
    const next: Cell[] = [];
    for (const cur of frontier) {
      for (const [dc, dr] of NEIGHBOURS) {
        const n = { c: cur.c + dc, r: cur.r + dr };
        if (!onBoard(n)) continue;
        const k = key(n);
        if (seen.has(k) || blocked.has(k)) continue;
        if (boxOnly && !inOwnBox(p.side, n)) continue;
        seen.add(k);
        // Defenders keep their distance from a pending restart.
        if (!rs || !restartForbidden(rs, n)) out.push(n);
        // A piece that reaches a loose ball stops there and collects it.
        if (k !== looseBall) next.push(n);
      }
    }
    frontier = next;
  }
  return out;
}

/** Cells the piece may move to this turn. */
export function moveTargets(s: GameState, pieceId: string): Cell[] {
  const p = getPiece(s, pieceId);
  if (!p || p.moved || p.side !== s.turn || s.phase !== 'playing') return [];
  if (s.restart && s.restart.side === p.side) {
    // The taker stays on the spot, and one action is always kept for the restart.
    if (p.id === s.restart.takerId || s.actionsLeft <= 1) return [];
  }
  return reachable(s, p, s.ball.carrier === p.id);
}

// ---------------------------------------------------------------- validation

export function validateAction(s: GameState, a: Action): string | null {
  if (s.phase !== 'playing') return 'The match is over';
  const rs = s.restart;
  if (a.type === 'endTurn') {
    if (rs && rs.side === s.turn) return `Take the ${RESTART_NAMES[rs.type].toLowerCase()} first`;
    return null;
  }
  const p = getPiece(s, a.pieceId);
  if (!p) return 'Unknown piece';
  if (p.side !== s.turn) return 'Not your turn';
  const st = stats(p);
  const hasBall = s.ball.carrier === p.id;

  switch (a.type) {
    case 'move': {
      if (p.moved) return 'This piece has already moved this turn';
      if (rs && rs.side === p.side && rs.takerId === p.id) return `Take the ${RESTART_NAMES[rs.type].toLowerCase()} first`;
      if (!onBoard(a.to)) return 'Off the board';
      return moveTargets(s, p.id).some((c) => sameCell(c, a.to)) ? null : 'Cannot reach that cell';
    }
    case 'pass': {
      if (!hasBall) return 'Only the ball carrier can pass';
      if (sameCell(a.to, p.pos)) return 'Invalid pass target';
      const out = !onBoard(a.to);
      if (out && !(lawsMode(s) && isOutCell(a.to))) return 'Invalid pass target';
      let range = st.pass;
      if (rs?.type === 'throwIn') range = Math.min(range, LAWS.throwInRange);
      if (dist(p.pos, a.to) > range) return 'Out of passing range';
      const occ = out ? undefined : pieceAt(s, a.to);
      if (occ && occ.side !== p.side) return 'Cannot pass to an opponent';
      return null;
    }
    case 'shoot': {
      if (!hasBall) return 'Only the ball carrier can shoot';
      if (rs?.type === 'throwIn') return 'You cannot score directly from a throw-in (Law 15)';
      if (rs?.type === 'indirectFreeKick') return 'An indirect free kick must touch another player before a goal can count (Law 13)';
      if (!goalTargets(p.side).some((c) => sameCell(c, a.target))) return 'Aim at the goal mouth';
      if (dist(p.pos, a.target) > RULES.maxShotDistance) return 'Too far to shoot';
      return null;
    }
    case 'tackle': {
      if (rs) return 'The ball is out of play until the restart is taken';
      if (p.tackled) return 'This piece has already tackled this turn';
      const t = getPiece(s, a.targetId);
      if (!t || t.side === p.side) return 'Tackle an opponent';
      if (s.ball.carrier !== t.id) return 'You can only tackle the ball carrier';
      if (dist(p.pos, t.pos) !== 1) return 'Tackler must be next to the ball carrier';
      return null;
    }
    case 'oneTwo': {
      if (rs) return `Take the ${RESTART_NAMES[rs.type].toLowerCase()} first`;
      if (s.actionsLeft < RULES.oneTwoCost) return `A one-two needs ${RULES.oneTwoCost} actions`;
      if (!hasBall) return 'Only the ball carrier can start a one-two';
      if (p.moved) return 'This piece has already moved this turn';
      const via = getPiece(s, a.viaId);
      if (!via || via.side !== p.side || via.id === p.id) return 'Choose a teammate for the one-two';
      if (dist(p.pos, via.pos) > Math.min(st.pass, RULES.groundPassMax)) return 'Teammate too far for a one-two';
      if (!reachable(s, p, false).some((c) => sameCell(c, a.to))) return 'Cannot run to that cell';
      if (dist(via.pos, a.to) > Math.min(stats(via).pass, RULES.groundPassMax)) return 'Return pass too long';
      return null;
    }
  }
}

// ---------------------------------------------------------------- resolution

function giveBall(s: GameState, p: Piece) {
  s.ball = { pos: { ...p.pos }, carrier: p.id };
  s.offsideWatch = null;
}

type PassResult = 'ok' | 'lost' | 'stopped';

/** Resolve a pass. 'lost' = the opponent won it; 'stopped' = play stopped for a restart. */
function doPass(s: GameState, from: Piece, to: Cell, quiet = false): PassResult {
  const rs = s.restart;
  // No offside from a throw-in, goal kick or corner (Law 11).
  const exempt = !!rs && rs.type !== 'indirectFreeKick';
  s.restart = null;
  const offside = lawsMode(s) && !exempt ? offsidePositions(s, from) : [];
  s.offsideWatch = null;

  const out = !onBoard(to);
  const lofted = dist(from.pos, to) > RULES.groundPassMax;
  const receiver = out ? undefined : pieceAt(s, to);
  if (!lofted) {
    const path = line(from.pos, to);
    for (let i = 0; i < path.length - 1; i++) {
      const q = pieceAt(s, path[i]);
      if (q && q.side !== from.side) {
        giveBall(s, q);
        log(s, 'intercept', q.side, `${pieceLabel(q)} intercepts the pass at ${cellName(q.pos)}`);
        return 'lost';
      }
    }
  } else if (!out) {
    const control = receiver ? stats(receiver).control : RULES.spaceControl;
    let best: Piece | undefined;
    for (const q of s.pieces) {
      if (q.side === from.side || dist(q.pos, to) > 1) continue;
      if (!best || stats(q).tackle > stats(best).tackle) best = q;
    }
    if (best && stats(best).tackle > control) {
      giveBall(s, best);
      log(s, 'intercept', best.side, `${pieceLabel(best)} wins the lofted ball at ${cellName(to)}`);
      return 'lost';
    }
  }

  if (out) {
    const overTouch = to.c < 0 || to.c >= RULES.cols;
    log(s, 'out', from.side, `Out of play: ${pieceLabel(from)} plays the ball over the ${overTouch ? 'touchline' : 'goal line'}`, LAW_NAMES.out);
    const r = restartForOut(from.side, to);
    awardRestart(s, r.type, r.side, r.spot);
    return 'stopped';
  }

  if (receiver && offside.some((o) => o.id === receiver.id)) {
    offsideOffence(s, receiver);
    return 'stopped';
  }

  s.ball = { pos: { ...to }, carrier: receiver ? receiver.id : null };
  if (!receiver && offside.length) s.offsideWatch = { side: from.side, ids: offside.map((o) => o.id) };
  if (!quiet) {
    const kind = rs ? RESTART_NAMES[rs.type] : lofted ? 'Lofted pass' : 'Pass';
    if (receiver) log(s, 'pass', from.side, `${kind}: ${from.role} → ${receiver.role} at ${cellName(to)}`, rs ? LAW_NAMES[rs.type] : undefined);
    else log(s, 'loosePass', from.side, `${kind} into space at ${cellName(to)}`, rs ? LAW_NAMES[rs.type] : undefined);
  }
  return 'ok';
}

export type ShotOutcome = 'goal' | 'save' | 'block' | 'parry' | 'deflect';

/** Work out a shot's result without changing the state. */
export function shotOutcome(s: GameState, shooter: Piece, target: Cell): { outcome: ShotOutcome; by?: Piece } {
  const opp = opponent(shooter.side);
  const laws = lawsMode(s);
  const path = line(shooter.pos, target).filter(onBoard);
  const power = stats(shooter).shot - Math.floor((dist(shooter.pos, target) - 1) / RULES.shotFalloff);
  const gk = s.pieces.find((q) => q.side === opp && q.role === 'GK');
  // Laws: a keeper outside their own penalty area may not handle, so plays like an outfield player.
  const keeperCanHandle = !!gk && (!laws || inOwnBox(opp, gk.pos));
  for (const c of path) {
    const q = pieceAt(s, c);
    if (!q || q.side !== opp) continue;
    if (q.role === 'GK' && keeperCanHandle) continue;
    // Laws: a hard shot deflects off the blocker and out for a corner.
    if (laws && power > stats(q).tackle) return { outcome: 'deflect', by: q };
    return { outcome: 'block', by: q };
  }
  if (gk && keeperCanHandle) {
    const gd = dist(gk.pos, target);
    const onPath = path.some((c) => sameCell(c, gk.pos));
    if (onPath || gd <= RULES.keeperReach) {
      const save = (stats(gk).save ?? 0) - Math.max(0, gd - 1) + (onPath ? 1 : 0);
      if (power < save || (power === save && !laws)) return { outcome: 'save', by: gk };
      if (power === save) return { outcome: 'parry', by: gk };
    }
  }
  return { outcome: 'goal' };
}

/** Strength of a tackle vs. the carrier's resistance, with adjacent teammates adding support. */
export function tackleOdds(s: GameState, tackler: Piece, carrier: Piece) {
  let attack = stats(tackler).tackle;
  let defend = stats(carrier).control;
  for (const q of s.pieces) {
    if (q.id === tackler.id || q.id === carrier.id || dist(q.pos, carrier.pos) !== 1) continue;
    if (q.side === tackler.side) attack++;
    else defend++;
  }
  return { attack, defend, wins: attack > defend };
}

function endTurn(s: GameState, kickoffFor?: Side) {
  s.turnsPlayed++;
  if (s.turnsPlayed >= RULES.turnsPerHalf) {
    if (s.half === 1) {
      s.half = 2;
      s.turnsPlayed = 0;
      log(s, 'halftime', s.turn, `Half-time: ${TEAM_NAMES.home} ${s.score.home} – ${s.score.away} ${TEAM_NAMES.away}`);
      kickoff(s, opponent(s.firstKickoff));
    } else {
      s.phase = 'finished';
      s.restart = null;
      resetFlags(s);
      log(s, 'fulltime', s.turn, `Full-time: ${TEAM_NAMES.home} ${s.score.home} – ${s.score.away} ${TEAM_NAMES.away}`);
    }
    return;
  }
  if (kickoffFor) {
    kickoff(s, kickoffFor);
    return;
  }
  s.turn = opponent(s.turn);
  s.actionsLeft = RULES.actionsPerTurn;
  resetFlags(s);
}

function spend(s: GameState, n: number) {
  s.actionsLeft -= n;
  if (s.actionsLeft <= 0 && s.phase === 'playing') endTurn(s);
}

/** Apply an action that is already known to be legal. */
export function resolveAction(prev: GameState, a: Action): GameState {
  const s = cloneState(prev);
  if (a.type === 'endTurn') {
    log(s, 'endTurn', s.turn, `${TEAM_NAMES[s.turn]} end their turn`);
    endTurn(s);
    return s;
  }
  const p = getPiece(s, a.pieceId)!;

  switch (a.type) {
    case 'move': {
      const carrying = s.ball.carrier === p.id;
      const from = cellName(p.pos);
      p.pos = { ...a.to };
      p.moved = true;
      if (carrying) {
        s.ball.pos = { ...a.to };
        log(s, 'dribble', p.side, `${pieceLabel(p)} dribbles ${from} → ${cellName(a.to)}`);
      } else if (s.ball.carrier === null && sameCell(s.ball.pos, a.to)) {
        const watch = s.offsideWatch;
        s.offsideWatch = null;
        if (watch && watch.side === p.side && watch.ids.includes(p.id)) {
          offsideOffence(s, p);
          endTurn(s);
          return s;
        }
        giveBall(s, p);
        log(s, 'pickup', p.side, `${pieceLabel(p)} collects the ball at ${cellName(a.to)}`);
      } else {
        log(s, 'move', p.side, `${pieceLabel(p)} moves ${from} → ${cellName(a.to)}`);
      }
      spend(s, 1);
      return s;
    }
    case 'pass': {
      if (doPass(s, p, a.to) === 'ok') spend(s, 1);
      else endTurn(s);
      return s;
    }
    case 'shoot': {
      const fromRestart = s.restart;
      s.restart = null;
      s.offsideWatch = null;
      const { outcome, by } = shotOutcome(s, p, a.target);
      if (outcome === 'goal') {
        s.score[p.side]++;
        log(
          s,
          'goal',
          p.side,
          `GOAL! ${pieceLabel(p)} scores ${fromRestart ? `direct from a ${RESTART_NAMES[fromRestart.type].toLowerCase()}` : `from ${cellName(p.pos)}`} (${TEAM_NAMES.home} ${s.score.home} – ${s.score.away} ${TEAM_NAMES.away})`,
          lawsMode(s) ? LAW_NAMES.goal : undefined,
        );
        endTurn(s, opponent(p.side));
      } else if (outcome === 'parry' || outcome === 'deflect') {
        log(
          s,
          outcome,
          by!.side,
          outcome === 'parry'
            ? `Parried! ${pieceLabel(by!)} pushes ${p.role}'s shot behind`
            : `Deflected! ${p.role}'s shot comes off ${pieceLabel(by!)} and goes behind`,
          LAW_NAMES.out,
        );
        awardRestart(s, 'corner', p.side, { c: a.target.c < RULES.cols / 2 ? 0 : RULES.cols - 1, r: a.target.r < 0 ? 0 : RULES.rows - 1 });
        endTurn(s);
      } else {
        giveBall(s, by!);
        log(
          s,
          outcome,
          by!.side,
          outcome === 'save'
            ? `Saved! ${pieceLabel(by!)} holds ${p.role}'s shot`
            : `Blocked! ${pieceLabel(by!)} blocks ${p.role}'s shot at ${cellName(by!.pos)}`,
        );
        endTurn(s);
      }
      return s;
    }
    case 'tackle': {
      const t = getPiece(s, a.targetId)!;
      const odds = tackleOdds(s, p, t);
      p.tackled = true;
      if (odds.wins) {
        giveBall(s, p);
        log(s, 'tackleWon', p.side, `${pieceLabel(p)} wins the ball from ${t.role} (${odds.attack} v ${odds.defend})`);
      } else {
        log(s, 'tackleFailed', t.side, `${pieceLabel(t)} holds off ${p.role}'s tackle (${odds.attack} v ${odds.defend})`);
      }
      spend(s, 1);
      return s;
    }
    case 'oneTwo': {
      const via = getPiece(s, a.viaId)!;
      if (doPass(s, p, via.pos, true) !== 'ok') {
        endTurn(s);
        return s;
      }
      p.pos = { ...a.to };
      p.moved = true;
      if (doPass(s, via, a.to, true) !== 'ok') {
        endTurn(s);
        return s;
      }
      log(s, 'oneTwo', p.side, `One-two: ${p.role} plays it to ${via.role} and collects at ${cellName(a.to)}`);
      spend(s, RULES.oneTwoCost);
      return s;
    }
  }
}

/** Validate and apply an action. Throws IllegalActionError when the action is not allowed. */
export function applyAction(s: GameState, a: Action): GameState {
  const err = validateAction(s, a);
  if (err) throw new IllegalActionError(err);
  return resolveAction(s, a);
}

/** The events an action would produce, without committing it. */
export function previewAction(s: GameState, a: Action): GameEvent[] {
  if (validateAction(s, a)) return [];
  return resolveAction(s, a).events.slice(s.events.length);
}

/** Rebuild a match from its setup and action log. Used by the server to verify results. */
export function replay(setup: MatchSetup, actions: Action[]): GameState {
  let s = createMatch(setup);
  for (const a of actions) s = applyAction(s, a);
  return s;
}

// ---------------------------------------------------------------- target lists (UI + CPU)

export function passTargets(s: GameState, pieceId: string): Cell[] {
  const p = getPiece(s, pieceId);
  if (!p || s.ball.carrier !== p.id || p.side !== s.turn) return [];
  const range = stats(p).pass;
  const out: Cell[] = [];
  for (let r = p.pos.r - range; r <= p.pos.r + range; r++)
    for (let c = p.pos.c - range; c <= p.pos.c + range; c++) {
      const cell = { c, r };
      if (!validateAction(s, { type: 'pass', pieceId, to: cell })) out.push(cell);
    }
  return out;
}

export function shotTargets(s: GameState, pieceId: string): Cell[] {
  const p = getPiece(s, pieceId);
  if (!p) return [];
  return goalTargets(p.side).filter((t) => !validateAction(s, { type: 'shoot', pieceId, target: t }));
}

export function tackleTargets(s: GameState, pieceId: string): Piece[] {
  const c = carrierOf(s);
  if (!c || validateAction(s, { type: 'tackle', pieceId, targetId: c.id })) return [];
  return [c];
}

export function oneTwoPartners(s: GameState, pieceId: string): Piece[] {
  const p = getPiece(s, pieceId);
  if (!p || s.restart || s.ball.carrier !== p.id || p.moved || s.actionsLeft < RULES.oneTwoCost) return [];
  return s.pieces.filter(
    (q) => q.side === p.side && q.id !== p.id && dist(p.pos, q.pos) <= Math.min(stats(p).pass, RULES.groundPassMax),
  );
}

export function oneTwoTargets(s: GameState, pieceId: string, viaId: string): Cell[] {
  const p = getPiece(s, pieceId);
  if (!p) return [];
  return reachable(s, p, false).filter((to) => !validateAction(s, { type: 'oneTwo', pieceId, viaId, to }));
}
