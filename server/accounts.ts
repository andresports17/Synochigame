/**
 * Account, reward and shop routes. Every currency change is decided here, on the
 * server, after verification; the client only displays balances.
 *
 * Rewards follow the Development Brief's economy:
 *  - Tactic Tokens: 40 for finishing a match, plus 80 for a win or 30 for a draw;
 *    +100 for the first win of the day; +50 and +150 for win streaks of 3 and 5.
 *  - Gold Boots: one per goal scored.
 *  - Mission Medals: lessons (1 each, plus 20 Tactic Tokens) and the Ref's Eye quiz
 *    (3 Medals plus 60 Tactic Tokens), first completion only.
 */
import { randomUUID } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { DEFAULT_FORMATION, FORMATION_NAMES, HALF_MINUTE_OPTIONS, validateFormation, layoutPieces, type Action, type Difficulty, type Layout, type MatchSetup } from '../src/engine/index';
import { AWAY_KITS, BOARD_THEMES, HOME_KITS } from '../src/ui/themes';
import type { Account, Currency, Ledger } from './ledger';
import { QUIZ_PASS_MARK, scoreQuiz, verifyCpuMatch, verifyLesson } from './verify';

export const REWARDS = {
  finish: 40,
  win: 80,
  draw: 30,
  firstWinOfDay: 100,
  streak3: 50,
  streak5: 150,
  bootsPerGoal: 1,
  lessonMedals: 1,
  lessonTokens: 20,
  quizMedals: 3,
  quizTokens: 60,
};

/** Possession limit by difficulty (Q20): 2 for the hardest CPU, 3 otherwise. */
export const stallLimitFor = (d: Difficulty) => (d === 'master' ? 2 : 3);

const CATALOG = new Map<string, number>([...BOARD_THEMES, ...HOME_KITS, ...AWAY_KITS].map((i) => [i.id, i.price]));
const DIFFS: Difficulty[] = ['beginner', 'baller', 'master'];

interface PendingCpuMatch {
  accountId: string;
  setup: MatchSetup;
  difficulty: Difficulty;
  startedAt: number;
}

const isAction = (a: unknown): a is Action => !!a && typeof a === 'object' && typeof (a as { type?: unknown }).type === 'string';

