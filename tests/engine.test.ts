import { describe, expect, it } from 'vitest';
import {
  FORMATION_NAMES,
  RULES,
  SCENARIOS,
  applyAction,
  createMatch,
  formationPieces,
  getPiece,
  moveTargets,
  parseCell,
  planTurn,
  replay,
  resolveAction,
  validateAction,
  type Action,
  type GameState,
} from '../src/engine';

const find = (s: GameState, role: string, side: 'home' | 'away' = 'home') =>
  s.pieces.find((p) => p.side === side && p.role === role)!;

function scenario(id: string) {
  return SCENARIOS.find((x) => x.id === id)!;
}

describe('formations', () => {
  it.each(FORMATION_NAMES)('%s has 11 pieces, one keeper, all in their own half', (name) => {
    for (const side of ['home', 'away'] as const) {
      const ps = formationPieces(side, name);
      expect(ps).toHaveLength(11);
      expect(ps.filter((p) => p.role === 'GK')).toHaveLength(1);
      for (const p of ps) expect(side === 'home' ? p.pos.r < 11 : p.pos.r > 12).toBe(true);
      expect(new Set(ps.map((p) => `${p.pos.c},${p.pos.r}`)).size).toBe(11);
    }
  });
});

describe('match setup', () => {
  it('starts with home kicking off from the centre', () => {
    const s = createMatch({ homeFormation: '4-3-3', awayFormation: '4-4-2' });
    expect(s.turn).toBe('home');
    expect(s.actionsLeft).toBe(RULES.actionsPerTurn);
    expect(getPiece(s, s.ball.carrier!)!.role).toBe('FW');
    expect(s.ball.pos).toEqual({ c: 7, r: 11 });
  });
});

describe('movement', () => {
  it('dribbling reduces range by one and moves the ball', () => {
    const s = scenario('l2-dribble').setup();
    const fw = find(s, 'FW');
    const cells = moveTargets(s, fw.id);
    expect(Math.max(...cells.map((c) => Math.abs(c.r - fw.pos.r)))).toBe(2);
    const n = applyAction(s, { type: 'move', pieceId: fw.id, to: { c: fw.pos.c, r: fw.pos.r + 2 } });
    expect(n.ball.pos).toEqual({ c: fw.pos.c, r: fw.pos.r + 2 });
    expect(n.ball.carrier).toBe(fw.id);
  });

  it('a piece may move only once per turn', () => {
    const s = scenario('l1-move').setup();
    const wg = find(s, 'WG');
    const n = applyAction(s, { type: 'move', pieceId: wg.id, to: { c: 2, r: 12 } });
    expect(validateAction(n, { type: 'move', pieceId: wg.id, to: { c: 2, r: 13 } })).toMatch(/already moved/);
  });

  it('keepers cannot leave their box', () => {
    const s = createMatch({ homeFormation: '4-3-3', awayFormation: '4-3-3' });
    const gk = find(s, 'GK');
    for (const c of moveTargets(s, gk.id)) expect(c.r).toBeLessThan(RULES.boxDepth);
  });

  it('collecting a loose ball', () => {
    const s = scenario('l1-move').setup();
    const wg = find(s, 'WG');
    const moved = applyAction({ ...s, ball: { pos: parseCell('C12'), carrier: null } }, {
      type: 'move', pieceId: wg.id, to: parseCell('C12'),
    });
    expect(moved.ball.carrier).toBe(wg.id);
  });
});

describe('passing', () => {
  it('ground passes are intercepted by opponents on the line', () => {
    const s = scenario('l3-pass').setup();
    const n = applyAction(s, { type: 'pass', pieceId: 'H0', to: getPiece(s, 'H2')!.pos });
    expect(getPiece(n, n.ball.carrier!)!.side).toBe('away');
    expect(n.turn).toBe('away'); // losing the ball ends the turn
  });

  it('a two-pass route reaches the forward', () => {
    let s = scenario('l3-pass').setup();
    s = applyAction(s, { type: 'pass', pieceId: 'H0', to: getPiece(s, 'H1')!.pos });
    s = applyAction(s, { type: 'pass', pieceId: 'H1', to: getPiece(s, 'H2')!.pos });
    expect(s.ball.carrier).toBe('H2');
    expect(scenario('l3-pass').success(s)).toBe(true);
  });

  it('lofted passes are contested at the landing cell', () => {
    const s = scenario('l4-lofted').setup();
    const lost = applyAction(s, { type: 'pass', pieceId: 'H0', to: getPiece(s, 'H2')!.pos });
    expect(lost.ball.carrier).toBe('A1');
    const won = applyAction(s, { type: 'pass', pieceId: 'H0', to: getPiece(s, 'H1')!.pos });
    expect(won.ball.carrier).toBe('H1');
  });

  it('cannot pass to an opponent or beyond range', () => {
    const s = scenario('l4-lofted').setup();
    expect(validateAction(s, { type: 'pass', pieceId: 'H0', to: getPiece(s, 'A0')!.pos })).toBeTruthy();
    expect(validateAction(s, { type: 'pass', pieceId: 'H0', to: { c: 7, r: 20 } })).toMatch(/range/);
  });
});

