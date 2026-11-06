/**
 * SYNOCHÍ official rules engine.
 *
 * Implements "SYNOCHÍ Official Game Rules — Extraction Draft" (3 Nov 2026),
 * which describes David André's Replit build. Section numbers in comments and
 * in event `rule` tags refer to that document. Where the document marks a point
 * "Confirm" or leaves it open, the interpretation used here is tagged
 * INTERPRETATION and listed in docs/OFFICIAL_RULES_IMPLEMENTATION.md.
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
  inKeeperBox,
  inOwnHalf,
  isFlank,
  onBoard,
  opponent,
  progress,
  sameCell,
} from './board';
import { FORMATION_NAMES, formationPieces } from './formations';
import { ONE_TWO_PARTNERS, ROLE_NAMES, maxRange } from './roles';
import type { Action, Cell, EventKind, GameEvent, GameState, MatchSetup, Piece, Side, Stats } from './types';

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
} as const;

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
    clock: { ...s.clock },
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

/** Match clock shown as minutes and seconds of real time remaining in the half. */
export function clockText(ms: number) {
  const t = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

// ------------------------------------------------------------------ setup and kickoff (rule 9)

export function createMatch(setup: MatchSetup): GameState {
  const first = setup.firstKickoff ?? 'home';
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
    firstKickoff: first,
    timed: setup.timed ?? true,
    clock: { halfMs: HALF_MS, turnMs: TURN_MS },
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
    let best: Cell | null = null;
    for (let r = from.r - radius; r <= from.r + radius; r++)
      for (let c = from.c - radius; c <= from.c + radius; c++) {
        const cell = { c, r };
        if (dist(cell, from) !== radius || !onBoard(cell) || pieceAt(s, cell) || !ok(cell)) continue;
        if (!best) best = cell;
      }
    if (best) return best;
  }
  return from;
}

function kickoff(s: GameState, side: Side) {
  s.pieces = [...formationPieces('home', s.formations.home), ...formationPieces('away', s.formations.away)];
  const kicker = s.pieces.find((p) => p.side === side && p.role === 'FW');
  if (!kicker) throw new Error('A formation needs a Frontliner to kick off');
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
  log(s, 'kickoff', side, `${TEAM_NAMES[side]} kick off: the ${ROLE_NAMES.FW} must pass first`, RULE.clock);
}

