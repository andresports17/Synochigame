import { describe, expect, it } from 'vitest';
import {
  QUIZ,
  SCENARIOS,
  applyAction,
  buildPosition,
  createMatch,
  getPiece,
  judge,
  moveTargets,
  offsideLine,
  offsidePositions,
  optionsFor,
  parseCell,
  planTurn,
  replay,
  restartForOut,
  restartForbidden,
  validateAction,
  type Action,
} from '../src/engine';

const sc = (id: string) => SCENARIOS.find((s) => s.id === id)!;

describe('Law 11: offside', () => {
  it('level with the second-last defender is onside; one row beyond is offside', () => {
    const s = sc('law-offside-level').setup();
    const am = getPiece(s, 'H0')!;
    expect(offsidePositions(s, am).map((p) => p.id)).toEqual(['H1']);
    // Pass now: flagged offside, indirect free kick to Red at the offender's square.
    const flagged = applyAction(s, { type: 'pass', pieceId: 'H0', to: parseCell('H20') });
    expect(flagged.events.some((e) => e.kind === 'offside')).toBe(true);
    expect(flagged.restart).toMatchObject({ type: 'indirectFreeKick', side: 'away', spot: parseCell('H20') });
    expect(flagged.turn).toBe('away');
    // Step back level first: legal.
    let ok = applyAction(s, { type: 'move', pieceId: 'H1', to: parseCell('H19') });
    ok = applyAction(ok, { type: 'pass', pieceId: 'H0', to: parseCell('H19') });
    expect(ok.ball.carrier).toBe('H1');
    expect(sc('law-offside-level').success(ok)).toBe(true);
  });

  it('is judged when the ball is played, not when it is collected', () => {
    const s = sc('law-offside-run').setup();
    // Pass into space, then run: legal.
    let legal = applyAction(s, { type: 'pass', pieceId: 'H0', to: parseCell('J20') });
    expect(legal.ball.carrier).toBeNull();
    legal = applyAction(legal, { type: 'move', pieceId: 'H1', to: parseCell('J20') });
    expect(legal.ball.carrier).toBe('H1');
    // Run first, then pass into space and collect: offside.
    let early = applyAction(s, { type: 'move', pieceId: 'H1', to: parseCell('J19') });
    early = applyAction(early, { type: 'pass', pieceId: 'H0', to: parseCell('J20') });
    expect(early.offsideWatch?.ids).toEqual(['H1']);
    // The piece already moved this turn; next turn it collects and is flagged.
    early = applyAction(early, { type: 'endTurn' });
    early = applyAction(early, { type: 'endTurn' });
    early = applyAction(early, { type: 'move', pieceId: 'H1', to: parseCell('J20') });
    expect(early.events.at(-1)!.kind).not.toBe('pickup');
    expect(early.events.some((e) => e.kind === 'offside')).toBe(true);
  });

  it('no offside in your own half or when behind the ball', () => {
    const own = QUIZ.find((q) => q.id === 'q-own-half')!.setup();
    expect(offsidePositions(own, getPiece(own, 'H0')!)).toHaveLength(0);
    const behind = QUIZ.find((q) => q.id === 'q-behind-ball')!.setup();
    expect(offsideLine(behind, 'home')).toBe(20); // the ball's row (21) sets the line
    expect(offsidePositions(behind, getPiece(behind, 'H0')!)).toHaveLength(0);
  });

  it('no offside from a throw-in', () => {
    const s = sc('law-throw-in').setup();
    expect(offsidePositions(s, getPiece(s, 'H0')!).map((p) => p.id)).toContain('H1');
    const n = applyAction(s, { type: 'pass', pieceId: 'H0', to: parseCell('C19') });
    expect(n.ball.carrier).toBe('H1');
    expect(n.restart).toBeNull();
  });

  it('quick mode has no offside', () => {
    const s = { ...sc('law-offside-level').setup(), mode: 'quick' as const };
    const n = applyAction(s, { type: 'pass', pieceId: 'H0', to: parseCell('H20') });
    expect(n.ball.carrier).toBe('H1');
  });
});

