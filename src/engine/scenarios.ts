import { RULES } from './config';
import { COL_LETTERS } from './geometry';
import type { Difficulty } from './cpu';
import type { Cell, GameState, Piece, Role, Side } from './types';

export interface Scenario {
  id: string;
  kind: 'lesson' | 'drill';
  title: string;
  brief: string;
  tips: string[];
  objective: string;
  /** How many of your own turns you get. */
  maxTurns: number;
  /** 'pass' = the opponent stands still; otherwise the CPU plays at that level. */
  opponent: 'pass' | Difficulty;
  /** When true, surviving all turns counts as success (defensive drills). */
  winOnTimeout?: boolean;
  setup: () => GameState;
  success: (s: GameState) => boolean;
  fail?: (s: GameState) => boolean;
}

/** Parse "H12" → { c: 7, r: 11 }. */
export function parseCell(name: string): Cell {
  const c = COL_LETTERS.indexOf(name[0].toUpperCase());
  const r = Number(name.slice(1)) - 1;
  if (c < 0 || !(r >= 0 && r < RULES.rows)) throw new Error(`Bad cell ${name}`);
  return { c, r };
}

type Spec = [Side, Role, string];

function position(specs: Spec[], ballWith: number | string, turn: Side = 'home'): GameState {
  const counters: Record<Side, number> = { home: 0, away: 0 };
  const pieces: Piece[] = specs.map(([side, role, at]) => ({
    id: `${side === 'home' ? 'H' : 'A'}${counters[side]++}`,
    side,
    role,
    pos: parseCell(at),
    moved: false,
    tackled: false,
  }));
  const carrier = typeof ballWith === 'number' ? pieces[ballWith] : undefined;
  return {
    pieces,
    ball: carrier ? { pos: { ...carrier.pos }, carrier: carrier.id } : { pos: parseCell(ballWith as string), carrier: null },
    turn,
    actionsLeft: RULES.actionsPerTurn,
    turnsPlayed: 0,
    half: 1,
    score: { home: 0, away: 0 },
    phase: 'playing',
    formations: { home: '4-3-3', away: '4-3-3' },
    firstKickoff: 'home',
    events: [],
  };
}

const homeHas = (s: GameState, id?: string) => {
  const c = s.ball.carrier;
  return !!c && c.startsWith('H') && (!id || c === id);
};
const lostBall = (s: GameState) => !!s.ball.carrier && s.ball.carrier.startsWith('A');