function nextTurn(s: GameState, side: Side) {
  s.turn = side;
  s.followUp = null;
  s.turnNumber++;
  s.clock.turnMs = TURN_MS;
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
      // Only the Box Keeper may enter a six-yard box, and it may never leave its own (rule 3.2).
      if (p.role === 'GK' ? !inKeeperBox(p.side, c) : inAnyKeeperBox(c)) break;
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

/** Pass geometry: straight or 45° diagonal to a teammate (rule 5.1). */
export function passLine(from: Cell, to: Cell): [number, number] | null {
  const dx = to.c - from.c;
  const dy = to.r - from.r;
  if (dx === 0 && dy === 0) return null;
  if (dx !== 0 && dy !== 0 && Math.abs(dx) !== Math.abs(dy)) return null;
  return [sign(dx), sign(dy)];
}

/**
 * Offside (rule 6), judged when the pass is played: the receiver is in the
 * opponent's half, ahead of the ball, and strictly beyond the deepest outfield
 * opponent. The Box Keeper does not count. No outfield defenders, no offside.
 */
export function isOffside(s: GameState, passer: Piece, receiver: Piece): boolean {
  const side = passer.side;
  if (inOwnHalf(side, receiver.pos)) return false;
  if (progress(side, receiver.pos.r) <= progress(side, passer.pos.r)) return false;
  const line = offsideLine(s, side);
  return line !== null && progress(side, receiver.pos.r) > line;
}

/** Progress value of the deepest outfield defender facing `attacking`, or null when there is none. */
export function offsideLine(s: GameState, attacking: Side): number | null {
  let deepest: number | null = null;
  for (const q of s.pieces)
    if (q.side !== attacking && q.role !== 'GK') {
      const pr = progress(attacking, q.pos.r);
      if (deepest === null || pr > deepest) deepest = pr;
    }
  return deepest;
}

/** What happens if `passer` passes to the teammate on `to` (no state change). */
export function passOutcome(s: GameState, passer: Piece, to: Cell, checkOffside = true): PassResult {
  const [dc, dr] = passLine(passer.pos, to)!;
  const n = dist(passer.pos, to);
  const receiver = pieceAt(s, to)!;
  const ray: Cell[] = [];
  for (let k = 1; k < n; k++) ray.push({ c: passer.pos.c + dc * k, r: passer.pos.r + dr * k });

  // 5.2: an opponent on the first square in the pass direction takes the ball.
  const first = ray[0] ? pieceAt(s, ray[0]) : undefined;
  if (first && first.side !== passer.side) return { result: 'blocked', by: first };

  // 5.2: opponents closer than 3 squares on the ray intercept, unless a teammate further down
  // the ray (at least 2 from the carrier) shields it. Opponents 3 or more away are ignored.
  // INTERPRETATION: the receiver itself does not count as the shielding teammate.
  for (let k = 1; k < ray.length && k + 1 < 3; k++) {
    const q = pieceAt(s, ray[k]);
    if (!q || q.side === passer.side) continue;
    const shield = ray.slice(k + 1).some((c) => {
      const t = pieceAt(s, c);
      return !!t && t.side === passer.side && dist(passer.pos, c) >= 2;
    });
    if (!shield) return { result: 'intercepted', by: q };
  }

  if (checkOffside && isOffside(s, passer, receiver)) return { result: 'offside', offender: receiver };

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

/** The automatic support-run square for a one-two (rule 5.4), or null if the one-two is not available. */
export function oneTwoRun(s: GameState, passer: Piece, via: Piece): Cell | null {
  if (!ONE_TWO_PARTNERS[passer.role].includes(via.role)) return null;
  if (!passLine(passer.pos, via.pos)) return null;
  if (progress(passer.side, via.pos.r) <= progress(passer.side, passer.pos.r)) return null; // the run is forward
  // INTERPRETATION: among legal squares on the receiver's row, take the one nearest the passer's
  // column, then nearest the receiver.
  const options = legalMoves(s, passer).filter((c) => c.r === via.pos.r);
  if (!options.length) return null;
  options.sort(
    (a, b) => Math.abs(a.c - passer.pos.c) - Math.abs(b.c - passer.pos.c) || Math.abs(a.c - via.pos.c) - Math.abs(b.c - via.pos.c),
  );
  return options[0];
}

/** One-two partners available to the carrier right now. */
export function oneTwoPartners(s: GameState, passer: Piece): Piece[] {
  return passTargets(s, passer).filter((q) => oneTwoRun(s, passer, q) && !isOffside(s, passer, q));
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
      // INTERPRETATION: "directly in front" = the square one step ahead of the carrier in its
      // attacking direction (symmetric for both teams; the original code is asymmetric).
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
  // 8.3: a keeper in its box within one square of any square on the path also saves.
  const keeper = s.pieces.find((q) => q.side !== shooter.side && q.role === 'GK');
  if (keeper && inKeeperBox(keeper.side, keeper.pos) && path.some((sq) => dist(sq, keeper.pos) <= 1))
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
  if (a.type === 'endTurn') return s.kickoffPending ? 'The kickoff must be a pass' : null;

  const p = getPiece(s, a.pieceId);
  if (!p) return 'Unknown piece';
  if (p.side !== s.turn) return 'Not your turn';
  if (s.followUp && s.followUp.pieceId !== p.id) return 'Only the piece that moved can act again this turn';

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
      if (s.followUp && p.role === 'AM') return 'A Sparker cannot move and then shoot';
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
      if (!oneTwoRun(s, p, via)) return 'No legal run onto the receiver\'s row';
      return null;
    }
  }
}

// ------------------------------------------------------------------ resolution

function endHalf(s: GameState) {
  if (s.half === 1) {
    s.phase = 'halftime';
    s.followUp = null;
    log(s, 'halftime', s.turn, `Half-time: ${TEAM_NAMES.home} ${s.score.home} – ${s.score.away} ${TEAM_NAMES.away}`, RULE.clock);
  } else {
    s.phase = 'finished';
    s.followUp = null;
    log(s, 'fulltime', s.turn, `Full-time: ${TEAM_NAMES.home} ${s.score.home} – ${s.score.away} ${TEAM_NAMES.away}`, RULE.clock);
  }
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
    case 'offside': {
      st.offsides++;
      // The ball goes to the defending piece nearest the offender (rule 6).
      const nearest = s.pieces
        .filter((q) => q.side === opp)
        .reduce((a, b) => (dist(b.pos, out.offender.pos) < dist(a.pos, out.offender.pos) ? b : a));
      giveBall(s, nearest);
      log(
        s,
        'offside',
        passer.side,
        `Offside! ${label(out.offender)} was beyond the last outfield defender when the pass was played. Ball to ${label(nearest)}`,
        RULE.offside,
      );
      return false;
    }
  }
}

