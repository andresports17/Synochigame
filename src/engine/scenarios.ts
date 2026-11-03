import { HALF_MS, TURN_MS, parseCell } from './board';
import { canShootFrom } from './board';
import type { Difficulty } from './cpu';
import type { GameState, Piece, Role, Side, Stats } from './types';

/** Lessons teach the official rules one at a time, each in a small set-piece position. */
export interface Scenario {
  id: string;
  title: string;
  rule: string;
  brief: string;
  tips: string[];
  objective: string;
  /** How many Blue turns the player gets. */
  maxTurns: number;
  /** 'pass' = Red does nothing; otherwise the CPU plays Red at that level. */
  opponent: 'pass' | Difficulty;
  setup: () => GameState;
  success: (s: GameState) => boolean;
  fail?: (s: GameState) => boolean;
}

export type Spec = [Side, Role, string];

const stats = (): Stats => ({
  passes: 0, passesCompleted: 0, shots: 0, shotsOnTarget: 0, goals: 0, saves: 0, blocks: 0, tackles: 0, reactiveTackles: 0, interceptions: 0, offsides: 0,
});

/** Build a custom, untimed position. `ballWith` is the index of the piece holding the ball. Blue (home) attacks up. */
export function buildPosition(specs: Spec[], ballWith: number, turn: Side = 'home'): GameState {
  const n: Record<Side, number> = { home: 0, away: 0 };
  const pieces: Piece[] = specs.map(([side, role, at]) => ({ id: `${side === 'home' ? 'H' : 'A'}${n[side]++}`, side, role, pos: parseCell(at) }));
  const carrier = pieces[ballWith];
  return {
    pieces,
    ball: { pos: { ...carrier.pos }, carrier: carrier.id },
    turn,
    followUp: null,
    kickoffPending: false,
    phase: 'playing',
    half: 1,
    score: { home: 0, away: 0 },
    formations: { home: '4-3-3', away: '4-3-3' },
    firstKickoff: 'home',
    timed: false,
    clock: { halfMs: HALF_MS, turnMs: TURN_MS },
    turnNumber: 1,
    stats: { home: stats(), away: stats() },
    events: [],
  };
}

const blueHas = (s: GameState, id?: string) => !!s.ball.carrier?.startsWith('H') && (!id || s.ball.carrier === id);
const redHas = (s: GameState) => !!s.ball.carrier?.startsWith('A');

