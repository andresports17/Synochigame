import { adjacent, canShootFrom, dist, inOwnHalf, opponent, progress } from './board';
import { actionsFor, carrierOf, hasSafePass, passOutcome, passTargets, resolveAction, shotOutcome } from './rules';
import type { Action, GameState, Side } from './types';

/**
 * CPU opponent for the official rules (rule 10). It uses the same validators as
 * human play, so it can never make an illegal move.
 *  - Beginner: no lookahead; picks among its best few plans with a little noise.
 *  - Baller:   one-ply lookahead: its plan, then the human's best reply.
 *  - Master:   two-ply: its plan, the reply, then its own best follow-up. Deterministic.
 * As in the original notes, the CPU does not play one-twos.
 */
export type Difficulty = 'beginner' | 'baller' | 'master';

export const DIFFICULTIES: Record<Difficulty, { label: string; blurb: string }> = {
  beginner: { label: 'Beginner', blurb: 'No lookahead and a little randomness. Forgiving.' },
  baller: { label: 'Baller', blurb: 'Looks one reply ahead.' },
  master: { label: 'Master', blurb: 'Looks two moves ahead. No randomness.' },
};

interface Plan {
  actions: Action[];
  state: GameState;
}

/** Every complete turn the side to play could take (without one-twos). */
export function turnPlans(s: GameState): Plan[] {
  const plans: Plan[] = [];
  if (s.phase !== 'playing') return plans;
  const side = s.turn;
  const add = (actions: Action[], state: GameState) => plans.push({ actions, state });
  for (const p of s.pieces) {
    if (p.side !== side) continue;
    const o = actionsFor(s, p);
    for (const q of o.passes) {
      const a: Action = { type: 'pass', pieceId: p.id, to: q.pos };
      add([a], resolveAction(s, a));
    }
    if (o.shoot) {
      const a: Action = { type: 'shoot', pieceId: p.id };
      add([a], resolveAction(s, a));
    }
    for (const to of o.moves) {
      const m: Action = { type: 'move', pieceId: p.id, to };
      const ns = resolveAction(s, m);
      if (ns.followUp && ns.followUp.pieceId === p.id && ns.turn === side) {
        const end: Action = { type: 'endTurn' };
        add([m, end], resolveAction(ns, end));
        const mp = ns.pieces.find((x) => x.id === p.id)!;
        const fo = actionsFor(ns, mp);
        for (const q of fo.passes) {
          const a: Action = { type: 'pass', pieceId: p.id, to: q.pos };
          add([m, a], resolveAction(ns, a));
        }
        if (fo.shoot) {
          const a: Action = { type: 'shoot', pieceId: p.id };
          add([m, a], resolveAction(ns, a));
        }
      } else add([m], ns);
    }
  }
  if (!s.kickoffPending && !s.followUp) {
    const end: Action = { type: 'endTurn' };
    add([end], resolveAction(s, end));
  }
  return plans;
}