export function registerAccountRoutes(app: Express, ledger: Ledger, now: () => number = Date.now) {
  const pending = new Map<string, PendingCpuMatch>();

  const auth = (req: Request, res: Response): Account | undefined => {
    const h = req.headers.authorization ?? '';
    const account = ledger.authenticate(h.startsWith('Bearer ') ? h.slice(7) : undefined);
    if (!account) res.status(401).json({ error: 'Sign in again: this device has no valid account token' });
    return account;
  };

  const summary = (a: Account) => ({
    id: a.id,
    balances: ledger.balances(a.id),
    owned: a.owned,
    completed: a.completed,
    record: a.record,
    winStreak: a.winStreak,
  });

  app.post('/api/accounts', (_req, res) => {
    const { account, token } = ledger.createAccount();
    res.status(201).json({ token, account: summary(account) });
  });

  app.get('/api/me', (req, res) => {
    const a = auth(req, res);
    if (!a) return;
    res.json({ account: summary(a), history: ledger.history(a.id) });
  });

  // ---- CPU matches: the server issues the setup, then verifies the finished log.
  app.post('/api/cpu-matches', (req, res) => {
    const a = auth(req, res);
    if (!a) return;
    const b = req.body ?? {};
    const difficulty: Difficulty = DIFFS.includes(b.difficulty) ? b.difficulty : 'baller';
    const formation = (f: unknown) => (typeof f === 'string' && FORMATION_NAMES.includes(f) ? f : DEFAULT_FORMATION);
    let homeLayout: Layout | undefined;
    if (Array.isArray(b.homeLayout)) {
      const layout = b.homeLayout as Layout;
      const valid = layout.every((l) => l && typeof l.role === 'string' && l.pos && Number.isInteger(l.pos.c) && Number.isInteger(l.pos.r));
      if (!valid || validateFormation('home', layoutPieces('home', layout)).length) return res.status(400).json({ error: 'That set-up is not a legal formation' });
      homeLayout = layout;
    }
    const setup: MatchSetup = {
      homeFormation: formation(b.homeFormation),
      awayFormation: formation(b.awayFormation),
      homeLayout,
      halfMinutes: HALF_MINUTE_OPTIONS.includes(b.halfMinutes) ? b.halfMinutes : 10,
      turnTimer: false,
      stallLimit: stallLimitFor(difficulty),
      restarts: b.restarts !== false,
    };
    const id = randomUUID();
    pending.set(id, { accountId: a.id, setup, difficulty, startedAt: now() });
    res.status(201).json({ id, setup, difficulty });
  });

  app.post('/api/cpu-matches/:id/finish', (req, res) => {
    const a = auth(req, res);
    if (!a) return;
    const m = pending.get(req.params.id);
    if (!m || m.accountId !== a.id) return res.status(404).json({ error: 'Unknown match' });
    const actions = req.body?.actions;
    if (!Array.isArray(actions) || actions.length > 20000 || !actions.every(isAction)) return res.status(400).json({ error: 'Send the match action log' });
    const v = verifyCpuMatch(m.setup, actions, m.difficulty, m.startedAt, now());
    if (!v.ok) return res.status(422).json({ error: v.error });
    pending.delete(req.params.id);

    const gf = v.state.score.home;
    const ga = v.state.score.away;
    const result = gf > ga ? 'w' : gf === ga ? 'd' : 'l';
    const ref = `cpu:${req.params.id}`;
    const today = new Date(now()).toISOString().slice(0, 10);
    const streak = result === 'w' ? a.winStreak + 1 : 0;
    const entries: Array<{ currency: Currency; amount: number; reason: string; ref: string }> = [
      { currency: 'tokens', amount: REWARDS.finish, reason: 'Match finished', ref },
      { currency: 'boots', amount: gf * REWARDS.bootsPerGoal, reason: `${gf} goal${gf === 1 ? '' : 's'}`, ref },
    ];
    if (result === 'w') entries.push({ currency: 'tokens', amount: REWARDS.win, reason: 'Win', ref });
    if (result === 'd') entries.push({ currency: 'tokens', amount: REWARDS.draw, reason: 'Draw', ref });
    if (result === 'w' && a.lastDailyWin !== today) entries.push({ currency: 'tokens', amount: REWARDS.firstWinOfDay, reason: 'First win of the day', ref });
    if (streak === 3) entries.push({ currency: 'tokens', amount: REWARDS.streak3, reason: '3-win streak', ref });
    if (streak === 5) entries.push({ currency: 'tokens', amount: REWARDS.streak5, reason: '5-win streak', ref });
    ledger.commit(a.id, entries, (acc) => {
      acc.record[result]++;
      acc.record.gf += gf;
      acc.record.ga += ga;
      acc.winStreak = streak;
      if (result === 'w') acc.lastDailyWin = today;
    });
    res.json({ account: summary(ledger.account(a.id)!), earned: entries.filter((e) => e.amount), score: v.state.score });
  });

  // ---- Lessons and the Ref's Eye quiz: paid once, after verification.
  app.post('/api/lessons/:id/complete', (req, res) => {
    const a = auth(req, res);
    if (!a) return;
    const actions = req.body?.actions;
    if (!Array.isArray(actions) || actions.length > 500 || !actions.every(isAction)) return res.status(400).json({ error: 'Send the lesson action log' });
    const v = verifyLesson(req.params.id, actions);
    if (!v.ok) return res.status(422).json({ error: v.error });
    const ref = `lesson:${req.params.id}`;
    if (!ledger.hasRef(a.id, ref))
      ledger.commit(
        a.id,
        [
          { currency: 'medals', amount: REWARDS.lessonMedals, reason: 'Lesson completed', ref },
          { currency: 'tokens', amount: REWARDS.lessonTokens, reason: 'Lesson completed', ref },
        ],
        (acc) => {
          if (!acc.completed.includes(req.params.id)) acc.completed.push(req.params.id);
        },
      );
    res.json({ account: summary(ledger.account(a.id)!) });
  });

  app.post('/api/quiz/submit', (req, res) => {
    const a = auth(req, res);
    if (!a) return;
    const scored = scoreQuiz(req.body?.answers);
    if (!scored.ok) return res.status(400).json({ error: scored.error });
    const passed = scored.correct >= QUIZ_PASS_MARK;
    const ref = 'quiz:refs-eye';
    if (passed && !ledger.hasRef(a.id, ref))
      ledger.commit(
        a.id,
        [
          { currency: 'medals', amount: REWARDS.quizMedals, reason: "Ref's Eye passed", ref },
          { currency: 'tokens', amount: REWARDS.quizTokens, reason: "Ref's Eye passed", ref },
        ],
        (acc) => {
          if (!acc.completed.includes('refs-eye')) acc.completed.push('refs-eye');
        },
      );
    res.json({ correct: scored.correct, passed, account: summary(ledger.account(a.id)!) });
  });

  // ---- Shop: cosmetics bought with Tactic Tokens, priced by the server's catalogue.
  app.post('/api/shop/buy', (req, res) => {
    const a = auth(req, res);
    if (!a) return;
    const itemId = req.body?.itemId;
    const price = typeof itemId === 'string' ? CATALOG.get(itemId) : undefined;
    if (price === undefined) return res.status(404).json({ error: 'No such item' });
    if (a.owned.includes(itemId)) return res.status(409).json({ error: 'Already owned' });
    if (ledger.balances(a.id).tokens < price) return res.status(402).json({ error: 'Not enough Tactic Tokens' });
    ledger.commit(a.id, [{ currency: 'tokens', amount: -price, reason: `Bought ${itemId}`, ref: `shop:${itemId}` }], (acc) => acc.owned.push(itemId));
    res.json({ account: summary(ledger.account(a.id)!) });
  });
}
