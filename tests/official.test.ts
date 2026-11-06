import { describe, expect, it } from 'vitest';
import {
  FORMATION_NAMES,
  HALF_MS,
  QUIZ,
  QUIZ_OPTIONS,
  SCENARIOS,
  TURN_MS,
  applyAction,
  buildPosition,
  canShootFrom,
  createMatch,
  formationPieces,
  getPiece,
  judge,
  legalMoves,
  mustPlayBall,
  offsideLine,
  oneTwoRuns,
  parseCell,
  passOutcome,
  planTurn,
  presetLayout,
  turnPlans,
  replay,
  shotOutcome,
  validateAction,
  validateFormation,
  type Action,
  type GameState,
} from '../src/engine';

const sc = (id: string) => SCENARIOS.find((s) => s.id === id)!;
const cells = (list: { c: number; r: number }[]) => list.map((c) => `${'ABCDEFGHIJKLMNOP'[c.c]}${c.r + 1}`).sort();

describe('1–2 · Board, teams and formations', () => {
  it.each(FORMATION_NAMES)('%s is a legal formation for both sides', (name) => {
    expect(validateFormation('home', formationPieces('home', name))).toEqual([]);
    expect(validateFormation('away', formationPieces('away', name))).toEqual([]);
  });

  it('rejects illegal formations', () => {
    const ps = formationPieces('home', '4-3-3');
    const noKeeper = ps.map((p) => (p.role === 'GK' ? { ...p, role: 'CB' as const } : p));
    expect(validateFormation('home', noKeeper).join()).toMatch(/Box Keeper/);
    const inBox = ps.map((p) => (p.role === 'CB' ? { ...p, pos: parseCell('H23') } : p));
    expect(validateFormation('home', inBox).join()).toMatch(/six-yard box/);
  });

  it('kickoff: home Frontliner on the spot, must pass first, defenders out of the centre circle', () => {
    const s = createMatch({ homeFormation: '4-3-3', awayFormation: '4-3-3', firstKickoff: 'away' });
    expect(getPiece(s, s.ball.carrier!)!.role).toBe('FW');
    expect(s.kickoffPending).toBe(true);
    const kicker = s.ball.carrier!;
    expect(validateAction(s, { type: 'move', pieceId: kicker, to: parseCell('I13') })).toMatch(/pass/);
    expect(validateAction(s, { type: 'endTurn' })).toMatch(/pass/);
    for (const p of s.pieces.filter((p) => p.side === 'home')) expect(p.pos.r >= 10 && p.pos.r <= 13 && p.pos.c >= 5 && p.pos.c <= 10).toBe(false);
  });
});

describe('3 · Movement', () => {
  it('Flanker reaches 3 diagonally forward only from a flank column', () => {
    const s = sc('o1-movement').setup();
    expect(cells(legalMoves(s, getPiece(s, 'H0')!))).toContain('E11');
    const mid = buildPosition([['home', 'WG', 'F14'], ['away', 'CB', 'H2']], 0);
    expect(cells(legalMoves(mid, getPiece(mid, 'H0')!))).not.toContain('I11');
    expect(cells(legalMoves(mid, getPiece(mid, 'H0')!))).toContain('H12');
  });

  it('rays stop at the first occupied square; outfield pieces never enter a six-yard box', () => {
    const s = buildPosition([['home', 'CB', 'H20'], ['home', 'MF', 'H22'], ['away', 'FW', 'H2']], 0);
    const cb = cells(legalMoves(s, getPiece(s, 'H0')!));
    expect(cb).toContain('H21');
    expect(cb).not.toContain('H22'); // occupied
    expect(cb).not.toContain('G22'); // keeper box
  });

  it('Box Keeper moves up to 2 but stays in its own box', () => {
    const s = createMatch({ homeFormation: '4-3-3', awayFormation: '4-3-3' });
    const gk = s.pieces.find((p) => p.side === 'home' && p.role === 'GK')!;
    for (const c of legalMoves(s, gk)) expect(c.r >= 21 && c.c >= 5 && c.c <= 10).toBe(true);
  });

  it('Anchor moves 2 forward from its own half, 1 from the opponent half', () => {
    const own = buildPosition([['home', 'DM', 'H14'], ['away', 'CB', 'A1']], 1);
    expect(cells(legalMoves(own, getPiece(own, 'H0')!))).toContain('H12');
    const opp = buildPosition([['home', 'DM', 'H10'], ['away', 'CB', 'A1']], 1);
    expect(cells(legalMoves(opp, getPiece(opp, 'H0')!))).not.toContain('H8');
  });
});

