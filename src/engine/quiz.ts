import { parseCell } from './board';
import { RULE, applyAction, getPiece } from './rules';
import { buildPosition, type Spec } from './scenarios';
import type { Action, Cell, GameState, Side } from './types';

/**
 * Ref's Eye: rules training. Each question shows a position and one action;
 * the player makes the call. The answer always comes from the rules engine, and
 * a test checks it against `expected`, so the quiz can never contradict the game.
 */
export type QuizKind = 'pass' | 'shot' | 'tackle';

export interface QuizQuestion {
  id: string;
  rule: string;
  kind: QuizKind;
  prompt: string;
  explain: string;
  setup: () => GameState;
  action: Action;
  expected: string;
}

export const QUIZ_OPTIONS: Record<QuizKind, string[]> = {
  pass: ['Pass completed', 'Intercepted', 'Offside', 'Won at reception'],
  shot: ['Goal', 'Saved', 'Blocked', 'Wide'],
  tackle: ['Ball won', 'Play on'],
};

export function judge(q: QuizQuestion): { call: string; after: GameState } {
  const before = q.setup();
  const after = applyAction(before, q.action);
  const kinds = new Set(after.events.slice(before.events.length).map((e) => e.kind));
  const call = kinds.has('offside')
    ? 'Offside'
    : kinds.has('intercept') || kinds.has('blocked')
      ? 'Intercepted'
      : kinds.has('contested')
        ? 'Won at reception'
        : kinds.has('pass')
          ? 'Pass completed'
          : kinds.has('goal')
            ? 'Goal'
            : kinds.has('save')
              ? 'Saved'
              : kinds.has('block')
                ? 'Blocked'
                : kinds.has('goalKick')
                  ? 'Wide'
                  : kinds.has('tackle') || kinds.has('reactiveTackle')
                    ? 'Ball won'
                    : 'Play on';
  return { call, after };
}

export function questionArrow(q: QuizQuestion): { from: Cell; to: Cell } | null {
  const s = q.setup();
  const a = q.action;
  if (a.type === 'pass' || a.type === 'move') return { from: getPiece(s, a.pieceId)!.pos, to: a.to };
  return null;
}

const pos = (specs: Spec[], ballWith: number, turn: Side = 'home') => () => buildPosition(specs, ballWith, turn);
const pass = (pieceId: string, to: string): Action => ({ type: 'pass', pieceId, to: parseCell(to) });
const move = (pieceId: string, to: string): Action => ({ type: 'move', pieceId, to: parseCell(to) });
const shoot = (pieceId: string): Action => ({ type: 'shoot', pieceId });

