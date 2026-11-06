import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { QUIZ, applyAction, createMatch, judge, parseCell, planTurn, type Action, type GameState, type MatchSetup } from '../src/engine';
import { createApp } from '../server/index';
import { Ledger } from '../server/ledger';

let clock = Date.UTC(2026, 10, 6, 12, 0, 0);
const ledger = new Ledger();
let server: Server;
let base = '';
beforeAll(async () => {
  server = createApp({ ledger, now: () => clock }).listen(0);
  await new Promise((r) => server.once('listening', r));
  const addr = server.address();
  base = `http://localhost:${typeof addr === 'object' && addr ? addr.port : 0}`;
});
afterAll(() => server.close());

const call = async (method: string, path: string, token?: string, body?: unknown) => {
  const r = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, json: await r.json() };
};

/** Play a whole match locally the way the app does: the human (Blue) and the real CPU (Red). */
function playMatch(setup: MatchSetup, difficulty: 'beginner' | 'baller' | 'master') {
  let s: GameState = createMatch(setup);
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
    for (const a of planTurn(s, s.turn === 'home' ? 'baller' : difficulty)) {
      if (s.phase !== 'playing') break;
      push(a);
    }
    if (s.phase === 'playing') push({ type: 'tick', ms: 8000 });
  }
  return { state: s, log };
}

describe('accounts and ledger', () => {
  let token = '';

  it('creates a guest account with empty balances', async () => {
    const r = await call('POST', '/api/accounts');
    expect(r.status).toBe(201);
    token = r.json.token;
    const me = await call('GET', '/api/me', token);
    expect(me.json.account.balances).toEqual({ tokens: 0, boots: 0, medals: 0, takeover: 0 });
    expect((await call('GET', '/api/me', 'wrong')).status).toBe(401);
  });

  it('pays for a verified CPU match, once', async () => {
    const start = await call('POST', '/api/cpu-matches', token, { difficulty: 'beginner', halfMinutes: 5 });
    expect(start.status).toBe(201);
    expect(start.json.setup).toMatchObject({ turnTimer: false, stallLimit: 3, halfMinutes: 5 });
    const { state, log } = playMatch(start.json.setup, 'beginner');
    clock += 11 * 60 * 1000; // real time passes
    const fin = await call('POST', `/api/cpu-matches/${start.json.id}/finish`, token, { actions: log });
    expect(fin.status).toBe(200);
    const res = state.score.home > state.score.away ? 'w' : state.score.home === state.score.away ? 'd' : 'l';
    const expected = 40 + (res === 'w' ? 80 + 100 : res === 'd' ? 30 : 0);
    expect(fin.json.account.balances.tokens).toBe(expected);
    expect(fin.json.account.balances.boots).toBe(state.score.home);
    expect(fin.json.account.record[res]).toBe(1);
    const again = await call('POST', `/api/cpu-matches/${start.json.id}/finish`, token, { actions: log });
    expect(again.status).toBe(404);
  }, 120_000);

  it('rejects a log where the player made the CPU\'s moves', async () => {
    const start = await call('POST', '/api/cpu-matches', token, { difficulty: 'baller', halfMinutes: 5 });
    const { log } = playMatch(start.json.setup, 'baller');
    // Replace the CPU's first reply with a different legal move.
    let s = createMatch(start.json.setup);
    let i = 0;
    while (s.turn === 'home' || log[i].type === 'tick') s = applyAction(s, log[i++]);
    const alt = planTurn(s, 'beginner').find((a) => JSON.stringify(a) !== JSON.stringify(log[i])) ?? { type: 'endTurn' as const };
    const forged = [...log.slice(0, i), alt, ...log.slice(i + 1)];
    clock += 11 * 60 * 1000;
    const fin = await call('POST', `/api/cpu-matches/${start.json.id}/finish`, token, { actions: forged });
    expect(fin.status).toBe(422);
  }, 120_000);

  it('rejects a match clock that ran faster than real time', async () => {
    const start = await call('POST', '/api/cpu-matches', token, { difficulty: 'beginner', halfMinutes: 5 });
    const { log } = playMatch(start.json.setup, 'beginner');
    clock += 60 * 1000; // only one minute passed
    const fin = await call('POST', `/api/cpu-matches/${start.json.id}/finish`, token, { actions: log });
    expect(fin.status).toBe(422);
    expect(fin.json.error).toMatch(/faster than real time/);
  }, 120_000);

  it('pays a verified lesson once, and only if solved', async () => {
    const before = (await call('GET', '/api/me', token)).json.account.balances;
    const bad = await call('POST', '/api/lessons/o1-movement/complete', token, { actions: [{ type: 'endTurn' }] });
    expect(bad.status).toBe(422);
    const solution = [{ type: 'move', pieceId: 'H0', to: parseCell('E11') }];
    const ok = await call('POST', '/api/lessons/o1-movement/complete', token, { actions: solution });
    expect(ok.json.account.balances.medals).toBe(before.medals + 1);
    expect(ok.json.account.balances.tokens).toBe(before.tokens + 20);
    const twice = await call('POST', '/api/lessons/o1-movement/complete', token, { actions: solution });
    expect(twice.json.account.balances.medals).toBe(before.medals + 1);
  });

  it("scores the Ref's Eye quiz on the server", async () => {
    const wrong = await call('POST', '/api/quiz/submit', token, { answers: QUIZ.map(() => 'Play on') });
    expect(wrong.json.passed).toBe(false);
    const right = await call('POST', '/api/quiz/submit', token, { answers: QUIZ.map((q) => judge(q).call) });
    expect(right.json).toMatchObject({ correct: QUIZ.length, passed: true });
    expect(right.json.account.completed).toContain('refs-eye');
  });

  it('sells cosmetics at the server price, only with enough tokens', async () => {
    expect((await call('POST', '/api/shop/buy', token, { itemId: 'nope' })).status).toBe(404);
    const me = (await call('GET', '/api/me', token)).json.account;
    const poor = await call('POST', '/api/shop/buy', token, { itemId: 'gold' }); // 600 tokens
    if (me.balances.tokens < 600) expect(poor.status).toBe(402);
    ledger.commit(me.id, [{ currency: 'tokens', amount: 1000, reason: 'test grant', ref: 'test' }]);
    const bought = await call('POST', '/api/shop/buy', token, { itemId: 'night' });
    expect(bought.status).toBe(200);
    expect(bought.json.account.owned).toContain('night');
    expect((await call('POST', '/api/shop/buy', token, { itemId: 'night' })).status).toBe(409);
  });
});
