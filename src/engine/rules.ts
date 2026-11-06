/**
 * SYNOCHÍ official rules engine.
 *
 * Implements "SYNOCHÍ Official Game Rules — Extraction Draft" (3 Nov 2026),
 * which describes David André's Replit build, as amended by David's answers to
 * the Rules & Launch Questionnaire (6 Nov 2026). Section numbers ("rule 5.2")
 * refer to the extraction draft; "Q" numbers to the questionnaire. Remaining
 * interpretations are tagged INTERPRETATION and listed in
 * docs/OFFICIAL_RULES_IMPLEMENTATION.md.
 *
 * The engine is deterministic: the same setup and action log (including clock
 * ticks) always gives the same match, so a server can replay and verify results.
 */
import {
  COLS,
  DIRECTIONS,
  HALF_MS,
  INNER_GOAL_COLS,
  KICKOFF_SPOT,
  ROWS,
  TURN_MS,
  adjacent,
  attackGoalRow,
  canShootFrom,
  cellName,
  dist,
  forwardDir,
  inAnyKeeperBox,
  inCentreCircle,
  inOwnHalf,
  inPenaltyArea,
  isFlank,
  onBoard,
  opponent,
  progress,
  sameCell,
} from './board';
import { FORMATION_NAMES, formationPieces, layoutPieces } from './formations';
import { ONE_TWO_PARTNERS, ROLE_NAMES, maxRange } from './roles';
import type { Action, Cell, EventKind, GameEvent, GameState, MatchSetup, Piece, Role, Side, Stats } from './types';

export class IllegalActionError extends Error {}

export const TEAM_NAMES: Record<Side, string> = { home: 'Blue', away: 'Red' };

export const RULE = {
  board: 'Rule 1 · Board',
  movement: 'Rule 3 · Movement',
  turn: 'Rule 4 · Turns',
  pass: 'Rule 5 · Passing',
  contested: 'Rule 5.3 · Contested reception',
  oneTwo: 'Rule 5.4 · One-two',
  offside: 'Rule 6 · Offside',
  tackle: 'Rule 7 · Tackling',
  shot: 'Rule 8 · Shooting',
  rebound: 'Rule 8.4 · Rebound',
  clock: 'Rule 9 · Kickoff and clock',
  possession: 'Possession limit',
} as const;

/** Roles that may move and then shoot (Q16: attacking pieces only). */
export const MOVE_AND_SHOOT_ROLES: ReadonlySet<Role> = new Set<Role>(['FW', 'WG', 'AM']);

// ------------------------------------------------------------------ helpers

const emptyStats = (): Stats => ({
  passes: 0,
  passesCompleted: 0,
  shots: 0,
  shotsOnTarget: 0,
  goals: 0,
  saves: 0,
  blocks: 0,
  tackles: 0,
  reactiveTackles: 0,
  interceptions: 0,
  offsides: 0,
});

export function cloneState(s: GameState): GameState {
  return {
    ...s,
    pieces: s.pieces.map((p) => ({ ...p, pos: { ...p.pos } })),
    ball: { pos: { ...s.ball.pos }, carrier: s.ball.carrier },
    followUp: s.followUp ? { ...s.followUp } : null,
    score: { ...s.score },
    formations: { ...s.formations },
    layouts: { ...s.layouts },
    clock: { ...s.clock },
    stall: { ...s.stall },
    turnStart: { carrier: s.turnStart.carrier, pos: { ...s.turnStart.pos } },
    stats: { home: { ...s.stats.home }, away: { ...s.stats.away } },
    events: s.events.slice(),
  };
}

export const getPiece = (s: GameState, id: string) => s.pieces.find((p) => p.id === id);

export function pieceAt(s: GameState, c: Cell): Piece | undefined {
  for (const p of s.pieces) if (p.pos.c === c.c && p.pos.r === c.r) return p;
  return undefined;
}

export const carrierOf = (s: GameState) => (s.ball.carrier ? getPiece(s, s.ball.carrier) : undefined);

export const label = (p: Piece) => `${TEAM_NAMES[p.side]} ${ROLE_NAMES[p.role]}`;

function log(s: GameState, kind: EventKind, side: Side, text: string, rule?: string) {
  const e: GameEvent = { kind, side, text, turn: s.turnNumber };
  if (rule) e.rule = rule;
  s.events.push(e);
}

function giveBall(s: GameState, p: Piece) {
  s.ball = { pos: { ...p.pos }, carrier: p.id };
}