describe('4 · Turns', () => {
  it('a carrier that moves into the opponent half outside the shooting zone cannot pass (except the Connector)', () => {
    const s = buildPosition([['home', 'FW', 'H12'], ['home', 'WG', 'B9'], ['away', 'CB', 'A1']], 0);
    const n = applyAction(s, { type: 'move', pieceId: 'H0', to: parseCell('H9') });
    expect(n.turn).toBe('away');
    const c = buildPosition([['home', 'MF', 'H12'], ['home', 'WG', 'B9'], ['away', 'CB', 'A1']], 0);
    const m = applyAction(c, { type: 'move', pieceId: 'H0', to: parseCell('H10') });
    expect(m.followUp).toMatchObject({ pieceId: 'H0', canPass: true });
  });

  it('Q16: attacking pieces may move then shoot; others may not; only the Connector passes after moving outside its own half', () => {
    const am = buildPosition([['home', 'AM', 'H7'], ['away', 'GK', 'L1']], 0);
    const a = applyAction(am, { type: 'move', pieceId: 'H0', to: parseCell('H5') });
    expect(a.followUp).toMatchObject({ canShoot: true, canPass: false });
    const cb = buildPosition([['home', 'CB', 'H5'], ['home', 'FW', 'C5'], ['away', 'GK', 'L1']], 0);
    const c = applyAction(cb, { type: 'move', pieceId: 'H0', to: parseCell('H4') });
    expect(c.followUp).toBeNull(); // a Central Pillar can't move then shoot or pass up here
    expect(c.turn).toBe('away');
    // Standing still, any carrier in the zone may shoot.
    expect(validateAction(cb, { type: 'shoot', pieceId: 'H0' })).toBeNull();
  });

  it('only the piece that moved may act again', () => {
    const s = buildPosition([['home', 'MF', 'H16'], ['home', 'FW', 'L11'], ['away', 'CB', 'D9']], 0);
    const n = applyAction(s, { type: 'move', pieceId: 'H0', to: parseCell('H15') });
    expect(validateAction(n, { type: 'move', pieceId: 'H1', to: parseCell('L10') })).toMatch(/Only the piece/);
    const done = applyAction(n, { type: 'pass', pieceId: 'H0', to: parseCell('L11') });
    expect(done.ball.carrier).toBe('H1');
    expect(done.turn).toBe('away');
  });
});

