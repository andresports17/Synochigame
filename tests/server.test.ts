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

    // Illegal: the kickoff must be a pass.
    const bad = await post(`/api/matches/${code}/actions`, { token: homeToken, action: { type: 'endTurn' } });
    expect(bad.status).toBe(422);

    // Clients cannot send clock ticks.
    const tick = await post(`/api/matches/${code}/actions`, { token: homeToken, action: { type: 'tick', ms: 999999 } });
    expect(tick.status).toBe(400);

    // Kickoff pass: Frontliner (H9) to the Anchor (H5) straight behind it.
    const ok = await post(`/api/matches/${code}/actions`, { token: homeToken, action: { type: 'pass', pieceId: 'H9', to: { c: 7, r: 17 } } });
    expect(ok.status).toBe(200);
    expect(ok.json.state.turn).toBe('away');

    const third = await post(`/api/matches/${code}/join`, {});
    expect(third.status).toBe(409);
  });

  it('verifies a match log by replay', async () => {
    const actions = [
      { type: 'pass', pieceId: 'H9', to: { c: 7, r: 17 } },
      { type: 'tick', ms: 600000 },
      { type: 'resume' },
      { type: 'pass', pieceId: 'A9', to: { c: 8, r: 6 } },
      { type: 'tick', ms: 600000 },
    ];
    const r = await post('/api/verify', { setup: { homeFormation: '4-3-3', awayFormation: '4-3-3' }, actions });
    expect(r.json).toMatchObject({ valid: true, finished: true, score: { home: 0, away: 0 } });
    const cheat = await post('/api/verify', { setup: { homeFormation: '4-3-3', awayFormation: '4-3-3' }, actions: [{ type: 'shoot', pieceId: 'H9' }] });
    expect(cheat.json.valid).toBe(false);
  });
});
