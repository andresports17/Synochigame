# SYNOCHÍ launch plan (working draft)

This plan merges the commercial launch memo, the developer proposal (Atharv Chauhan, revised, $3,500 fixed / $3,950 accelerated) and this codebase into one plan.

## 1. Prices: one sheet

The memo listed the Founder's Edition at both $9.99 and $4.99. **Pick one before any store listing.** Recommended:

| Product | Price | Notes |
|---|---|---|
| Digital game | Free | Tutorial, practice and CPU play included |
| Premium Starter Pack | $4.99 | Cosmetics and a Tactic Token bundle |
| Founder's Edition | $9.99 | Limited-time early supporter pack (decide: $9.99 or $4.99) |
| Season Pass | $4.99–$7.99 | Cosmetic reward track only |
| Physical Standard Edition | $39.99 | Preorder interest only until quotes arrive |
| Physical Collector's Edition | $69.99 | Preorder interest only until quotes arrive |

These are test prices, not validated with market data. Nothing sold may affect gameplay (no pay-to-win).

## 2. Marketing claims vs. what exists

The concept art advertises features. Store reviewers reject listings whose screenshots show features the app lacks.

| Claimed in the concept art | Status |
|---|---|
| Tutorial / lessons | 7 lessons built (art says 24) |
| Practice drills | 3 built (art says 13) |
| 3 CPU levels | Built |
| Formations, custom formation | 5 presets built; custom editor not built |
| Online multiplayer | Invite-code play built; open matchmaking not built |
| Ranked seasons, leaderboards, clubs | Not built |
| Board themes, kits | Built (cosmetic) |
| Custom crests, goal celebrations | Not built |
| Cross-platform | Web works; native apps not built |
| "Realistic 3D gameplay" | The game is 2D top-down. Remove this claim or commission 3D work |
| Blockchain collectibles | Recommend dropping (store NFT rules, legal cost, no gameplay value) |

The concept image also has AI-generation errors: repeated or out-of-order row numbers on the board, and "6" in place of "G". Commission final artwork before it appears on packaging or a store listing.

## 3. Physical edition: components for the manufacturing quote

Derived from the game's formations. **A set needs 15 figures per side to play every formation, 30 in total, not the 22 shown in the art.**

| Per side | GK | CB | FB | DM | MF | AM | WG | FW | Total |
|---|---|---|---|---|---|---|---|---|---|
| Figures | 1 | 3 | 2 | 2 | 2 | 1 | 2 | 2 | 15 |

That means 8 distinct sculpts (one per role) in 2 team colours, plus:

- Folding board, 16 × 24 grid (columns A–P, rows 1–24) with marked goal mouths (G–J) and penalty areas
- 1 ball token
- Rulebook, 5 formation cards and a quick-reference role stat card
- Action tracker (3 pips per turn) and turn or score tracker
- Box and insert; collector's edition: drawstring bag and coins as in the concept art

Send this list to LongPack (RFQ already sent) as an addendum, and use it for the Panda quote request, which has not been submitted yet. Panda's minimum order is 1,500 units.

## 4. Roadmap to store launch

This codebase already covers the proposal's "keep" layer: engine, CPU, tutorial, drills, formations, server-side move validation and log replay. Remaining work, mapped to the proposal's phases:

| Phase | Work | Status |
|---|---|---|
| 0. Audit | Compare this engine with the original Replit build and the official rules; settle the 11 rule differences | Needs the Replit export and the Rules, CPU and Open Decisions tabs |
| 1. Foundation | Accounts; Postgres currency ledger (Tactic Tokens, Gold Boots, Mission Medals) with rewards granted only after `/api/verify`; season config; managed hosting with backups and monitoring | Not started |
| 2. Mobile apps | Capacitor wrappers for iOS and Android, push notifications, haptics, invite deep links | Not started; the web app is ready to wrap |
| 3. Store billing | Apple and Google in-app purchases with server receipt validation; Stripe for the web | Not started |
| 4. Online play | Persist matches (currently in memory), reconnects; optional matchmaking queue | Invite-code play built |
| 5. QA and beta | Device testing, TestFlight and Play internal testing, store submission | Not started |

Outside the build: final artwork, Apple ($99 a year) and Google ($25 once) developer accounts, privacy policy and terms (legal review), trademark clearance for "SYNOCHÍ", and support processes (refunds, inbox).

## 5. Decisions needed from David André

1. The official rules: share the Rules tab, or approve this rule set as the base.
2. Founder's Edition price: $9.99 or $4.99.
3. Launch on iOS, Android or both? Is open matchmaking needed at launch?
4. Keep or drop the blockchain collectibles and "3D gameplay" claims.
5. Who supplies the final artwork and owns the developer accounts?
6. Target launch date.
