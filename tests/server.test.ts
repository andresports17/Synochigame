import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../server/index';

let server: Server;
let base = '';
beforeAll(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  const addr = server.address();
  base = `http://localhost:${typeof addr === 'object' && addr ? addr.port : 0}`;
});
afterAll(() => server.close());

const post = async (path: string, body: unknown) => {
  const r = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json() };
};

describe('match server', () => {
  it('runs an invite-code match with server-side validation', async () => {
    const created = await post('/api/matches', { formation: '4-3-3' });
    expect(created.status).toBe(201);
    const { code, token: homeToken } = created.json;
    const joined = await post(`/api/matches/${code}/join`, { formation: '4-4-2' });
    expect(joined.json.side).toBe('away');

    // Away cannot act on home's turn.
    const early = await post(`/api/matches/${code}/actions`, { token: joined.json.token, action: { type: 'endTurn' } });
    expect(early.status).toBe(409);

    // Illegal move is rejected by the engine.
    const bad = await post(`/api/matches/${code}/actions`, { token: homeToken, action: { type: 'move', pieceId: 'H0', to: { c: 7, r: 20 } } });
    expect(bad.status).toBe(422);

    const ok = await post(`/api/matches/${code}/actions`, { token: homeToken, action: { type: 'endTurn' } });
    expect(ok.status).toBe(200);
    expect(ok.json.state.turn).toBe('away');

    const third = await post(`/api/matches/${code}/join`, {});
    expect(third.status).toBe(409);
  });

  it('verifies a match log by replay', async () => {
    const actions = Array.from({ length: 48 }, () => ({ type: 'endTurn' }));
    const r = await post('/api/verify', { setup: { homeFormation: '4-3-3', awayFormation: '4-3-3' }, actions });
    expect(r.json).toMatchObject({ valid: true, finished: true, score: { home: 0, away: 0 } });
    const cheat = await post('/api/verify', { setup: { homeFormation: '4-3-3', awayFormation: '4-3-3' }, actions: [{ type: 'shoot', pieceId: 'H9', target: { c: 7, r: 24 } }] });
    expect(cheat.json.valid).toBe(false);
  });
});