describe('shooting', () => {
  it('keeper saves a long shot, forward scores from close to the far corner', () => {
    const s = scenario('l5-shoot').setup();
    const far = applyAction(s, { type: 'shoot', pieceId: 'H0', target: { c: 9, r: 24 } });
    expect(far.score.home).toBe(0);
    expect(far.ball.carrier).toBe('A0');

    let close = applyAction(s, { type: 'move', pieceId: 'H0', to: parseCell('H21') });
    close = applyAction(close, { type: 'shoot', pieceId: 'H0', target: { c: 9, r: 24 } });
    expect(close.score.home).toBe(1);
    // After a goal the conceding side kicks off with full formations.
    expect(close.turn).toBe('away');
    expect(close.pieces).toHaveLength(22);
  });

  it('defenders on the line block shots', () => {
    const s = scenario('l5-shoot').setup();
    const n = applyAction(s, { type: 'shoot', pieceId: 'H0', target: { c: 6, r: 24 } });
    expect(n.events.at(-1)!.kind === 'block' || n.events.at(-1)!.kind === 'save').toBe(true);
    expect(n.score.home).toBe(0);
  });
});

describe('tackling', () => {
  it('a lone tackle fails but a supported one wins', () => {
    const s = scenario('l6-tackle').setup();
    const fail = applyAction(s, { type: 'tackle', pieceId: 'H0', targetId: 'A0' });
    expect(fail.ball.carrier).toBe('A0');
    let ok = applyAction(s, { type: 'move', pieceId: 'H1', to: parseCell('I14') });
    ok = applyAction(ok, { type: 'tackle', pieceId: 'H0', targetId: 'A0' });
    expect(ok.ball.carrier).toBe('H0');
  });
});

describe('one-two', () => {
  it('passes, runs and receives for two actions', () => {
    const s = scenario('l7-onetwo').setup();
    const n = applyAction(s, { type: 'oneTwo', pieceId: 'H0', viaId: 'H1', to: parseCell('H18') });
    expect(n.ball.carrier).toBe('H0');
    expect(n.actionsLeft).toBe(1);
    expect(scenario('l7-onetwo').success(n)).toBe(true);
  });
});

describe('turns, halves and determinism', () => {
  it('turn passes after three actions or end turn', () => {
    let s = createMatch({ homeFormation: '4-3-3', awayFormation: '4-3-3' });
    s = applyAction(s, { type: 'endTurn' });
    expect(s.turn).toBe('away');
    expect(s.actionsLeft).toBe(3);
  });

  it('plays two halves and finishes', () => {
    let s = createMatch({ homeFormation: '4-3-3', awayFormation: '4-3-3' });
    for (let i = 0; i < RULES.turnsPerHalf; i++) s = applyAction(s, { type: 'endTurn' });
    expect(s.half).toBe(2);
    expect(s.turn).toBe('away');
    for (let i = 0; i < RULES.turnsPerHalf; i++) s = applyAction(s, { type: 'endTurn' });
    expect(s.phase).toBe('finished');
    expect(() => applyAction(s, { type: 'endTurn' })).toThrow();
  });

  it('a CPU vs CPU match is legal, finishes, and replays to the same result', () => {
    const setup = { homeFormation: '4-3-3', awayFormation: '3-5-2' } as const;
    let s = createMatch(setup);
    const log: Action[] = [];
    let guard = 0;
    while (s.phase === 'playing' && guard++ < 1000) {
      const plan = planTurn(s, s.turn === 'home' ? 'pro' : 'rookie');
      expect(plan.length).toBeGreaterThan(0);
      for (const a of plan) {
        if (s.phase !== 'playing') break;
        s = applyAction(s, a); // throws if the CPU ever plays an illegal action
        log.push(a);
      }
    }
    expect(s.phase).toBe('finished');
    const again = replay(setup, log);
    expect(again.score).toEqual(s.score);
    expect(again.events.length).toBe(s.events.length);
    // eslint-disable-next-line no-console
    console.log(`CPU pro vs rookie: ${s.score.home}-${s.score.away}, ${log.length} actions`);
  }, 60_000);

  it('the CPU takes an open goal', () => {
    const s = scenario('l5-shoot').setup();
    const plan = planTurn(s, 'pro');
    let n = s;
    for (const a of plan) n = resolveAction(n, a);
    expect(n.score.home).toBe(1);
  });
});

describe('scenarios', () => {
  it.each(SCENARIOS.map((x) => x.id))('%s sets up a legal, unsolved position', (id) => {
    const sc = scenario(id);
    const s = sc.setup();
    expect(sc.success(s)).toBe(false);
    const cells = new Set(s.pieces.map((p) => `${p.pos.c},${p.pos.r}`));
    expect(cells.size).toBe(s.pieces.length);
  });
});