describe('5 · Passing', () => {
  it('only straight or diagonal passes to teammates', () => {
    const s = buildPosition([['home', 'MF', 'H16'], ['home', 'FW', 'L11'], ['away', 'CB', 'D9']], 0);
    expect(validateAction(s, { type: 'pass', pieceId: 'H0', to: parseCell('L11') })).toMatch(/straight or diagonal/);
  });

  it('adjacent block, interception within 2, ignored from 3', () => {
    const lanes = sc('o3-lanes').setup();
    const dm = getPiece(lanes, 'H0')!;
    expect(passOutcome(lanes, dm, parseCell('B18')).result).toBe('blocked');
    expect(passOutcome(lanes, dm, parseCell('H13')).result).toBe('intercepted');
    expect(passOutcome(lanes, dm, parseCell('E15')).result).toBe('complete');
  });

  it('contested reception: pressure tackle from behind the receiver', () => {
    const s = sc('o4-reception').setup();
    expect(passOutcome(s, getPiece(s, 'H0')!, parseCell('H12')).result).toBe('contested');
    expect(passOutcome(s, getPiece(s, 'H0')!, parseCell('E13')).result).toBe('complete');
  });

  it('Q6: one-two run chosen by the player, any direction in line with the receiver, ball returns', () => {
    const s = sc('o9-one-two').setup();
    const runs = cells(oneTwoRuns(s, getPiece(s, 'H0')!, getPiece(s, 'H1')!));
    expect(runs).toEqual(expect.arrayContaining(['H15', 'J17', 'J19', 'F15'])); // forward, sideways, backward, diagonal
    const n = applyAction(s, { type: 'oneTwo', pieceId: 'H0', viaId: 'H1', to: parseCell('J19') });
    expect(n.ball.carrier).toBe('H0');
    expect(getPiece(n, 'H0')!.pos).toEqual(parseCell('J19'));
    expect(getPiece(n, 'H1')!.pos).toEqual(parseCell('J15')); // the return passer does not move
    expect(n.turn).toBe('away');
    expect(validateAction(s, { type: 'oneTwo', pieceId: 'H0', viaId: 'H1', to: parseCell('G17') })).toMatch(/in line/);
    // Central Pillars may only play one-twos with an Anchor.
    const cb = buildPosition([['home', 'CB', 'H18'], ['home', 'FW', 'J16'], ['away', 'CB', 'A1']], 0);
    expect(validateAction(cb, { type: 'oneTwo', pieceId: 'H0', viaId: 'H1', to: parseCell('H17') })).toMatch(/cannot play a one-two/);
  });

  it('Q6b: a defender on the return line intercepts; one next to the run square tackles under the tackle rules', () => {
    const lane = buildPosition([['home', 'MF', 'H17'], ['home', 'AM', 'J15'], ['away', 'FW', 'J16'], ['away', 'CB', 'A1']], 0);
    const cut = applyAction(lane, { type: 'oneTwo', pieceId: 'H0', viaId: 'H1', to: parseCell('J17') });
    expect(cut.ball.carrier).toBe('A0');
    const tackle = buildPosition([['home', 'MF', 'H17'], ['home', 'AM', 'J15'], ['away', 'DM', 'E14'], ['away', 'CB', 'A1']], 0);
    const won = applyAction(tackle, { type: 'oneTwo', pieceId: 'H0', viaId: 'H1', to: parseCell('F15') });
    expect(won.events.some((e) => e.kind === 'oneTwo')).toBe(true);
    expect(won.ball.carrier).toBe('A0'); // the Anchor next to F15 makes a reactive tackle
  });
});

describe('6 · Offside', () => {
  it('beyond the last outfield defender is offside; the keeper does not count; level is onside', () => {
    const s = sc('o5-offside').setup();
    const off = applyAction(s, { type: 'pass', pieceId: 'H0', to: parseCell('H9') });
    expect(off.events.some((e) => e.kind === 'offside')).toBe(true);
    expect(off.ball.carrier!.startsWith('A')).toBe(true);
    // Step back level, Red pass, then pass: onside.
    let ok = applyAction(s, { type: 'move', pieceId: 'H1', to: parseCell('H10') });
    ok = applyAction(ok, { type: 'endTurn' });
    ok = applyAction(ok, { type: 'pass', pieceId: 'H0', to: parseCell('H10') });
    expect(ok.ball.carrier).toBe('H1');
  });

  it('no outfield defenders, no offside', () => {
    const s = buildPosition([['home', 'MF', 'H15'], ['home', 'FW', 'H4'], ['away', 'GK', 'H2']], 0);
    expect(applyAction(s, { type: 'pass', pieceId: 'H0', to: parseCell('H4') }).ball.carrier).toBe('H1');
  });
});

