# SYNOCHÍ™ — The World's Game On Board

*The most innovative soccer/football/futbol game ever created.*

**By David André.** A turn-based soccer-chess game: 22 role-based pieces on a 24 × 16 grid, one piece a turn, two five-minute halves, nothing random. This repository holds the digital game (web now, iOS and Android next) and the match server.

## Quick start

```bash
npm install
npm test            # official-rules engine + server tests
npm run dev         # web app at http://localhost:5173 (start `npm run server` too for online play)
npm run build       # production build into dist/
npm run server      # serves dist/ and the match API on http://localhost:8787
npm run build:demo  # single-file web demo: dist-single/synochi-web-demo.html
```

## What's in the game

The rules are **David André's official SYNOCHÍ rules** (extraction draft, 3 November 2026). See [docs/OFFICIAL_RULES_IMPLEMENTATION.md](docs/OFFICIAL_RULES_IMPLEMENTATION.md) for how each section is implemented and the points awaiting confirmation.

| Area | Status |
|---|---|
| Rules engine: ray movement per role, one piece per turn with follow-ups, straight/diagonal passing with interception and contested reception, offside, one-twos, reactive and active tackles, shooting zones, saves and rebounds, kickoff, real-time clock | Done; tested section by section |
| CPU: Beginner, Baller, Master | Done (needs balance tuning) |
| Play vs CPU (official real-time clock or relaxed), local two-player, online invite codes with a server-side clock | Done |
| Result verification by replaying the action log (`POST /api/verify`) | Done |
| 9 lessons (one rule each) and the Ref's Eye quiz (14 calls) | Done |
| Live match statistics, half-time formation changes | Done |
| 5 preset formations with a rule-2.1 validator | Done; custom formation editor not built |
| Server accounts and currency ledger: guest accounts; Tactic Tokens, Gold Boots and Mission Medals kept on the server; rewards paid only after the server replays and verifies the match (including every CPU move and the clock), lesson or quiz; cosmetics bought at server prices | Done (JSON file store; move to Postgres for launch) |
| Locker: board themes and kits (cosmetic) | Done |
| Sign-in (beyond guest accounts), seasons and missions, store billing, native apps | Not yet; see [docs/LAUNCH_PLAN.md](docs/LAUNCH_PLAN.md) |

## Architecture

```
src/engine/       Pure TypeScript rules library shared by the client and the server
  board.ts        Board geometry, zones, shooting zones (rule 1, 8.1)
  roles.ts        Role names, movement ranges, one-two partners (rules 2, 3, 5.4)
  formations.ts   Presets and formation validation (rule 2)
  rules.ts        Turns, passing, offside, tackling, shooting, kickoff, clock (rules 4–9)
  cpu.ts          CPU opponent (rule 10)
  scenarios.ts    Lessons
  quiz.ts         Ref's Eye questions
src/ui/           React web app
server/           Express server: online play with a server-side clock, accounts and currency ledger (ledger.ts), result verification (verify.ts), reward and shop routes (accounts.ts)
tests/            Vitest suites
docs/             Rules implementation notes, launch plan
```

The engine is deterministic and treats state as immutable. The same setup and action log, clock ticks included, always produce the same match.

## Rule changes

Every rule lives in one clearly named function in `src/engine/rules.ts`, with movement ranges in `roles.ts` and zones in `board.ts`. To change a rule, edit it there and update the matching block in `tests/official.test.ts`. Points still awaiting David's confirmation are listed in the implementation notes.

## Licence

Copyright © 2026 David Andre LLC. All rights reserved. Proprietary and confidential; see [LICENSE](LICENSE).
