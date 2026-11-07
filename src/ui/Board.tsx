import { memo } from 'react';
import {
  COLS,
  COL_LETTERS,
  CENTRE_COLS,
  CENTRE_ROWS,
  GOAL_COLS,
  INNER_GOAL_COLS,
  KEEPER_BOX_COLS,
  KEEPER_BOX_DEPTH,
  PENALTY_COLS,
  PENALTY_DEPTH,
  ROWS,
  canShootFrom,
  type Ball,
  type Cell,
  type Piece,
  type Side,
} from '../engine';
import type { BoardTheme, Kit } from './themes';

export const CELL = 30;
const LABEL = 20;
const GOAL = 16;
export const OX = LABEL;
export const OY = LABEL + GOAL;
export const BOARD_W = COLS * CELL + LABEL * 2;
export const BOARD_H = ROWS * CELL + (LABEL + GOAL) * 2;

export type OverlayKind = 'move' | 'moveDanger' | 'moveTackle' | 'pass' | 'passLost' | 'passOffside' | 'oneTwo' | 'run' | 'out' | 'pending';
export interface Overlay {
  cell: Cell;
  kind: OverlayKind;
}

const cx = (c: number) => OX + c * CELL + CELL / 2;
const cy = (r: number) => OY + r * CELL + CELL / 2;

interface Props {
  state: { pieces: Piece[]; ball: Ball };
  theme: BoardTheme;
  kits: { home: Kit; away: Kit };
  selected?: string | null;
  overlays?: Overlay[];
  onCell?: (c: Cell) => void;
  onHover?: (c: Cell | null) => void;
  compact?: boolean;
  /** Offside line for the attacking side: the progress value of the last outfield defender. */
  offside?: { side: Side; line: number } | null;
  flagged?: string[];
  /** Tint the shooting zone of this attacking side. */
  zone?: Side | null;
  /** A shot's path, drawn from the shooter. */
  shot?: { from: Cell; path: Cell[]; outcome: string } | null;
  arrow?: { from: Cell; to: Cell } | null;
}

