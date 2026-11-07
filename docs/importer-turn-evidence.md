# Importer, map, coverage, and turn evidence

Checked on `fead794ce33fec26e2b2543a60ccd233549fe8e0`. Node v22.23.4. This file records commands and one local browser session. It is not an approval, and it does not say the release is finished.

## Commands on this commit

| Command | Exit | Result |
|---|---|---|
| `npm test` | 0 | 67 passed, 0 failed |
| `npm run gates -- map` | 0 | Planted self-loop and one-way edge failed. Indiana map passed: 92 counties, 8 regions, 55151 bytes |
| `npm run gates -- quiz` | 0 | 15 passed. `quiz structure: PASS`. `coverage: 1000 questions, 92 counties, 8 to 13 each`. `minima: not applied`. `historical fact check: not-run`. `ledger: not-implemented`. `security: PASS` |
| `node scripts/btt19-release-check.mjs --out /tmp/btt19-fead` | 1 | `automated: pass`. `release: blocked`. `historicalFactCheck: not-run`. `localFullTurn: pending`. `publicSmoke: pending`. `releaseBlocking: manual:local-full-turn, manual:public-smoke` |

The release script does not read the browser session below, so its `localFullTurn` row stays pending.

Pack inspection on this commit: `data/quiz.json` has `sourceDigest` `12ecc69109decb249faeafbf558a45b48d82e4e4efb4e9d8cda0dc613ddfee5a` and `mapDigest` `3a4567de500538dfcf959f63f43fcd5b7f11ea226db448a82b02251f68725a87`. It has 1,000 questions and 92 counties. `public/data/quiz.json` is absent. A name-order count from Johnson through Whitley is 52 counties and 573 questions. That slice is not the whole pack.

## Map

Requirement `sty_48d53b7e`.