/** Real-time clock shown as minutes and seconds. */
export function clockText(ms: number) {
  const t = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

const nearestOf = (pieces: Piece[], to: Cell) => pieces.reduce((a, b) => (dist(b.pos, to) < dist(a.pos, to) ? b : a));

// ------------------------------------------------------------------ setup and kickoff (rule 9)

export function createMatch(setup: MatchSetup): GameState {
  const first = setup.firstKickoff ?? 'home';
  const halfLength = setup.halfMinutes ? setup.halfMinutes * 60 * 1000 : HALF_MS;
  const s: GameState = {
    pieces: [],
    ball: { pos: { ...KICKOFF_SPOT[first] }, carrier: null },
    turn: first,
    followUp: null,
    kickoffPending: true,
    phase: 'playing',
    half: 1,
    score: { home: 0, away: 0 },
    formations: { home: setup.homeFormation, away: setup.awayFormation },
    layouts: { home: setup.homeLayout ?? null, away: setup.awayLayout ?? null },
    firstKickoff: first,
    timed: setup.timed ?? true,
    halfLength,
    turnTimer: setup.turnTimer ?? false,
    clock: { halfMs: halfLength, turnMs: TURN_MS },
    stallLimit: setup.stallLimit ?? null,
    stall: { side: first, turns: 0 },
    turnStart: { carrier: null, pos: { ...KICKOFF_SPOT[first] } },
    turnNumber: 1,
    stats: { home: emptyStats(), away: emptyStats() },
    events: [],
  };
  kickoff(s, first);
  return s;
}

/** Nearest empty square satisfying `ok`, searching outward from `from`. */
function nearestSquare(s: GameState, from: Cell, ok: (c: Cell) => boolean): Cell {
  for (let radius = 1; radius < ROWS; radius++) {
    for (let r = from.r - radius; r <= from.r + radius; r++)
      for (let c = from.c - radius; c <= from.c + radius; c++) {
        const cell = { c, r };
        if (dist(cell, from) === radius && onBoard(cell) && !pieceAt(s, cell) && ok(cell)) return cell;
      }
  }
  return from;
}

function teamPieces(s: GameState, side: Side): Piece[] {
  const layout = s.layouts[side];
  return layout ? layoutPieces(side, layout) : formationPieces(side, s.formations[side]);
}

function kickoff(s: GameState, side: Side) {
  s.pieces = [...teamPieces(s, 'home'), ...teamPieces(s, 'away')];
  const kicker = s.pieces.find((p) => p.side === side && p.role === 'FW');
  if (!kicker) throw new Error('A formation needs a Frontliner to kick off');
  // Clear the kickoff square if a custom layout put someone on it.
  const blocker = pieceAt(s, KICKOFF_SPOT[side]);
  if (blocker && blocker.id !== kicker.id) blocker.pos = nearestSquare(s, blocker.pos, (c) => inOwnHalf(blocker.side, c) && !inAnyKeeperBox(c));
  kicker.pos = { ...KICKOFF_SPOT[side] };
  // The defending side is moved out of the centre circle (rule 9).
  for (const p of s.pieces)
    if (p.side !== side && inCentreCircle(p.pos))
      p.pos = nearestSquare(s, p.pos, (c) => inOwnHalf(p.side, c) && !inCentreCircle(c) && !inAnyKeeperBox(c));
  giveBall(s, kicker);
  s.turn = side;
  s.followUp = null;
  s.kickoffPending = true;
  s.clock.turnMs = TURN_MS;
  s.stall = { side, turns: 0 };
  s.turnStart = { carrier: kicker.id, pos: { ...kicker.pos } };
  log(s, 'kickoff', side, `${TEAM_NAMES[side]} kick off: the ${ROLE_NAMES.FW} must pass first`, RULE.clock);
}

/**
 * End the current turn and start `side`'s. Also keeps the possession-limit count (Q20):
 * a turn in which the team holding the ball leaves it where it was adds one.
 */
function nextTurn(s: GameState, side: Side) {
  const holder = carrierOf(s);
  const ballStill = !!holder && holder.id === s.turnStart.carrier && sameCell(s.ball.pos, s.turnStart.pos);
  if (!ballStill) s.stall = { side: holder?.side ?? side, turns: 0 };
  else if (holder.side === s.turn) s.stall = { side: holder.side, turns: s.stall.side === holder.side ? s.stall.turns + 1 : 1 };
  s.turn = side;
  s.followUp = null;
  s.turnNumber++;
  s.clock.turnMs = TURN_MS;
  s.turnStart = { carrier: s.ball.carrier, pos: { ...s.ball.pos } };
}

/** Q20: true when the team to play has kept the ball still for the limit and must move it this turn. */
export function mustPlayBall(s: GameState): boolean {
  if (s.stallLimit === null || s.kickoffPending || s.phase !== 'playing') return false;
  const c = carrierOf(s);
  return !!c && c.side === s.turn && s.stall.side === s.turn && s.stall.turns >= s.stallLimit;
}

// ------------------------------------------------------------------ movement (rule 3)

/** Legal destination squares for a piece: straight rays, stopped by the first occupied square. */
export function legalMoves(s: GameState, p: Piece): Cell[] {
  const out: Cell[] = [];
  for (const [dc, dr] of DIRECTIONS) {
    const range = maxRange(p, dc, dr);
    for (let k = 1; k <= range; k++) {
      const c = { c: p.pos.c + dc * k, r: p.pos.r + dr * k };
      if (!onBoard(c) || pieceAt(s, c)) break;
      // Outfield pieces never enter a six-yard box (rule 3.2). The Box Keeper may go
      // anywhere in its own penalty area (Q24).
      if (p.role === 'GK' ? !inPenaltyArea(p.side, c) : inAnyKeeperBox(c)) break;
      out.push(c);
    }
  }
  return out;
}

/** True if the piece could move to a square where no opponent is adjacent (used by the trap rule). */
function canEscapePressure(s: GameState, p: Piece): boolean {
  return legalMoves(s, p).some((c) => !s.pieces.some((q) => q.side !== p.side && adjacent(q.pos, c)));
}

// ------------------------------------------------------------------ passing (rule 5) and offside (rule 6)

export type PassResult =
  | { result: 'complete' }
  | { result: 'blocked' | 'intercepted' | 'contested'; by: Piece }
  | { result: 'offside'; offender: Piece };

const sign = (n: number) => (n > 0 ? 1 : n < 0 ? -1 : 0);

/** Pass geometry: straight or 45° diagonal (rule 5.1). */
export function passLine(from: Cell, to: Cell): [number, number] | null {
  const dx = to.c - from.c;
  const dy = to.r - from.r;
  if (dx === 0 && dy === 0) return null;
  if (dx !== 0 && dy !== 0 && Math.abs(dx) !== Math.abs(dy)) return null;
  return [sign(dx), sign(dy)];
}

/**
 * The offside line for `attacking` as a progress value: the second-last opponent,
 * keeper included, as in the Laws of the Game (Q23). Null when there are fewer than
 * two opponents.
 */
export function offsideLine(s: GameState, attacking: Side): number | null {
  const prog = s.pieces
    .filter((q) => q.side !== attacking)
    .map((q) => progress(attacking, q.pos.r))
    .sort((a, b) => b - a);
  return prog.length >= 2 ? prog[1] : null;
}

/**
 * Offside (rule 6, Q13, Q23), judged when the pass is played: the receiver is in the
 * opponent's half, ahead of the ball (a pass from a teammate further forward is never
 * offside), and strictly beyond the second-last opponent. Level is onside.
 */
export function isOffside(s: GameState, passer: Piece, receiver: Piece | Cell): boolean {
  const side = passer.side;
  const at = 'pos' in receiver ? receiver.pos : receiver;
  if (inOwnHalf(side, at)) return false;
  if (progress(side, at.r) <= progress(side, passer.pos.r)) return false;
  const line = offsideLine(s, side);
  return line !== null && progress(side, at.r) > line;
}

/** What happens if `passer` passes to the teammate on `to` (no state change). */
export function passOutcome(s: GameState, passer: Piece, to: Cell, checkOffside = true): PassResult {
  const [dc, dr] = passLine(passer.pos, to)!;
  const n = dist(passer.pos, to);
  const receiver = pieceAt(s, to)!;

  // Q5: offside is checked first, before any interception.
  if (checkOffside && isOffside(s, passer, receiver)) return { result: 'offside', offender: receiver };

  const ray: Cell[] = [];
  for (let k = 1; k < n; k++) ray.push({ c: passer.pos.c + dc * k, r: passer.pos.r + dr * k });

  // 5.2: an opponent on the first square in the pass direction takes the ball.
  const first = ray[0] ? pieceAt(s, ray[0]) : undefined;
  if (first && first.side !== passer.side) return { result: 'blocked', by: first };

  // 5.2: opponents closer than 3 squares on the ray intercept, unless a teammate further down
  // the ray (at least 2 from the carrier) shields it. Opponents 3 or more away are ignored.
  // INTERPRETATION (Q3, unanswered): the receiver itself does not count as the shielding teammate.
  for (let k = 1; k < ray.length && k + 1 < 3; k++) {
    const q = pieceAt(s, ray[k]);
    if (!q || q.side === passer.side) continue;
    const shield = ray.slice(k + 1).some((c) => {
      const t = pieceAt(s, c);
      return !!t && t.side === passer.side && dist(passer.pos, c) >= 2;
    });
    if (!shield) return { result: 'intercepted', by: q };
  }

  // 5.3 pressure tackle: a defender adjacent to the receiver, straight on along the pass direction.
  const ahead = pieceAt(s, { c: to.c + dc, r: to.r + dr });
  if (ahead && ahead.side !== passer.side) return { result: 'contested', by: ahead };

  // 5.3 double-team: two or more adjacent defenders and no free, unpressured square beside the receiver.
  const markers = s.pieces.filter((q) => q.side !== passer.side && adjacent(q.pos, to));
  if (markers.length >= 2) {
    let escape = false;
    for (const [ex, ey] of DIRECTIONS) {
      const c = { c: to.c + ex, r: to.r + ey };
      if (!onBoard(c) || pieceAt(s, c)) continue;
      if (!s.pieces.some((q) => q.side !== passer.side && adjacent(q.pos, c))) {
        escape = true;
        break;
      }
    }
    if (!escape) return { result: 'contested', by: markers[0] };
  }
  return { result: 'complete' };
}

/** Teammates the carrier may legally pass to (geometry only; the outcome may still be a turnover). */
export function passTargets(s: GameState, passer: Piece): Piece[] {
  return s.pieces.filter((q) => q.side === passer.side && q.id !== passer.id && passLine(passer.pos, q.pos));
}

/** A pass that would be completed (used by the tackle rules' "no clear pass"). */
export function hasSafePass(s: GameState, carrier: Piece): boolean {
  return passTargets(s, carrier).some((q) => passOutcome(s, carrier, q.pos).result === 'complete');
}

/**
 * One-two run squares (rule 5.4, Q6a): the passer may run forward, backward or sideways,
 * within its normal movement, to any square in a straight or diagonal line with the
 * receiver, who stays where it is.
 */
export function oneTwoRuns(s: GameState, passer: Piece, via: Piece): Cell[] {
  if (!ONE_TWO_PARTNERS[passer.role].includes(via.role)) return [];
  if (!passLine(passer.pos, via.pos)) return [];
  return legalMoves(s, passer).filter((c) => !sameCell(c, via.pos) && passLine(via.pos, c));
}

/** One-two partners available to the carrier right now (the first pass must be onside). */
export function oneTwoPartners(s: GameState, passer: Piece): Piece[] {
  return passTargets(s, passer).filter((q) => !isOffside(s, passer, q) && oneTwoRuns(s, passer, q).length > 0);
}

// ------------------------------------------------------------------ tackling (rule 7)

const REACTIVE_ROLES = new Set(['DM', 'CB', 'FB']);

/** Rule 7.1, reactive: the carrier has just moved next to an Anchor, Central Pillar or Defensive Flanker. */
export function reactiveTackler(s: GameState, carrier: Piece): Piece | undefined {
  return s.pieces.find((q) => q.side !== carrier.side && REACTIVE_ROLES.has(q.role) && adjacent(q.pos, carrier.pos));
}

/** Rule 7.1, active: a defender has just moved next to a stationary carrier. Returns the rule that applies, if any. */
export function activeTackleRule(s: GameState, defender: Piece, carrier: Piece): string | null {
  if (!adjacent(defender.pos, carrier.pos)) return null;
  const pressing = s.pieces.filter((q) => q.side === defender.side && adjacent(q.pos, carrier.pos)).length;
  const doubleTeam = pressing >= 2;
  if (doubleTeam && !hasSafePass(s, carrier) && !canEscapePressure(s, carrier)) return 'Trap';
  const own = inOwnHalf(defender.side, defender.pos);
  const diagonal = defender.pos.c !== carrier.pos.c && defender.pos.r !== carrier.pos.r;
  switch (defender.role) {
    case 'CB':
      if (diagonal) return 'Central Pillar diagonal tackle';
      if (own && !hasSafePass(s, carrier)) return 'Central Pillar close-down';
      return null;
    case 'FB':
      return isFlank(defender.pos.c) ? 'Defensive Flanker wide tackle' : null;
    case 'DM':
      if (own) return 'Anchor own-half tackle';
      return doubleTeam ? 'Anchor double-team' : null;
    case 'MF': {
      // Q7: "directly in front" is the square one step ahead of the carrier in the
      // carrier's own attacking direction, so it differs for each team.
      const front = { c: carrier.pos.c, r: carrier.pos.r + forwardDir(carrier.side) };
      if (own && sameCell(defender.pos, front)) return 'Connector front tackle';
      return doubleTeam ? 'Connector double-team' : null;
    }
    case 'AM':
    case 'FW':
    case 'WG':
      return doubleTeam ? 'Press double-team' : null;
    case 'GK':
      return null;
  }
}

// ------------------------------------------------------------------ shooting (rule 8)

export type ShotResult = {
  outcome: 'goal' | 'save' | 'block' | 'wide';
  by?: Piece;
  path: Cell[];
  dir: [number, number];
};

/** Shot direction from the shooter's column (rule 8.2). */
export function shotDirection(side: Side, from: Cell): [number, number] {
  const dr = forwardDir(side);
  if (from.c < INNER_GOAL_COLS[0]) return [1, dr];
  if (from.c > INNER_GOAL_COLS[1]) return [-1, dr];
  return [0, dr];
}

export function shotOutcome(s: GameState, shooter: Piece): ShotResult {
  const dir = shotDirection(shooter.side, shooter.pos);
  const goalRow = attackGoalRow(shooter.side);
  const path: Cell[] = [];
  let c = { ...shooter.pos };
  while (c.r !== goalRow) {
    c = { c: c.c + dir[0], r: c.r + dir[1] };
    if (!onBoard(c)) break;
    path.push(c);
  }
  // 8.3: the first occupied square decides: the keeper saves, anyone else blocks.
  for (const sq of path) {
    const q = pieceAt(s, sq);
    if (!q) continue;
    if (q.role === 'GK' && q.side !== shooter.side) return { outcome: 'save', by: q, path, dir };
    return { outcome: 'block', by: q, path, dir };
  }
  // 8.3 / Q21: a keeper saves only a shot passing within one square of it.
  const keeper = s.pieces.find((q) => q.side !== shooter.side && q.role === 'GK');
  if (keeper && inPenaltyArea(keeper.side, keeper.pos) && path.some((sq) => dist(sq, keeper.pos) <= 1))
    return { outcome: 'save', by: keeper, path, dir };
  const end = path[path.length - 1];
  const onTarget = !!end && end.r === goalRow && end.c >= INNER_GOAL_COLS[0] && end.c <= INNER_GOAL_COLS[1];
  return { outcome: onTarget ? 'goal' : 'wide', path, dir };
}

// ------------------------------------------------------------------ validation

function canPassNow(s: GameState, p: Piece): boolean {
  if (s.ball.carrier !== p.id) return false;
  if (s.followUp) return s.followUp.pieceId === p.id && s.followUp.canPass;
  return true;
}

function canShootNow(s: GameState, p: Piece): boolean {
  if (s.ball.carrier !== p.id || s.kickoffPending) return false;
  if (!canShootFrom(p.side, p.pos)) return false;
  if (s.followUp) return s.followUp.pieceId === p.id && s.followUp.canShoot;
  return true;
}

export function validateAction(s: GameState, a: Action): string | null {
  if (a.type === 'tick') return s.phase === 'playing' && a.ms >= 0 ? null : 'The clock is not running';
  if (a.type === 'resume') {
    if (s.phase !== 'halftime') return 'It is not half-time';
    for (const f of [a.homeFormation, a.awayFormation]) if (f && !FORMATION_NAMES.includes(f)) return `Unknown formation ${f}`;
    return null;
  }
  if (s.phase !== 'playing') return s.phase === 'halftime' ? 'It is half-time' : 'The match is over';
  const forced = mustPlayBall(s);
  if (a.type === 'endTurn') {
    if (s.kickoffPending) return 'The kickoff must be a pass';
    return null;
  }

  const p = getPiece(s, a.pieceId);
  if (!p) return 'Unknown piece';
  if (p.side !== s.turn) return 'Not your turn';
  if (s.followUp && s.followUp.pieceId !== p.id) return 'Only the piece that moved can act again this turn';
  if (forced && s.ball.carrier !== p.id) return 'Possession limit: the ball carrier must play this turn';

  switch (a.type) {
    case 'move': {
      if (s.kickoffPending) return 'At kickoff the first action must be a pass';
      if (s.followUp) return 'This piece has already moved this turn';
      return legalMoves(s, p).some((c) => sameCell(c, a.to)) ? null : 'That square is not a legal move';
    }
    case 'pass': {
      if (!canPassNow(s, p)) return s.ball.carrier !== p.id ? 'Only the ball carrier can pass' : 'No pass is allowed after this move';
      const q = pieceAt(s, a.to);
      if (!q || q.side !== p.side || q.id === p.id) return 'Pass to a teammate';
      if (!passLine(p.pos, a.to)) return 'Passes must be straight or diagonal';
      return null;
    }
    case 'shoot': {
      if (s.kickoffPending) return 'At kickoff the first action must be a pass';
      if (s.ball.carrier !== p.id) return 'Only the ball carrier can shoot';
      if (!canShootFrom(p.side, p.pos)) return 'Not in a shooting position';
      if (s.followUp && !MOVE_AND_SHOOT_ROLES.has(p.role)) return 'Only Frontliners, Flankers and Sparkers can move and then shoot';
      return canShootNow(s, p) ? null : 'No shot is allowed after this move';
    }
    case 'oneTwo': {
      if (s.kickoffPending) return 'At kickoff the first action must be a plain pass';
      if (!canPassNow(s, p)) return 'A one-two needs a pass to be allowed';
      const via = getPiece(s, a.viaId);
      if (!via || via.side !== p.side || via.id === p.id) return 'Choose a teammate';
      if (!ONE_TWO_PARTNERS[p.role].includes(via.role)) return `${ROLE_NAMES[p.role]} cannot play a one-two with a ${ROLE_NAMES[via.role]}`;
      if (!passLine(p.pos, via.pos)) return 'Passes must be straight or diagonal';
      if (isOffside(s, p, via)) return 'The first pass would be offside';
      if (!oneTwoRuns(s, p, via).some((c) => sameCell(c, a.to))) return 'Run to a square in line with the receiver, within normal movement';
      return null;
    }
  }
}

// ------------------------------------------------------------------ resolution

function endHalf(s: GameState) {
  s.followUp = null;
  if (s.half === 1) {
    s.phase = 'halftime';
    log(s, 'halftime', s.turn, `Half-time: ${TEAM_NAMES.home} ${s.score.home} – ${s.score.away} ${TEAM_NAMES.away}`, RULE.clock);
  } else {
    s.phase = 'finished';
    log(s, 'fulltime', s.turn, `Full-time: ${TEAM_NAMES.home} ${s.score.home} – ${s.score.away} ${TEAM_NAMES.away}`, RULE.clock);
  }
}

function offsideRestart(s: GameState, offender: Piece) {
  const opp = opponent(offender.side);
  s.stats[offender.side].offsides++;
  // The ball goes to the defending piece nearest the offender (rule 6).
  const nearest = nearestOf(s.pieces.filter((q) => q.side === opp), offender.pos);
  giveBall(s, nearest);
  log(
    s,
    'offside',
    offender.side,
    `Offside! ${label(offender)} was beyond the second-last defender when the pass was played. Ball to ${label(nearest)}`,
    RULE.offside,
  );
}

/** Q20: the possession limit was reached and the ball did not move: it goes to the nearest opponent. */
function stallHandover(s: GameState) {
  const c = carrierOf(s)!;
  const taker = nearestOf(s.pieces.filter((q) => q.side !== c.side), c.pos);
  giveBall(s, taker);
  log(s, 'stall', c.side, `Possession limit! ${TEAM_NAMES[c.side]} did not move the ball. Ball to ${label(taker)}`, RULE.possession);
}

/** Resolve a pass from the carrier; returns true if the passer's team kept the ball. */
function doPass(s: GameState, passer: Piece, to: Cell, quiet = false): boolean {
  const st = s.stats[passer.side];
  const opp = opponent(passer.side);
  st.passes++;
  const out = passOutcome(s, passer, to);
  const receiver = pieceAt(s, to)!;
  switch (out.result) {
    case 'complete':
      st.passesCompleted++;
      giveBall(s, receiver);
      if (!quiet) log(s, 'pass', passer.side, `${label(passer)} passes to ${ROLE_NAMES[receiver.role]} at ${cellName(to)}`, RULE.pass);
      return true;
    case 'blocked':
      s.stats[opp].interceptions++;
      giveBall(s, out.by);
      log(s, 'blocked', opp, `${label(out.by)} is standing in the passing lane right next to the passer and takes the ball`, RULE.pass);
      return false;
    case 'intercepted':
      s.stats[opp].interceptions++;
      giveBall(s, out.by);
      log(s, 'intercept', opp, `${label(out.by)} intercepts at ${cellName(out.by.pos)}`, RULE.pass);
      return false;
    case 'contested':
      s.stats[opp].tackles++;
      giveBall(s, out.by);
      log(s, 'contested', opp, `${label(out.by)} wins the ball from the ${ROLE_NAMES[receiver.role]} as it arrives`, RULE.contested);
      return false;
    case 'offside':
      offsideRestart(s, out.offender);
      return false;
  }
}

function afterMove(s: GameState, p: Piece) {
  const carrying = s.ball.carrier === p.id;
  if (carrying) {
    // 7.1 reactive tackle: the carrier moved next to an Anchor, Central Pillar or Defensive Flanker.
    const t = reactiveTackler(s, p);
    if (t) {
      s.stats[t.side].tackles++;
      s.stats[t.side].reactiveTackles++;
      giveBall(s, t);
      log(s, 'reactiveTackle', t.side, `Reactive tackle! ${label(p)} moved next to ${label(t)}, who wins the ball`, RULE.tackle);
      nextTurn(s, t.side);
      return;
    }
    // Q16: any piece may move then pass in its own half; only a Connector may move then pass
    // anywhere; only attacking pieces may move then shoot, inside the shooting zone.
    const canPass = inOwnHalf(p.side, p.pos) || p.role === 'MF';
    const canShoot = canShootFrom(p.side, p.pos) && MOVE_AND_SHOOT_ROLES.has(p.role);
    if (canPass || canShoot) {
      s.followUp = { pieceId: p.id, canPass, canShoot };
      return;
    }
    nextTurn(s, opponent(p.side));
    return;
  }
  // 7.2 active tackle: a defender moved next to a stationary carrier.
  const carrier = carrierOf(s);
  if (carrier && carrier.side !== p.side) {
    const rule = activeTackleRule(s, p, carrier);
    if (rule) {
      s.stats[p.side].tackles++;
      giveBall(s, p);
      log(s, 'tackle', p.side, `${rule}: ${label(p)} wins the ball from the ${ROLE_NAMES[carrier.role]}`, RULE.tackle);
      // The winner gets a fresh normal turn (rule 4.2).
      nextTurn(s, p.side);
      return;
    }
  }
  nextTurn(s, opponent(p.side));
}

/** Apply an action that is already known to be legal. */
export function resolveAction(prev: GameState, a: Action): GameState {
  const s = cloneState(prev);
  switch (a.type) {
    case 'tick': {
      if (!s.timed || s.kickoffPending) return s;
      s.clock.halfMs -= a.ms;
      if (s.turnTimer) s.clock.turnMs -= a.ms;
      if (s.clock.halfMs <= 0) {
        s.clock.halfMs = 0;
        endHalf(s);
      } else if (s.turnTimer && s.clock.turnMs <= 0) {
        if (mustPlayBall(s)) {
          stallHandover(s);
        } else {
          log(s, 'timeout', s.turn, `Time! ${TEAM_NAMES[s.turn]} ran out of their 25 seconds and forfeit the turn`, RULE.clock);
        }
        nextTurn(s, opponent(s.turn));
      }
      return s;
    }
    case 'resume': {
      if (a.homeFormation) {
        s.formations.home = a.homeFormation;
        s.layouts.home = null;
      }
      if (a.awayFormation) {
        s.formations.away = a.awayFormation;
        s.layouts.away = null;
      }
      if (a.homeLayout) s.layouts.home = a.homeLayout;
      if (a.awayLayout) s.layouts.away = a.awayLayout;
      s.phase = 'playing';
      s.half = 2;
      s.clock.halfMs = s.halfLength;
      s.turnNumber++;
      kickoff(s, opponent(s.firstKickoff));
      return s;
    }
    case 'endTurn': {
      // INTERPRETATION (Q20): ending the turn without moving the ball once the limit is reached
      // gives the ball to the nearest opponent, the same as running out of time.
      if (mustPlayBall(s)) {
        stallHandover(s);
        nextTurn(s, opponent(s.turn));
        return s;
      }
      log(s, 'endTurn', s.turn, `${TEAM_NAMES[s.turn]} end their turn`);
      nextTurn(s, opponent(s.turn));
      return s;
    }
  }

  const p = getPiece(s, a.pieceId)!;
  switch (a.type) {
    case 'move': {
      const hadBall = s.ball.carrier === p.id;
      const from = cellName(p.pos);
      p.pos = { ...a.to };
      if (hadBall) {
        s.ball.pos = { ...a.to };
        log(s, 'move', p.side, `${label(p)} dribbles ${from} → ${cellName(a.to)}`, RULE.movement);
      } else if (s.ball.carrier === null && sameCell(s.ball.pos, a.to)) {
        giveBall(s, p);
        log(s, 'recover', p.side, `${label(p)} collects the loose ball at ${cellName(a.to)}`, RULE.turn);
      } else {
        log(s, 'move', p.side, `${label(p)} moves ${from} → ${cellName(a.to)}`, RULE.movement);
      }
      afterMove(s, p);
      return s;
    }
    case 'pass': {
      s.kickoffPending = false;
      // Rule 4.2: a completed pass hands play to the other team; so does losing the ball.
      doPass(s, p, a.to);
      nextTurn(s, opponent(p.side));
      return s;
    }
    case 'oneTwo': {
      const via = getPiece(s, a.viaId)!;
      const run = { ...a.to };
      if (!doPass(s, p, via.pos, true)) {
        nextTurn(s, opponent(p.side));
        return s;
      }
      p.pos = run;
      // Q6b: the return pass is intercepted by a defender on the squares between.
      const [dc, dr] = passLine(via.pos, run)!;
      const lane: Cell[] = [];
      for (let k = 1; k < dist(via.pos, run); k++) lane.push({ c: via.pos.c + dc * k, r: via.pos.r + dr * k });
      const thief = lane.map((c) => pieceAt(s, c)).find((q) => q && q.side !== p.side);
      if (thief) {
        s.stats[thief.side].interceptions++;
        giveBall(s, thief);
        log(s, 'intercept', thief.side, `${label(thief)} cuts out the return pass of the one-two`, RULE.oneTwo);
      } else if (isOffside(s, via, p)) {
        offsideRestart(s, p);
      } else {
        s.stats[p.side].passes++;
        s.stats[p.side].passesCompleted++;
        giveBall(s, p);
        log(s, 'oneTwo', p.side, `One-two: ${ROLE_NAMES[p.role]} → ${ROLE_NAMES[via.role]} → ${ROLE_NAMES[p.role]} at ${cellName(run)}`, RULE.oneTwo);
        // Q6b: a defender next to the run square can still tackle under the tackling rules.
        const t = reactiveTackler(s, p);
        if (t) {
          s.stats[t.side].tackles++;
          s.stats[t.side].reactiveTackles++;
          giveBall(s, t);
          log(s, 'reactiveTackle', t.side, `Reactive tackle! ${label(t)} wins the ball as the one-two arrives`, RULE.tackle);
        }
      }
      nextTurn(s, opponent(p.side));
      return s;
    }
    case 'shoot': {
      const st = s.stats[p.side];
      const opp = opponent(p.side);
      st.shots++;
      const res = shotOutcome(s, p);
      if (res.outcome === 'goal') {
        st.shotsOnTarget++;
        st.goals++;
        s.score[p.side]++;
        log(s, 'goal', p.side, `GOAL! ${label(p)} scores from ${cellName(p.pos)} (${TEAM_NAMES.home} ${s.score.home} – ${s.score.away} ${TEAM_NAMES.away})`, RULE.shot);
        s.turnNumber++;
        kickoff(s, opp);
        return s;
      }
      if (res.outcome === 'save') {
        st.shotsOnTarget++;
        s.stats[opp].saves++;
        giveBall(s, res.by!);
        log(s, 'save', opp, `Saved! ${label(res.by!)} stops the ${ROLE_NAMES[p.role]}'s shot`, RULE.shot);
      } else if (res.outcome === 'wide') {
        const keeper = s.pieces.find((q) => q.side === opp && q.role === 'GK') ?? s.pieces.find((q) => q.side === opp)!;
        giveBall(s, keeper);
        log(s, 'goalKick', opp, `Wide! The shot misses the target. Goal kick: ${label(keeper)} has the ball`, RULE.shot);
      } else {
        const b = res.by!;
        if (b.side === opp) s.stats[opp].blocks++;
        log(s, 'block', b.side, `Blocked by ${label(b)} at ${cellName(b.pos)}`, RULE.shot);
        // 8.4 rebound: straight shots come back one square, diagonal shots two squares diagonally back.
        const [dc, dr] = res.dir;
        const reb = dc === 0 ? { c: b.pos.c, r: b.pos.r - dr } : { c: b.pos.c + 2 * dc, r: b.pos.r - 2 * dr };
        if (!onBoard(reb)) giveBall(s, b);
        else {
          const there = pieceAt(s, reb);
          if (there) {
            giveBall(s, there);
            log(s, 'rebound', there.side, `The rebound falls to ${label(there)} at ${cellName(reb)}`, RULE.rebound);
          } else {
            // Q8: a loose rebound stays on its square until a piece moves onto it.
            s.ball = { pos: reb, carrier: null };
            log(s, 'rebound', opp, `The rebound runs loose at ${cellName(reb)}`, RULE.rebound);
          }
        }
      }
      nextTurn(s, opp);
      return s;
    }
  }
}

/** Validate and apply an action. Throws IllegalActionError when it is not allowed. */
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

/** Rebuild a match from its setup and action log (server-side result verification). */
export function replay(setup: MatchSetup, actions: Action[]): GameState {
  let s = createMatch(setup);
  for (const a of actions) s = applyAction(s, a);
  return s;
}

/** Every action the given piece may take right now (used by the UI and the CPU). */
export function actionsFor(s: GameState, p: Piece) {
  const none = { moves: [] as Cell[], passes: [] as Piece[], shoot: false, oneTwos: [] as Piece[] };
  if (s.phase !== 'playing' || p.side !== s.turn || (s.followUp && s.followUp.pieceId !== p.id)) return none;
  if (mustPlayBall(s) && s.ball.carrier !== p.id) return none;
  const moves = s.kickoffPending || s.followUp ? [] : legalMoves(s, p);
  const passes = canPassNow(s, p) ? passTargets(s, p) : [];
  const shoot = !validateAction(s, { type: 'shoot', pieceId: p.id });
  const oneTwos = canPassNow(s, p) && !s.kickoffPending ? oneTwoPartners(s, p) : [];
  return { moves, passes, shoot, oneTwos };
}

export { COLS, ROWS };
