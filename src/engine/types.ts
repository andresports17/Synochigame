export type Side = 'home' | 'away';
export type Role = 'GK' | 'CB' | 'FB' | 'DM' | 'MF' | 'AM' | 'WG' | 'FW';

/** Board cell. c = column (0 = A … 15 = P), r = row (0 = row 1 … 23 = row 24). */
export interface Cell {
  c: number;
  r: number;
}

export interface Piece {
  id: string;
  side: Side;
  role: Role;
  pos: Cell;
  /** Has moved this turn (each piece may move once per turn). */
  moved: boolean;
  /** Has attempted a tackle this turn. */
  tackled: boolean;
}

export interface Ball {
  pos: Cell;
  /** id of the piece holding the ball, or null when the ball is loose. */
  carrier: string | null;
}

export type Action =
  | { type: 'move'; pieceId: string; to: Cell }
  | { type: 'pass'; pieceId: string; to: Cell }
  | { type: 'shoot'; pieceId: string; target: Cell }
  | { type: 'tackle'; pieceId: string; targetId: string }
  | { type: 'oneTwo'; pieceId: string; viaId: string; to: Cell }
  | { type: 'endTurn' };

export type EventKind =
  | 'kickoff'
  | 'move'
  | 'dribble'
  | 'pickup'
  | 'pass'
  | 'loosePass'
  | 'intercept'
  | 'oneTwo'
  | 'goal'
  | 'save'
  | 'block'
  | 'tackleWon'
  | 'tackleFailed'
  | 'endTurn'
  | 'halftime'
  | 'fulltime';

export interface GameEvent {
  kind: EventKind;
  side: Side;
  text: string;
  turn: number;
  half: 1 | 2;
}

export type Phase = 'playing' | 'finished';

export interface GameState {
  pieces: Piece[];
  ball: Ball;
  turn: Side;
  actionsLeft: number;
  /** Turns completed in the current half (both sides counted). */
  turnsPlayed: number;
  half: 1 | 2;
  score: Record<Side, number>;
  phase: Phase;
  formations: Record<Side, string>;
  firstKickoff: Side;
  events: GameEvent[];
}

export interface MatchSetup {
  homeFormation: string;
  awayFormation: string;
  firstKickoff?: Side;
}