/** Static evaluation of a position from `side`'s point of view. */
export function evaluate(s: GameState, side: Side): number {
  const opp = opponent(side);
  let v = (s.score[side] - s.score[opp]) * 10000;
  if (s.phase === 'finished') return v;
  const carrier = carrierOf(s);
  const mine = s.pieces.filter((p) => p.side === side);
  const theirs = s.pieces.filter((p) => p.side === opp);

  if (carrier && carrier.side === side) {
    v += 500 + progress(side, carrier.pos.r) * 26;
    if (canShootFrom(side, carrier.pos)) v += shotOutcome(s, carrier).outcome === 'goal' ? 1100 : 220;
    // Pressure on the carrier and options to keep the ball.
    const near = theirs.filter((q) => dist(q.pos, carrier.pos) <= 2).length;
    v -= near * 30;
    if (theirs.filter((q) => adjacent(q.pos, carrier.pos)).length >= 2) v -= 120;
    let safe = 0;
    for (const q of passTargets(s, carrier))
      if (passOutcome(s, carrier, q.pos).result === 'complete') {
        safe++;
        if (safe >= 4) break;
      }
    v += safe * 14;
  } else if (carrier) {
    v -= 500 + progress(opp, carrier.pos.r) * 22;
    if (canShootFrom(opp, carrier.pos)) v -= shotOutcome(s, carrier).outcome === 'goal' ? 1300 : 200;
    let nearest = 99;
    for (const p of mine) nearest = Math.min(nearest, dist(p.pos, carrier.pos));
    v -= nearest * 28;
    v += Math.min(2, mine.filter((p) => adjacent(p.pos, carrier.pos)).length) * 55;
    if (!hasSafePass(s, carrier)) v += 90;
  }

  // Shape: stay goal-side of the ball, keep defenders in their own half.
  const ballProg = progress(side, s.ball.pos.r);
  let goalSide = 0;
  for (const p of mine) {
    if (p.role === 'GK') {
      v -= Math.abs(p.pos.c - 7.5) * 6;
      continue;
    }
    if (progress(side, p.pos.r) < ballProg) goalSide++;
    if ((p.role === 'CB' || p.role === 'FB') && !inOwnHalf(side, p.pos)) v -= 15;
    if (carrier?.side === side && (p.role === 'FW' || p.role === 'WG' || p.role === 'AM' || p.role === 'MF')) {
      v += progress(side, p.pos.r) * 4;
      if (canShootFrom(side, p.pos)) v += 40;
    }
  }
  v += Math.min(goalSide, 6) * 12;
  return v;
}

/** Small deterministic noise from the position, so "random" CPU play is still reproducible. */
function noise(s: GameState, i: number, amp: number) {
  let h = s.turnNumber * 2654435761 + i * 40503;
  for (const p of s.pieces) h = (h ^ (p.pos.c * 31 + p.pos.r * 17)) * 16777619;
  return ((h >>> 0) % 1000) / 1000 * amp - amp / 2;
}

/** Value of `s` for `side` after the opponent picks its best reply. */
function afterBestReply(s: GameState, side: Side, ownFollowUp: boolean): number {
  if (s.phase !== 'playing' || s.turn === side) return ownFollowUp ? bestPlanValue(s, side) : evaluate(s, side);
  const replies = turnPlans(s);
  if (!replies.length) return evaluate(s, side);
  const opp = opponent(side);
  // The opponent picks its best plan by its own evaluation.
  replies.sort((a, b) => evaluate(b.state, opp) - evaluate(a.state, opp));
  if (!ownFollowUp) return evaluate(replies[0].state, side);
  let worst = Infinity;
  for (const r of replies.slice(0, 4)) worst = Math.min(worst, bestPlanValue(r.state, side));
  return worst;
}

function bestPlanValue(s: GameState, side: Side): number {
  if (s.phase !== 'playing' || s.turn !== side) return evaluate(s, side);
  let best = -Infinity;
  for (const p of turnPlans(s)) best = Math.max(best, evaluate(p.state, side));
  return best === -Infinity ? evaluate(s, side) : best;
}

/** Choose the CPU's actions for this turn. */
export function planTurn(s: GameState, difficulty: Difficulty = 'baller'): Action[] {
  const side = s.turn;
  const plans = turnPlans(s);
  if (!plans.length) return [{ type: 'endTurn' }];
  const scored = plans.map((p, i) => ({ p, v: evaluate(p.state, side) + (difficulty === 'master' ? 0 : noise(s, i, difficulty === 'beginner' ? 160 : 30)) }));
  scored.sort((a, b) => b.v - a.v);
  if (difficulty === 'beginner') {
    const top = scored.slice(0, 4);
    return top[Math.floor(Math.abs(noise(s, 99, 1) + 0.5) * top.length) % top.length].p.actions;
  }
  const width = difficulty === 'master' ? 6 : 10;
  let best = scored[0];
  let bestV = -Infinity;
  for (const c of scored.slice(0, width)) {
    const v = afterBestReply(c.p.state, side, difficulty === 'master') + (difficulty === 'baller' ? noise(c.p.state, 7, 30) : 0);
    if (v > bestV) {
      bestV = v;
      best = c;
    }
  }
  return best.p.actions;
}
