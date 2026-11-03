import { memo } from 'react';
import { COL_LETTERS, RULES, type Cell, type GameState, type Piece, type Side } from '../engine';
import type { BoardTheme, Kit } from './themes';

export const CELL = 30;
const LABEL = 20;
const GOAL = 16;
export const OX = LABEL;
export const OY = LABEL + GOAL;
export const BOARD_W = RULES.cols * CELL + LABEL * 2;
export const BOARD_H = RULES.rows * CELL + (LABEL + GOAL) * 2;

export type OverlayKind = 'move' | 'pass' | 'space' | 'shot' | 'tackle' | 'via' | 'run' | 'pending' | 'out';
export interface Overlay {
  cell: Cell;
  kind: OverlayKind;
}

const cx = (c: number) => OX + c * CELL + CELL / 2;
const cy = (r: number) => OY + r * CELL + CELL / 2;

interface Props {
  state: GameState;
  theme: BoardTheme;
  kits: { home: Kit; away: Kit };
  selected?: string | null;
  overlays?: Overlay[];
  onCell?: (c: Cell) => void;
  onHover?: (c: Cell | null) => void;
  compact?: boolean;
  /** Laws Mode: draw the offside line for the attacking side (a progress value from offsideLine). */
  offside?: { side: Side; line: number } | null;
  /** Pieces to flag as standing in an offside position. */
  flagged?: string[];
  /** Arrow for a pass or shot (quiz and previews). */
  arrow?: { from: Cell; to: Cell } | null;
  /** Spot of a pending restart. */
  restartSpot?: Cell | null;
}

/** Centre of a cell in board units, including the out-of-play ring around the pitch. */
function point(c: Cell) {
  const x = c.c < 0 ? OX / 2 : c.c >= RULES.cols ? BOARD_W - OX / 2 : cx(c.c);
  const y = c.r < 0 ? OY - GOAL / 2 + 1 : c.r >= RULES.rows ? OY + RULES.rows * CELL + GOAL / 2 - 1 : cy(c.r);
  return { x, y };
}

function Pitch({ theme }: { theme: BoardTheme }) {
  const W = RULES.cols * CELL;
  const H = RULES.rows * CELL;
  const [g0, g1] = RULES.goalCols;
  const [b0, b1] = RULES.boxCols;
  const box = RULES.boxDepth * CELL;
  const stripes = [];
  for (let r = 0; r < RULES.rows; r += 2)
    stripes.push(<rect key={r} x={OX} y={OY + r * CELL} width={W} height={CELL * 2} fill={(r / 2) % 2 ? theme.grassB : theme.grassA} />);
  const ln = { stroke: theme.lines, strokeWidth: 2, fill: 'none' } as const;
  return (
    <g>
      <rect x={0} y={0} width={BOARD_W} height={BOARD_H} rx={10} fill={theme.frame} />
      {stripes}
      {/* grid */}
      <g stroke="rgba(0,0,0,.16)" strokeWidth={1}>
        {Array.from({ length: RULES.cols - 1 }, (_, i) => (
          <line key={`v${i}`} x1={OX + (i + 1) * CELL} y1={OY} x2={OX + (i + 1) * CELL} y2={OY + H} />
        ))}
        {Array.from({ length: RULES.rows - 1 }, (_, i) => (
          <line key={`h${i}`} x1={OX} y1={OY + (i + 1) * CELL} x2={OX + W} y2={OY + (i + 1) * CELL} />
        ))}
      </g>
      {/* markings */}
      <rect x={OX} y={OY} width={W} height={H} {...ln} />
      <line x1={OX} y1={OY + H / 2} x2={OX + W} y2={OY + H / 2} {...ln} />
      <circle cx={OX + W / 2} cy={OY + H / 2} r={CELL * 2.6} {...ln} />
      <circle cx={OX + W / 2} cy={OY + H / 2} r={3} fill={theme.lines} />
      {[0, 1].map((end) => {
        const y = end ? OY + H - box : OY;
        const gy = end ? OY + H : OY - GOAL + 2;
        return (
          <g key={end}>
            <rect x={OX + b0 * CELL} y={y} width={(b1 - b0 + 1) * CELL} height={box} {...ln} />
            <rect x={OX + (g0 - 1) * CELL} y={end ? OY + H - CELL * 2 : OY} width={(g1 - g0 + 3) * CELL} height={CELL * 2} {...ln} />
            <rect
              x={OX + g0 * CELL}
              y={gy}
              width={(g1 - g0 + 1) * CELL}
              height={GOAL - 2}
              fill="url(#net)"
              stroke={theme.lines}
              strokeWidth={2}
            />
          </g>
        );
      })}
      {/* coordinates */}
      <g fill={theme.labels} fontSize={10} fontFamily="var(--font-mono)" textAnchor="middle" dominantBaseline="central">
        {COL_LETTERS.split('').map((L, i) => (
          <g key={L}>
            <text x={cx(i)} y={10}>{L}</text>
            <text x={cx(i)} y={BOARD_H - 10}>{L}</text>
          </g>
        ))}
        {Array.from({ length: RULES.rows }, (_, r) => (
          <g key={r}>
            <text x={LABEL / 2} y={cy(r)}>{r + 1}</text>
            <text x={BOARD_W - LABEL / 2} y={cy(r)}>{r + 1}</text>
          </g>
        ))}
      </g>
    </g>
  );
}