describe('Laws 9, 15–17: ball out of play and restarts', () => {
  it('maps the exit point and last touch to the right restart', () => {
    expect(restartForOut('home', { c: -1, r: 5 })).toMatchObject({ type: 'throwIn', side: 'away', spot: { c: 0, r: 5 } });
    expect(restartForOut('home', { c: 2, r: 24 })).toMatchObject({ type: 'goalKick', side: 'away' });
    expect(restartForOut('away', { c: 2, r: 24 })).toMatchObject({ type: 'corner', side: 'home', spot: { c: 0, r: 23 } });
    expect(restartForOut('away', { c: 13, r: -1 })).toMatchObject({ type: 'goalKick', side: 'home' });
    expect(restartForOut('home', { c: 13, r: -1 })).toMatchObject({ type: 'corner', side: 'away', spot: { c: 15, r: 0 } });
  });

  it('a throw-in cannot be scored directly, the taker must take it, and it has a short range', () => {
    const s = sc('law-throw-in').setup();
    expect(validateAction(s, { type: 'shoot', pieceId: 'H0', target: { c: 7, r: 24 } })).toMatch(/throw-in/);
    expect(validateAction(s, { type: 'endTurn' })).toMatch(/throw-in/);
    expect(moveTargets(s, 'H0')).toHaveLength(0);
    expect(validateAction(s, { type: 'pass', pieceId: 'H0', to: parseCell('A21') })).toMatch(/range/);
  });

  it('opponents retreat from a corner and cannot tackle until it is taken', () => {
    // Red CB starts right next to the corner square.
    const s = buildPosition(
      [['home', 'WG', 'N22'], ['home', 'FW', 'J21'], ['away', 'GK', 'H24'], ['away', 'CB', 'O23']],
      3,
      'away',
      { mode: 'laws' },
    );
    // Red's Central Pillar clears over their own goal line from O23: corner to Blue.
    const n = applyAction(s, { type: 'pass', pieceId: 'A1', to: { c: 15, r: 24 } });
    expect(n.restart).toMatchObject({ type: 'corner', side: 'home', spot: { c: 15, r: 23 } });
    for (const p of n.pieces.filter((p) => p.side === 'away')) expect(restartForbidden(n.restart!, p.pos)).toBe(false);
    expect(n.events.some((e) => e.kind === 'encroach')).toBe(true);
    expect(n.turn).toBe('home');
  });

  it('a corner can be scored directly from the delivery sequence in the lesson', () => {
    let s = sc('law-corner').setup();
    s = applyAction(s, { type: 'pass', pieceId: 'H0', to: parseCell('J21') });
    s = applyAction(s, { type: 'shoot', pieceId: 'H1', target: { c: 9, r: 24 } });
    expect(s.score.home).toBe(1);
  });

  it('goal kicks clear the penalty area', () => {
    const t = buildPosition([['home', 'WG', 'N20'], ['away', 'GK', 'H24'], ['home', 'FW', 'H22']], 0, 'home', { mode: 'laws' });
    const n = applyAction(t, { type: 'pass', pieceId: 'H0', to: { c: 13, r: 24 } });
    expect(n.restart).toMatchObject({ type: 'goalKick', side: 'away', takerId: 'A0' });
    expect(getPiece(n, 'H1')!.pos.r).toBeLessThan(20); // Blue FW pushed out of Red's box
  });

  it('parried shots and hard deflections go out for a corner', () => {
    const q = QUIZ.find((x) => x.id === 'q-parry')!;
    const { after } = judge(q);
    expect(after.events.some((e) => e.kind === 'parry')).toBe(true);
    expect(after.restart?.type).toBe('corner');
    expect(after.turn).toBe('away'); // defenders get to set up first
  });
});

describe('Law 12: keeper handling', () => {
  it('keepers may leave the box in Laws Mode but cannot handle outside it', () => {
    const s = buildPosition([['home', 'FW', 'H18'], ['away', 'GK', 'H20'], ['away', 'CB', 'A23']], 0, 'home', { mode: 'laws' });
    // Red's keeper at H20 is outside the box (rows 21–24) and on the shot line: it acts as a blocker, no save.
    const n = applyAction(s, { type: 'shoot', pieceId: 'H0', target: { c: 7, r: 24 } });
    expect(['block', 'deflect']).toContain(n.events.find((e) => ['block', 'deflect', 'save', 'parry', 'goal'].includes(e.kind))!.kind);
    const quick = createMatch({ homeFormation: '4-3-3', awayFormation: '4-3-3' });
    const laws = createMatch({ homeFormation: '4-3-3', awayFormation: '4-3-3', mode: 'laws' });
    const gkMovesQuick = moveTargets({ ...quick, turn: 'home' }, 'H0');
    const gkMovesLaws = moveTargets({ ...laws, turn: 'home' }, 'H0');
    expect(gkMovesLaws.length).toBeGreaterThanOrEqual(gkMovesQuick.length);
  });
});

describe("Ref's Eye quiz", () => {
  it.each(QUIZ.map((q) => q.id))('%s: the engine makes the expected call', (id) => {
    const q = QUIZ.find((x) => x.id === id)!;
    const { call } = judge(q);
    expect(call).toBe(q.expected);
    expect(optionsFor(q)).toContain(call);
  });
});

describe('Laws Mode lessons', () => {
  it.each(SCENARIOS.filter((s) => s.kind === 'law').map((s) => s.id))('%s is set up in Laws Mode and unsolved', (id) => {
    const s = sc(id).setup();
    expect(s.mode).toBe('laws');
    expect(sc(id).success(s)).toBe(false);
  });
});

describe('Laws Mode full match', () => {
  it('CPU vs CPU is legal, finishes and replays exactly', () => {
    const setup = { homeFormation: '4-2-3-1', awayFormation: '4-4-2', mode: 'laws' as const };
    let s = createMatch(setup);
    const log: Action[] = [];
    while (s.phase === 'playing') {
      for (const a of planTurn(s, 'pro')) {
        if (s.phase !== 'playing') break;
        s = applyAction(s, a);
        log.push(a);
      }
    }
    const again = replay(setup, log);
    expect(again.score).toEqual(s.score);
    expect(again.events.length).toBe(s.events.length);
  }, 60_000);
});