function Pitch({ theme }: { theme: BoardTheme }) {
  const W = COLS * CELL;
  const H = ROWS * CELL;
  const stripes = [];
  for (let r = 0; r < ROWS; r += 2)
    stripes.push(<rect key={r} x={OX} y={OY + r * CELL} width={W} height={CELL * 2} fill={(r / 2) % 2 ? theme.grassB : theme.grassA} />);
  const ln = { stroke: theme.lines, strokeWidth: 2, fill: 'none' } as const;
  const boxX = OX + KEEPER_BOX_COLS[0] * CELL;
  const boxW = (KEEPER_BOX_COLS[1] - KEEPER_BOX_COLS[0] + 1) * CELL;
  const goalX = OX + GOAL_COLS[0] * CELL;
  const goalW = (GOAL_COLS[1] - GOAL_COLS[0] + 1) * CELL;
  const innerX = OX + INNER_GOAL_COLS[0] * CELL;
  const innerW = (INNER_GOAL_COLS[1] - INNER_GOAL_COLS[0] + 1) * CELL;
  return (
    <g>
      <rect x={0} y={0} width={BOARD_W} height={BOARD_H} rx={10} fill={theme.frame} />
      {stripes}
      <g stroke="rgba(0,0,0,.16)" strokeWidth={1}>
        {Array.from({ length: COLS - 1 }, (_, i) => (
          <line key={`v${i}`} x1={OX + (i + 1) * CELL} y1={OY} x2={OX + (i + 1) * CELL} y2={OY + H} />
        ))}
        {Array.from({ length: ROWS - 1 }, (_, i) => (
          <line key={`h${i}`} x1={OX} y1={OY + (i + 1) * CELL} x2={OX + W} y2={OY + (i + 1) * CELL} />
        ))}
      </g>
      <rect x={OX} y={OY} width={W} height={H} {...ln} />
      <line x1={OX} y1={OY + H / 2} x2={OX + W} y2={OY + H / 2} {...ln} />
      {/* Centre circle, and the rule's centre area (rows 10–13, columns F–K) as a faint square. */}
      <rect
        x={OX + CENTRE_COLS[0] * CELL}
        y={OY + CENTRE_ROWS[0] * CELL}
        width={(CENTRE_COLS[1] - CENTRE_COLS[0] + 1) * CELL}
        height={(CENTRE_ROWS[1] - CENTRE_ROWS[0] + 1) * CELL}
        fill="rgba(255,255,255,.05)"
        stroke={theme.lines}
        strokeOpacity={0.25}
        strokeDasharray="3 4"
      />
      <circle cx={OX + W / 2} cy={OY + H / 2} r={CELL * 2} {...ln} />
      <circle cx={OX + W / 2} cy={OY + H / 2} r={3} fill={theme.lines} />
      {[0, 1].map((end) => (
        // 18-yard box: the Box Keeper may move anywhere inside its own (Q24).
        <rect
          key={`pa${end}`}
          x={OX + PENALTY_COLS[0] * CELL}
          y={end ? OY + H - PENALTY_DEPTH * CELL : OY}
          width={(PENALTY_COLS[1] - PENALTY_COLS[0] + 1) * CELL}
          height={PENALTY_DEPTH * CELL}
          {...ln}
        />
      ))}
      {[0, 1].map((end) => {
        const y = end ? OY + H - KEEPER_BOX_DEPTH * CELL : OY;
        const gy = end ? OY + H : OY - GOAL + 2;
        return (
          <g key={end}>
            {/* Six-yard box: only the Box Keeper may enter. */}
            <rect x={boxX} y={y} width={boxW} height={KEEPER_BOX_DEPTH * CELL} fill="url(#hatch)" stroke={theme.lines} strokeWidth={2} />
            <rect x={goalX} y={gy} width={goalW} height={GOAL - 2} fill="url(#net)" stroke={theme.lines} strokeWidth={1.5} />
            <rect x={innerX} y={gy} width={innerW} height={GOAL - 2} fill="none" stroke="var(--gold)" strokeWidth={2.5} />
          </g>
        );
      })}
      <g fill={theme.labels} fontSize={10} fontFamily="var(--font-mono)" textAnchor="middle" dominantBaseline="central">
        {COL_LETTERS.split('').map((L, i) => (
          <g key={L}>
            <text x={cx(i)} y={10}>{L}</text>
            <text x={cx(i)} y={BOARD_H - 10}>{L}</text>
          </g>
        ))}
        {Array.from({ length: ROWS }, (_, r) => (
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

function Zone({ side }: { side: Side }) {
  const cells = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (canShootFrom(side, { c, r }))
        cells.push(<rect key={`${c},${r}`} x={OX + c * CELL + 1} y={OY + r * CELL + 1} width={CELL - 2} height={CELL - 2} fill="rgba(232,193,92,.20)" />);
  return <g>{cells}</g>;
}

function BallIcon({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <circle r={5.5} fill="#fff" stroke="#111" strokeWidth={1} />
      <path d="M0,-2.4 L2.3,-0.7 L1.4,2 L-1.4,2 L-2.3,-0.7 Z" fill="#111" />
    </g>
  );
}

function PieceToken({ p, kit, selected, hasBall, compact, flagged }: { p: Piece; kit: Kit; selected: boolean; hasBall: boolean; compact?: boolean; flagged?: boolean }) {
  // Keepers wear a different colour from their team (as in Law 4).
  const fill = p.role === 'GK' ? kit.ink : kit.fill;
  const ink = p.role === 'GK' ? kit.fill : kit.ink;
  return (
    <g className="piece" style={{ transform: `translate(${cx(p.pos.c)}px, ${cy(p.pos.r)}px)` }}>
      <ellipse cx={0} cy={9} rx={11} ry={4} fill="rgba(0,0,0,.35)" />
      {selected && <circle r={15} fill="none" stroke="var(--gold)" strokeWidth={3} className="pulse" />}
      <circle r={12} fill={fill} stroke={ink} strokeOpacity={0.9} strokeWidth={p.role === 'GK' ? 2.4 : 1.6} />
      <circle r={12} fill="url(#sheen)" />
      {!compact && (
        <text y={0.5} fill={ink} fontSize={9} fontWeight={700} textAnchor="middle" dominantBaseline="central" fontFamily="var(--font-display)" letterSpacing={0.4}>
          {p.role}
        </text>
      )}
      {hasBall && <BallIcon x={9} y={9} />}
      {flagged && (
        <g transform="translate(-13,-16)">
          <line x1={0} y1={0} x2={0} y2={12} stroke="#fff" strokeWidth={1.5} />
          <path d="M0 0 h9 l-2 3 l2 3 h-9 z" fill="#ffd400" stroke="#111" strokeWidth={0.6} />
        </g>
      )}
    </g>
  );
}

const OVERLAY_COLOR: Record<OverlayKind, string> = {
  move: 'rgba(255,255,255,.85)',
  moveDanger: '#ff5a5a',
  moveTackle: '#5cf2a0',
  pass: '#9fe0ff',
  passLost: '#ff5a5a',
  passOffside: '#ffd400',
  oneTwo: '#e8c15c',
  run: '#e8c15c',
  out: '#ff9a3c',
  pending: 'var(--gold)',
};

function OverlayMark({ o }: { o: Overlay }) {
  const x = cx(o.cell.c);
  const y = cy(o.cell.r);
  const color = OVERLAY_COLOR[o.kind];
  switch (o.kind) {
    case 'out':
      return <path d={`M${x - 6},${y - 6} L${x + 6},${y} L${x - 6},${y + 6} Z`} transform={`rotate(${o.cell.c < 0 ? 180 : o.cell.c >= COLS ? 0 : o.cell.r < 0 ? -90 : 90} ${x} ${y})`} fill={color} stroke="#3a1a00" strokeWidth={1} />;
    case 'run':
      return <rect x={x - 6} y={y - 6} width={12} height={12} transform={`rotate(45 ${x} ${y})`} fill={color} stroke="rgba(0,0,0,.4)" strokeWidth={1} />;
    case 'move':
    case 'moveDanger':
    case 'moveTackle':
      return <circle cx={x} cy={y} r={o.kind === 'move' ? 5 : 6} fill={color} stroke="rgba(0,0,0,.4)" strokeWidth={1} />;
    case 'pending':
      return <rect x={x - 14} y={y - 14} width={28} height={28} rx={6} fill="none" stroke={color} strokeWidth={3} />;
    default:
      return <circle cx={x} cy={y} r={15} fill="none" stroke={color} strokeWidth={2.6} strokeDasharray={o.kind === 'oneTwo' ? '4 3' : undefined} />;
  }
}

export function Board({ state, theme, kits, selected, overlays = [], onCell, onHover, compact, offside, flagged = [], zone, shot, arrow }: Props) {
  const toCell = (e: React.MouseEvent<SVGSVGElement>): Cell | null => {
    const svg = e.currentTarget;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const m = svg.getScreenCTM();
    if (!m) return null;
    const p = pt.matrixTransform(m.inverse());
    // Squares just beyond the pitch edge are clickable too (for aiming a clearance).
    const c = p.x < OX ? (p.x >= 0 ? -1 : -9) : Math.floor((p.x - OX) / CELL);
    const r = p.y < OY ? (p.y >= OY - GOAL ? -1 : -9) : Math.floor((p.y - OY) / CELL);
    if (c < -1 || c > COLS || r < -1 || r > ROWS) return null;
    if ((c < 0 || c >= COLS) && (r < 0 || r >= ROWS)) return null;
    return { c, r };
  };
  const loose = state.ball.carrier === null;
  const back = overlays.filter((o) => o.kind.startsWith('move'));
  const front = overlays.filter((o) => !o.kind.startsWith('move'));
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
        <pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="8" height="8" fill="rgba(255,255,255,.04)" />
          <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(255,255,255,.14)" strokeWidth="3" />
        </pattern>
        <radialGradient id="sheen" cx="35%" cy="30%" r="70%">
          <stop offset="0" stopColor="#fff" stopOpacity=".45" />
          <stop offset=".5" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".25" />
        </radialGradient>
      </defs>
      <MemoPitch theme={theme} />
      {zone && <Zone side={zone} />}
      {offside && (() => {
        // Offside when progress > line. Home: progress = 23 - r; Away: progress = r.
        const y = offside.side === 'home' ? OY + (ROWS - 1 - offside.line) * CELL : OY + (offside.line + 1) * CELL;
        return (
          <g>
            <line x1={OX} y1={y} x2={OX + COLS * CELL} y2={y} stroke="#ffd400" strokeWidth={2.5} strokeDasharray="8 5" />
            <text x={OX + COLS * CELL - 4} y={y + (offside.side === 'home' ? -5 : 11)} fill="#ffd400" fontSize={9} fontWeight={700} textAnchor="end" fontFamily="var(--font-body)">OFFSIDE LINE</text>
          </g>
        );
      })()}
      {back.map((o, i) => <OverlayMark key={`b${i}`} o={o} />)}
      {state.pieces.map((p) => (
        <PieceToken key={p.id} p={p} kit={kits[p.side]} selected={p.id === selected} hasBall={state.ball.carrier === p.id} compact={compact} flagged={flagged.includes(p.id)} />
      ))}
      {loose && (
        <g className="piece" style={{ transform: `translate(${cx(state.ball.pos.c)}px, ${cy(state.ball.pos.r)}px)` }}>
          <BallIcon x={0} y={0} />
        </g>
      )}
      {front.map((o, i) => <OverlayMark key={`f${i}`} o={o} />)}
      {shot && shot.path.length > 0 && (
        <polyline
          points={[shot.from, ...shot.path].map((c) => `${cx(c.c)},${cy(c.r)}`).join(' ')}
          fill="none"
          stroke={shot.outcome === 'goal' ? '#5cf2a0' : '#ff5a5a'}
          strokeWidth={3}
          strokeDasharray="6 4"
        />
      )}
      {arrow && (() => {
        const a = { x: cx(arrow.from.c), y: cy(arrow.from.r) };
        const b = { x: cx(arrow.to.c), y: cy(arrow.to.r) };
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
