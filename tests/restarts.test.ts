import { describe, expect, it } from 'vitest';
import { applyAction, buildPosition, clearTargets, getPiece, isOffside, parseCell, restartForOut, type GameState } from '../src/engine';

const on = (s: GameState): GameState => ({ ...s, restartsEnabled: true });
const cell = (n: string) => parseCell(n);

describe('Stage 1 restarts: ball out of play (Laws 9, 15–17)', () => {
  it('maps where the ball left play and who touched it last to the right restart', () => {
    expect(restartForOut('home', { c: 16, r: 9 })).toMatchObject({ type: 'throwIn', side: 'away', spot: { c: 15, r: 9 } });
    expect(restartForOut('home', { c: 2, r: 24 })).toMatchObject({ type: 'corner', side: 'away', spot: { c: 0, r: 23 } }); // over Blue's own line
    expect(restartForOut('home', { c: 13, r: -1 })).toMatchObject({ type: 'goalKick', side: 'away' }); // over Red's line
    expect(restartForOut('away', { c: 2, r: -1 })).toMatchObject({ type: 'corner', side: 'home', spot: { c: 0, r: 0 } });
  });

  it('clearing over the touchline gives a throw-in to the other team, which must pass up to 4 squares', () => {
    let s = on(buildPosition([['home', 'FB', 'O10'], ['home', 'FW', 'H6'], ['away', 'WG', 'L12'], ['away', 'MF', 'L5'], ['away', 'CB', 'H3']], 0));
    expect(clearTargets(s, getPiece(s, 'H0')!).some((c) => c.c === 16 && c.r === 9)).toBe(true);
    s = applyAction(s, { type: 'clear', pieceId: 'H0', to: { c: 16, r: 9 } });
    expect(s.restart).toMatchObject({ type: 'throwIn', side: 'away', spot: cell('P10') });
    expect(s.turn).toBe('away');
    const taker = getPiece(s, s.restart!.takerId)!;
    expect(taker.pos).toEqual(cell('P10'));
    // Blue keeps a 1-square gap from the thrower.
    expect(Math.max(Math.abs(getPiece(s, 'H0')!.pos.c - 15), Math.abs(getPiece(s, 'H0')!.pos.r - 9))).toBeGreaterThan(1);
    expect(applyAction.bind(null, s, { type: 'shoot', pieceId: taker.id })).toThrow(/must be a pass/);
    expect(applyAction.bind(null, s, { type: 'move', pieceId: taker.id, to: cell('O10') })).toThrow(/must be a pass/);
  });

  it('no offside from a throw-in', () => {
    // Red throw-in to a Red Frontliner beyond Blue's second-last defender.
    let s = on(buildPosition([['away', 'FB', 'A16'], ['away', 'FW', 'C18'], ['home', 'GK', 'H24'], ['home', 'CB', 'E17'], ['home', 'DM', 'H12']], 0, 'away'));
    s = { ...s, restart: { type: 'throwIn', side: 'away', takerId: 'A0', spot: cell('A16') } };
    expect(isOffside(s, getPiece(s, 'A0')!, getPiece(s, 'A1')!)).toBe(true);
    const n = applyAction(s, { type: 'pass', pieceId: 'A0', to: cell('C18') });
    expect(n.ball.carrier).toBe('A1');
    expect(n.restart).toBeNull();
  });

  it('a defender clearing over its own goal line concedes a corner; opponents keep 2 squares away', () => {
    let s = on(buildPosition([['home', 'CB', 'C22'], ['home', 'FB', 'B23'], ['home', 'GK', 'H24'], ['away', 'FW', 'E20']], 0));
    s = applyAction(s, { type: 'clear', pieceId: 'H0', to: { c: 2, r: 24 } });
    expect(s.restart).toMatchObject({ type: 'corner', side: 'away', spot: cell('A24') });
    for (const p of s.pieces.filter((q) => q.side === 'home')) expect(Math.max(Math.abs(p.pos.c - 0), Math.abs(p.pos.r - 23))).toBeGreaterThan(2);
  });

  it('a wide shot gives a goal kick; attackers leave the 18-yard box', () => {
    let s = on(buildPosition([['home', 'FW', 'C4'], ['home', 'WG', 'H4'], ['away', 'GK', 'J2'], ['away', 'CB', 'N8']], 0));
    s = applyAction(s, { type: 'shoot', pieceId: 'H0' });
    expect(s.events.some((e) => e.kind === 'goalKick')).toBe(true);
    expect(s.restart).toMatchObject({ type: 'goalKick', side: 'away', takerId: 'A0' });
    const wg = getPiece(s, 'H1')!;
    expect(wg.pos.c >= 3 && wg.pos.c <= 12 && wg.pos.r <= 3).toBe(false);
  });

  it('ending the turn without taking the restart hands the ball to the other team', () => {
    let s = on(buildPosition([['home', 'FB', 'O10'], ['away', 'WG', 'L12'], ['away', 'CB', 'H3']], 0));
    s = applyAction(s, { type: 'clear', pieceId: 'H0', to: { c: 16, r: 9 } });
    s = applyAction(s, { type: 'endTurn' });
    expect(s.restart).toBeNull();
    expect(s.ball.carrier).toBe('H0');
  });

  it('an opponent on the first square blocks a clearance', () => {
    let s = on(buildPosition([['home', 'FB', 'N10'], ['away', 'WG', 'O10'], ['away', 'CB', 'H3']], 0));
    s = applyAction(s, { type: 'clear', pieceId: 'H0', to: { c: 16, r: 9 } });
    expect(s.ball.carrier).toBe('A0');
    expect(s.restart).toBeNull();
  });

  it('with restarts off the ball never goes out', () => {
    const s = buildPosition([['home', 'FW', 'C4'], ['away', 'GK', 'J2'], ['away', 'CB', 'N8']], 0);
    expect(clearTargets(s, getPiece(s, 'H0')!)).toHaveLength(0);
    const n = applyAction(s, { type: 'shoot', pieceId: 'H0' });
    expect(n.restart).toBeNull();
    expect(n.ball.carrier).toBe('A0');
  });
});

describe('Lesson 10', () => {
  it('is solved by clearing over the touchline', async () => {
    const { SCENARIOS } = await import('../src/engine');
    const sc = SCENARIOS.find((x) => x.id === 'o10-out-of-play')!;
    const s = sc.setup();
    expect(sc.success(s)).toBe(false);
    const n = applyAction(s, { type: 'clear', pieceId: 'H0', to: { c: 16, r: 13 } });
    expect(sc.success(n)).toBe(true);
  });
});
