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

## Interpretations awaiting David's confirmation

The extract flags these points or leaves them open. Each choice is marked `INTERPRETATION` in the code where it applies:

1. **Row numbering.** Row 1 is the top of the board (Red's goal line); Blue attacks up.
2. **Kickoff squares.** Not given in the extract. The build uses H13 (Blue) and I12 (Red).
3. **Pass shielding.** "A teammate farther down the ray" is taken to exclude the receiver. Otherwise every opponent 2 squares away would be shielded, and the 2-square interception rule would never apply.
4. **Offside line.** "The most advanced non-keeper opponent" is read as the *deepest* outfield defender, the one nearest its own goal.
5. **Order of pass checks.** Adjacent block, then lane interception, then offside, then contested reception.
6. **One-two run square.** Of the legal squares on the receiver's row, the one nearest the passer's column. The return pass is cut out by a defender on the lane or adjacent to the run square. One-twos are allowed wherever a pass is allowed, including after a move.
7. **Connector front tackle.** The square directly ahead of the carrier in its attacking direction, the same for both teams. The extract says the original code is asymmetric.
8. **Loose rebounds.** The nearest piece recovers the ball at once, with ties going to the defending side.
9. **Kickoff timing.** The 25-second turn timer does not run while a kickoff is pending, so a kickoff can't be forfeited.
10. **Wide shots.** Wide or off-target shots give the ball to the defending keeper ("goal kick / keeper possession").
11. **Passing the turn.** Players may end a turn without acting, the same as letting the timer run out.

## What testing showed

- **Legality:** all 14 Ref's Eye calls and every lesson solution are checked against the engine. CPU-vs-CPU matches always end legally on the clock and replay exactly.
- **Low scoring:** CPU-vs-CPU matches end 0–0 or 1–0. In these rules a stationary carrier is hard to dispossess: only specific roles in specific spots win the ball. A carrier that moves into the opponent's half outside the shooting zone can't pass afterwards, so advancing is risky.
- **Holding possession:** a side can keep the ball by not moving the carrier and repositioning other pieces, since the 25-second timer only forfeits a turn. Decide whether this is intended, or whether a possession limit should push play forward. The extract mentions a "possession buildup count" in 4.1 without defining it.
- **CPU strength:** good enough to test the rules, but it needs tuning for a satisfying Master level.

## Differences from real football (relevant to the teaching goal)

These are SYNOCHÍ design choices, not bugs. They matter if the game is presented as teaching football's real rules:

- **Offside:** SYNOCHÍ ignores the keeper. In real football the keeper usually counts as one of the last two defenders.
- **Keeper movement:** the keeper is confined to the six-yard box. A real keeper can go anywhere and only handles in the penalty area.
- **No restarts:** there are no throw-ins, corners or goal kicks as restarts, and no fouls, free kicks, penalties or cards.

The Ref's Eye quiz points out the offside difference. The v0.1 Laws Mode work (in git history) could become an optional "Laws of the Game" variant if David wants it.
