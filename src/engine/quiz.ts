import { LAW_NAMES, RESTART_NAMES } from './config';
import { applyAction, getPiece, TEAM_NAMES } from './rules';
import { buildPosition, parseCell, type Spec } from './scenarios';
import type { Action, Cell, GameState, RestartType, Side } from './types';

/**
 * Ref's Eye: referee training. Each question shows a position and one action.
 * The player makes the call; the answer always comes from the rules engine,
 * so the quiz can never disagree with the game.
 */
export interface QuizQuestion {
  id: string;
  law: string;
  prompt: string;
  explain: string;
  kind: 'offside' | 'restart';
  setup: () => GameState;
  action: Action;
  /** The call we expect the engine to make (checked by the tests). */
  expected: string;
}

export const OFFSIDE_OPTIONS = ['Play on', 'Offside'];
export const RESTART_OPTIONS = (['throwIn', 'goalKick', 'corner'] as RestartType[]).flatMap((t) =>
  (['home', 'away'] as Side[]).map((s) => `${RESTART_NAMES[t]} to ${TEAM_NAMES[s]}`),
);

export const optionsFor = (q: QuizQuestion) => (q.kind === 'offside' ? OFFSIDE_OPTIONS : RESTART_OPTIONS);

/** The referee's call for a question, as decided by the engine. */
export function judge(q: QuizQuestion): { call: string; after: GameState } {
  const before = q.setup();
  const after = applyAction(before, q.action);
  const fresh = after.events.slice(before.events.length);
  if (fresh.some((e) => e.kind === 'offside')) return { call: 'Offside', after };
  const restart = fresh.find((e) => e.kind === 'restart');
  if (restart && after.restart) return { call: `${RESTART_NAMES[after.restart.type]} to ${TEAM_NAMES[after.restart.side]}`, after };
  return { call: 'Play on', after };
}

/** Start and end cells of the question's action, for drawing an arrow. */
export function questionArrow(q: QuizQuestion): { from: Cell; to: Cell } | null {
  const s = q.setup();
  const a = q.action;
  if (a.type === 'pass') return { from: getPiece(s, a.pieceId)!.pos, to: a.to };
  if (a.type === 'shoot') return { from: getPiece(s, a.pieceId)!.pos, to: a.target };
  return null;
}

const laws = (specs: Spec[], ballWith: number, turn: Side = 'home', restart?: RestartType) => () =>
  buildPosition(specs, ballWith, turn, { mode: 'laws', restart });

const pass = (pieceId: string, to: string | Cell): Action => ({ type: 'pass', pieceId, to: typeof to === 'string' ? parseCell(to) : to });