export const SCENARIOS: Scenario[] = [
  {
    id: 'o1-movement',
    title: '1 · Every role moves differently',
    rule: 'Rule 3 · Movement',
    brief:
      'Pieces move in straight lines, straight or diagonal, up to a limit that depends on the role and the direction. They cannot jump over or land on another piece. A Flanker normally reaches 2 squares diagonally forward, but 3 when it starts in a flank column (A–C or N–P).',
    tips: ['Tap the Flanker to see its moves.', 'Every turn is one piece: move it, and pass or shoot with that same piece when the rules allow.'],
    objective: 'Move the Flanker from B14 to E11.',
    maxTurns: 1,
    opponent: 'pass',
    setup: () => buildPosition([['home', 'WG', 'B14'], ['home', 'MF', 'H17'], ['away', 'CB', 'H8']], 1),
    success: (s) => s.pieces.some((p) => p.id === 'H0' && p.pos.c === 4 && p.pos.r === 10),
  },
  {
    id: 'o2-move-pass',
    title: '2 · Move, then pass',
    rule: 'Rule 4 · Turns',
    brief:
      'A turn is one piece. A ball carrier may move and then pass if it ends in its own half or in the shooting zone. The Connector is special: it can move then pass from anywhere. Passes must travel in a straight or diagonal line.',
    tips: ['Your Frontliner is not in line with the Connector yet.', 'Move the Connector one square so the pass becomes a diagonal, then pass.'],
    objective: 'Get the ball to your Frontliner.',
    maxTurns: 1,
    opponent: 'pass',
    setup: () => buildPosition([['home', 'MF', 'H16'], ['home', 'FW', 'L11'], ['away', 'CB', 'D9'], ['away', 'GK', 'H2']], 0),
    success: (s) => blueHas(s, 'H1'),
    fail: redHas,
  },
  {
    id: 'o3-lanes',
    title: '3 · Passing lanes',
    rule: 'Rule 5.2 · Interception',
    brief:
      'An opponent on the first square of a pass takes the ball. An opponent 2 squares away on the line intercepts it too. Opponents 3 or more squares away are ignored: the pass goes over them.',
    tips: ['Tap the Anchor, then hover or tap each teammate to preview the pass.', 'Only one pass here is safe.'],
    objective: 'Complete a pass without losing the ball.',
    maxTurns: 1,
    opponent: 'pass',
    setup: () =>
      buildPosition(
        [
          ['home', 'DM', 'H18'],
          ['home', 'AM', 'H13'],
          ['home', 'WG', 'L14'],
          ['home', 'MF', 'E15'],
          ['home', 'FB', 'B18'],
          ['away', 'FW', 'H16'],
          ['away', 'DM', 'J16'],
          ['away', 'AM', 'G18'],
        ],
        0,
      ),
    success: (s) => blueHas(s) && s.ball.carrier !== 'H0',
    fail: redHas,
  },
  {
    id: 'o4-reception',
    title: '4 · Contested reception',
    rule: 'Rule 5.3 · Contested reception',
    brief:
      'A pass can clear the lane and still be lost at the receiver. If a defender stands right behind the receiver, in line with the pass, it wins the ball. So does a double-team that leaves the receiver no free, unpressured square.',
    tips: ['Look at what is standing beyond each receiver.'],
    objective: 'Find the receiver who keeps the ball.',
    maxTurns: 1,
    opponent: 'pass',
    setup: () =>
      buildPosition(
        [['home', 'MF', 'H16'], ['home', 'FW', 'H12'], ['home', 'AM', 'E13'], ['away', 'CB', 'H11'], ['away', 'GK', 'H2']],
        0,
      ),
    success: (s) => blueHas(s, 'H2'),
    fail: redHas,
  },
  {
    id: 'o5-offside',
    title: '5 · Offside',
    rule: 'Rule 6 · Offside',
    brief:
      'When the pass is played, a receiver is offside if it is in the opponent\'s half, ahead of the ball, and beyond the last outfield defender. Level is onside. In SYNOCHÍ the Box Keeper does not count. Offside gives the ball to the defender nearest the offender.',
    tips: ['Your Frontliner is one row beyond the Central Pillar.', 'Step it back level first (that uses your turn), then pass next turn.'],
    objective: 'Get the ball to your Frontliner without being offside.',
    maxTurns: 2,
    opponent: 'pass',
    setup: () =>
      buildPosition([['home', 'MF', 'H15'], ['home', 'FW', 'H9'], ['away', 'CB', 'F10'], ['away', 'GK', 'I2']], 0),
    success: (s) => blueHas(s, 'H1'),
    fail: redHas,
  },
  {
    id: 'o6-reactive',
    title: '6 · Reactive tackles',
    rule: 'Rule 7 · Tackling',
    brief:
      'If you move the ball carrier next to an Anchor, Central Pillar or Defensive Flanker, it wins the ball straight away. The shooting zone is the rows nearest the opponent\'s goal (shaded). Pick a route that stays clear of the defenders.',
    tips: ['Straight ahead and to the right both end next to a Central Pillar.'],
    objective: 'Take the Frontliner into the shooting zone with the ball.',
    maxTurns: 1,
    opponent: 'pass',
    setup: () =>
      buildPosition([['home', 'FW', 'H8'], ['away', 'CB', 'G6'], ['away', 'CB', 'J6'], ['away', 'GK', 'H2']], 0),
    success: (s) => {
      const fw = s.pieces.find((p) => p.id === 'H0')!;
      return s.ball.carrier === 'H0' && canShootFrom('home', fw.pos);
    },
    fail: redHas,
  },
  {
    id: 'o7-active',
    title: '7 · Winning the ball',
    rule: 'Rule 7 · Tackling',
    brief:
      'To win the ball, move a defender next to the carrier, as long as that defender\'s role allows it. A Central Pillar can always tackle diagonally. Frontliners, Flankers and Sparkers only win the ball as part of a double-team. Win it and you get a fresh turn.',
    tips: ['Your Frontliner alone will not do it.', 'Bring the Central Pillar diagonally next to the Red Frontliner.'],
    objective: 'Win the ball back.',
    maxTurns: 1,
    opponent: 'pass',
    setup: () =>
      buildPosition([['home', 'CB', 'F16'], ['home', 'FW', 'K13'], ['away', 'FW', 'H14'], ['away', 'MF', 'H9']], 2),
    success: (s) => blueHas(s),
  },
  {
    id: 'o8-shooting',
    title: '8 · Shooting and the keeper',
    rule: 'Rule 8 · Shooting',
    brief:
      'Shots go straight at goal from columns G–J and diagonally toward goal from outside them. The first piece on the shot\'s path stops it: the keeper saves, anyone else blocks. A keeper within one square of any square on the path also saves.',
    tips: ['From E4 the diagonal shot runs right past the keeper.', 'Step sideways to column G and shoot straight: the keeper is two squares away.'],
    objective: 'Score.',
    maxTurns: 1,
    opponent: 'pass',
    setup: () => buildPosition([['home', 'FW', 'E4'], ['away', 'GK', 'I2'], ['away', 'CB', 'L5']], 0),
    success: (s) => s.score.home > 0,
    fail: redHas,
  },
  {
    id: 'o9-one-two',
    title: '9 · The one-two',
    rule: 'Rule 5.4 · One-two',
    brief:
      'A one-two passes to a compatible teammate; the passer runs forward onto the receiver\'s row automatically and gets the ball back. Either pass can still be intercepted.',
    tips: ['Select the Connector, choose One-two, then pick the Sparker.'],
    objective: 'Complete a one-two.',
    maxTurns: 1,
    opponent: 'pass',
    setup: () =>
      buildPosition([['home', 'MF', 'H17'], ['home', 'AM', 'J15'], ['away', 'FW', 'D12'], ['away', 'CB', 'H8']], 0),
    success: (s) => s.events.some((e) => e.kind === 'oneTwo'),
    fail: redHas,
  },
];

export { HALF_MS };