export const QUIZ: QuizQuestion[] = [
  {
    id: 'q-keeper-ignored',
    rule: RULE.offside,
    kind: 'pass',
    prompt: 'The Frontliner is past every Red outfield player. Only Red\'s Box Keeper is behind it. The Connector passes.',
    explain: 'In SYNOCHÍ the Box Keeper does not count for offside. The line is the last outfield defender, and the Frontliner is beyond it. (In real football the keeper usually counts as one of the last two.)',
    setup: pos([['home', 'MF', 'H15'], ['home', 'FW', 'H9'], ['away', 'CB', 'F10'], ['away', 'GK', 'I2']], 0),
    action: pass('H0', 'H9'),
    expected: 'Offside',
  },
  {
    id: 'q-level',
    rule: RULE.offside,
    kind: 'pass',
    prompt: 'Now the Frontliner is level with Red\'s last Central Pillar.',
    explain: 'Level is onside. The receiver must be strictly beyond the last outfield defender to be offside.',
    setup: pos([['home', 'MF', 'H15'], ['home', 'FW', 'H10'], ['away', 'CB', 'F10'], ['away', 'GK', 'I2']], 0),
    action: pass('H0', 'H10'),
    expected: 'Pass completed',
  },
  {
    id: 'q-behind-ball',
    rule: RULE.offside,
    kind: 'pass',
    prompt: 'The Sparker is deep in Red\'s half and passes sideways to the Flanker on the same row, past the last defender.',
    explain: 'A receiver must be ahead of the ball to be offside. A square or backward pass is always onside.',
    setup: pos([['home', 'AM', 'L6'], ['home', 'WG', 'D6'], ['away', 'CB', 'H9'], ['away', 'GK', 'H2']], 0),
    action: pass('H0', 'D6'),
    expected: 'Pass completed',
  },
  {
    id: 'q-adjacent',
    rule: RULE.pass,
    kind: 'pass',
    prompt: 'A Red Sparker stands on the square right next to the Anchor, in the direction of the pass.',
    explain: 'An opponent on the first square of the pass takes the ball as soon as the pass is attempted.',
    setup: pos([['home', 'DM', 'H18'], ['home', 'FB', 'B18'], ['away', 'AM', 'G18']], 0),
    action: pass('H0', 'B18'),
    expected: 'Intercepted',
  },
  {
    id: 'q-two-away',
    rule: RULE.pass,
    kind: 'pass',
    prompt: 'A Red Frontliner is on the pass line, two squares from the passer.',
    explain: 'Opponents closer than 3 squares on the pass line intercept it, unless a teammate further down the line shields it.',
    setup: pos([['home', 'DM', 'H18'], ['home', 'AM', 'H13'], ['away', 'FW', 'H16']], 0),
    action: pass('H0', 'H13'),
    expected: 'Intercepted',
  },
  {
    id: 'q-three-away',
    rule: RULE.pass,
    kind: 'pass',
    prompt: 'The Red Frontliner is on the pass line again, but three squares from the passer.',
    explain: 'Opponents 3 or more squares from the passer are ignored: the ball goes over them.',
    setup: pos([['home', 'DM', 'H18'], ['home', 'AM', 'H13'], ['away', 'FW', 'H15']], 0),
    action: pass('H0', 'H13'),
    expected: 'Pass completed',
  },
  {
    id: 'q-shield',
    rule: RULE.pass,
    kind: 'pass',
    prompt: 'A Red piece is two squares out on the line, but a Blue Connector stands further down the same line before the receiver.',
    explain: 'A teammate further down the pass line, at least two squares from the passer, shields the pass from a closer opponent.',
    setup: pos([['home', 'DM', 'H18'], ['home', 'MF', 'H15'], ['home', 'AM', 'H13'], ['away', 'FW', 'H16']], 0),
    action: pass('H0', 'H13'),
    expected: 'Pass completed',
  },
  {
    id: 'q-pressure',
    rule: RULE.contested,
    kind: 'pass',
    prompt: 'The lane to the Frontliner is clear, but a Red Central Pillar stands right behind it, in line with the pass.',
    explain: 'Pressure tackle: a defender next to the receiver, straight on along the pass direction, wins the ball as it arrives.',
    setup: pos([['home', 'MF', 'H16'], ['home', 'FW', 'H12'], ['away', 'CB', 'H11']], 0),
    action: pass('H0', 'H12'),
    expected: 'Won at reception',
  },
  {
    id: 'q-keeper-reach',
    rule: RULE.shot,
    kind: 'shot',
    prompt: 'The Frontliner shoots diagonally from E4. Red\'s keeper stands at I2.',
    explain: 'A keeper in its box saves any shot whose path passes within one square of it. The diagonal path runs through H1, right next to the keeper.',
    setup: pos([['home', 'FW', 'E4'], ['away', 'GK', 'I2']], 0),
    action: shoot('H0'),
    expected: 'Saved',
  },
  {
    id: 'q-straight',
    rule: RULE.shot,
    kind: 'shot',
    prompt: 'Same keeper, but the Frontliner shoots straight from G4.',
    explain: 'From columns G–J the shot goes straight at goal. Every square on the path is two away from the keeper, so it is a goal.',
    setup: pos([['home', 'FW', 'G4'], ['away', 'GK', 'I2']], 0),
    action: shoot('H0'),
    expected: 'Goal',
  },
  {
    id: 'q-block',
    rule: RULE.shot,
    kind: 'shot',
    prompt: 'A Red Anchor stands on G3, between the shooter on G4 and the goal.',
    explain: 'The first piece on the path stops the shot. A keeper saves; anyone else blocks it, and the ball rebounds.',
    setup: pos([['home', 'FW', 'G4'], ['away', 'DM', 'G3'], ['away', 'GK', 'L1']], 0),
    action: shoot('H0'),
    expected: 'Blocked',
  },
  {
    id: 'q-reactive',
    rule: RULE.tackle,
    kind: 'tackle',
    prompt: 'Blue\'s Frontliner dribbles forward and ends next to a Red Anchor.',
    explain: 'Reactive tackle: a carrier that moves next to an Anchor, Central Pillar or Defensive Flanker loses the ball at once.',
    setup: pos([['home', 'FW', 'H12'], ['away', 'DM', 'G9']], 0),
    action: move('H0', 'H10'),
    expected: 'Ball won',
  },
  {
    id: 'q-press-alone',
    rule: RULE.tackle,
    kind: 'tackle',
    prompt: 'Blue\'s Frontliner moves next to the Red ball carrier on its own.',
    explain: 'Frontliners, Flankers and Sparkers can only win the ball as part of a double-team. Alone, nothing happens.',
    setup: pos([['home', 'FW', 'K13'], ['away', 'FW', 'H14']], 1),
    action: move('H0', 'I13'),
    expected: 'Play on',
  },
  {
    id: 'q-diagonal',
    rule: RULE.tackle,
    kind: 'tackle',
    prompt: 'Blue\'s Central Pillar steps diagonally next to the Red ball carrier.',
    explain: 'A Central Pillar may always tackle from a diagonal square, and winning the ball gives Blue a fresh turn.',
    setup: pos([['home', 'CB', 'F16'], ['away', 'FW', 'H14']], 1),
    action: move('H0', 'G15'),
    expected: 'Ball won',
  },
];
