/**
 * Types for the official SYNOCHÍ rules (David André): the "Official Game Rules —
 * Extraction Draft" of 3 November 2026, as amended by David's answers to the
 * Rules & Launch Questionnaire (6 November 2026).
 */
export type Side = 'home' | 'away';

/**
 * Role codes. Names: GK Box Keeper, CB Central Pillar, FB Defensive Flanker,
 * DM Anchor, MF Connector, AM Sparker, WG Flanker, FW Frontliner.
 */
export type Role = 'GK' | 'CB' | 'FB' | 'DM' | 'MF' | 'AM' | 'WG' | 'FW';

/** Internal coordinates, as in the original engine: c 0–15 = columns A–P, r 0–23 = rows 1–24 from the top. */
export interface Cell {
  c: number;
  r: number;
}

export interface Piece {
  id: string;
  side: Side;
  role: Role;
  pos: Cell;
}

/** A team's starting positions: any legal formation the player sets up (questionnaire Q2). */
export type Layout = Array<{ role: Role; pos: Cell }>;

export interface Ball {
  pos: Cell;
  carrier: string | null;
}

export type Action =
  | { type: 'move'; pieceId: string; to: Cell }
  /** Pass to the teammate standing on `to`. */
  | { type: 'pass'; pieceId: string; to: Cell }
  /** Shot direction is fixed by the shooter's column (rule 8.2). */
  | { type: 'shoot'; pieceId: string }
  /** Give-and-go: pass to `viaId`, run to `to` (chosen by the player), get the ball back (rule 5.4, Q6). */
  | { type: 'oneTwo'; pieceId: string; viaId: string; to: Cell }
  /** End the turn: decline an optional follow-up, or forfeit. */
  | { type: 'endTurn' }
  /** Advance the match and turn clocks by `ms` (real-time play and replays). */
  | { type: 'tick'; ms: number }
  /** Start the second half, optionally with new formations (rule 9). */
  | { type: 'resume'; homeFormation?: string; awayFormation?: string; homeLayout?: Layout; awayLayout?: Layout };

export type EventKind =
  | 'kickoff'
  | 'move'
  | 'recover'
  | 'pass'
  | 'oneTwo'
  | 'blocked'
  | 'intercept'
  | 'contested'
  | 'offside'
  | 'tackle'
  | 'reactiveTackle'
  | 'shot'
  | 'goal'
  | 'save'
  | 'block'
  | 'rebound'
  | 'goalKick'
  | 'endTurn'
  | 'timeout'
  | 'halftime'
  | 'fulltime'
  | 'stall';

export interface GameEvent {
  kind: EventKind;
  side: Side;
  text: string;
  /** Which section of the official rules produced this call, e.g. "Rule 6 · Offside". */
  rule?: string;
  turn: number;
}

export interface Stats {
  passes: number;
  passesCompleted: number;
  shots: number;
  shotsOnTarget: number;
  goals: number;
  saves: number;
  blocks: number;
  tackles: number;
  reactiveTackles: number;
  interceptions: number;
  offsides: number;
}

export type Phase = 'playing' | 'halftime' | 'finished';

export interface GameState {
  pieces: Piece[];
  ball: Ball;
  turn: Side;
  /** Set after a move when the same piece may still pass or shoot (rule 4). */
  followUp: { pieceId: string; canPass: boolean; canShoot: boolean } | null;
  /** True until the opening pass of a kickoff (rule 9). */
  kickoffPending: boolean;
  phase: Phase;
  half: 1 | 2;
  score: Record<Side, number>;
  formations: Record<Side, string>;
  /** Custom starting positions; when set they replace the named formation. */
  layouts: Record<Side, Layout | null>;
  firstKickoff: Side;
  /** Whether the match clock runs. Lessons are untimed. */
  timed: boolean;
  /** Length of each half in ms (Q22: default 10 minutes). */
  halfLength: number;
  /** Whether the 25-second turn timer applies (Q17: online and ranked only). */
  turnTimer: boolean;
  clock: { halfMs: number; turnMs: number };
  /** Possession limit (Q20): turns a team may keep the ball without moving it; null = off. */
  stallLimit: number | null;
  /** Consecutive turns `side` has kept the ball without moving it. */
  stall: { side: Side; turns: number };
  /** Ball position when the current turn began (to detect a turn in which the ball did not move). */
  turnStart: { carrier: string | null; pos: Cell };
  turnNumber: number;
  stats: Record<Side, Stats>;
  events: GameEvent[];
}

export interface MatchSetup {
  homeFormation: string;
  awayFormation: string;
  firstKickoff?: Side;
  homeLayout?: Layout;
  awayLayout?: Layout;
  timed?: boolean;
  /** Minutes per half (Q22: 5, 10 or 15; default 10). */
  halfMinutes?: number;
  /** 25-second turn timer (Q17: on for online and ranked play). */
  turnTimer?: boolean;
  /** Possession limit in turns (Q20: 2 for ranked and the hardest CPU, 3 otherwise). */
  stallLimit?: number | null;
}
