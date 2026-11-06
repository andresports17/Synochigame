/**
 * Verification of results claimed by a player, before any reward is paid.
 *
 *  - A CPU match is replayed from the setup the server issued. Because the CPU is
 *    deterministic, the server recomputes every CPU turn and checks the log really
 *    contains the CPU's own moves, so a player cannot "win" by playing both sides.
 *  - The clock ticks in the log may not add up to more real time than has passed
 *    since the server issued the match, so a match cannot be fast-forwarded.
 *  - A lesson is replayed from its fixed position and must reach its objective.
 *  - Quiz answers are judged by the rules engine.
 */
import {
  QUIZ,
  SCENARIOS,
  applyAction,
  createMatch,
  judge,
  planTurn,
  type Action,
  type Difficulty,
  type GameState,
  type MatchSetup,
  type Side,
} from '../src/engine/index';

export type Verified = { ok: true; state: GameState } | { ok: false; error: string };

const same = (a: Action, b: Action) => JSON.stringify(a) === JSON.stringify(b);

/** Replay `actions` from `start`, checking that every action on `cpuSide`'s turns is the CPU's own plan. */
function replayWithCpu(start: GameState, actions: Action[], cpuSide: Side | null, difficulty: Difficulty | 'pass'): Verified {
  let s = start;
  let plan: Action[] = [];
  let planTurnNo = -1;
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    const cpuToAct = cpuSide !== null && s.phase === 'playing' && s.turn === cpuSide && a.type !== 'tick';
    if (cpuToAct) {
      if (a.type === 'resume') return { ok: false, error: 'Unexpected resume on the CPU turn' };
      if (planTurnNo !== s.turnNumber) {
        plan = difficulty === 'pass' ? [{ type: 'endTurn' }] : planTurn(s, difficulty);
        planTurnNo = s.turnNumber;
      }
      const expected = plan.shift();
      if (!expected || !same(expected, a)) return { ok: false, error: `Action ${i} is not the CPU's move` };
    }
    if (a.type === 'resume' && cpuSide) {
      const cpuChange = cpuSide === 'home' ? a.homeFormation ?? a.homeLayout : a.awayFormation ?? a.awayLayout;
      if (cpuChange) return { ok: false, error: "The CPU's formation cannot be changed by the player" };
    }
    try {
      s = applyAction(s, a);
    } catch (e) {
      return { ok: false, error: `Action ${i}: ${(e as Error).message}` };
    }
  }
  return { ok: true, state: s };
}

export function verifyCpuMatch(setup: MatchSetup, actions: Action[], difficulty: Difficulty, startedAt: number, now = Date.now()): Verified {
  const ticks = actions.reduce((sum, a) => sum + (a.type === 'tick' ? a.ms : 0), 0);
  const slackMs = 5000;
  if (ticks > now - startedAt + slackMs) return { ok: false, error: 'The match clock ran faster than real time' };
  const res = replayWithCpu(createMatch(setup), actions, 'away', difficulty);
  if (res.ok && res.state.phase !== 'finished') return { ok: false, error: 'The match has not finished' };
  return res;
}

export function verifyLesson(scenarioId: string, actions: Action[]): Verified {
  const sc = SCENARIOS.find((x) => x.id === scenarioId);
  if (!sc) return { ok: false, error: 'Unknown lesson' };
  let s = sc.setup();
  let blueTurns = 0;
  let cpuPlan: Action[] = [];
  let planNo = -1;
  for (let i = 0; i < actions.length; i++) {
    if (sc.success(s)) break;
    if (sc.fail?.(s) || blueTurns >= sc.maxTurns) return { ok: false, error: 'The lesson was not completed' };
    const a = actions[i];
    if (s.turn === 'away') {
      if (planNo !== s.turnNumber) {
        cpuPlan = sc.opponent === 'pass' ? [{ type: 'endTurn' }] : planTurn(s, sc.opponent);
        planNo = s.turnNumber;
      }
      const expected = cpuPlan.shift();
      if (!expected || !same(expected, a)) return { ok: false, error: `Action ${i} is not the opponent's move` };
    }
    const before = s;
    try {
      s = applyAction(s, a);
    } catch (e) {
      return { ok: false, error: `Action ${i}: ${(e as Error).message}` };
    }
    if (before.turn === 'home' && s.turnNumber !== before.turnNumber) blueTurns++;
  }
  return sc.success(s) ? { ok: true, state: s } : { ok: false, error: 'The lesson was not completed' };
}

export const QUIZ_PASS_MARK = 11;

/** Score a full set of quiz answers (one per question, in order). */
export function scoreQuiz(answers: unknown): { ok: true; correct: number } | { ok: false; error: string } {
  if (!Array.isArray(answers) || answers.length !== QUIZ.length || !answers.every((x) => typeof x === 'string'))
    return { ok: false, error: `Send ${QUIZ.length} answers` };
  let correct = 0;
  QUIZ.forEach((q, i) => {
    if (judge(q).call === answers[i]) correct++;
  });
  return { ok: true, correct };
}