export const QUIZ: QuizQuestion[] = [
  {
    id: 'q-level',
    law: LAW_NAMES.offside,
    kind: 'offside',
    prompt: 'Blue\'s Connector passes to the Frontliner, who is level with the last two Red defenders. Your call?',
    explain: 'Level with the second-last defender is onside. The attacker has to be nearer the goal line than that defender to be offside.',
    setup: laws([['home', 'MF', 'E12'], ['home', 'FW', 'H19'], ['away', 'GK', 'H24'], ['away', 'CB', 'F19'], ['away', 'CB', 'K19']], 0),
    action: pass('H0', 'H19'),
    expected: 'Play on',
  },
  {
    id: 'q-beyond',
    law: LAW_NAMES.offside,
    kind: 'offside',
    prompt: 'Same pass, but the Frontliner is one row beyond the defenders.',
    explain: 'The Frontliner is in Red\'s half and nearer the goal line than both the ball and the second-last defender. Receiving the pass is an offside offence: indirect free kick to Red.',
    setup: laws([['home', 'MF', 'E12'], ['home', 'FW', 'H20'], ['away', 'GK', 'H24'], ['away', 'CB', 'F19'], ['away', 'CB', 'K19']], 0),
    action: pass('H0', 'H20'),
    expected: 'Offside',
  },
  {
    id: 'q-own-half',
    law: LAW_NAMES.offside,
    kind: 'offside',
    prompt: 'Red have pushed their defenders into Blue\'s half. Blue\'s Frontliner, still in their own half, receives a pass behind them.',
    explain: 'You cannot be offside in your own half. Red\'s high line left space behind it.',
    setup: laws([['home', 'DM', 'H6'], ['home', 'FW', 'H12'], ['away', 'GK', 'H20'], ['away', 'CB', 'F11'], ['away', 'CB', 'K11']], 0),
    action: pass('H0', 'H12'),
    expected: 'Play on',
  },
  {
    id: 'q-behind-ball',
    law: LAW_NAMES.offside,
    kind: 'offside',
    prompt: 'Blue\'s Sparker is deep in Red\'s half and squares the ball back to the Frontliner, who is past the defenders but behind the ball.',
    explain: 'A player behind the ball cannot be offside. That makes a pass backwards, or square, always safe.',
    setup: laws([['home', 'AM', 'K21'], ['home', 'FW', 'H20'], ['away', 'GK', 'H24'], ['away', 'CB', 'E18'], ['away', 'CB', 'M18']], 0),
    action: pass('H0', 'H20'),
    expected: 'Play on',
  },
  {
    id: 'q-keeper-counts',
    law: LAW_NAMES.offside,
    kind: 'offside',
    prompt: 'Red have one Central Pillar back plus their Box Keeper. Blue\'s Frontliner is between them when the pass is played.',
    explain: 'The keeper is usually the last defender, so the Central Pillar is the second-last. The Frontliner is beyond them: offside.',
    setup: laws([['home', 'MF', 'H13'], ['home', 'FW', 'J20'], ['away', 'GK', 'H24'], ['away', 'CB', 'H18']], 0),
    action: pass('H0', 'J20'),
    expected: 'Offside',
  },
  {
    id: 'q-keeper-out',
    law: LAW_NAMES.offside,
    kind: 'offside',
    prompt: 'Red\'s keeper has come out to row 19 and a defender is back on the goal line. Blue\'s Frontliner is at row 21 when the pass is played.',
    explain: 'The second-last defender does not have to be an outfield player. With a defender on the line, the keeper at row 19 is second-last, and the Frontliner is beyond them: offside.',
    setup: laws([['home', 'AM', 'H14'], ['home', 'FW', 'L21'], ['away', 'GK', 'H19'], ['away', 'CB', 'E23'], ['away', 'CB', 'H10']], 0),
    action: pass('H0', 'L21'),
    expected: 'Offside',
  },
  {
    id: 'q-throw-in',
    law: LAW_NAMES.throwIn,
    kind: 'offside',
    prompt: 'Blue take a throw-in to a Frontliner standing beyond the Red defenders.',
    explain: 'There is no offside offence from a throw-in, a goal kick or a corner kick.',
    setup: laws([['home', 'WG', 'A18'], ['home', 'FW', 'C21'], ['away', 'GK', 'H24'], ['away', 'CB', 'E19'], ['away', 'CB', 'H19']], 0, 'home', 'throwIn'),
    action: pass('H0', 'C21'),
    expected: 'Play on',
  },
  {
    id: 'q-touchline',
    law: LAW_NAMES.out,
    kind: 'restart',
    prompt: 'Blue\'s Defensive Flanker hits the ball over the touchline. What is the restart?',
    explain: 'The ball is out when all of it crosses a touchline. The team that did not touch it last takes a throw-in from where it went out.',
    setup: laws([['home', 'FB', 'O10'], ['away', 'WG', 'M11'], ['away', 'GK', 'H24']], 0),
    action: pass('H0', { c: 16, r: 9 }),
    expected: 'Throw-in to Red',
  },
  {
    id: 'q-own-line',
    law: LAW_NAMES.corner,
    kind: 'restart',
    prompt: 'Under pressure, Red\'s Central Pillar plays the ball over Red\'s own goal line, wide of the posts.',
    explain: 'When the defending team last touches the ball before it crosses their own goal line, the attackers take a corner kick.',
    setup: laws([['away', 'CB', 'C23'], ['away', 'GK', 'H24'], ['home', 'FW', 'D21']], 0, 'away'),
    action: pass('A0', { c: 2, r: 24 }),
    expected: 'Corner kick to Blue',
  },
  {
    id: 'q-overhit',
    law: LAW_NAMES.goalKick,
    kind: 'restart',
    prompt: 'Blue\'s Flanker over-hits a cross and it goes over Red\'s goal line, wide of the posts.',
    explain: 'When the attacking team last touches the ball before it crosses the goal line, the defenders restart with a goal kick from their goal area.',
    setup: laws([['home', 'WG', 'N20'], ['away', 'GK', 'H24'], ['away', 'CB', 'H21']], 0),
    action: pass('H0', { c: 13, r: 24 }),
    expected: 'Goal kick to Red',
  },
  {
    id: 'q-attack-line',
    law: LAW_NAMES.goalKick,
    kind: 'restart',
    prompt: 'Red\'s Frontliner, attacking Blue\'s goal, miscontrols the ball over Blue\'s goal line.',
    explain: 'Red touched it last going over the goal line they were attacking, so it is a goal kick to Blue.',
    setup: laws([['away', 'FW', 'E3'], ['home', 'GK', 'H1'], ['home', 'CB', 'K3']], 0, 'away'),
    action: pass('A0', { c: 4, r: -1 }),
    expected: 'Goal kick to Blue',
  },
  {
    id: 'q-parry',
    law: LAW_NAMES.corner,
    kind: 'restart',
    prompt: 'Blue\'s Sparker shoots. Red\'s keeper gets a hand to it and pushes it round the post.',
    explain: 'The keeper touched the ball last before it crossed their own goal line, so Blue take a corner. The keeper counts as a defender here like anyone else.',
    setup: laws([['home', 'AM', 'H21'], ['away', 'GK', 'H24'], ['away', 'CB', 'C22']], 0),
    action: { type: 'shoot', pieceId: 'H0', target: { c: 9, r: 24 } },
    expected: 'Corner kick to Blue',
  },
];