describe('7 · Tackling', () => {
  it('reactive: a carrier that moves next to a Central Pillar loses the ball', () => {
    const s = sc('o6-reactive').setup();
    const n = applyAction(s, { type: 'move', pieceId: 'H0', to: parseCell('H5') });
    expect(n.ball.carrier!.startsWith('A')).toBe(true);
    expect(n.stats.away.reactiveTackles).toBe(1);
    const safe = applyAction(s, { type: 'move', pieceId: 'H0', to: parseCell('E5') });
    expect(safe.ball.carrier).toBe('H0');
    expect(sc('o6-reactive').success(safe)).toBe(true);
  });

  it('active: Central Pillar diagonal tackle wins the ball and a fresh turn; a lone Frontliner does not', () => {
    const s = sc('o7-active').setup();
    const won = applyAction(s, { type: 'move', pieceId: 'H0', to: parseCell('G15') });
    expect(won.ball.carrier).toBe('H0');
    expect(won.turn).toBe('home');
    expect(won.followUp).toBeNull();
    const alone = applyAction(s, { type: 'move', pieceId: 'H1', to: parseCell('I13') });
    expect(alone.ball.carrier).toBe('A0');
  });
});

describe('8 · Shooting', () => {
  it('shooting zones: band of 4 rows (5th in C–N) minus the no-shoot squares', () => {
    expect(canShootFrom('home', parseCell('H1'))).toBe(false); // goal line
    expect(canShootFrom('home', parseCell('E2'))).toBe(false); // row next to goal, A–E
    expect(canShootFrom('home', parseCell('F2'))).toBe(true);
    expect(canShootFrom('home', parseCell('B4'))).toBe(false); // A–B
    expect(canShootFrom('home', parseCell('C5'))).toBe(true); // 5th row, C–N
    expect(canShootFrom('home', parseCell('H6'))).toBe(false);
    expect(canShootFrom('away', parseCell('H20'))).toBe(true); // mirrored
    expect(canShootFrom('away', parseCell('H24'))).toBe(false);
  });

  it('keeper saves when within one square of the path; straight shot past it scores', () => {
    const s = sc('o8-shooting').setup();
    expect(shotOutcome(s, getPiece(s, 'H0')!).outcome).toBe('save');
    let n = applyAction(s, { type: 'move', pieceId: 'H0', to: parseCell('G4') });
    n = applyAction(n, { type: 'shoot', pieceId: 'H0' });
    expect(n.score.home).toBe(1);
    expect(n.kickoffPending).toBe(true);
    expect(n.turn).toBe('away');
  });

  it('Q8: a blocked shot rebounds one square back and stays loose until a piece moves onto it', () => {
    // A Red Flanker blocks (a Flanker makes no reactive tackles, so Blue can collect safely).
    const s = buildPosition([['home', 'FW', 'G5'], ['home', 'AM', 'K6'], ['away', 'WG', 'G3'], ['away', 'GK', 'L1']], 0);
    const n = applyAction(s, { type: 'shoot', pieceId: 'H0' });
    expect(n.events.some((e) => e.kind === 'block')).toBe(true);
    expect(n.ball).toEqual({ pos: parseCell('G4'), carrier: null });
    const back = applyAction(n, { type: 'endTurn' });
    const got = applyAction(back, { type: 'move', pieceId: 'H0', to: parseCell('G4') });
    expect(got.ball.carrier).toBe('H0');
  });
});

