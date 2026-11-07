# Battle for the 92

An original conquest game that teaches Indiana fourth graders their own county's history, where knowing it wins you armies.

## How to run

Node `>=22.18` (`package.json` `engines`). `package.json` has no `dev` or `preview` script. From a clean checkout:

```bash
npm ci
npx vite --host 127.0.0.1 --port 5173
```

Open http://127.0.0.1:5173/ . `vite.config.ts` does not set a host or port. This is local hot-seat and versus-computer play. It does not use Redis.

Static production build, then Vite's preview server for `dist/`:

```bash
npm run build
npx vite preview --host 127.0.0.1 --port 4173
```

Open http://127.0.0.1:4173/ . A page response is not a gameplay check.

Box checks:

```bash
npm run box
```

`npm run box` runs `npm run check` (typecheck, focused tests, and `vite build`) and then `npm run gates`.

Hot-seat stays in the static page. Optional online create and join is separate: `src/online/http.ts` defines `GET /api/health/db`, `POST /api/games`, `POST /api/games/:id/join`, and `GET /api/games/:id`. Nothing in `package.json`, `vite.config.ts`, or an `api/` directory mounts those handlers. `vercel.json` rewrites `/g/:id` to `/index.html` and sets headers; it does not serve those API paths. `npx vite` and `npx vite preview` are static only. The online panel starts hidden and is shown only when `GET /api/health/db` is OK. The handler's OK body is `{"ok":true}`. A static page is not that response.

Hosting that API would pass server env into `openConfiguredStore` in `src/online/redis-store.ts`, which reads `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. No env file is checked in. Do not put those values in `VITE_` variables or any browser bundle. Do not provision or deploy from this document. `MemoryStore` (`src/online/memory-store.ts`) is the in-process test store, not a local server.

`CONTRACT.md` and later owner decisions control this demo. The older absolute no-backend baseline remains the default static path above. Optional online code does not replace hot-seat, and these Vite commands do not host it. Factual QA stays deferred, as the next section says.

## Current Indiana demo precedence

`CONTRACT.md` and later explicit owner decisions control this demo. Conflicting instructions below are historical, not current release gates. The quiz bonus is fixed at +2 once per turn. Use the supplied repository CSV; do not generate replacement trivia. Factual QA, both-checker verdicts, ledger merge and random factual audits are deferred, not completed. Legacy content quotas do not block this CSV import. Structural mapping and security checks remain required. Hidden benchmark truth labels remain private; supplied gameplay correct letters and answers ship. No hosted CI or previews. Changes use branches and PRs with non-author exact-head approval, local box checks and main-only production deployment. The UI must say "Questions unverified" and must not claim the demo is fact-checked.

The historical benchmark plan planted fakes and used two independent checkers. That work is deferred, not Done. Do not describe the current demo as fact-checked. The supplied questions and gameplay answers are `inputs/battle-for-the-92-benchmark-1000_nokey.csv`. `bank/questions.csv` is not in this repo.

Built at Indy Init on November 7. This first commit is the plan and question bank; everything that runs was built on the day, and the commit history shows it.

## Start here

| File | Purpose |
|---|---|
| `SPEC.md` | What we're building, why, and what "done" means |
| `AGENTS.md` | Rules every agent follows, whichever tool runs it |
| `CLAUDE.md` | Imports those rules for Claude Code |
| `BOARD.md` | Ticket format and opening backlog |
| `CONTRACT.template.md` | Formats and role boundaries that let agents work in parallel |
| `.claude/agents/` | Designer, dev, content and fact-checker briefs |
| `BARS.md` | The pass/fail numbers |
| `STATES.md` | The seven contest states and all 51 jurisdictions |
| `bank/` | Historical bank note and unpublished key schedule (`bank/README.md`). Not the current importer input |
| `decisions/` | Choices we made, with their tradeoffs |
| `FAILURES.md` | Where the AI needed correcting, and what we changed |
| `SCORECARD.md` | Results by judging category |
| `metrics/` | Time, tokens and interventions per ticket |
| `RUNBOOK.md` | The day's schedule and the demo |

To begin, an agent reads `CONTRACT.md` first, then `SPEC.md`, subject to the current demo precedence above, and takes the next unblocked ticket from `BOARD.md`.

## Box checks

`npm run build:map` writes `data/regions/in/map.json` from Census cartographic boundaries (`us-atlas@3.0.1` `counties-10m.json`) drawn north-up with an Indiana-centered transverse Mercator (`factory/projection.ts`), and rewrites the inline map in `index.html` to match. A region manifest that already lists its regions keeps them, even while marked draft; regions are only drawn from county centroids when the manifest lists none. After a rebuild, refresh the quiz map digest with `node --experimental-strip-types factory/import-quiz.ts --csv inputs/battle-for-the-92-benchmark-1000_nokey.csv --map data/regions/in/map.json --out data/quiz.json`.

`npm run gates -- map` checks that map. A planted self-loop and a planted one-way border fail, then the real map passes.

`npm run check` typechecks, runs the focused tests, and builds.

The geometry source URL is `geometrySource` in `regions/in/region.json`.
