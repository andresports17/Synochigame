import { RULES } from './config';
import type { Cell, Side } from './types';

export const COL_LETTERS = 'ABCDEFGHIJKLMNOP';

export const cellName = (c: Cell): string =>
  c.r < 0 || c.r >= RULES.rows ? `Goal ${COL_LETTERS[c.c]}` : `${COL_LETTERS[c.c]}${c.r + 1}`;

export const sameCell = (a: Cell, b: Cell) => a.c === b.c && a.r === b.r;

export const dist = (a: Cell, b: Cell) => Math.max(Math.abs(a.c - b.c), Math.abs(a.r - b.r));

export const onBoard = (c: Cell) => c.c >= 0 && c.c < RULES.cols && c.r >= 0 && c.r < RULES.rows;

export const key = (c: Cell) => c.r * RULES.cols + c.c;

/** Cells on the straight line from a to b (Bresenham), excluding a, including b. */
export function line(a: Cell, b: Cell): Cell[] {
  const out: Cell[] = [];
  let x = a.c;
  let y = a.r;
  const dx = Math.abs(b.c - a.c);
  const dy = -Math.abs(b.r - a.r);
  const sx = a.c < b.c ? 1 : -1;
  const sy = a.r < b.r ? 1 : -1;
  let err = dx + dy;
  while (x !== b.c || y !== b.r) {
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
    out.push({ c: x, r: y });
  }
  return out;
}

export const opponent = (s: Side): Side => (s === 'home' ? 'away' : 'home');

/** Home defends row 1 (top) and attacks row 24; away the reverse. */
export const attackDir = (s: Side) => (s === 'home' ? 1 : -1);

/** Off-board row of the goal a side is attacking. */
export const targetGoalRow = (s: Side) => (s === 'home' ? RULES.rows : -1);

export const ownGoalLineRow = (s: Side) => (s === 'home' ? 0 : RULES.rows - 1);

/** Rows advanced toward the opponent's goal (0 = own goal line, 23 = opponent goal line). */
export const progress = (s: Side, r: number) => (s === 'home' ? r : RULES.rows - 1 - r);

export function goalTargets(attacking: Side): Cell[] {
  const r = targetGoalRow(attacking);
  const out: Cell[] = [];
  for (let c = RULES.goalCols[0]; c <= RULES.goalCols[1]; c++) out.push({ c, r });
  return out;
}

export function inOwnBox(side: Side, c: Cell): boolean {
  if (c.c < RULES.boxCols[0] || c.c > RULES.boxCols[1]) return false;
  return progress(side, c.r) < RULES.boxDepth;
}

export const NEIGHBOURS: ReadonlyArray<[number, number]> = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];