describe('9 · Clock', () => {
  it('Q17/Q22: 10-minute halves by default, turn timer off unless asked for', () => {
    const s = createMatch({ homeFormation: '4-3-3', awayFormation: '4-3-3' });
    expect(s.clock.halfMs).toBe(10 * 60 * 1000);
    expect(s.turnTimer).toBe(false);
    expect(createMatch({ homeFormation: '4-3-3', awayFormation: '4-3-3', halfMinutes: 15 }).clock.halfMs).toBe(15 * 60 * 1000);
  });

  it('turn timer forfeits the turn; half and full time follow the match clock', () => {
    let s = createMatch({ homeFormation: '4-3-3', awayFormation: '4-3-3', turnTimer: true, halfMinutes: 5 });
    // The clock does not run until the opening pass.
    s = applyAction(s, { type: 'tick', ms: 60_000 });
    expect(s.clock.halfMs).toBe(5 * 60 * 1000);
    const fw = s.ball.carrier!;
    s = applyAction(s, { type: 'pass', pieceId: fw, to: s.pieces.find((p) => p.side === 'home' && p.role === 'DM')!.pos });
    expect(s.turn).toBe('away');
    s = applyAction(s, { type: 'tick', ms: TURN_MS });
    expect(s.turn).toBe('home');
    expect(s.events.at(-1)!.kind).toBe('timeout');
    s = applyAction(s, { type: 'tick', ms: HALF_MS });
    expect(s.phase).toBe('halftime');
    s = applyAction(s, { type: 'resume', awayFormation: '5-3-2' });
    expect(s.half).toBe(2);
    expect(s.turn).toBe('away'); // the other team kicks off the second half
    expect(s.formations.away).toBe('5-3-2');
    const kick = s.ball.carrier!;
    s = applyAction(s, { type: 'pass', pieceId: kick, to: s.pieces.find((p) => p.side === 'away' && p.role === 'DM')!.pos });
    s = applyAction(s, { type: 'tick', ms: HALF_MS });
    expect(s.phase).toBe('finished');
  });
});

describe("David's decisions (questionnaire, 6 Nov 2026)", () => {
  it('Q23: the keeper counts for offside (second-last defender)', () => {
    const s = buildPosition([['home', 'MF', 'H15'], ['home', 'FW', 'H9'], ['away', 'CB', 'F10'], ['away', 'GK', 'I2']], 0);
    expect(offsideLine(s, 'home')).toBe(14); // the Central Pillar on row 10
    // With only the keeper back, it is the last defender: one opponent is not enough for an offside line.
    const one = buildPosition([['home', 'MF', 'H15'], ['home', 'FW', 'H4'], ['away', 'GK', 'H2']], 0);
    expect(offsideLine(one, 'home')).toBeNull();
  });

  it('Q5: offside is checked before interception', () => {
    const s = buildPosition([['home', 'MF', 'H15'], ['home', 'FW', 'H9'], ['away', 'AM', 'H14'], ['away', 'CB', 'F10'], ['away', 'GK', 'I2']], 0);
    expect(passOutcome(s, getPiece(s, 'H0')!, parseCell('H9')).result).toBe('offside');
  });

  it('Q24: the keeper may move anywhere in its own 18-yard box, outfield pieces still stay out of the six-yard box', () => {
    const s = buildPosition([['home', 'GK', 'H23'], ['away', 'FW', 'A1']], 1);
    const moves = cells(legalMoves(s, getPiece(s, 'H0')!));
    expect(moves).toContain('H21'); // up to the edge of the 18-yard box (rows 21–24)
    expect(moves).toContain('F21');
    expect(moves).not.toContain('H20');
  });

  it('Q20: possession limit forces the ball to move, and hands it over if it does not', () => {
    let s = buildPosition([['home', 'DM', 'H18'], ['home', 'CB', 'E20'], ['away', 'FW', 'H10'], ['away', 'CB', 'A1']], 0);
    s = { ...s, stallLimit: 2 };
    for (let i = 0; i < 2; i++) {
      s = applyAction(s, { type: 'move', pieceId: 'H1', to: parseCell(i === 0 ? 'E19' : 'E20') }); // ball stays still
      s = applyAction(s, { type: 'endTurn' }); // Red
    }
    expect(mustPlayBall(s)).toBe(true);
    expect(validateAction(s, { type: 'move', pieceId: 'H1', to: parseCell('E19') })).toMatch(/Possession limit/);
    const handed = applyAction(s, { type: 'endTurn' });
    expect(handed.ball.carrier!.startsWith('A')).toBe(true);
    const moved = applyAction(s, { type: 'move', pieceId: 'H0', to: parseCell('H17') });
    expect(moved.ball.carrier).toBe('H0');
  });

  it('Q2: a custom layout is used for kickoff', () => {
    const layout = presetLayout('home', '4-3-3').map((l) => (l.role === 'WG' && l.pos.c === 2 ? { ...l, pos: parseCell('A17') } : l));
    expect(validateFormation('home', layout.map((l, i) => ({ id: `x${i}`, side: 'home' as const, ...l })))).toEqual([]);
    const s = createMatch({ homeFormation: '4-3-3', awayFormation: '4-3-3', homeLayout: layout });
    expect(s.pieces.some((p) => p.side === 'home' && p.role === 'WG' && p.pos.c === 0 && p.pos.r === 16)).toBe(true);
  });

  it('Q15: the CPU considers one-twos, and its plans stay legal', () => {
    const s = sc('o9-one-two').setup();
    expect(turnPlans(s, true).some((p) => p.actions[0].type === 'oneTwo')).toBe(true);
    expect(turnPlans(s, false).some((p) => p.actions[0].type === 'oneTwo')).toBe(false);
    for (const level of ['beginner', 'baller', 'master'] as const) {
      let n = s;
      for (const a of planTurn(s, level)) n = applyAction(n, a); // throws if illegal
      expect(n.turnNumber).toBeGreaterThan(s.turnNumber);
    }
  });
});

