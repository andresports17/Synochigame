# SYNOCHÍ Laws Mode: rules specification

SYNOCHÍ is David André's project. Laws Mode makes the game a way to *learn* football's real rules: every call names the Law it comes from. The rules follow the **Laws of the Game published by IFAB** (FIFA is one of IFAB's members). In marketing, say "follows the official Laws of the Game" rather than "FIFA rules", because FIFA is a protected trademark, and explain the Laws in our own words rather than copying IFAB's text.

Quick Play keeps the simplified rules (no offside, the ball never goes out) for casual games.

## Scale

On a 105 × 68 m pitch, one square is about 4.3 m. Teaching line: **10 yards = 2 squares.**

| Real | Board |
|---|---|
| Penalty area, 16.5 m deep | 4 rows, columns D–M |
| 9.15 m (free kicks, corners, centre circle) | 2 squares |
| Throw-in (typically 15–17 m) | Up to 4 squares |
| Goal, 7.32 m | 2 columns in reality; the game currently uses 4 (G–J). **Decision needed** |

## Stage 1: built and tested

| Law | Rule on the board | Code |
|---|---|---|
| 11 Offside | When a teammate passes, an attacker is in an offside position if they are in the opponent's half and nearer the goal line than both the ball and the second-last defender. **Level is onside.** Judged when the ball is played; punished only if that attacker then plays the ball, directly or by collecting a pass into space. Restart: indirect free kick to the defenders where the offender stood. | `offsideLine`, `offsidePositions`, `doPass`, move pickup |
| 11 Exemptions | No offside from a throw-in, goal kick or corner. Never offside in your own half or behind the ball. | `doPass` |
| 9 Out of play | The ball is out when it leaves the pitch completely. Players may pass it out on purpose. | `isOutCell`, `restartForOut` |
| 15 Throw-in | To the team that did not touch it last, from where it went out. Up to 4 squares. Cannot score directly. | `validateAction` |
| 16 Goal kick | Attackers last touched it over the goal line. The keeper takes it from the goal area; opponents leave the penalty area until it is taken. | `restartForbidden` |
| 17 Corner | Defenders last touched it over their own goal line, including a **parried** shot (power exactly equals the keeper's save) or a **hard deflection** off a blocker. Opponents stay 2 squares away. Can score directly. | `shotOutcome` |
| 13 Indirect free kick | Given for offside. Opponents stay 2 squares away. Cannot score directly. | `awardRestart` |
| 12 Keeper handling | Keepers may go anywhere but can only save inside their own penalty area; outside it they block like outfield players. (Quick Play keeps keepers inside the box.) | `shotOutcome`, `reachable` |
| Encroachment | When a restart is awarded, opponents standing too close are moved to the nearest legal square, and the log says why. | `awardRestart` |

### How a restart plays

- While a restart is pending, the ball is out of play: no tackles.
- If the restart goes to the side that has just finished its turn (for example, a corner after a parried shot), the other side gets one turn to **set up**. They may move pieces but must keep their distance.
- The restarting side may move other pieces first, but must keep one action for the kick and cannot end the turn without taking it. The taker cannot dribble off the spot.

### Teaching features

- **Offside line:** when choosing a pass in Laws Mode, a dashed line shows where offside starts, and a yellow flag marks any teammate in an offside position.
- **Law tags:** every call in the match log and the action preview names its Law.
- **Restart panel:** explains the restart's rules as it happens.
- **4 Laws lessons:** Level is onside, Timing the run, The throw-in, The corner kick.
- **Ref's Eye:** 12 referee calls on offside and restarts. Every answer is computed by the engine, and a test checks it against the expected call, so the quiz and the game cannot disagree.

### What testing showed

Over 15 CPU-vs-CPU Laws matches:

- **Corners:** about 13 per match (real football: about 10), but almost all from parried shots. The CPU has learned that shooting to win a corner pays.
- **Throw-ins:** only when the CPU chooses to clear into touch; real football has far more.
- **Offside:** never called, because the CPU sees it coming and avoids it.
- **Goals:** about 1 per match.

These are balance points to tune once David's official rules are in.

## Stage 2: proposed next (needs David's approval)

| Law | Proposal |
|---|---|
| 12 Fouls | A tackle from behind (tackler between the carrier and the carrier's own goal) is a foul. A tackle lost by 2 or more is a careless foul. A fair tackle that wins the ball plays on. |
| 5 Advantage | The fouled side chooses between the free kick and playing on. |
| 13 Free kicks | Direct free kick for fouls. Defenders get a short set-up to form a wall at 2 squares; attackers cannot stand in the wall. Quick free kick allowed before the wall forms. |
| 14 Penalty | A foul in the defenders' own penalty area. Kick from row 3 or row 22; everyone else outside the area. Resolved by a **simultaneous secret choice** (kicker picks a corner, keeper picks a side): outguessing, not luck. |
| 12 Cards | Yellow: stopping a promising attack. Red: denying an obvious goal-scoring opportunity (exactly definable: the carrier has a clear shot in range with only the keeper to beat). DOGSO in the box while genuinely going for the ball: penalty plus yellow only. Two yellows make a red. |
| 12 Keeper holding | Back-pass rule: the keeper cannot hold a deliberate pass from a teammate (indirect free kick). A keeper holding the ball after a save cannot be tackled and must release it within one turn, or the opponents get a corner (the 2025/26 "8-second" rule). |

**Decision needed: red cards vs. "all 22 stay on the board."** Laws Mode could remove a sent-off piece; Quick Play could use a temporary sit-out (a sin bin, which grassroots football allows).

## Stage 3: proposed later

- **Law 3 substitutions:** 5 substitutes in 3 windows plus half-time, only when play has stopped. A substitute may come on in a different role. The physical edition then needs bench figures.
- **Law 7 added time:** extra turns at the end of each half for goals, cards and substitutions; the clock shows real football minutes.
- **Law 10 shootouts:** for knockout tournaments, 5 kicks each, alternating, using the penalty system.
- **Quiz cards:** for the Laws a board can't show (the ball, equipment, handball, dissent, VAR).

## Open questions for David

1. Do these rules match the written rulebook and the 11 open decisions in the Development Brief?
2. Real 2-column goal, or the wider 4-column goal?
3. Red cards: remove the piece, or a sin bin?
4. Penalties: secret simultaneous choice?
5. Should Laws Mode be the default for ranked play?
