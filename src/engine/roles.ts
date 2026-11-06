import { isFlank, inOwnHalf, forwardDir } from './board';
import type { Piece, Role } from './types';

export const ROLE_NAMES: Record<Role, string> = {
  GK: 'Box Keeper',
  CB: 'Central Pillar',
  FB: 'Defensive Flanker',
  DM: 'Anchor',
  MF: 'Connector',
  AM: 'Sparker',
  WG: 'Flanker',
  FW: 'Frontliner',
};

export const ROLE_SUMMARY: Record<Role, string> = {
  FW: 'Striker. Up to 3 forward (straight or diagonal), 1 back, 2 sideways.',
  WG: 'Winger. 3 straight forward; 2 diagonal forward, or 3 from the flank columns; 2 back; 2 sideways.',
  MF: 'Link player. 2 in any direction. Can move then pass from anywhere.',
  DM: 'Defensive mid. 2 forward from own half (1 from the opponent half), 3 back, 2 sideways. Tackles in own half or in a double-team.',
  AM: 'Attacking mid. 3 straight forward, 2 diagonal forward, 2 back, 3 sideways. Cannot move then shoot.',
  CB: 'Centre-back. 1 forward, 3 straight back, 2 diagonal back, 2 sideways. Tackles diagonally, or when the carrier has no clear pass in own half.',
  FB: 'Fullback. 2 forward; 3 straight back from the flank columns (otherwise 2); 3 diagonal back; 2 sideways. Tackles from the flank columns.',
  GK: 'Goalkeeper. Up to 2 in any direction, never leaving its own six-yard box.',
};

/**
 * Maximum squares a piece may travel along direction (dc, dr), per the table in
 * rule 3. Ranges that depend on position ("from own half", "starting in flank
 * columns") use the starting square.
 */
export function maxRange(p: Piece, dc: number, dr: number): number {
  const fwd = dr !== 0 && dr === forwardDir(p.side);
  const back = dr !== 0 && !fwd;
  const straight = dc === 0;
  const flank = isFlank(p.pos.c);
  switch (p.role) {
    case 'FW':
      return fwd ? 3 : back ? 1 : 2;
    case 'WG':
      if (fwd) return straight ? 3 : flank ? 3 : 2;
      return back ? 2 : 2;
    case 'MF':
      return 2;
    case 'DM':
      if (fwd) return inOwnHalf(p.side, p.pos) ? 2 : 1;
      return back ? 3 : 2;
    case 'AM':
      if (fwd) return straight ? 3 : 2;
      return back ? 2 : 3;
    case 'CB':
      if (fwd) return 1;
      if (back) return straight ? 3 : 2;
      return 2;
    case 'FB':
      if (fwd) return 2;
      if (back) return straight ? (flank ? 3 : 2) : 3;
      return 2;
    case 'GK':
      return 2;
  }
}

/** One-two partners by passing role (rule 5.4). */
export const ONE_TWO_PARTNERS: Record<Role, Role[]> = {
  FW: ['AM', 'WG', 'FW'],
  WG: ['FW', 'FB', 'WG'],
  AM: ['FW', 'WG', 'MF', 'AM'],
  MF: ['AM', 'FW', 'WG', 'FB', 'DM', 'MF'],
  DM: ['MF', 'FB', 'CB', 'DM'],
  CB: ['DM'],
  FB: ['WG', 'MF', 'DM', 'FB'],
  GK: [],
};
