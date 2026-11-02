# SYNOCHÍ™ — The World's Game On Board

**By David André.** A deterministic football strategy board game: 22 pieces on a 16 × 24 pitch, three actions per turn, no dice. This repository holds the digital game (web now, iOS and Android next) and the match server.

## Quick start

```bash
npm install
npm test            # rules engine + server tests
npm run dev         # web app at http://localhost:5173 (start `npm run server` too for online play)
npm run build       # production build into dist/
npm run server      # serves dist/ and the match API on http://localhost:8787
npm run build:demo  # single-file web demo: dist-single/synochi-web-demo.html
```

## What's in the game

| Area | Status in v0.1 |
|---|---|
| Rules engine (move, dribble, ground and lofted passes, shots, keeper saves, supported tackles, one-twos, halves, kickoffs) | Done. Deterministic, fully tested |
| CPU opponent: Rookie, Pro, Legend | Done. Beam search over whole turns |
| Play vs CPU, local two-player | Done |
| Online invite-code matches, server-authoritative | Done (in-memory server) |
| Match verification by replaying the action log (`POST /api/verify`) | Done |
| 7 lessons and 3 practice drills | Done |
| 5 formations: 4-3-3, 4-4-2, 3-5-2, 4-2-3-1, 5-3-2 | Done |
| Locker: board themes and kits bought with earned Tactic Tokens, cosmetic only | Done (stored in the browser) |
| Rules page generated from the engine's config | Done |
| Accounts, server-side currency ledger, seasons, store billing, native apps, matchmaking | Not yet. See [docs/LAUNCH_PLAN.md](docs/LAUNCH_PLAN.md) |

## Architecture

```
src/engine/      Pure TypeScript rules library shared by the client and the server
  config.ts      ALL rule numbers and role stats (the one file to edit for the official rules)
  rules.ts       Actions, validation, resolution, replay
  cpu.ts         CPU opponent (evaluation + beam search)
  formations.ts  Formation layouts
  scenarios.ts   Lessons and drills
src/ui/          React web app (board renderer, match screen, menus)
server/          Express match server (online play, result verification)
tests/           Vitest suites for the engine and the server
```

The engine has no randomness and treats state as immutable. The same setup plus the same action list always gives the same match. That is what lets the server validate online moves and verify rewards before granting them.

## Important: provisional rules

This build was written without access to the original SYNOCHÍ Replit project or the official rulebook. The rules here are a complete, playable placeholder set. When the official Rules tab is available:

1. Update the numbers in `src/engine/config.ts`.
2. Change any rule that works differently in `src/engine/rules.ts`. Each action is resolved in one clearly named function.
3. Run `npm test` and update the tests that encode the old behaviour.

If the original Replit code is the better base, the engine here can be compared against it rule by rule, or dropped in as the server-side validator.
