import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ROLE_NAMES,
  ROLE_SUMMARY,
  TEAM_NAMES,
  TURN_MS,
  TURN_WARNING_MS,
  actionsFor,
  applyAction,
  carrierOf,
  cellName,
  clockText,
  getPiece,
  mustPlayBall,
  offsideLine,
  oneTwoRuns,
  passOutcome,
  pieceAt,
  planTurn,
  previewAction,
  resolveAction,
  sameCell,
  shotOutcome,
  isOffside,
  type Action,
  type Cell,
  type Difficulty,
  type GameEvent,
  type GameState,
  type Side,
} from '../engine';
import { Board, type Overlay } from './Board';
import type { BoardTheme, Kit } from './themes';

export type Controller = 'human' | 'pass' | Difficulty;

/** 'realtime' = the official clock (rule 9). 'relaxed' = no turn timer; each turn uses 6 s of match clock. */
export type ClockMode = 'realtime' | 'relaxed';
export const RELAXED_TURN_MS = 6000;

/** Runs a local match: human input, CPU turns played back step by step, and the clocks. */
export function useLocalMatch(initial: GameState, controllers: Record<Side, Controller>, clockMode: ClockMode = 'realtime') {
  const [state, setState] = useState(initial);
  const [cpuThinking, setCpuThinking] = useState(false);
  const [paused, setPaused] = useState(false);
  const ref = useRef(state);
  ref.current = state;

  const dispatch = (a: Action) => {
    const next = applyAction(ref.current, a); // throws on an illegal action
    ref.current = next;
    setState(next);
  };

  // Real-time clock.
  useEffect(() => {
    if (clockMode !== 'realtime' || !initial.timed || paused) return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const ms = Math.round(now - last);
      last = now;
      if (ref.current.phase === 'playing') dispatch({ type: 'tick', ms });
    }, 250);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clockMode, paused, initial.timed]);

  // Relaxed clock: each completed turn uses a fixed slice of the match clock.
  const lastTurn = useRef(state.turnNumber);
  useEffect(() => {
    if (clockMode !== 'relaxed' || !initial.timed) return;
    if (state.turnNumber !== lastTurn.current) {
      lastTurn.current = state.turnNumber;
      if (state.phase === 'playing' && !state.kickoffPending) dispatch({ type: 'tick', ms: RELAXED_TURN_MS });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.turnNumber, state.phase]);

  // CPU turns.
  useEffect(() => {
    const ctl = controllers[state.turn];
    if (ctl === 'human' || state.phase !== 'playing' || paused) return;
    let cancelled = false;
    const timers: number[] = [];
    setCpuThinking(true);
    const turn = state.turnNumber;
    timers.push(
      window.setTimeout(() => {
        const start = ref.current;
        if (start.turnNumber !== turn || start.phase !== 'playing') return setCpuThinking(false);
        const plan: Action[] = ctl === 'pass' ? [{ type: 'endTurn' }] : planTurn(start, ctl);
        let i = 0;
        const step = () => {
          if (cancelled) return;
          const s = ref.current;
          if (i >= plan.length || s.phase !== 'playing' || s.turnNumber !== turn) return setCpuThinking(false);
          try {
            dispatch(plan[i++]);
          } catch {
            return setCpuThinking(false);
          }
          timers.push(window.setTimeout(step, 650));
        };
        step();
      }, ctl === 'pass' ? 300 : 550),
    );
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      setCpuThinking(false);
    };
    // Re-plan whenever a new turn starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.turnNumber, state.phase, paused]);

  return { state, dispatch, cpuThinking, paused, setPaused };
}

const EVENT_TONE: Partial<Record<GameEvent['kind'], string>> = {
  goal: 'good',
  save: 'warn',
  block: 'warn',
  goalKick: 'warn',
  intercept: 'bad',
  blocked: 'bad',
  contested: 'bad',
  offside: 'bad',
  tackle: 'bad',
  reactiveTackle: 'bad',
  timeout: 'bad',
  halftime: 'info',
  fulltime: 'info',
  kickoff: 'info',
};

interface ViewProps {
  state: GameState;
  onAction: (a: Action) => void;
  humanSides: Side[];
  busy?: boolean;
  theme: BoardTheme;
  kits: { home: Kit; away: Kit };
  banner?: React.ReactNode;
  statusNote?: string;
  controls?: React.ReactNode;
  clockMode?: ClockMode;
}

export function MatchView({ state, onAction, humanSides, busy, theme, kits, banner, statusNote, controls }: ViewProps) {
  const [sel, setSel] = useState<string | null>(null);
  const [oneTwoMode, setOneTwoMode] = useState(false);
  const [via, setVia] = useState<string | null>(null);
  const [pending, setPending] = useState<Action | null>(null);
  const [hover, setHover] = useState<Cell | null>(null);
  const [error, setError] = useState<string | null>(null);

  const myTurn = humanSides.includes(state.turn) && state.phase === 'playing' && !busy;
  // During a follow-up or a kickoff only one piece may act: select it for the player.
  const forced = state.followUp?.pieceId ?? (state.kickoffPending ? state.ball.carrier : null);
  useEffect(() => {
    setPending(null);
    setOneTwoMode(false);
    setVia(null);
    if (!myTurn) setSel(null);
    else if (forced) setSel(forced);
    else setSel((cur) => (cur && getPiece(state, cur)?.side === state.turn ? cur : null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.turnNumber, state.followUp?.pieceId, state.kickoffPending, myTurn]);

  const selPiece = sel ? getPiece(state, sel) : undefined;
  const opts = useMemo(() => (selPiece && myTurn ? actionsFor(state, selPiece) : null), [state, selPiece, myTurn]);

  // Colour every option by what it would lead to: the core teaching aid.
  const overlays: Overlay[] = useMemo(() => {
    if (!opts || !selPiece) return [];
    const out: Overlay[] = [];
    if (oneTwoMode) {
      // Q6a: pick the partner, then where to run (any square in line with the partner).
      const partner = via ? getPiece(state, via) : undefined;
      if (partner) {
        out.push({ cell: partner.pos, kind: 'oneTwo' });
        for (const c of oneTwoRuns(state, selPiece, partner)) out.push({ cell: c, kind: 'run' });
      } else for (const q of opts.oneTwos) out.push({ cell: q.pos, kind: 'oneTwo' });
      return out;
    }
    for (const to of opts.moves) {
      const after = resolveAction(state, { type: 'move', pieceId: selPiece.id, to });
      const lost = state.ball.carrier === selPiece.id && after.ball.carrier !== selPiece.id;
      const won = state.ball.carrier !== null && getPiece(state, state.ball.carrier)!.side !== selPiece.side && after.ball.carrier === selPiece.id;
      out.push({ cell: to, kind: lost ? 'moveDanger' : won ? 'moveTackle' : 'move' });
    }
    for (const q of opts.passes) {
      const r = passOutcome(state, selPiece, q.pos).result;
      out.push({ cell: q.pos, kind: r === 'complete' ? 'pass' : r === 'offside' ? 'passOffside' : 'passLost' });
    }
    return out;
  }, [opts, selPiece, oneTwoMode, via, state]);

  const pendingCell = pending && (pending.type === 'move' || pending.type === 'pass' || pending.type === 'oneTwo') ? pending.to : null;
  const allOverlays = pendingCell ? [...overlays, { cell: pendingCell, kind: 'pending' as const }] : overlays;

  const buildAction = (cell: Cell): Action | null => {
    if (!selPiece || !opts) return null;
    if (oneTwoMode) {
      const partner = via ? getPiece(state, via) : undefined;
      if (!partner) return null;
      return oneTwoRuns(state, selPiece, partner).some((c) => sameCell(c, cell)) ? { type: 'oneTwo', pieceId: selPiece.id, viaId: partner.id, to: cell } : null;
    }
    if (opts.moves.some((c) => sameCell(c, cell))) return { type: 'move', pieceId: selPiece.id, to: cell };
    if (opts.passes.some((q) => sameCell(q.pos, cell))) return { type: 'pass', pieceId: selPiece.id, to: cell };
    return null;
  };

  const commit = (a: Action) => {
    try {
      onAction(a);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
    setPending(null);
    setOneTwoMode(false);
    setVia(null);
  };

  const onCell = (cell: Cell) => {
    if (!myTurn) return;
    setError(null);
    if (pending && pendingCell && sameCell(pendingCell, cell)) return commit(pending);
    const a = buildAction(cell);
    if (a) return setPending(a);
    if (oneTwoMode && opts) {
      const q = opts.oneTwos.find((x) => sameCell(x.pos, cell));
      if (q) {
        setVia(q.id);
        setPending(null);
        return;
      }
    }
    const p = pieceAt(state, cell);
    if (p && p.side === state.turn && !forced) {
      setSel(p.id === sel ? null : p.id);
      setPending(null);
      setOneTwoMode(false);
      return;
    }
    if (!forced) setSel(null);
    setPending(null);
  };

  const hoverAction = !pending && hover ? buildAction(hover) : null;
  const shown = pending ?? hoverAction;
  const preview = shown ? previewAction(state, shown) : [];

  const carrier = carrierOf(state);
  const teachPass = !!selPiece && !!opts && state.ball.carrier === selPiece.id && (opts.passes.length > 0 || oneTwoMode);
  const lineValue = teachPass ? offsideLine(state, selPiece!.side) : null;
  const flagged =
    teachPass && selPiece ? state.pieces.filter((q) => q.side === selPiece.side && q.id !== selPiece.id && isOffside(state, selPiece, q)).map((q) => q.id) : [];
  const zone = selPiece && carrier?.id === selPiece.id ? selPiece.side : null;
  const shotPreview =
    pending?.type === 'shoot' && selPiece ? (() => { const r = shotOutcome(state, selPiece); return { from: selPiece.pos, path: r.path, outcome: r.outcome }; })() : null;

  const turnFrac = Math.max(0, Math.min(1, state.clock.turnMs / TURN_MS));
  const warn = state.clock.turnMs <= TURN_WARNING_MS;
  const recent = state.events.slice(-8).reverse();

  return (
    <div className="match">
      <div className="scorebar">
        <div className="team home" style={{ '--kit': kits.home.fill } as React.CSSProperties}>
          <span className="swatch" />
          {TEAM_NAMES.home}
        </div>
        <div className="score">
          <span>{state.score.home}</span>
          <span className="sep">–</span>
          <span>{state.score.away}</span>
        </div>
        <div className="team away" style={{ '--kit': kits.away.fill } as React.CSSProperties}>
          {TEAM_NAMES.away}
          <span className="swatch" />
        </div>
        <div className="clock">
          {state.phase === 'finished'
            ? 'Full-time'
            : state.phase === 'halftime'
              ? 'Half-time'
              : `${state.half === 1 ? '1st' : '2nd'} half · ${state.timed ? clockText(state.clock.halfMs) + ' left' : 'untimed'}${state.kickoffPending ? ' · kickoff' : ''}`}
        </div>
      </div>

      <div className="match-body">
        <div className="board-wrap">
          <Board
            state={state}
            theme={theme}
            kits={kits}
            selected={sel}
            overlays={allOverlays}
            onCell={onCell}
            onHover={setHover}
            offside={lineValue !== null && selPiece ? { side: selPiece.side, line: lineValue } : null}
            flagged={flagged}
            zone={zone}
            shot={shotPreview}
          />
        </div>

        <aside className="panel">
          {banner}
          <div className={`turn-chip ${state.turn}`} style={{ '--kit': kits[state.turn].fill } as React.CSSProperties}>
            {state.phase !== 'playing' ? (
              state.phase === 'halftime' ? 'Half-time' : 'Full-time'
            ) : (
              <>
                <span className="swatch" />
                <span>
                  {TEAM_NAMES[state.turn]} to play{!humanSides.includes(state.turn) && busy ? ' · thinking…' : ''}
                </span>
                {state.timed && state.turnTimer && !state.kickoffPending && (
                  <span className={`turn-timer ${warn ? 'warn' : ''}`} aria-label={`${Math.ceil(state.clock.turnMs / 1000)} seconds left this turn`}>
                    <i style={{ width: `${turnFrac * 100}%` }} />
                    <b className="mono">{Math.ceil(state.clock.turnMs / 1000)}s</b>
                  </span>
                )}
              </>
            )}
          </div>
          {controls}
          {statusNote && <p className="note">{statusNote}</p>}

          {myTurn && !selPiece && <p className="hint">Select one of your pieces. A turn is one piece: move it, then pass or shoot with it if the rules allow.</p>}
          {myTurn && state.kickoffPending && <p className="hint">Kickoff: your Frontliner must pass first. Tap a teammate in a straight or diagonal line.</p>}
          {myTurn && mustPlayBall(state) && (
            <p className="error">Possession limit: the ball has stayed still for {state.stallLimit} turns. Move it this turn (dribble, pass or shoot), or it goes to the opponent.</p>
          )}
          {myTurn && state.followUp && (
            <p className="hint">
              Follow-up: this piece may {state.followUp.canPass ? 'pass' : ''}
              {state.followUp.canPass && state.followUp.canShoot ? ' or ' : ''}
              {state.followUp.canShoot ? 'shoot' : ''}, or end the turn.
            </p>
          )}

          {selPiece && opts && (
            <div className="piece-card">
              <div className="piece-head">
                <strong>{ROLE_NAMES[selPiece.role]}</strong>
                <span className="mono">{cellName(selPiece.pos)}</span>
              </div>
              <p className="hint">{ROLE_SUMMARY[selPiece.role]}</p>
              <div className="modes" role="group" aria-label="Actions">
                <button type="button" className={!oneTwoMode ? 'active' : ''} onClick={() => { setOneTwoMode(false); setPending(null); }}>
                  Move / pass
                </button>
                <button type="button" disabled={!opts.shoot} onClick={() => { setOneTwoMode(false); setPending({ type: 'shoot', pieceId: selPiece.id }); }}>
                  Shoot
                </button>
                <button type="button" className={oneTwoMode ? 'active' : ''} disabled={opts.oneTwos.length === 0} onClick={() => { setOneTwoMode(true); setVia(null); setPending(null); }}>
                  One-two
                </button>
              </div>
              {oneTwoMode && <p className="hint">{via ? 'Now tap a gold diamond: where the passer runs to get the ball back.' : 'Tap the partner (dashed ring) to play the one-two with.'}</p>}
              <ul className="legend">
                <li><i className="lg-move" /> move</li>
                <li><i className="lg-danger" /> lose the ball</li>
                <li><i className="lg-tackle" /> win the ball</li>
                <li><i className="lg-pass" /> safe pass</li>
                <li><i className="lg-lost" /> pass lost</li>
                <li><i className="lg-off" /> offside</li>
              </ul>
            </div>
          )}

          {shown && (
            <div className="preview">
              <div className="eyebrow">{pending ? 'Confirm' : 'Preview'}</div>
              {preview.length === 0 ? (
                <p>No effect.</p>
              ) : (
                preview
                  .filter((e) => e.kind !== 'kickoff')
                  .slice(0, 3)
                  .map((e, i) => (
                    <p key={i} className={`ev ${EVENT_TONE[e.kind] ?? ''}`}>
                      {e.text}
                      {e.rule && <span className="law">{e.rule}</span>}
                    </p>
                  ))
              )}
              {pending && (
                <div className="row">
                  <button type="button" className="btn primary" onClick={() => commit(pending)}>Confirm</button>
                  <button type="button" className="btn ghost" onClick={() => setPending(null)}>Cancel</button>
                </div>
              )}
            </div>
          )}

          {error && <p className="error">{error}</p>}

          {myTurn && !state.kickoffPending && (
            <button type="button" className="btn end" onClick={() => commit({ type: 'endTurn' })}>
              End turn
            </button>
          )}

          <div className="log">
            <div className="eyebrow">Match log</div>
            <ol>
              {recent.map((e, i) => (
                <li key={state.events.length - i} className={`ev ${EVENT_TONE[e.kind] ?? ''}`}>
                  <span className="dot" style={{ background: kits[e.side].fill }} />
                  <span>
                    {e.text}
                    {e.rule && <span className="law">{e.rule}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </div>
  );
}

/** Match statistics table (rule 7.2 and 8.4 track these separately). */
export function StatsTable({ state }: { state: GameState }) {
  const rows: [string, keyof GameState['stats']['home']][] = [
    ['Shots', 'shots'],
    ['On target', 'shotsOnTarget'],
    ['Saves', 'saves'],
    ['Blocks', 'blocks'],
    ['Passes completed', 'passesCompleted'],
    ['Interceptions', 'interceptions'],
    ['Tackles', 'tackles'],
    ['Reactive tackles', 'reactiveTackles'],
    ['Offsides', 'offsides'],
  ];
  return (
    <table className="stats-table">
      <thead>
        <tr>
          <th>{TEAM_NAMES.home}</th>
          <th />
          <th>{TEAM_NAMES.away}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, k]) => (
          <tr key={k}>
            <td className="mono">{state.stats.home[k]}</td>
            <th>{label}</th>
            <td className="mono">{state.stats.away[k]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