export const SCENARIOS: Scenario[] = [
  {
    id: 'l1-move',
    kind: 'lesson',
    title: '1 · Moving pieces',
    brief: 'Every turn you get 3 actions. Moving a piece costs 1 action, and each piece can move once per turn.',
    tips: [
      'Tap a blue piece to see where it can go.',
      'Pieces step like a chess king, up to their Move value, and walk around other pieces.',
      'Wingers move 4, most players 3, centre-backs and DMs 2.',
    ],
    objective: 'Get any blue piece to row 14 or beyond.',
    maxTurns: 2,
    opponent: 'pass',
    setup: () => position([['home', 'WG', 'C10'], ['home', 'MF', 'H9'], ['away', 'CB', 'H15']], 'A1', 'home'),
    success: (s) => s.pieces.some((p) => p.side === 'home' && p.pos.r >= 13),
  },
  {
    id: 'l2-dribble',
    kind: 'lesson',
    title: '2 · Dribbling',
    brief: 'The piece holding the ball can move with it. Dribbling costs 1 cell of range, so a forward with Move 3 dribbles 2.',
    tips: ['Use Move on the ball carrier to dribble.', 'You will need two turns: plan your route.'],
    objective: 'Carry the ball to row 16 or beyond.',
    maxTurns: 2,
    opponent: 'pass',
    setup: () => position([['home', 'FW', 'H12'], ['away', 'DM', 'H15']], 0),
    success: (s) => homeHas(s) && s.ball.pos.r >= 15,
  },
  {
    id: 'l3-pass',
    kind: 'lesson',
    title: '3 · Ground passes',
    brief:
      'Passes up to 4 cells travel along the ground. Any opponent standing on the line intercepts them. Before you pass, the preview tells you exactly what will happen.',
    tips: ['Select the carrier, choose Pass, then tap a teammate.', 'A pass to an empty cell leaves the ball loose there.'],
    objective: 'Get the ball to your forward.',
    maxTurns: 1,
    opponent: 'pass',
    setup: () =>
      position(
        [['home', 'MF', 'E10'], ['home', 'AM', 'H11'], ['home', 'FW', 'I14'], ['away', 'CB', 'G12']],
        0,
      ),
    success: (s) => homeHas(s, 'H2'),
    fail: lostBall,
  },
  {
    id: 'l4-lofted',
    kind: 'lesson',
    title: '4 · Lofted passes',
    brief:
      'Passes longer than 4 cells are lofted. They fly over everyone, but any opponent next to the landing cell contests it: if their Tackle beats the receiver\'s Control, they win the ball.',
    tips: ['Find a receiver with no strong defender beside them.', 'Midfielders have the longest passing range (8).'],
    objective: 'Get the ball to a winger with one pass.',
    maxTurns: 1,
    opponent: 'pass',
    setup: () =>
      position(
        [
          ['home', 'MF', 'H8'],
          ['home', 'WG', 'C14'],
          ['home', 'WG', 'N14'],
          ['away', 'DM', 'H10'],
          ['away', 'CB', 'M15'],
        ],
        0,
      ),
    success: (s) => homeHas(s, 'H1') || homeHas(s, 'H2'),
    fail: lostBall,
  },
  {
    id: 'l5-shoot',
    kind: 'lesson',
    title: '5 · Shooting',
    brief:
      'Shots are aimed at one of the four goal-mouth cells (G–J). Shot power drops with distance, and the keeper only covers cells within 2 of where they stand, getting weaker the further they reach.',
    tips: [
      'Forwards shoot hardest (6). Get within 4 cells.',
      'Aim for the corner furthest from the keeper.',
      'The preview shows GOAL, SAVED or BLOCKED before you commit.',
    ],
    objective: 'Score a goal.',
    maxTurns: 2,
    opponent: 'pass',
    setup: () => position([['home', 'FW', 'H19'], ['away', 'GK', 'H24'], ['away', 'CB', 'F22']], 0),
    success: (s) => s.score.home > 0,
    fail: lostBall,
  },
  {
    id: 'l6-tackle',
    kind: 'lesson',
    title: '6 · Tackling with support',
    brief:
      'A piece next to the ball carrier can tackle: its Tackle plus 1 for every teammate next to the carrier, against the carrier\'s Control plus 1 for each of their teammates beside them. Higher number wins; a tie goes to the carrier.',
    tips: ['A lone DM (5) cannot beat a forward (5).', 'Bring a second piece alongside first, then tackle.'],
    objective: 'Win the ball back.',
    maxTurns: 1,
    opponent: 'pass',
    setup: () => position([['home', 'DM', 'H13'], ['home', 'MF', 'K13'], ['away', 'FW', 'H14']], 2),
    success: (s) => homeHas(s),
  },
  {
    id: 'l7-onetwo',
    kind: 'lesson',
    title: '7 · The one-two',
    brief:
      'A one-two uses 2 actions: pass to a nearby teammate, run, and receive the return pass. Both passes can still be intercepted.',
    tips: ['Select the carrier, choose One-Two, pick the teammate, then pick where to run.'],
    objective: 'Get past the centre-back with the ball at row 18 or beyond.',
    maxTurns: 1,
    opponent: 'pass',
    setup: () =>
      position([['home', 'AM', 'H15'], ['home', 'WG', 'J16'], ['away', 'CB', 'H17'], ['away', 'CB', 'F17']], 0),
    success: (s) => homeHas(s) && s.ball.pos.r >= 17,
    fail: lostBall,
  },
  {
    id: 'd1-finish',
    kind: 'drill',
    title: 'Drill · Clinical finish',
    brief: 'Three attackers against two defenders and a keeper. The CPU defends.',
    tips: ['Draw the keeper to one side, then shoot to the other.'],
    objective: 'Score within 3 turns.',
    maxTurns: 3,
    opponent: 'pro',
    setup: () =>
      position(
        [
          ['home', 'AM', 'H16'],
          ['home', 'FW', 'F18'],
          ['home', 'WG', 'L17'],
          ['away', 'GK', 'H24'],
          ['away', 'CB', 'G21'],
          ['away', 'CB', 'J21'],
        ],
        0,
      ),
    success: (s) => s.score.home > 0,
    fail: (s) => lostBall(s),
  },
  {
    id: 'd2-build',
    kind: 'drill',
    title: 'Drill · Build from the back',
    brief: 'Play out from your own box against a three-man press.',
    tips: ['Keep supporting pieces next to the carrier so tackles fail.'],
    objective: 'Get the ball past halfway (row 13+) without losing it, within 4 turns.',
    maxTurns: 4,
    opponent: 'pro',
    setup: () =>
      position(
        [
          ['home', 'GK', 'H1'],
          ['home', 'CB', 'E3'],
          ['home', 'CB', 'K3'],
          ['home', 'DM', 'H6'],
          ['home', 'MF', 'D8'],
          ['away', 'FW', 'H4'],
          ['away', 'WG', 'D5'],
          ['away', 'AM', 'K7'],
        ],
        0,
      ),
    success: (s) => homeHas(s) && s.ball.pos.r >= 12,
    fail: lostBall,
  },
  {
    id: 'd3-defend',
    kind: 'drill',
    title: 'Drill · Hold the line',
    brief: 'Red are attacking your goal. Survive their onslaught.',
    tips: ['Block shooting lanes to the far corners.', 'Keep your keeper central.', 'Tackle with support.'],
    objective: 'Don\'t concede for 4 turns (or win the ball and clear it past halfway).',
    maxTurns: 4,
    opponent: 'pro',
    winOnTimeout: true,
    setup: () =>
      position(
        [
          ['home', 'GK', 'H1'],
          ['home', 'CB', 'G4'],
          ['home', 'CB', 'J4'],
          ['home', 'DM', 'H7'],
          ['away', 'FW', 'H9'],
          ['away', 'AM', 'E8'],
          ['away', 'WG', 'L8'],
        ],
        4,
        'away',
      ),
    success: (s) => homeHas(s) && s.ball.pos.r >= 12,
    fail: (s) => s.score.away > 0,
  },
];
