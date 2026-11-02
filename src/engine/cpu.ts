import { RULES } from './config';
import { attackDir, dist, goalTargets, onBoard, opponent, progress } from './geometry';
import {
  carrierOf,
  moveTargets,
  oneTwoPartners,
  oneTwoTargets,
  pieceAt,
  resolveAction,
  shotOutcome,
  stats,
  tackleOdds,
  validateAction,
} from './rules';
import type { Action, Cell, GameState, Piece, Side } from './types';

export type Difficulty = 'rookie' | 'pro' | 'legend';

export const DIFFICULTIES: Record<Difficulty, { label: string; beam: number; lookahead: boolean; blurb: string }> = {
  rookie: { label: 'Beginner', beam: 1, lookahead: false, blurb: 'Plays one action at a time. Good for learning.' },
  pro: { label: 'Baller', beam: 4, lookahead: true, blurb: 'Plans whole turns and protects the ball.' },
  legend: { label: 'Master', beam: 10, lookahead: true, blurb: 'Searches deeply and punishes loose play.' },
};

/** Every action worth considering for the side to move. */
export function candidateActions(s: GameState): Action[] {
  const out: Action[] = [{ type: 'endTurn' }];
  if (s.phase !== 'playing') return out;
  const side = s.turn;
  const carrier = carrierOf(s);
  const mine = s.pieces.filter((p) => p.side === side);

  for (const p of mine) for (const to of moveTargets(s, p.id)) out.push({ type: 'move', pieceId: p.id, to });

  if (carrier && carrier.side === side) {
    const range = stats(carrier).pass;
    const dir = attackDir(side);
    const seen = new Set<string>();
    const addPass = (to: Cell) => {
      const k = `${to.c},${to.r}`;
      if (seen.has(k)) return;
      seen.add(k);
      const a: Action = { type: 'pass', pieceId: carrier.id, to };
      if (dist(carrier.pos, to) <= range && !validateAction(s, a)) out.push(a);
    };
    for (const q of mine) {
      if (q.id === carrier.id) continue;
      addPass(q.pos);
      // Through balls into space just ahead of teammates.
      for (const dc of [-1, 0, 1]) {
        const ahead = { c: q.pos.c + dc, r: q.pos.r + dir };
        if (onBoard(ahead) && !pieceAt(s, ahead)) addPass(ahead);
      }
    }
    for (const t of goalTargets(side)) {
      const a: Action = { type: 'shoot', pieceId: carrier.id, target: t };
      if (!validateAction(s, a)) out.push(a);
    }
    for (const via of oneTwoPartners(s, carrier.id))
      for (const to of oneTwoTargets(s, carrier.id, via.id))
        if (progress(side, to.r) > progress(side, carrier.pos.r))
          out.push({ type: 'oneTwo', pieceId: carrier.id, viaId: via.id, to });
  }

  if (carrier && carrier.side !== side)
    for (const p of mine)
      if (!p.tackled && dist(p.pos, carrier.pos) === 1) out.push({ type: 'tackle', pieceId: p.id, targetId: carrier.id });

  return out;
}

/** Can `attacker` score from where its ball carrier stands right now? */
function canScoreNow(s: GameState, carrier: Piece): boolean {
  return goalTargets(carrier.side).some(
    (t) => dist(carrier.pos, t) <= RULES.maxShotDistance && shotOutcome(s, carrier, t).outcome === 'goal',
  );
}

/** Opponents within reach who could step in and win a tackle against the carrier next turn. */
function tackleThreat(s: GameState, carrier: Piece): number {
  let threat = 0;
  for (const q of s.pieces) {
    if (q.side === carrier.side) continue;
    const d = dist(q.pos, carrier.pos);
    if (d === 0 || d > stats(q).move + 1) continue;
    const odds = tackleOdds(s, q, carrier);
    // Being next to the carrier already counts toward support; approximate by the raw duel.
    if (odds.wins || stats(q).tackle + 1 > odds.defend) threat += d === 1 ? 2 : 1;
  }
  return threat;
}

