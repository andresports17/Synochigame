import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ROLE_NAMES,
  ROLE_STATS,
  RULES,
  TEAM_NAMES,
  applyAction,
  cellName,
  getPiece,
  matchMinute,
  moveTargets,
  oneTwoPartners,
  oneTwoTargets,
  passTargets,
  pieceAt,
  planTurn,
  previewAction,
  sameCell,
  shotTargets,
  tackleTargets,
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

/** Runs a local match: human input plus CPU turns played back one action at a time. */
export function useLocalMatch(initial: GameState, controllers: Record<Side, Controller>) {
  const [state, setState] = useState(initial);
  const [cpuThinking, setCpuThinking] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const ctl = controllers[state.turn];
    if (ctl === 'human' || state.phase !== 'playing') return;
    let cancelled = false;
    const timers: number[] = [];
    setCpuThinking(true);
    timers.push(
      window.setTimeout(() => {
        const start = stateRef.current;
        const plan: Action[] = ctl === 'pass' ? [{ type: 'endTurn' }] : planTurn(start, ctl);
        let s = start;
        let i = 0;
        const step = () => {
          if (cancelled) return;
          if (i >= plan.length || s.phase !== 'playing' || s.turn !== start.turn || s.turnsPlayed !== start.turnsPlayed) {
            setCpuThinking(false);
            return;
          }
          s = applyAction(s, plan[i++]);
          setState(s);
          timers.push(window.setTimeout(step, ctl === 'pass' ? 250 : 700));
        };
        step();
      }, ctl === 'pass' ? 350 : 450),
    );
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      setCpuThinking(false);
    };
    // Re-plan only at turn boundaries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.turn, state.turnsPlayed, state.half, state.phase]);

  const act = (a: Action) => {
    const next = applyAction(stateRef.current, a); // throws on an illegal action
    stateRef.current = next;
    setState(next);
  };
  return { state, setState, act, cpuThinking };
}

type Mode = 'move' | 'pass' | 'shoot' | 'tackle' | 'oneTwo';

const MODE_LABEL: Record<Mode, string> = { move: 'Move', pass: 'Pass', shoot: 'Shoot', tackle: 'Tackle', oneTwo: 'One-Two' };

const EVENT_TONE: Partial<Record<GameEvent['kind'], string>> = {
  goal: 'good',
  save: 'warn',
  block: 'warn',
  intercept: 'bad',
  tackleWon: 'bad',
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
}