[Pull request 4](https://github.com/squashy/indyinit/pull/4) merged as [`a00ee4dad06bb642172e4bf75fbfcce0f3bd7423`](https://github.com/squashy/indyinit/commit/a00ee4dad06bb642172e4bf75fbfcce0f3bd7423). That pull request has no review comment in this repository, so no review score is claimed for it.

The map gate run above is the check on this commit. Its planted self-loop and asymmetric edge fail, then the Indiana map passes. The gate's own checks cover a connected graph, no self-neighbor, symmetric borders, one region membership per county, and contiguous regions. It printed eight named regions whose county counts add to 92: Central Indiana 10, East Central Indiana 21, North Central Indiana 10, Northeast Indiana 12, Northwest Indiana 9, South Central Indiana 10, Southwest Indiana 10, West Central Indiana 10. `regions/in/region.json` and the map pack still mark those regions `review: draft`. Bonus values are not adopted.

## Structural and safety gates

[Pull request 11](https://github.com/squashy/indyinit/pull/11) merged as [`ccfeaad2553dacb064bb2edbb17875436be0a784`](https://github.com/squashy/indyinit/commit/ccfeaad2553dacb064bb2edbb17875436be0a784) from head `18ac351ec7e2b61ff216ab12454d1c7c943a61dd`. That pull request has no review comment and no review submission here. This record does not supply that review and does not close the gate card.

On this commit the quiz gate ran the negative fixtures. `structural failures name the broken question` rejects duplicate choices, a correct answer that misses its letter, a prompt that omits the county name, and HTML in a prompt. `planted unsafe sources and answer-key files fail` rejects `innerHTML`, `eval`, an external script, and a tracked answer-key name. `a one-question fixture is not rejected for coverage minimums` shows a one-question pack is accepted while the coverage report still counts counties under the old minimums. The shipped line is `minima: not applied`. `ledger: not-implemented` and `historical fact check: not-run` remain. The browser session below showed the text `Questions unverified`.

## Coverage slice

Requirement `sty_f4ed3ee7`.

[Pull request 18](https://github.com/squashy/indyinit/pull/18) merged as [`cfe1ce5aaa0cd9920750fac059ddb36d93482535`](https://github.com/squashy/indyinit/commit/cfe1ce5aaa0cd9920750fac059ddb36d93482535). `reports/quiz-c2.json` says Johnson through Whitley, 52 counties, 573 questions, 2,292 choices, factual QA deferred, minima not applied, and no structural errors in that range. Its stored `mapDigest` is `bdfc6a3ab0dc9b47554a92be0e65bd86c44919651148cfdfdb9dc1bb277e2013`. The current pack's `mapDigest` is the newer value above; `sourceDigest` is the same. The 52 and 573 figures were counted again from the current pack and map names. They are a slice of the 1,000 questions. This record does not read source pages and does not check historical truth.

## Importer

Requirement `sty_96c7a5b6`.

The importer is in [pull request 2](https://github.com/squashy/indyinit/pull/2), merged as [`0df72ecbbb6db03f387301132e8248c02bd8577a`](https://github.com/squashy/indyinit/commit/0df72ecbbb6db03f387301132e8248c02bd8577a), and the pack import is in pull request 4. [Pull request 9](https://github.com/squashy/indyinit/pull/9) merged as [`241642ea1348fae1f8c07363f50cf4ef5db7c326`](https://github.com/squashy/indyinit/commit/241642ea1348fae1f8c07363f50cf4ef5db7c326) and the passing test `corrected keys stay pinned for questions 45, 289, and 356` still matches those three gameplay letters. `the shipped quiz pack is the supplied file imported against the current map` passed on this commit: `data/quiz.json` equals a fresh import of `inputs/battle-for-the-92-benchmark-1000_nokey.csv` against the current map. The tracked path is `data/quiz.json`. The name `public/data/quiz.json` is still absent. Ledger merge, a human question audit, and factual QA were not run.

## Human turn

Requirement `sty_5313bd00`.

[Pull request 12](https://github.com/squashy/indyinit/pull/12) reviewed head `49daca3630ec01963e8d6475b96528186de19007` and merge [`8062288d6ee9e06eba7f6aa520208faa37926479`](https://github.com/squashy/indyinit/commit/8062288d6ee9e06eba7f6aa520208faa37926479) have the same tree, `61f8a576553ba4523ca615a2616b138aab5a9a8e`. The diff from `e86012ded097ebb755f0fd7950d36a49c03d5ae7` to `49daca36` is docs, quiz and safety gates, and the release-check script. It does not change `src/` or `index.html`. A reported local-merge commit `abfd9a908bf95385959f62cb507ca651d529d973` is not in this clone, so its tree was not compared. A review comment on `e86012de` records approval of that module head. This record does not repeat that review.

Current main is later than that tree. The fresh browser session below is this commit, `fead794ce33fec26e2b2543a60ccd233549fe8e0`, production preview `http://127.0.0.1:4173/`, headless Chrome 156, 1440×900. Two human seats. Log: `docs/evidence/turn-log.json`.

| Check | Observed |
|---|---|
| Notice | `Questions unverified` |
| Quiz county | Porter, highlighted `18127`, prompt found in the pack for that county |
| Correct, once | `Right. You get 2 armies, one time.` Reinforcement `Armies to place: 17. Counties 15, regions 0, question 2.` A second click left that line and the army badges unchanged. Choice buttons were disabled |
| Placement | Phase became attack. `Armies to place: 0.` |
| Attack and occupy | Phase became move-in, then attack again after the move-in button |
| Fortify | After stop-attacking, Adams `18001` went from 17 to 16 and Allen `18003` from 1 to 2. Phase then said pass the screen |
| Handoff | `Hand the screen to Ben.` |
| Second seat, wrong | Clay, highlighted `18021`. `Not this time. The answer is The Lincoln Highway. You get 0 armies.` The supplied explanation was on screen. Reinforcement `Armies to place: 15. Counties 15, regions 0, question 0.` |

Screenshots: `docs/evidence/01-quiz.png`, `02-correct.png`, `03-fortify.png`, `04-handoff.png`, `05-wrong.png`.

A separate reported production session, not this browser run, describes deployment `dpl_E6p9eCZxJuPYxSMLAGbxFwWfTJZ5` at `https://battlefor92-b94i46jrs-rawcode1.vercel.app` for commit `8062288d`, from 1:34:50 to 1:38:45 EST. The report says two human seats had 46 counties each, an Owen question showed `Questions unverified` and +2 with 17 armies, placement and an attack from Owen to Monroe, a fortify from Owen to Greene that needed a second press of Move 1 army, and a Sam skip with 0 and 15 armies. No response headers were captured. The alias has since moved. That report is not a run from this session, and it is not a header check.

`src/ai/ai.ts` chooses a local action: a quiz coin flip, placement, attack, occupation, or fortify, through the engine. `src/ui/turn.ts` plays one such action on a timer, or a bounded loop when hurry is used. It is not a remote model and it is not a skip-only stub. This browser session used two human seats, so computer pacing was not watched.

## Not closed

- Coverage minima are reported and not enforced.
- Factual QA, source reading, a human question audit, and ledger or checker merge were not run.
- Pull request 11 has no review in this repository.
- The release script still blocks on a manual full turn and on public header smoke. This local browser session does not clear that script, and the reported production session did not record headers.
- Computer pacing was not played in the browser.