/** Static evaluation of a position from `side`'s point of view. Higher is better. */
export function evaluate(s: GameState, side: Side, lookahead: boolean): number {
  const opp = opponent(side);
  let v = (s.score[side] - s.score[opp]) * 10000;
  if (s.phase === 'finished') return v;

  const carrier = carrierOf(s);
  const ballProgress = progress(side, s.ball.pos.r);

  if (carrier && carrier.side === side) {
    v += 400 + ballProgress * 15;
    if (lookahead) {
      v -= tackleThreat(s, carrier) * 70;
      if (canScoreNow(s, carrier)) v += 250;
    }
  } else if (carrier) {
    v -= 400 + (RULES.rows - 1 - ballProgress) * 10;
    // Pressure the carrier and stay between ball and goal.
    let nearest = 99;
    for (const p of s.pieces) if (p.side === side) nearest = Math.min(nearest, dist(p.pos, carrier.pos));
    v -= nearest * 12;
    if (lookahead && canScoreNow(s, carrier)) v -= 900;
  } else {
    let mineD = 99;
    let theirD = 99;
    for (const p of s.pieces) {
      const d = dist(p.pos, s.ball.pos);
      if (p.side === side) mineD = Math.min(mineD, d);
      else theirD = Math.min(theirD, d);
    }
    v += (theirD - mineD) * 40 + ballProgress * 5;
  }

  // Shape: keep some pieces goal-side of the ball and the keeper central.
  let goalSide = 0;
  for (const p of s.pieces) {
    if (p.side !== side) continue;
    if (p.role === 'GK') v -= Math.abs(p.pos.c - 7.5) * 6;
    else if (progress(side, p.pos.r) < ballProgress) goalSide++;
    // Mild pull forward for attackers when we have the ball.
    if (carrier?.side === side && (p.role === 'FW' || p.role === 'WG' || p.role === 'AM'))
      v += progress(side, p.pos.r) * 2;
  }
  v += Math.min(goalSide, 6) * 15;
  return v;
}

interface Line {
  state: GameState;
  actions: Action[];
  score: number;
}

/**
 * Pick the CPU's whole turn with a beam search over action sequences.
 * Deterministic: the same position always produces the same plan.
 */
export function planTurn(s: GameState, difficulty: Difficulty = 'pro'): Action[] {
  const side = s.turn;
  const { beam, lookahead } = DIFFICULTIES[difficulty];
  const finals: Line[] = [];
  let beams: Line[] = [{ state: s, actions: [], score: evaluate(s, side, lookahead) }];

  for (let depth = 0; depth < RULES.actionsPerTurn && beams.length; depth++) {
    const next: Line[] = [];
    for (const b of beams) {
      if (b.state.turn !== side || b.state.phase !== 'playing' || b.state.turnsPlayed !== s.turnsPlayed || b.state.half !== s.half) {
        finals.push(b);
        continue;
      }
      for (const a of candidateActions(b.state)) {
        const ns = resolveAction(b.state, a);
        const line: Line = { state: ns, actions: [...b.actions, a], score: evaluate(ns, side, lookahead) };
        if (a.type === 'endTurn') finals.push(line);
        else next.push(line);
      }
    }
    next.sort((x, y) => y.score - x.score);
    beams = next.slice(0, beam);
  }
  finals.push(...beams);
  let best = finals[0];
  for (const f of finals) if (f.score > best.score) best = f;
  const plan = best ? best.actions.slice() : [];
  // Make sure the plan finishes the turn.
  const last = plan[plan.length - 1];
  if (!last || last.type !== 'endTurn') {
    let st = s;
    for (const a of plan) st = resolveAction(st, a);
    if (st.turn === side && st.phase === 'playing' && st.turnsPlayed === s.turnsPlayed && st.half === s.half)
      plan.push({ type: 'endTurn' });
  }
  return plan;
}