export function MatchView({ state, onAction, humanSides, busy, theme, kits, banner, statusNote }: ViewProps) {
  const [sel, setSel] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('move');
  const [via, setVia] = useState<string | null>(null);
  const [pending, setPending] = useState<Action | null>(null);
  const [hover, setHover] = useState<Cell | null>(null);
  const [error, setError] = useState<string | null>(null);

  const myTurn = humanSides.includes(state.turn) && state.phase === 'playing' && !busy;
  const selPiece = sel ? getPiece(state, sel) : undefined;

  // Clear selection whenever the turn changes or the piece is no longer ours.
  useEffect(() => {
    if (!selPiece || selPiece.side !== state.turn || !myTurn) {
      setSel(null);
      setPending(null);
      setVia(null);
    }
  }, [state, selPiece, myTurn]);

  const avail = useMemo(() => {
    if (!selPiece || !myTurn) return null;
    return {
      move: moveTargets(state, selPiece.id),
      pass: passTargets(state, selPiece.id),
      shoot: shotTargets(state, selPiece.id),
      tackle: tackleTargets(state, selPiece.id).map((p) => p.pos),
      oneTwo: oneTwoPartners(state, selPiece.id).map((p) => p.pos),
    };
  }, [state, selPiece, myTurn]);

  const runTargets = useMemo(
    () => (selPiece && via && mode === 'oneTwo' ? oneTwoTargets(state, selPiece.id, via) : []),
    [state, selPiece, via, mode],
  );

  const overlays: Overlay[] = [];
  if (avail && selPiece) {
    if (mode === 'move') avail.move.forEach((cell) => overlays.push({ cell, kind: 'move' }));
    if (mode === 'pass')
      avail.pass.forEach((cell) => {
        const p = pieceAt(state, cell);
        overlays.push({ cell, kind: p ? 'pass' : 'space' });
      });
    if (mode === 'shoot') avail.shoot.forEach((cell) => overlays.push({ cell, kind: 'shot' }));
    if (mode === 'tackle') avail.tackle.forEach((cell) => overlays.push({ cell, kind: 'tackle' }));
    if (mode === 'oneTwo') {
      if (!via) avail.oneTwo.forEach((cell) => overlays.push({ cell, kind: 'via' }));
      else runTargets.forEach((cell) => overlays.push({ cell, kind: 'run' }));
    }
  }
  const pendingCell = pending && pending.type !== 'endTurn' ? actionCell(state, pending) : null;
  if (pendingCell) overlays.push({ cell: pendingCell, kind: 'pending' });

  const buildAction = (cell: Cell): Action | null => {
    if (!selPiece || !avail) return null;
    const id = selPiece.id;
    const has = (list: Cell[]) => list.some((c) => sameCell(c, cell));
    switch (mode) {
      case 'move':
        return has(avail.move) ? { type: 'move', pieceId: id, to: cell } : null;
      case 'pass':
        return has(avail.pass) ? { type: 'pass', pieceId: id, to: cell } : null;
      case 'shoot':
        return has(avail.shoot) ? { type: 'shoot', pieceId: id, target: cell } : null;
      case 'tackle': {
        const t = pieceAt(state, cell);
        return t && has(avail.tackle) ? { type: 'tackle', pieceId: id, targetId: t.id } : null;
      }
      case 'oneTwo':
        return via && has(runTargets) ? { type: 'oneTwo', pieceId: id, viaId: via, to: cell } : null;
    }
  };

  const commit = (a: Action) => {
    try {
      onAction(a);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
    setPending(null);
    setVia(null);
    if (a.type !== 'move') setSel(null);
    else if (state.ball.carrier === a.pieceId) setMode('pass');
  };

  const onCell = (cell: Cell) => {
    if (!myTurn) return;
    setError(null);
    if (pending && pendingCell && sameCell(pendingCell, cell)) return commit(pending);
    const a = buildAction(cell);
    if (a) {
      if (a.type === 'move') return commit(a);
      setPending(a);
      return;
    }
    if (mode === 'oneTwo' && selPiece && !via && avail?.oneTwo.some((c) => sameCell(c, cell))) {
      setVia(pieceAt(state, cell)!.id);
      return;
    }
    const p = pieceAt(state, cell);
    if (p && p.side === state.turn) {
      setSel(p.id === sel ? null : p.id);
      setPending(null);
      setVia(null);
      const carrier = state.ball.carrier === p.id;
      setMode(carrier && moveTargets(state, p.id).length === 0 ? 'pass' : 'move');
      return;
    }
    setSel(null);
    setPending(null);
    setVia(null);
  };

  const hoverAction = !pending && hover ? buildAction(hover) : null;
  const shown = pending ?? (hoverAction && hoverAction.type !== 'move' ? hoverAction : null);
  const preview = shown ? previewAction(state, shown) : [];

  const recent = state.events.slice(-7).reverse();
  const minute = matchMinute(state);
  const st = selPiece ? ROLE_STATS[selPiece.role] : null;

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
          {state.phase === 'finished' ? 'FT' : `${state.half === 1 ? '1st' : '2nd'} half · ${String(minute).padStart(2, '0')}′`}
        </div>
      </div>

      <div className="match-body">
        <div className="board-wrap">
          <Board state={state} theme={theme} kits={kits} selected={sel} overlays={overlays} onCell={onCell} onHover={setHover} />
        </div>

        <aside className="panel">
          {banner}
          <div className={`turn-chip ${state.turn}`} style={{ '--kit': kits[state.turn].fill } as React.CSSProperties}>
            {state.phase === 'finished' ? (
              'Full-time'
            ) : (
              <>
                <span className="swatch" />
                <span>
                  {TEAM_NAMES[state.turn]} to play
                  {!humanSides.includes(state.turn) ? (busy ? ' · thinking…' : '') : ''}
                </span>
                <span className="pips" aria-label={`${state.actionsLeft} actions left`}>
                  {Array.from({ length: RULES.actionsPerTurn }, (_, i) => (
                    <i key={i} className={i < state.actionsLeft ? 'on' : ''} />
                  ))}
                </span>
              </>
            )}
          </div>
          {statusNote && <p className="note">{statusNote}</p>}

          {myTurn && !selPiece && <p className="hint">Select one of your pieces. You have {state.actionsLeft} action{state.actionsLeft === 1 ? '' : 's'} left.</p>}

          {selPiece && st && avail && (
            <div className="piece-card">
              <div className="piece-head">
                <strong>{ROLE_NAMES[selPiece.role]}</strong>
                <span className="mono">{cellName(selPiece.pos)}</span>
              </div>
              <dl className="stats">
                <div><dt>Move</dt><dd>{st.move}</dd></div>
                <div><dt>Pass</dt><dd>{st.pass}</dd></div>
                <div><dt>Shot</dt><dd>{st.shot}</dd></div>
                <div><dt>Tackle</dt><dd>{st.tackle}</dd></div>
                <div><dt>Control</dt><dd>{st.control}</dd></div>
                {st.save !== undefined && <div><dt>Save</dt><dd>{st.save}</dd></div>}
              </dl>
              <div className="modes" role="group" aria-label="Action">
                {(Object.keys(MODE_LABEL) as Mode[]).map((m) => {
                  const n = avail[m].length;
                  return (
                    <button
                      key={m}
                      type="button"
                      className={m === mode ? 'active' : ''}
                      disabled={n === 0}
                      onClick={() => {
                        setMode(m);
                        setPending(null);
                        setVia(null);
                      }}
                    >
                      {MODE_LABEL[m]}
                    </button>
                  );
                })}
              </div>
              <p className="hint">{modeHint(mode, !!via)}</p>
            </div>
          )}

          {shown && (
            <div className="preview">
              <div className="eyebrow">{pending ? 'Confirm action' : 'Preview'}</div>
              {preview.length === 0 ? <p>No effect.</p> : preview.filter((e) => e.kind !== 'kickoff').slice(0, 3).map((e, i) => (
                <p key={i} className={`ev ${EVENT_TONE[e.kind] ?? ''}`}>{e.text}</p>
              ))}
              {pending && (
                <div className="row">
                  <button type="button" className="btn primary" onClick={() => commit(pending)}>Confirm</button>
                  <button type="button" className="btn ghost" onClick={() => setPending(null)}>Cancel</button>
                </div>
              )}
            </div>
          )}

          {error && <p className="error">{error}</p>}

          {myTurn && (
            <button type="button" className="btn end" onClick={() => commit({ type: 'endTurn' })}>
              End turn
            </button>
          )}

          <div className="log">
            <div className="eyebrow">Match log</div>
            <ol>
              {recent.map((e, i) => (
                <li key={state.events.length - i} className={`ev ${EVENT_TONE[e.kind] ?? ''}`}>
                  <span className={`dot ${e.side}`} style={{ background: kits[e.side].fill }} />
                  {e.text}
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </div>
  );
}

function actionCell(s: GameState, a: Action): Cell | null {
  switch (a.type) {
    case 'move':
    case 'pass':
    case 'oneTwo':
      return a.to;
    case 'shoot':
      return a.target;
    case 'tackle':
      return getPiece(s, a.targetId)?.pos ?? null;
    default:
      return null;
  }
}

function modeHint(m: Mode, via: boolean) {
  switch (m) {
    case 'move':
      return 'Tap a white dot to move. The ball carrier dribbles 1 cell less.';
    case 'pass':
      return 'Tap a teammate (ring) or open space (square). Passes over 4 cells are lofted.';
    case 'shoot':
      return 'Tap a gold goal-mouth cell to aim your shot.';
    case 'tackle':
      return 'Tap the ball carrier. Teammates beside them add +1 each.';
    case 'oneTwo':
      return via ? 'Now tap a gold dot: where you run to collect the return pass.' : 'Tap the teammate to play the one-two with.';
  }
}
