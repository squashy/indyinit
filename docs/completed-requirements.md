# Completed requirements

This record maps engine, rules, page-shell, setup-map, and contract behavior on the current parent to the merged pull requests that introduced it. Commands below were run on 2026-11-07 in this worktree, Node v22.23.4. The parent commit is [`8062288d6ee9e06eba7f6aa520208faa37926479`](https://github.com/squashy/indyinit/commit/8062288d6ee9e06eba7f6aa520208faa37926479). The only source edits beside this file are `tests/shell-setup.test.ts` and the `test` script entry that runs it.

Status words mean:

| Word | Meaning |
|---|---|
| Verified | A command in this run exited 0 and exercised that behavior |
| Source-checked | A file on this parent was read or matched by a test; a browser did not show it |
| Unverified | Present in the tree, or previously reported, and not exercised in this run |
| Deferred | The contract leaves it for later, and this run did not do it |
| Open | The contract still leaves the decision unresolved |
| Incomplete | The module or path is absent, or the behavior stops short of the requirement |

## Commands

| Command | Exit | Result |
|---|---|---|
| `npm run typecheck` | 0 | `tsc --noEmit` produced no errors |
| `npm test` | 0 | 59 passed, 0 failed, 0 skipped |
| `npm run build` | 0 | Vite wrote `dist/index.html`, `dist/assets/index-CbptL3bh.css`, `dist/assets/index-0Jh3srEp.js` |
| `npm run gates -- map` | 0 | Planted self-loop and one-way border failed; Indiana map passed: 92 counties, 8 regions, 53196 bytes |
| `npm run gates -- rules` | 0 | `rules: PASS`, `mutants: PASS`, 17 rule cases passed, 7 planted rule breaks caught |
| `npm run gates -- rules-engine` | 0 | 14 passed, 0 failed |
| `npm run gates -- quiz` | 0 | 15 passed, 0 failed. Printed `quiz structure: PASS`, `coverage: 1000 questions, 92 counties, 8 to 13 each`, `minima: not applied`, `historical fact check: not-run`, `ledger: not-implemented`, `security: PASS` |

`npm run check` was not invoked as one script. It is typecheck, then `npm test`, then build. Those three commands each exited 0.

File check on this parent:

```
present src/engine/engine.ts src/quiz/quiz.ts factory/import-quiz.ts factory/parse-quiz-csv.ts
present data/regions/in/map.json data/quiz.json index.html src/main.ts
present src/styles.css src/styles/theme.css public/assets/mark.svg
present src/ui/setup.ts src/ui/map.ts src/panzoom.ts src/ui/turn.ts src/ui/quiz-dialog.ts src/ui/battle.ts
present CONTRACT.md
absent public/data/quiz.json
absent src/ai/ai.ts
```

The built document has one local module script, `src="/assets/index-0Jh3srEp.js"`. That built script contains the text `Questions unverified`. No browser loaded the page.

## Engine and rules

Original work:

- Independent rule tests: [pull request 1](https://github.com/squashy/indyinit/pull/1), merge [`4836f64ef76ad73de599a4c2551d22f98056441e`](https://github.com/squashy/indyinit/commit/4836f64ef76ad73de599a4c2551d22f98056441e)
- Rules engine, quiz selector, and quiz importer: [pull request 2](https://github.com/squashy/indyinit/pull/2), merge [`0df72ecbbb6db03f387301132e8248c02bd8577a`](https://github.com/squashy/indyinit/commit/0df72ecbbb6db03f387301132e8248c02bd8577a)
- Integration of that engine, those tests, the Indiana map, and the imported quiz pack: [pull request 4](https://github.com/squashy/indyinit/pull/4), merge [`a00ee4dad06bb642172e4bf75fbfcce0f3bd7423`](https://github.com/squashy/indyinit/commit/a00ee4dad06bb642172e4bf75fbfcce0f3bd7423)

A later engine change is already on this parent: rejected turns and unsupported saves roll the random cursor back, [pull request 5](https://github.com/squashy/indyinit/pull/5), merge [`2043fb0400ca52d38acb4e756e12ddca968ec3c8`](https://github.com/squashy/indyinit/commit/2043fb0400ca52d38acb4e756e12ddca968ec3c8). The same `npm test` and rules gates cover it.

| Requirement | Status | Evidence on this parent |
|---|---|---|
| Seeded deal gives every county once, with the recorded two-player pools (60 and 75) and an even three-player total | Verified | `tests/rules.test.ts` and `npm run gates -- rules` |
| Same seed and actions replay, including the cursor | Verified | rules tests and the rules gate |
| Correct answer adds 2 once; a second or stale answer adds 0 | Verified | rules tests, rules gate, and the seven mutant catches |
| Wrong answer, skip, and a county with no question add 0 | Verified | rules tests and the rules gate |
| Illegal action returns the same state and does not advance the random cursor | Verified | rules tests and the rules gate |
| Save and load keep a pending quiz and an occupation; an unsupported generator fails and leaves the live session | Verified | `tests/rules.test.ts` |
| A rejected combat roll or shuffle keeps the cursor with the unchanged position | Verified | `tests/rules.test.ts` |
| Ties cost the attacker; a capture moves armies in; quick win waits until the turn ends; fortify follows an owned path | Verified | rules tests and the rules gate |
| Quiz selector stays on the selected county, shuffles choices, and keeps the correct letter | Verified | `tests/quiz.test.ts` |
| Importer binds the supplied CSV to the current map digest | Verified | `factory/import-quiz.test.ts` inside `npm test` and the quiz gate |
| Map adjacency is symmetric and connected; a planted self-loop and a planted one-way border fail | Verified | `npm run gates -- map` |

Region income follows an explicit bonus on a fully held region and is 0 otherwise. That behavior is verified by the rules tests. Adopting region names, membership, and bonus numbers is still open in `CONTRACT.md`. The map gate counted 8 regions; this run does not adopt those labels or bonuses.

## Page shell and module entry

Page shell: [pull request 6](https://github.com/squashy/indyinit/pull/6), merge [`9ebcce8f489d4d0958ed9bbd8acb58fa286afda8`](https://github.com/squashy/indyinit/commit/9ebcce8f489d4d0958ed9bbd8acb58fa286afda8). That pull request's page had no module script. The script and `src/main.ts` arrived in [pull request 12](https://github.com/squashy/indyinit/pull/12), merge [`8062288d6ee9e06eba7f6aa520208faa37926479`](https://github.com/squashy/indyinit/commit/8062288d6ee9e06eba7f6aa520208faa37926479), which is this parent.

| Requirement | Status | Evidence |
|---|---|---|
| Contract ids are in `index.html` (`app`, `setup`, `player-list`, `mode`, `start-game`, `continue-game`, `map`, `county-info`, `regions`, `player-stats`, `phase`, `reinforcement-count`, `trip-log`, `quiz-dialog`, `quiz-county`, `quiz-question`, `quiz-choices`, `quiz-result`, `skip-quiz`, `battle-dialog`, `occupy-dialog`, `end-attacks`, `end-turn`, `handoff-dialog`, `winner-dialog`, `error-status`) | Verified | `tests/shell-setup.test.ts` |
| 92 county groups, labels, and army badges; six pattern defs `cue-0` through `cue-5` | Verified | same test, by reading `index.html` |
| Trip log is `role="log"` and `aria-live="polite"`; the five dialogs set `aria-modal="false"` | Verified | same test |
| How-to-play text says a right answer adds exactly 2 armies, one time, and that players do not pick counties | Source-checked | same test matches those sentences in `index.html` |
| Stylesheet is the local file `/src/styles.css`; the document has no external script URL | Source-checked | same test |
| Module entry exists: `index.html` loads `/src/main.ts`, and that file loads `data/regions/in/map.json` and `data/quiz.json`, then calls `readGamePacks`, `bindMap`, `attachPanZoom`, `bindSetup`, and `dispatch` | Source-checked | same test, plus the production build's local script |
| The quiz module assigns `Questions unverified` | Source-checked | `tests/shell-setup.test.ts` reads `src/ui/quiz-dialog.ts`; the built script contains the same sentence |
| Phone, Chromebook, and desktop layout; 44px targets; focus ring; reduced motion; a turn played in a browser | Unverified | No browser was opened in this run |

`DESIGN.md` still says the shell has no script tag. On this parent, `index.html` includes `<script type="module" src="/src/main.ts"></script>`. The entry is present. A played turn was not observed here, so this record does not call the page a completed playable session.

## Setup and map

Setup, county rendering, and pan/zoom: [pull request 7](https://github.com/squashy/indyinit/pull/7), merge [`e014f9d48c32ede212a27b900d949599ad86182d`](https://github.com/squashy/indyinit/commit/e014f9d48c32ede212a27b900d949599ad86182d).

| Requirement | Status | Evidence |
|---|---|---|
| `readGamePacks` accepts `data/regions/in/map.json` with `data/quiz.json` and returns 92 matching county ids | Verified | `tests/shell-setup.test.ts` |
| A quiz pack whose `mapDigest` is not the map digest is rejected | Verified | same test |
| A throwing `localStorage` getter does not resume a session and does not throw on save | Verified | same test, with a stand-in document |
| A store whose `getItem` or `setItem` throws does not replace the session | Verified | same test |
| Start deals counties from the real form controls in `index.html` | Unverified | The new tests do not construct `HTMLInputElement` nodes or click Start |
| The map paints `data-owner` and army counts from a live game | Unverified | `src/ui/map.ts` is on the parent; this run did not call `bindMap` |
| Wheel, drag, and button pan/zoom | Unverified | `src/panzoom.ts` is on the parent; this run did not attach it to a document |

The engine deal of all 92 counties is verified in the rules tests. That is the engine result. It is separate from the Start button.

## Contract

`CONTRACT.md` is on this parent. Its current demo text was reconciled in [pull request 15](https://github.com/squashy/indyinit/pull/15), merge [`2bc9035f6439a4b0cd006cdd37c42d8a11b881c5`](https://github.com/squashy/indyinit/commit/2bc9035f6439a4b0cd006cdd37c42d8a11b881c5). This change does not edit the contract.

| Item | Status |
|---|---|
| Fixed quiz award of +2 once, and 0 for a wrong answer, a skip, or no question | Verified by the rules tests above |
| Supplied gameplay letters and answers ship with the pack | Source-checked by the importer and quiz-structure gate. Historical truth was not checked |
| `Questions unverified` is required on the quiz surface | Source-checked in `src/ui/quiz-dialog.ts` and in the built script. Display in a browser is unverified |
| Approved pack path `public/data/quiz.json` | Open. That path is absent. The tracked pack and the module entry use `data/quiz.json`. This run does not choose a new path |
| Region names, membership, and bonuses | Open |
| Ledger, verdict merge, and both-checker factual QA | Deferred. The quiz gate printed `ledger: not-implemented` and `historical fact check: not-run` |
| Per-county question, category, and seat minima | Reported only. The quiz gate printed `minima: not applied` |
| Computer seat that plays a turn | Incomplete. The engine accepts `kind: "computer"`. `src/ai/ai.ts` is absent, and `src/main.ts` does not choose computer actions |
| Simulation harness | Incomplete. No simulation runner is in `scripts/` |
| Hosted CI, preview, deploy, and public header smoke | Unverified. Those commands were not run |

## Supplied quiz

The supplied questions remain unverified. This run did not grade historical truth, did not read a hidden answer key, and did not treat the structural quiz gate as a fact check. The gate's own line is `historical fact check: not-run`. An existing test still pins three gameplay letters and answer strings (questions 45, 289, and 356). That pin passing is a pack-content check, not a fact check of the whole pack.

## This change

`tests/shell-setup.test.ts` covers the page-shell ids, the local module entry, the unverified-notice assignment, the setup pack reader, and the blocked-storage paths. Those setup storage paths had no committed test on the parent. `package.json` only adds that file to the existing `test` script. Gameplay, gates, the release checker, build config, and deploy config are unchanged.
