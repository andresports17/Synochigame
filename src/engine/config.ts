import type { Role } from './types';

/**
 * ALL GAME RULES LIVE HERE.
 *
 * These values are a provisional, playable rule set written without access to
 * David André's official SYNOCHÍ rulebook. Replace them with the official
 * values (and adjust rules.ts where a rule works differently) once the Rules
 * tab from the original project is available.
 */
export interface RoleStats {
  /** Cells a piece may move per turn (king steps, around other pieces). */
  move: number;
  /** Maximum pass distance (Chebyshev). */
  pass: number;
  /** Shooting power at close range. */
  shot: number;
  /** Strength when tackling or contesting a lofted ball. */
  tackle: number;
  /** Strength when keeping the ball under a tackle or receiving a lofted pass. */
  control: number;
  /** Goalkeepers only: shot-stopping strength. */
  save?: number;
}

export const ROLE_STATS: Record<Role, RoleStats> = {
  GK: { move: 2, pass: 8, shot: 3, tackle: 4, control: 3, save: 6 },
  CB: { move: 2, pass: 6, shot: 3, tackle: 5, control: 3 },
  FB: { move: 3, pass: 6, shot: 3, tackle: 4, control: 3 },
  DM: { move: 2, pass: 7, shot: 4, tackle: 5, control: 4 },
  MF: { move: 3, pass: 8, shot: 4, tackle: 3, control: 4 },
  AM: { move: 3, pass: 7, shot: 5, tackle: 2, control: 5 },
  WG: { move: 4, pass: 6, shot: 5, tackle: 2, control: 4 },
  FW: { move: 3, pass: 5, shot: 6, tackle: 2, control: 5 },
};

export const ROLE_NAMES: Record<Role, string> = {
  GK: 'Goalkeeper',
  CB: 'Centre-Back',
  FB: 'Full-Back',
  DM: 'Defensive Mid',
  MF: 'Midfielder',
  AM: 'Attacking Mid',
  WG: 'Winger',
  FW: 'Forward',
};

export const RULES = {
  cols: 16,
  rows: 24,
  /** Goal mouth columns, inclusive (G–J). */
  goalCols: [6, 9] as const,
  /** Goalkeeper must stay inside the penalty area: these columns, and this many rows from the goal line. */
  boxCols: [3, 12] as const,
  boxDepth: 4,
  actionsPerTurn: 3,
  /** Turns per half, both sides counted (12 each). */
  turnsPerHalf: 24,
  /** A piece dribbling with the ball moves this many fewer cells (minimum 1). */
  dribblePenalty: 1,
  /** Passes longer than this are lofted: they fly over pieces but are contested where they land. */
  groundPassMax: 4,
  /** Control value of an empty landing cell when a lofted pass into space is contested. */
  spaceControl: 2,
  /** Maximum shooting distance (Chebyshev, to the goal-line target). */
  maxShotDistance: 9,
  /** Shot power drops by 1 for each full band of this many cells beyond the first. */
  shotFalloff: 4,
  /** Goalkeeper reach: the keeper can only save shots aimed within this distance. */
  keeperReach: 2,
  /** A one-two costs this many actions. */
  oneTwoCost: 2,
} as const;

export type Rules = typeof RULES;