describe('Lessons', () => {
  it.each(SCENARIOS.map((x) => x.id))('%s starts unsolved', (id) => {
    expect(sc(id).success(sc(id).setup())).toBe(false);
  });

  const solutions: Record<string, Action[]> = {
    'o1-movement': [{ type: 'move', pieceId: 'H0', to: parseCell('E11') }],
    'o2-move-pass': [{ type: 'move', pieceId: 'H0', to: parseCell('H15') }, { type: 'pass', pieceId: 'H0', to: parseCell('L11') }],
    'o3-lanes': [{ type: 'pass', pieceId: 'H0', to: parseCell('E15') }],
    'o4-reception': [{ type: 'pass', pieceId: 'H0', to: parseCell('E13') }],
    'o9-one-two': [{ type: 'oneTwo', pieceId: 'H0', viaId: 'H1', to: parseCell('H15') }],
  };
  it.each(Object.keys(solutions))('%s can be solved', (id) => {
    let s: GameState = sc(id).setup();
    for (const a of solutions[id]) s = applyAction(s, a);
    expect(sc(id).success(s)).toBe(true);
  });
});

describe("Ref's Eye", () => {
  it.each(QUIZ.map((q) => q.id))('%s: the engine makes the expected call', (id) => {
    const q = QUIZ.find((x) => x.id === id)!;
    expect(judge(q).call).toBe(q.expected);
    expect(QUIZ_OPTIONS[q.kind]).toContain(q.expected);
  });
});

describe('Full match', () => {
  it('CPU vs CPU is legal, finishes on the clock and replays exactly', () => {
    const setup = { homeFormation: '4-4-2', awayFormation: '4-2-3-1' };
    let s = createMatch(setup);
    const log: Action[] = [];
    const push = (a: Action) => {
      s = applyAction(s, a);
      log.push(a);
    };
    while (s.phase !== 'finished') {
      if (s.phase === 'halftime') {
        push({ type: 'resume' });
        continue;
      }
      for (const a of planTurn(s, s.turn === 'home' ? 'baller' : 'beginner')) {
        if (s.phase !== 'playing') break;
        push(a);
      }
      if (s.phase === 'playing') push({ type: 'tick', ms: 8000 });
    }
    const again = replay(setup, log);
    expect(again.score).toEqual(s.score);
    expect(again.stats).toEqual(s.stats);
  }, 120_000);
});
