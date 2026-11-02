/**
 * SYNOCHÍ match server.
 *
 * - Serves the built web app (dist/).
 * - Runs online invite-code matches. The server owns the game state: every
 *   action is validated by the shared rules engine before it is applied.
 * - Verifies finished matches by replaying the action log (POST /api/verify),
 *   which is how rewards should be granted once currencies move server-side.
 *
 * State is in memory in this build. For production, persist matches and the
 * currency ledger in Postgres (see docs/LAUNCH_PLAN.md).
 */
import express from 'express';
import { randomBytes, randomInt } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FORMATION_NAMES,
  IllegalActionError,
  applyAction,
  createMatch,
  replay,
  type Action,
  type GameState,
  type MatchSetup,
  type Side,
} from '../src/engine/index';

interface OnlineMatch {
  code: string;
  tokens: Partial<Record<Side, string>>;
  formations: Partial<Record<Side, string>>;
  setup?: MatchSetup;
  state?: GameState;
  log: Action[];
  createdAt: number;
  updatedAt: number;
}

const matches = new Map<string, OnlineMatch>();
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MATCH_TTL_MS = 6 * 60 * 60 * 1000;

const newCode = () => {
  let code = '';
  do code = Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');
  while (matches.has(code));
  return code;
};
const newToken = () => randomBytes(16).toString('hex');
const validFormation = (f: unknown): string => (typeof f === 'string' && FORMATION_NAMES.includes(f) ? f : '4-3-3');

function isAction(a: unknown): a is Action {
  if (!a || typeof a !== 'object') return false;
  const t = (a as { type?: unknown }).type;
  return t === 'move' || t === 'pass' || t === 'shoot' || t === 'tackle' || t === 'oneTwo' || t === 'endTurn';
}

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '256kb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true, matches: matches.size }));

  app.post('/api/matches', (req, res) => {
    const code = newCode();
    const token = newToken();
    const now = Date.now();
    matches.set(code, {
      code,
      tokens: { home: token },
      formations: { home: validFormation(req.body?.formation) },
      log: [],
      createdAt: now,
      updatedAt: now,
    });
    res.status(201).json({ code, token, side: 'home' });
  });

  app.post('/api/matches/:code/join', (req, res) => {
    const m = matches.get(req.params.code.toUpperCase());
    if (!m) return res.status(404).json({ error: 'No match with that code. Check the code and try again.' });
    if (m.tokens.away) return res.status(409).json({ error: 'That match already has two players.' });
    const token = newToken();
    m.tokens.away = token;
    m.formations.away = validFormation(req.body?.formation);
    m.setup = { homeFormation: m.formations.home!, awayFormation: m.formations.away };
    m.state = createMatch(m.setup);
    m.updatedAt = Date.now();
    res.json({ code: m.code, token, side: 'away' });
  });

  app.get('/api/matches/:code', (req, res) => {
    const m = matches.get(req.params.code.toUpperCase());
    if (!m) return res.status(404).json({ error: 'Match not found' });
    res.json({ code: m.code, status: m.state ? m.state.phase : 'waiting', state: m.state ?? null, actions: m.log.length });
  });

  app.post('/api/matches/:code/actions', (req, res) => {
    const m = matches.get(req.params.code.toUpperCase());
    if (!m || !m.state) return res.status(404).json({ error: 'Match not started' });
    const side = (Object.keys(m.tokens) as Side[]).find((s) => m.tokens[s] === req.body?.token);
    if (!side) return res.status(403).json({ error: 'You are not a player in this match' });
    if (m.state.turn !== side) return res.status(409).json({ error: 'It is not your turn' });
    const action = req.body?.action;
    if (!isAction(action)) return res.status(400).json({ error: 'Malformed action' });
    try {
      m.state = applyAction(m.state, action);
      m.log.push(action);
      m.updatedAt = Date.now();
      res.json({ state: m.state });
    } catch (e) {
      if (e instanceof IllegalActionError) return res.status(422).json({ error: e.message });
      res.status(400).json({ error: 'Invalid action' });
    }
  });

  /** Replay a match log and report the verified result. */
  app.post('/api/verify', (req, res) => {
    const { setup, actions } = req.body ?? {};
    if (!setup || !Array.isArray(actions) || actions.length > 2000 || !actions.every(isAction))
      return res.status(400).json({ valid: false, error: 'Provide setup and an actions array' });
    try {
      const s = replay(
        { homeFormation: validFormation(setup.homeFormation), awayFormation: validFormation(setup.awayFormation), firstKickoff: setup.firstKickoff === 'away' ? 'away' : 'home' },
        actions,
      );
      res.json({ valid: true, finished: s.phase === 'finished', score: s.score });
    } catch (e) {
      res.json({ valid: false, error: (e as Error).message });
    }
  });

  const here = dirname(fileURLToPath(import.meta.url));
  const dist = join(here, '..', 'dist');
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get('*', (_req, res) => res.sendFile(join(dist, 'index.html')));
  }
  return app;
}

// Drop abandoned matches.
setInterval(() => {
  const cutoff = Date.now() - MATCH_TTL_MS;
  for (const [code, m] of matches) if (m.updatedAt < cutoff) matches.delete(code);
}, 10 * 60 * 1000).unref();

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.PORT ?? 8787);
  createApp().listen(port, () => console.log(`SYNOCHÍ server on http://localhost:${port}`));
}
