import { COLS, ROWS, inAnyKeeperBox, inCentreCircle, inKeeperBox, inOwnHalf, key } from './board';
import type { Layout, Piece, Role, Side } from './types';

type Slot = [Role, number, number]; // role, column, depth (0 = own goal line)

/**
 * Preset formations (rule 2.2). Slots are given from the team's own goal line
 * outward; home is placed at the bottom of the board and away mirrored at the top.
 * Positions respect rule 2.1: own half, keeper in its six-yard box, no outfield
 * piece in a six-yard box, and nothing in the centre circle.
 */
export const FORMATIONS: Record<string, { blurb: string; slots: Slot[] }> = {
  '4-3-3': {
    blurb: 'Balanced width and attack; default preset.',
    slots: [
      ['GK', 7, 0],
      ['CB', 6, 3], ['CB', 9, 3], ['FB', 2, 4], ['FB', 13, 4],
      ['DM', 7, 6], ['MF', 4, 8], ['AM', 10, 8],
      ['WG', 2, 10], ['FW', 7, 9], ['WG', 13, 10],
    ],
  },
  '4-4-2': {
    blurb: 'Classic two banks of four.',
    slots: [
      ['GK', 7, 0],
      ['CB', 6, 3], ['CB', 9, 3], ['FB', 2, 4], ['FB', 13, 4],
      ['WG', 2, 8], ['DM', 6, 7], ['MF', 9, 7], ['WG', 13, 8],
      ['FW', 6, 9], ['FW', 9, 9],
    ],
  },
  '3-5-2': {
    blurb: 'Packed midfield, wing-backs.',
    slots: [
      ['GK', 7, 0],
      ['CB', 4, 3], ['CB', 7, 3], ['CB', 11, 3],
      ['FB', 1, 7], ['DM', 7, 5], ['MF', 5, 8], ['AM', 10, 8], ['FB', 14, 7],
      ['FW', 6, 9], ['FW', 9, 9],
    ],
  },
  '4-2-3-1': {
    blurb: 'Double pivot, creative line.',
    slots: [
      ['GK', 7, 0],
      ['CB', 6, 3], ['CB', 9, 3], ['FB', 2, 4], ['FB', 13, 4],
      ['DM', 5, 6], ['DM', 10, 6],
      ['WG', 2, 9], ['AM', 7, 7], ['WG', 13, 9],
      ['FW', 8, 9],
    ],
  },
  '5-3-2': {
    blurb: 'Defensive, counter-attacking.',
    slots: [
      ['GK', 7, 0],
      ['FB', 1, 5], ['CB', 4, 3], ['CB', 7, 3], ['CB', 11, 3], ['FB', 14, 5],
      ['MF', 4, 8], ['DM', 7, 6], ['MF', 11, 8],
      ['FW', 6, 9], ['FW', 9, 9],
    ],
  },
};

export const FORMATION_NAMES = Object.keys(FORMATIONS);
export const DEFAULT_FORMATION = '4-3-3';

export function formationPieces(side: Side, name: string): Piece[] {
  const f = FORMATIONS[name];
  if (!f) throw new Error(`Unknown formation ${name}`);
  return f.slots.map(([role, c, depth], i) => ({
    id: `${side === 'home' ? 'H' : 'A'}${i}`,
    side,
    role,
    pos: side === 'home' ? { c, r: ROWS - 1 - depth } : { c: COLS - 1 - c, r: depth },
  }));
}

/** A preset as a layout (absolute positions for `side`), the starting point for a custom set-up. */
export const presetLayout = (side: Side, name: string): Layout => formationPieces(side, name).map((p) => ({ role: p.role, pos: { ...p.pos } }));

/** Pieces for a custom layout (Q2: any legal formation, placed by the player). */
export function layoutPieces(side: Side, layout: Layout): Piece[] {
  return layout.map((l, i) => ({ id: `${side === 'home' ? 'H' : 'A'}${i}`, side, role: l.role, pos: { ...l.pos } }));
}

/** Mirror a layout to the other side of the board (so a saved layout works for either team). */
export const mirrorLayout = (layout: Layout): Layout => layout.map((l) => ({ role: l.role, pos: { c: COLS - 1 - l.pos.c, r: ROWS - 1 - l.pos.r } }));

/** Whether `role` may start on `c` for `side` (rule 2.1): own half, out of the centre circle, the keeper in its six-yard box and nobody else in a six-yard box. */
export function legalFormationSquare(side: Side, role: Role, c: { c: number; r: number }): boolean {
  if (!inOwnHalf(side, c) || inCentreCircle(c)) return false;
  return role === 'GK' ? inKeeperBox(side, c) : !inAnyKeeperBox(c);
}

/** Rule 2.1 checks for any formation (presets and custom). Returns a list of problems; empty means legal. */
export function validateFormation(side: Side, pieces: Piece[]): string[] {
  const errors: string[] = [];
  if (pieces.length !== 11) errors.push('A formation needs exactly 11 pieces');
  const keepers = pieces.filter((p) => p.role === 'GK');
  if (keepers.length !== 1) errors.push('A formation needs exactly one Box Keeper');
  if (!pieces.some((p) => p.role === 'FW')) errors.push('A formation needs at least one Frontliner to take the kickoff');
  const seen = new Set<number>();
  for (const p of pieces) {
    if (!inOwnHalf(side, p.pos)) errors.push(`${p.role} must start in its own half`);
    if (p.role === 'GK' && !inKeeperBox(side, p.pos)) errors.push('The Box Keeper must start inside its own six-yard box');
    if (p.role !== 'GK' && inAnyKeeperBox(p.pos)) errors.push(`${p.role} may not start in a six-yard box`);
    if (inCentreCircle(p.pos)) errors.push(`${p.role} may not start in the centre circle`);
    const k = key(p.pos);
    if (seen.has(k)) errors.push('Two pieces cannot share a square');
    seen.add(k);
  }
  return errors;
}
