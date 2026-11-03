# SYNOCHÍ launch plan (working draft, revised after the Development Brief)

SYNOCHÍ is David André's project. Sources: the commercial launch memo; the Development Brief (11 Oct 2026, by King Dave), which documents the Replit prototype as of 23 June 2026; and this repository. No development partner is under contract.

## 1. What the brief changes

**The Replit prototype is the product.** According to the brief it already has the full rules, a three-level CPU, online play, a 24-lesson tutorial, 13 drills, a formation editor, ranked tiers, missions, a season pass, four currencies, Stripe token packs, clubs, leaderboards, accounts and accessibility options.

This repository (v0.1) is a separate, smaller rebuild written before the brief was available. Its rules are provisional and differ from the prototype (section 3). **Recommendation:** once the rules are settled, decide which code base goes to launch: the Replit prototype (far more features) or this repo (Laws Mode, tested engine, replay verification). Whichever is chosen, the other serves as a reference to check it against. Laws Mode is specified in [LAWS_MODE.md](LAWS_MODE.md) so it can be carried into either.

## 2. Concept art vs. the prototype (corrected)

| Claimed in the concept art | In the prototype (per the brief) |
|---|---|
| 24-lesson tutorial, 13 practice drills | Yes |
| 3 CPU levels | Yes: Beginner, Baller, Master |
| Online multiplayer, ranked seasons | Invite-code casual and ranked; no stranger matchmaking; Season 1 ended 31 Aug 2026, so seasonal progress is frozen now |
| Clubs and leaderboards, custom crests, board themes, goal celebrations | Yes |
| Formations including custom | Yes, including halftime changes |
| Cross-platform, App Store and Google Play badges | **No.** Web app only; no native builds yet |
| "Realistic 3D gameplay" | **No.** Pieces are coloured tokens with role letters. Remove the claim or commission 3D art |
| Optional blockchain collectibles | **Not in the prototype.** Recommend dropping it from all marketing |
| Footballer figures and player art | Final piece artwork is listed as still needed |

The image's board also has generation errors (repeated row numbers, "6" for "G"). It shows a 24-row by 16-column board, which matches the brief's 24 × 16 grid.

## 3. Known rule differences: prototype vs. this v0.1

The brief gives the outline; the exact rules are on the Rules tab, which hasn't been shared.

| Rule | Prototype (brief) | This v0.1 |
|---|---|---|
| Turn | One action per turn: a move, pass, shot or one-two | 3 actions per turn |
| Clock | Two 5-minute real-time halves, 25 seconds per turn | Fixed number of turns per half |
| Role movement | "Every role moves differently" | Same king-step pattern, different ranges |
| Offside | Yes | Not implemented |
| Rebounds | Yes | Not implemented |
| Losing the ball | Tackles, blocked passes, **crowded receivers**, offside | Tackles, interceptions, contested lofted passes, blocks, saves |
| Formations | Any mix of roles plus a keeper, custom editor, halftime changes | 5 presets only |

The prototype itself also differs from the creator's written rules in 11 places (Open Decisions tab). Those decisions come first.

Already aligned in v0.1: role names (Box Keeper, Central Pillar, Defensive Flanker, Anchor, Connector, Sparker, Flanker, Frontliner), CPU level names, and match rewards (40 Tactic Tokens for finishing, +80 for a win or +30 for a draw, one Gold Boot per goal).

## 4. Prices: what's actually configured vs. the memo

The prototype sells **Takeover Tokens** through Stripe:

| Pack | Tokens | Price |
|---|---|---|
| Starter | 50 | $4.99 |
| Pro | 135 (120 + 15 bonus) | $9.99 |
| Elite | 360 (300 + 60 bonus) | $19.99 |
| Ultimate | 1,050 (800 + 250 bonus) | $49.99 |

Issues to settle:

1. **The memo's prices don't match the build.** The memo lists a $4.99 Premium Starter Pack, a Founder's Edition at both $9.99 and $4.99, and a Season Pass at $4.99–$7.99. The build has token packs only, with no Founder's Edition product.
2. **The premium season pass costs 150 Takeover Tokens, but no pack gives 150.** The Pro pack gives 135, so a player must spend $14.98 on two packs or $19.99 on Elite. That is far above the memo's $4.99–$7.99, and players may read it as a deliberate shortfall. Either price the pass at 135 tokens or sell it as a direct $7.99 product.
3. **App stores:** token packs and the season pass are digital goods. In the iOS and Android apps they must use Apple and Google billing (Stripe stays for web), and prices move to the store price tiers.

Physical editions stay as in the memo ($39.99 and $69.99), in preorder-interest mode until quotes arrive.

## 5. Physical edition: components for the manufacturing quote

The 5 preset formations need **15 figures per side (30 in total)**, not 22:

| Per side | Box Keeper | Central Pillar | Def. Flanker | Anchor | Connector | Sparker | Flanker | Frontliner | Total |
|---|---|---|---|---|---|---|---|---|---|
| Figures | 1 | 3 | 2 | 2 | 2 | 1 | 2 | 2 | 15 |

The prototype also allows **custom formations with any mix of roles**. A physical set can't hold every possible mix with role-specific sculpts. Options to put to LongPack and Panda:

- **A.** 15 role-specific figures per side (8 sculpts × 2 colours), supporting the presets only.
- **B.** 11 generic footballer figures per side with interchangeable role bases or clip-on role discs. One sculpt keeps tooling cheaper, and any formation works. Recommended.
- **C.** B for the standard edition, A as painted figures for the collector's edition.

Also include: a folding 24 × 16 board, ball token, rulebook, formation cards, a role reference card, and a turn and score tracker. A physical game can't use the 25-second clock, so the board-game rules need a timer-free variant or a sand timer.

The LongPack quote request is already sent; send this as an addendum. The Panda quote request has not been submitted yet. Panda's minimum order is 1,500 units.

## 6. Launch roadmap

| Phase | Work | Notes |
|---|---|---|
| 0. Audit | Run the prototype's 22 test suites; settle the 11 open rule decisions; turn the CPU's late-game logic back on | Needs the Replit export |
| Rules | Laws Mode stage 1 (offside, ball out of play, throw-ins, goal kicks, corners, keeper handling) is built and tested here; stages 2–3 in [LAWS_MODE.md](LAWS_MODE.md) | David to approve each stage |
| 1. Foundation | Move Tactic Tokens, Gold Boots and Mission Medals to a server ledger (they're editable on the device today); season config and Season 2 setup; move hosting off Replit; grant rewards for online matches after server validation | v0.1's `/api/verify` replay approach is a working example |
| 2. Mobile apps | Capacitor iOS and Android builds, push notifications, haptics, deep links | |
| 3. Store billing | In-app purchases with receipt validation; fix the 150 vs 135 token gap first | |
| 4. Online play | Rewards for online matches; optional matchmaking queue using the existing hidden rating | |
| 5. QA and beta | Device testing, TestFlight and Play internal testing, store submission | |

Outside the build: final piece art and store screenshots; Apple ($99 a year) and Google ($25 once) developer accounts; legal review of the privacy policy and terms, which exist; trademark clearance for SYNOCHÍ and Sinohi; and support processes.

## 7. Decisions needed

1. Share the Replit export and the Rules, CPU and Open Decisions tabs, so Laws Mode can be checked against David's written rules.
2. Settle the 11 open rule decisions.
3. Season pass price: fix the 150-token vs. 135-token gap.
4. Drop or keep the Founder's Edition (not in the build) and the blockchain and 3D claims.
5. Physical figures: option A, B or C above.
6. Launch on iOS, Android or both; is matchmaking needed at launch; target date.
