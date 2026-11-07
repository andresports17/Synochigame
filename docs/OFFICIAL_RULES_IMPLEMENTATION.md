# Official rules: implementation notes

**Source:** *SYNOCHÍ Official Game Rules — Extraction Draft* (3 November 2026), from David André's Replit build.
**Engine:** `src/engine/` (board, roles, formations, rules, CPU, lessons, quiz). **Tests:** `tests/official.test.ts`, with one block per rules section.

This replaces the provisional rule set from v0.1 and the "Laws Mode" experiment. Both remain in git history (commit `5e19cbe`) if any of those ideas are wanted later.

Board labels in this document use columns A–P and rows 1–24 counted from the top. The extract uses zero-based rows 0–23, so its "row 0" is row 1 here.

## Rule-by-rule mapping

| Section | Implemented as | Where |
|---|---|---|
| 1 Board | 24 × 16; goal-line columns F–K, on-target G–J; six-yard boxes F–K × 3 rows at each end; halfway between rows 12 and 13; centre area rows 11–14 × F–K. Home (Blue) attacks toward row 1. | `board.ts` |
| 2 Teams and formations | 8 roles; 5 presets; validator: 11 pieces, 1 keeper, at least 1 Frontliner, own half, keeper in its box, no outfield piece in a box, no defender in the centre circle, no shared squares. | `roles.ts`, `formations.ts` |
| 3 Movement | Straight rays, per-role and per-direction limits (forward, backward, sideways, straight vs diagonal), position-dependent ranges (flank columns, own half) measured from the start square; stopped by the first occupied square; only the keeper enters a six-yard box and never leaves its own. | `maxRange`, `legalMoves` |
| 4 Turns | One piece per turn. Follow-up after a move: pass in own half or shooting zone, shoot in the shooting zone, Connector passes anywhere, Sparker never moves and shoots. Stationary pass or shot. Kickoff must be a pass. A pass or shot ends the turn; a tackle gives the winner a fresh turn. | `afterMove`, `validateAction` |
| 5.1–5.2 Passing | Straight or diagonal to a teammate, any distance. Adjacent first-square block; interception within 2; ignored from 3; shield by a teammate further down the ray. | `passOutcome` |
| 5.3 Contested reception | Pressure tackle (defender just beyond the receiver along the pass line); double-team with no free, unpressured square. | `passOutcome` |
| 5.4 One-two | Compatibility table; automatic forward run onto the receiver's row; first leg must be onside; return leg can be intercepted. The CPU does not play one-twos (as in the original notes). | `oneTwoRun`, `resolveAction` |
| 6 Offside | Judged at the pass: opponent half, ahead of the ball, strictly beyond the deepest outfield defender (keeper excluded). No outfield defenders, no offside. Ball goes to the defender nearest the offender. Both one-two legs checked. | `isOffside`, `offsideLine` |
| 7 Tackling | Reactive (carrier moves next to an Anchor, Central Pillar or Defensive Flanker). Active (defender moves next to a stationary carrier): Trap, Central Pillar close-down and diagonal, Defensive Flanker wide, Anchor own-half and double-team, Connector front and double-team, press roles double-team only. Reactive and total tackles are counted separately. | `reactiveTackler`, `activeTackleRule` |
| 8 Shooting | Shooting band and no-shoot zones; straight or diagonal by column; first occupied square decides (keeper saves, others block); keeper within one square of the path saves; on target only in G–J, otherwise wide (keeper's ball); rebounds one square back (straight) or two diagonally back (diagonal). | `canShootFrom`, `shotOutcome` |
| 9 Kickoff and clock | Frontliner on the kickoff square, pass first; defenders moved out of the centre circle; two 5:00 halves starting at the opening pass; 25 s per turn with forfeit; half-time formation change; the other team kicks off the second half. | `createMatch`, `tick`, `resume` |
| 10 CPU | Beginner (no lookahead, a little noise), Baller (one-ply lookahead), Master (two-ply, deterministic). Uses the same validators as players. | `cpu.ts` |

The clock is part of the deterministic log as `tick` actions, so the server can replay a match, clock included, to verify results. Online, the server applies real elapsed time, and players cannot send ticks.

## David's decisions (questionnaire, 6 November 2026)

David answered the [Rules & Launch Questionnaire](https://claude.ai/artifact/JAcgHucbiMAVP42QiVFUoL) in comments. These rule answers are now built in:

| Q | Decision | Built as |
|---|---|---|
| 1 | Row 1 at the top; Blue attacks up | Unchanged |
| 2 | Kickoff at the centre on the halfway line; players may place pieces anywhere in a legal formation | Kickoff squares unchanged (H13 / I12, either side of the centre); "My set-up" editor with the rule 2.1 checks (`legalFormationSquare`, `validateFormation`), used through `homeLayout` / `awayLayout` |
| 3 | Not answered | Kept: the receiver does not count as the shielding teammate |
| 4 | Offside line: keep | Superseded by Q23 |
| 5 | Offside before interceptions | `passOutcome` checks offside first |
| 6a | The player chooses where the passer runs: forward, backward or sideways, in line with the receiver, who stays put | `oneTwoRuns`: any legal move square in a straight or diagonal line with the receiver; the action carries the chosen square |
| 6b | A defender on the squares between intercepts; one next to the run square tackles under the tackle rules | Return lane only; then the reactive-tackle check on the runner |
| 6c | One-two after a move: keep | Unchanged |
| 7 | Connector front square: keep, direction per team | The square ahead in the carrier's own attacking direction |
| 8 | A loose rebound stays on its square | No automatic recovery; collected by moving onto it |
| 9 | Turn timer paused at kickoff | Unchanged |
| 10 | Wide shot: keeper's ball | Unchanged |
| 11 | An "End turn" option | Always available (once the kickoff pass is made) |
| 12 | Shooting zones: keep | Unchanged |
| 13, 23 | Offside as in real football: the keeper counts | Line = second-last opponent, keeper included; receiver must be in the opponent's half and ahead of the ball |
| 14 | Passes unlimited for now | Unchanged |
| 15 | The CPU plays one-twos, more often at higher levels | Master looks every turn and favours them; Baller considers them; Beginner on about one turn in five |
| 16 | Move-then-pass in own half for anyone; Connector anywhere; only Frontliner, Flanker, Sparker may move then shoot | `afterMove` follow-up rules; standing shots allowed for any carrier in the zone |
| 17 | 25-second timer for online and ranked only | `turnTimer` setting: on for online, off for CPU and local |
| 19 | No buildup count | None |
| 20 | Possession limit: 2 turns for ranked and the hardest CPU, 3 for regular online and easier levels | `stallLimit`: Master 2; Beginner, Baller, local and online 3 |
| 21 | Keeper saves only shots within one square | Unchanged |
| 22 | Default 2 × 10 minutes; 5, 10 or 15 against the CPU | `halfMinutes` |
| 24 | Keeper may move anywhere in its 18-yard box | `inPenaltyArea`: columns D–M, 4 rows deep |
| 18, 25, 26 | Fouls, restarts: "strategize a way to add them" | **Stage 1 (restarts) built**, on by default and switchable in setup: clearances over the touchline or goal line, throw-ins (pass up to 4 squares), corners, goal kicks (including wide shots), rebounds going out; no offside from restarts, no tackles while the ball is out, an untaken restart hands the ball over. Stages 2–3 (fouls, free kicks, penalties, cards) wait for David's answers P2–P4 |

## Interpretations still awaiting confirmation

1. **Pass shielding (Q3, unanswered).** The receiver does not count as the shielding teammate.
2. **18-yard box size.** Not in the rules extract; scaled from a real pitch: columns D–M, 4 rows deep at each end.
3. **Possession limit details.** "The ball moved" means it ended the turn on a different square or with a different piece. If the limit is reached and the team ends its turn, or runs out of time, without moving the ball, the ball goes to the nearest opponent. The middle CPU level (Baller) uses 3 turns.
4. **Move then pass in the shooting zone.** Read literally, Q16 lets only the Connector pass after moving outside its own half. So an attacker that moves into the shooting zone may shoot but not pass.
5. **One-two run directions.** Q6a's "moves diagonally either forward, backward, left or right" is read as: any direction within the passer's normal movement, ending in line with the receiver.
6. **Kickoff squares.** "The centre of the board with the halfway line" is read as the existing squares either side of the centre (H13 for Blue, I12 for Red).
7. **Order of the other pass checks.** After offside: adjacent block, then interception within 2, then contested reception.
8. **Wide shots.** The defending keeper gets the ball ("goal kick").

## What testing showed

- **Legality:** all 14 Ref's Eye calls and every lesson solution are checked against the engine. CPU-vs-CPU matches always end legally on the clock and replay exactly.
- **Low scoring:** CPU-vs-CPU matches still end 0–0 or 1–0 after David's changes (6 Nov). In these rules a stationary carrier is hard to dispossess: only specific roles in specific spots win the ball. A carrier that moves into the opponent's half outside the shooting zone can't pass afterwards, so advancing is risky.
- **Holding possession:** a side can keep the ball by not moving the carrier and repositioning other pieces, since the 25-second timer only forfeits a turn. Decide whether this is intended, or whether a possession limit should push play forward. The extract mentions a "possession buildup count" in 4.1 without defining it.
- **CPU strength:** good enough to test the rules, but it needs tuning for a satisfying Master level.

## Differences from real football (teaching goal)

- **Offside:** now aligned with real football (Q23).
- **Keeper:** may roam its 18-yard box (Q24); in real football a keeper may go anywhere but only handles inside that box.
- **Restarts:** throw-ins, goal kicks and corners built (stage 1). **Fouls:** not yet; stages 2–3 of the proposal wait for David's choices.
