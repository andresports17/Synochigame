import type { Cell, Side } from './types';

/**
 * Board geometry from rule 1. Internal row 0 is the top of the board.
 * Home attacks toward row 0 (up); Away attacks toward row 23 (down).
 */
export const ROWS = 24;
export const COLS = 16;
export const COL_LETTERS = 'ABCDEFGHIJKLMNOP';

/** Goal-line columns F–K, with the on-target inner mouth G–J. */
export const GOAL_COLS = [5, 10] as const;
export const INNER_GOAL_COLS = [6, 9] as const;

/** Six-yard (keeper) box: columns F–K, three rows deep at each end. */
export const KEEPER_BOX_COLS = [5, 10] as const;
export const KEEPER_BOX_DEPTH = 3;

/** Centre circle area: rows 10–13, columns F–K. */
export const CENTRE_ROWS = [10, 13] as const;
export const CENTRE_COLS = [5, 10] as const;

/** Flank columns A–C and N–P (rule 3.1). */
export const isFlank = (c: number) => c <= 2 || c >= COLS - 3;

/** Kickoff spots, one either side of halfway. Not fixed by the rules extract: confirm. */
export const KICKOFF_SPOT: Record<Side, Cell> = { home: { c: 7, r: 12 }, away: { c: 8, r: 11 } };

export const HALF_MS = 5 * 60 * 1000;
export const TURN_MS = 25 * 1000;
export const TURN_WARNING_MS = 10 * 1000;

export const opponent = (s: Side): Side => (s === 'home' ? 'away' : 'home');

/** Row step toward the side's attacking goal. */
export const forwardDir = (s: Side) => (s === 'home' ? -1 : 1);

/** The goal line a side attacks. */
export const attackGoalRow = (s: Side) => (s === 'home' ? 0 : ROWS - 1);

/** Rows advanced toward the opponent's goal line (0 = own goal line, 23 = opponent goal line). */
export const progress = (s: Side, r: number) => (s === 'home' ? ROWS - 1 - r : r);

/** Rows from the opponent goal line, as used by the shooting zones (rule 8.1). */
export const rowsFromGoal = (s: Side, r: number) => (s === 'home' ? r : ROWS - 1 - r);

export const inOwnHalf = (s: Side, c: Cell) => (s === 'home' ? c.r >= ROWS / 2 : c.r < ROWS / 2);

export const onBoard = (c: Cell) => c.c >= 0 && c.c < COLS && c.r >= 0 && c.r < ROWS;

export const sameCell = (a: Cell, b: Cell) => a.c === b.c && a.r === b.r;

export const dist = (a: Cell, b: Cell) => Math.max(Math.abs(a.c - b.c), Math.abs(a.r - b.r));

export const adjacent = (a: Cell, b: Cell) => dist(a, b) === 1;

export const key = (c: Cell) => c.r * COLS + c.c;

export function inKeeperBox(side: Side, c: Cell): boolean {
  if (c.c < KEEPER_BOX_COLS[0] || c.c > KEEPER_BOX_COLS[1]) return false;
  return side === 'home' ? c.r >= ROWS - KEEPER_BOX_DEPTH : c.r < KEEPER_BOX_DEPTH;
}

export const inAnyKeeperBox = (c: Cell) => inKeeperBox('home', c) || inKeeperBox('away', c);

export const inCentreCircle = (c: Cell) =>
  c.r >= CENTRE_ROWS[0] && c.r <= CENTRE_ROWS[1] && c.c >= CENTRE_COLS[0] && c.c <= CENTRE_COLS[1];

/**
 * Shooting zone (rule 8.1) for the side attacking. The band is the four rows
 * nearest the opponent goal line plus a fifth row in columns C–N; the no-shoot
 * zones then remove the goal-line row itself, columns A–E and L–P on the next
 * row, and columns A–B and O–P across the first five rows.
 */
export function canShootFrom(side: Side, c: Cell): boolean {
  const d = rowsFromGoal(side, c.r);
  const inBand = d <= 3 || (d === 4 && c.c >= 2 && c.c <= COLS - 3);
  if (!inBand) return false;
  if (d === 0) return false;
  if (d === 1 && (c.c <= 4 || c.c >= 11)) return false;
  if (d <= 4 && (c.c <= 1 || c.c >= COLS - 2)) return false;
  return true;
}

/** "H13" style label: column letter + row number counted from the top (row 1 = internal row 0). Confirm orientation. */
export const cellName = (c: Cell) => `${COL_LETTERS[c.c] ?? '?'}${c.r + 1}`;

export function parseCell(name: string): Cell {
  const c = COL_LETTERS.indexOf(name[0].toUpperCase());
  const r = Number(name.slice(1)) - 1;
  if (c < 0 || !(r >= 0 && r < ROWS)) throw new Error(`Bad cell ${name}`);
  return { c, r };
}

export const DIRECTIONS: ReadonlyArray<[number, number]> = [
  [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1],
];