const MemoPitch = memo(Pitch);

function PieceToken({ p, kit, selected, hasBall, compact, flagged }: { p: Piece; kit: Kit; selected: boolean; hasBall: boolean; compact?: boolean; flagged?: boolean }) {
  const spent = p.moved;
  return (
    <g className="piece" style={{ transform: `translate(${cx(p.pos.c)}px, ${cy(p.pos.r)}px)` }}>
      <ellipse cx={0} cy={9} rx={11} ry={4} fill="rgba(0,0,0,.35)" />
      {selected && <circle r={15} fill="none" stroke="var(--gold)" strokeWidth={3} className="pulse" />}
      <circle r={12} fill={kit.fill} stroke={kit.ink} strokeOpacity={0.85} strokeWidth={1.6} opacity={spent ? 0.62 : 1} />
      <circle r={12} fill="url(#sheen)" />
      {!compact && (
        <text y={0.5} fill={kit.ink} fontSize={9} fontWeight={700} textAnchor="middle" dominantBaseline="central" fontFamily="var(--font-display)" letterSpacing={0.4}>
          {p.role}
        </text>
      )}
      {hasBall && <Ball x={9} y={9} />}
      {flagged && (
        <g transform="translate(-13,-16)">
          <line x1={0} y1={0} x2={0} y2={12} stroke="#fff" strokeWidth={1.5} />
          <path d="M0 0 h9 l-2 3 l2 3 h-9 z" fill="#ffd400" stroke="#111" strokeWidth={0.6} />
        </g>
      )}
    </g>
  );
}

function Ball({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <circle r={5.5} fill="#fff" stroke="#111" strokeWidth={1} />
      <path d="M0,-2.4 L2.3,-0.7 L1.4,2 L-1.4,2 L-2.3,-0.7 Z" fill="#111" />
    </g>
  );
}

function OverlayMark({ o }: { o: Overlay }) {
  const { x, y } = point(o.cell);
  switch (o.kind) {
    case 'out':
      return <rect x={x - 5} y={y - 5} width={10} height={10} transform={`rotate(45 ${x} ${y})`} fill="#ff9a3c" stroke="#3a1a00" strokeWidth={1} />;
    case 'move':
    case 'run':
      return <circle cx={x} cy={y} r={5} fill={o.kind === 'run' ? 'var(--gold)' : 'rgba(255,255,255,.78)'} />;
    case 'pass':
    case 'via':
      return <circle cx={x} cy={y} r={14.5} fill="none" stroke="#9fe0ff" strokeWidth={2.5} strokeDasharray={o.kind === 'via' ? '4 3' : undefined} />;
    case 'space':
      return <rect x={x - 11} y={y - 11} width={22} height={22} rx={4} fill="rgba(159,224,255,.16)" stroke="rgba(159,224,255,.55)" strokeWidth={1} />;
    case 'shot':
      return <rect x={x - 13} y={y - 7} width={26} height={14} rx={3} fill="rgba(232,193,92,.55)" stroke="var(--gold)" strokeWidth={2} />;
    case 'tackle':
      return <circle cx={x} cy={y} r={15} fill="none" stroke="#ff5a5a" strokeWidth={3} />;
    case 'pending':
      return <rect x={x - 14} y={y - 14} width={28} height={28} rx={6} fill="none" stroke="var(--gold)" strokeWidth={3} />;
  }
}

