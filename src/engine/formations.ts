import { RULES } from './config';
import type { Piece, Role, Side } from './types';

type Slot = [Role, number, number]; // role, column, row — from the home side's view (home defends row 1)

/** Every formation keeps all eleven pieces in their own half (rows 1–11). */
export const FORMATIONS: Record<string, Slot[]> = {
  '4-3-3': [
    ['GK', 7, 0],
    ['CB', 6, 3], ['CB', 9, 3], ['FB', 2, 4], ['FB', 13, 4],
    ['DM', 7, 6], ['MF', 4, 8], ['AM', 10, 8],
    ['WG', 2, 10], ['FW', 7, 10], ['WG', 13, 10],
  ],
  '4-4-2': [
    ['GK', 7, 0],
    ['CB', 6, 3], ['CB', 9, 3], ['FB', 2, 4], ['FB', 13, 4],
    ['WG', 2, 8], ['DM', 6, 7], ['MF', 9, 7], ['WG', 13, 8],
    ['FW', 6, 10], ['FW', 9, 10],
  ],
  '3-5-2': [
    ['GK', 7, 0],
    ['CB', 4, 3], ['CB', 7, 2], ['CB', 11, 3],
    ['FB', 1, 7], ['DM', 7, 5], ['MF', 5, 8], ['AM', 10, 8], ['FB', 14, 7],
    ['FW', 6, 10], ['FW', 9, 10],
  ],
  '4-2-3-1': [
    ['GK', 7, 0],
    ['CB', 6, 3], ['CB', 9, 3], ['FB', 2, 4], ['FB', 13, 4],
    ['DM', 5, 6], ['DM', 10, 6],
    ['WG', 2, 9], ['AM', 7, 8], ['WG', 13, 9],
    ['FW', 8, 10],
  ],
  '5-3-2': [
    ['GK', 7, 0],
    ['FB', 1, 5], ['CB', 4, 3], ['CB', 7, 2], ['CB', 11, 3], ['FB', 14, 5],
    ['MF', 4, 8], ['DM', 7, 6], ['MF', 11, 8],
    ['FW', 6, 10], ['FW', 9, 10],
  ],
};

export const FORMATION_NAMES = Object.keys(FORMATIONS);

export function formationPieces(side: Side, name: string): Piece[] {
  const slots = FORMATIONS[name];
  if (!slots) throw new Error(`Unknown formation ${name}`);
  return slots.map(([role, c, r], i) => ({
    id: `${side === 'home' ? 'H' : 'A'}${i}`,
    side,
    role,
    // Away mirrors the home layout through the centre of the board.
    pos: side === 'home' ? { c, r } : { c: RULES.cols - 1 - c, r: RULES.rows - 1 - r },
    moved: false,
    tackled: false,
  }));
}