/** A loose ball goes to the nearest piece; ties go to `priority` (INTERPRETATION of rule 8.4). */
function recoverLoose(s: GameState, at: Cell, priority: Side) {
  let best: Piece | undefined;
  for (const p of s.pieces) {
    if (!best) {
      best = p;
      continue;
    }
    const d = dist(p.pos, at);
    const bd = dist(best.pos, at);
    if (d < bd || (d === bd && p.side === priority && best.side !== priority)) best = p;
  }
  giveBall(s, best!);
  log(s, 'recover', best!.side, `${label(best!)} recovers the loose ball`, RULE.rebound);
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
    // Rule 4: follow-up pass or shot by the same piece.
    const canPass = inOwnHalf(p.side, p.pos) || canShootFrom(p.side, p.pos) || p.role === 'MF';
    const canShoot = canShootFrom(p.side, p.pos) && p.role !== 'AM';
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
      s.clock.turnMs -= a.ms;
      if (s.clock.halfMs <= 0) {
        s.clock.halfMs = 0;
        endHalf(s);
      } else if (s.clock.turnMs <= 0) {
        log(s, 'timeout', s.turn, `Time! ${TEAM_NAMES[s.turn]} ran out of their 25 seconds and forfeit the turn`, RULE.clock);
        nextTurn(s, opponent(s.turn));
      }
      return s;
    }
    case 'resume': {
      if (a.homeFormation) s.formations.home = a.homeFormation;
      if (a.awayFormation) s.formations.away = a.awayFormation;
      s.phase = 'playing';
      s.half = 2;
      s.clock.halfMs = HALF_MS;
      s.turnNumber++;
      kickoff(s, opponent(s.firstKickoff));
      return s;
    }
    case 'endTurn': {
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
      const run = oneTwoRun(s, p, via)!;
      if (!doPass(s, p, via.pos, true)) {
        nextTurn(s, opponent(p.side));
        return s;
      }
      p.pos = { ...run };
      // Return leg: intercepted by a defender on the lane or next to the runner's square (INTERPRETATION).
      const lane: Cell[] = [];
      const step = sign(run.c - via.pos.c);
      for (let c = via.pos.c + step; c !== run.c; c += step) lane.push({ c, r: run.r });
      const thief =
        s.pieces.find((q) => q.side !== p.side && lane.some((l) => sameCell(l, q.pos))) ??
        s.pieces.find((q) => q.side !== p.side && adjacent(q.pos, run));
      if (thief) {
        s.stats[thief.side].interceptions++;
        giveBall(s, thief);
        log(s, 'intercept', thief.side, `${label(thief)} cuts out the return pass of the one-two`, RULE.oneTwo);
      } else if (isOffside(s, via, p)) {
        doPass(s, via, run); // logs the offside
      } else {
        s.stats[p.side].passes++;
        s.stats[p.side].passesCompleted++;
        giveBall(s, p);
        log(s, 'oneTwo', p.side, `One-two: ${ROLE_NAMES[p.role]} → ${ROLE_NAMES[via.role]} → ${ROLE_NAMES[p.role]} at ${cellName(run)}`, RULE.oneTwo);
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
            s.ball = { pos: reb, carrier: null };
            recoverLoose(s, reb, opp);
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

/** Every action the side to play may take right now (used by the UI and the CPU). */
export function actionsFor(s: GameState, p: Piece) {
  if (s.phase !== 'playing' || p.side !== s.turn || (s.followUp && s.followUp.pieceId !== p.id)) {
    return { moves: [] as Cell[], passes: [] as Piece[], shoot: false, oneTwos: [] as Piece[] };
  }
  const moves = s.kickoffPending || s.followUp ? [] : legalMoves(s, p);
  const passes = canPassNow(s, p) ? passTargets(s, p) : [];
  const shoot = !validateAction(s, { type: 'shoot', pieceId: p.id });
  const oneTwos = canPassNow(s, p) && !s.kickoffPending ? oneTwoPartners(s, p) : [];
  return { moves, passes, shoot, oneTwos };
}

export { COLS, ROWS };