export function Board({ state, theme, kits, selected, overlays = [], onCell, onHover, compact, offside, flagged = [], arrow, restartSpot }: Props) {
  const toCell = (e: React.MouseEvent<SVGSVGElement>): Cell | null => {
    const svg = e.currentTarget;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const m = svg.getScreenCTM();
    if (!m) return null;
    const p = pt.matrixTransform(m.inverse());
    if (p.x < 0 || p.x > BOARD_W) return null;
    const c = p.x < OX ? -1 : p.x >= OX + RULES.cols * CELL ? RULES.cols : Math.floor((p.x - OX) / CELL);
    if (p.y < OY && p.y >= OY - GOAL) return c < 0 || c >= RULES.cols ? null : { c, r: -1 };
    if (p.y >= OY + RULES.rows * CELL && p.y < OY + RULES.rows * CELL + GOAL) return c < 0 || c >= RULES.cols ? null : { c, r: RULES.rows };
    const r = Math.floor((p.y - OY) / CELL);
    if (r < 0 || r >= RULES.rows) return null;
    return { c, r };
  };
  const loose = state.ball.carrier === null;
  return (
    <svg
      className="board"
      viewBox={`0 0 ${BOARD_W} ${BOARD_H}`}
      role="img"
      aria-label="SYNOCHÍ board"
      onClick={onCell ? (e) => { const c = toCell(e); if (c) onCell(c); } : undefined}
      onMouseMove={onHover ? (e) => onHover(toCell(e)) : undefined}
      onMouseLeave={onHover ? () => onHover(null) : undefined}
    >
      <defs>
        <pattern id="net" width="5" height="5" patternUnits="userSpaceOnUse">
          <rect width="5" height="5" fill="rgba(255,255,255,.08)" />
          <path d="M0 0 L5 5 M5 0 L0 5" stroke="rgba(255,255,255,.35)" strokeWidth=".6" />
        </pattern>
        <radialGradient id="sheen" cx="35%" cy="30%" r="70%">
          <stop offset="0" stopColor="#fff" stopOpacity=".45" />
          <stop offset=".5" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".25" />
        </radialGradient>
      </defs>
      <MemoPitch theme={theme} />
      {offside && (() => {
        const y = offside.side === 'home' ? OY + (offside.line + 1) * CELL : OY + (RULES.rows - 1 - offside.line) * CELL;
        return (
          <g>
            <line x1={OX} y1={y} x2={OX + RULES.cols * CELL} y2={y} stroke="#ffd400" strokeWidth={2.5} strokeDasharray="8 5" />
            <text x={OX + RULES.cols * CELL - 4} y={y + (offside.side === 'home' ? 11 : -5)} fill="#ffd400" fontSize={9} fontWeight={700} textAnchor="end" fontFamily="var(--font-body)">OFFSIDE LINE</text>
          </g>
        );
      })()}
      {restartSpot && (() => {
        const { x, y } = point(restartSpot);
        return <circle cx={x} cy={y} r={17} fill="none" stroke="#ffd400" strokeWidth={2} strokeDasharray="3 3" />;
      })()}
      {overlays.filter((o) => o.kind !== 'pending' && o.kind !== 'tackle' && o.kind !== 'pass' && o.kind !== 'via').map((o, i) => <OverlayMark key={`u${i}`} o={o} />)}
      {state.pieces.map((p) => (
        <PieceToken key={p.id} p={p} kit={kits[p.side]} selected={p.id === selected} hasBall={state.ball.carrier === p.id} compact={compact} flagged={flagged.includes(p.id)} />
      ))}
      {loose && (
        <g className="piece" style={{ transform: `translate(${cx(state.ball.pos.c)}px, ${cy(state.ball.pos.r)}px)` }}>
          <Ball x={0} y={0} />
        </g>
      )}
      {overlays.filter((o) => o.kind === 'pending' || o.kind === 'tackle' || o.kind === 'pass' || o.kind === 'via').map((o, i) => <OverlayMark key={`o${i}`} o={o} />)}
      {arrow && (() => {
        const a = point(arrow.from);
        const b = point(arrow.to);
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const ux = (b.x - a.x) / len;
        const uy = (b.y - a.y) / len;
        const ex = b.x - ux * 8;
        const ey = b.y - uy * 8;
        return (
          <g stroke="#ffd400" fill="#ffd400">
            <line x1={a.x + ux * 13} y1={a.y + uy * 13} x2={ex} y2={ey} strokeWidth={3} />
            <path d={`M${b.x},${b.y} L${ex - uy * 6},${ey + ux * 6} L${ex + uy * 6},${ey - ux * 6} Z`} strokeWidth={1} />
          </g>
        );
      })()}
    </svg>
  );
}
