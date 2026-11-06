# SYNOCHÍ launch plan (working draft, revised after the Development Brief)

SYNOCHÍ is David André's project. Sources: the commercial launch memo; the Development Brief (11 Oct 2026, by King Dave), which documents the Replit prototype as of 23 June 2026; and this repository. No development partner is under contract.

## Decisions made (David André, 6 November 2026)

From the [Rules & Launch Questionnaire](https://claude.ai/artifact/JAcgHucbiMAVP42QiVFUoL), Part B. These override anything below that disagrees.

| Q | Topic | Decision |
|---|---|---|
| 27 | Code base | **This repository (the new build)** goes to launch |
| 28 | Pricing | The game is **free to download**; Founder's Edition **$4.99** |
| 29 | Token packs | Add a **150-token pack at $9.99**; the 135-token pack becomes **$7.99** (it was $9.99). The premium season pass stays at 150 tokens |
| 30 | Marketing claims | **Drop** "realistic 3D gameplay" and "blockchain collectibles" for now |
| 31 | Physical figures | **Option C:** 11 identical figures per side with swappable role bases in the standard edition; role-specific figures in the collector's edition |
| 32 | Physical turn timing | **Include a sand timer** in the box |
| 33 | Platforms | **iOS and Android first**, web as well where possible |
| 34 | Matchmaking | **Invite codes only** at launch |
| 35 | Store accounts | Not set up yet; will be (owner to confirm, presumably David Andre LLC) |
| 36 | Artwork | **Hire an illustrator** |
| 37 | Legal | **Commission** a trademark search (SYNOCHÍ, Sinohi) and a lawyer's review of the licence, terms and privacy policy |
| 38 | Dates | **Launch before 24 June 2027** (the Women's World Cup). Restart at Season 1 at launch if possible, otherwise Season 2 |

## 1. What the brief changes

**The Replit prototype is the product.** According to the brief it already has the full rules, a three-level CPU, online play, a 24-lesson tutorial, 13 drills, a formation editor, ranked tiers, missions, a season pass, four currencies, Stripe token packs, clubs, leaderboards, accounts and accessibility options.

This repository now implements the official rules from the Replit build (section 3) as a tested, deterministic engine with lessons, a rules quiz, CPU levels, online play with a server-side clock, and replay verification. The Replit prototype still has far more features (accounts, missions, season pass, shop, clubs, 24 lessons). **Decided (Q27):** this repository goes to launch; the prototype's features (accounts, missions, season pass, shop, clubs, more lessons) are to be rebuilt here.

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

## 3. Rules

**Resolved:** this repository now implements David André's official rules (extraction draft, 3 Nov 2026). See [OFFICIAL_RULES_IMPLEMENTATION.md](OFFICIAL_RULES_IMPLEMENTATION.md) for the rule-by-rule mapping, the 11 interpretations awaiting confirmation, and the balance findings. Role names, CPU levels and match rewards match the Development Brief.

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
| Rules | Official rules implemented and tested here; 11 interpretations to confirm ([notes](OFFICIAL_RULES_IMPLEMENTATION.md)); optional Laws variant in [LAWS_MODE.md](LAWS_MODE.md) | David to confirm |
| 1. Foundation | Move Tactic Tokens, Gold Boots and Mission Medals to a server ledger (they're editable on the device today); season config and Season 2 setup; move hosting off Replit; grant rewards for online matches after server validation | This repo's `/api/verify` replay (clock included) is a working example |
| 2. Mobile apps | Capacitor iOS and Android builds, push notifications, haptics, deep links | |
| 3. Store billing | In-app purchases with receipt validation; fix the 150 vs 135 token gap first | |
| 4. Online play | Rewards for online matches; optional matchmaking queue using the existing hidden rating | |
| 5. QA and beta | Device testing, TestFlight and Play internal testing, store submission | |

Outside the build: final piece art and store screenshots; Apple ($99 a year) and Google ($25 once) developer accounts; legal review of the privacy policy and terms, which exist; trademark clearance for SYNOCHÍ and Sinohi; and support processes.

## 7. Still open

1. Who owns the App Store and Google Play developer accounts (Q35), and when they are opened.
2. Final prices for the other token packs (Starter 50 / $4.99, Elite 360 / $19.99, Ultimate 1,050 / $49.99), now that the 135 and 150 packs change.
3. David's approval of the restarts and fouls proposal (Q18, Q25, Q26).
4. The few rule interpretations still open in [OFFICIAL_RULES_IMPLEMENTATION.md](OFFICIAL_RULES_IMPLEMENTATION.md).
5. Which Replit features to rebuild first (accounts and the server currency ledger are the prerequisite for the shop and season pass).
