# Phase, combat, map, and motion evidence

This record cites the merged surface pull request and the review comments already on it. It does not re-run the suite, open a browser, or capture pinch zoom.

## Merged change

[Pull request 31](https://github.com/squashy/indyinit/pull/31) merged as [`42c089dbbf8cd563f5b4fb819d3f50e6ce6a94f8`](https://github.com/squashy/indyinit/commit/42c089dbbf8cd563f5b4fb819d3f50e6ce6a94f8). Parents: `b0726239f7efcb15c9107cb134f1175b53335ea9` and `71f12ae3be0cb064cb830019e1adc3044049322c`. That merge is an ancestor of this main. The reviewed head is `71f12ae3be0cb064cb830019e1adc3044049322c`.

The change is the page surface: `src/ui/turn.ts`, `src/ui/battle.ts`, `src/ui/map.ts`, `src/ui/quiz-dialog.ts`, `src/styles.css`, `index.html`, `gates/browser.mjs`, and the UI tests. The review comment on that head says the engine, rules, and quiz packs were not changed. `src/ui/quiz-dialog.ts` still sets the notice text to `Questions unverified`.

## What the review comment records

The comment on `71f12ae3` records approval. Its box proof, at that exact head, is:

- `npm ci` exit 0
- `npm run box` exit 0: typecheck clean, 88 tests passed, production build passed
- gates passed: map, rules, rules-engine, quiz, and security
- `node --experimental-strip-types --test tests/ui-*.test.ts`: 21 passed, 0 failed

Those 21 cases are the files below. This record read the test names. It did not run them again.

Earlier comments on the same pull request record 87 tests at `98c17e86cca03763f40e261112436661c9167c3e` and 20 focused UI tests at `f5094dc85eeb3d4b1e721bc2f59e4b28b64758d7`. The last comment is the one for the merged head.

A named box log for 85 automated browser checks is not in this workspace. The comment on `71f12ae3` says `gates/browser.mjs` is not part of `npm run box` and that a manual browser pass was still worth doing. This record does not claim those 85 checks, a new screenshot, or a pinch-zoom measurement.

## Phase and turn controls

`tests/ui-phase.test.ts` names these cases: the stepper names every step and highlights only the real phase; county count stays separate from base reinforcement; turn controls follow the phase and a stale end turn does not skip fortify; handoff focus enters Ready and returns after close; desktop phase controls sit in a dock so the page itself does not scroll.

The review comment says the phase stepper highlights only the real phase and a stale end turn does not skip fortify.

## Combat losses and move-in

`tests/ui-battle.test.ts` names these cases: battle text shows both counties, dice, and each side's losses; a capture opens move-in and keeps the engine minimum, maximum, and garrison; move-in rejects a bad count once, keeps the county, and ignores a second click; Enter submits move-in only from the focused form and Escape cannot skip it; the trip log repeats the engine losses.

The review comment says a successful attack paints dice and losses from the engine result, and a rejected action still repaints.

## Map artwork

`tests/ui-map.test.ts` names these cases: six players keep a name, a seat, and a pattern in the legend; selection is named in text and drawn with selected, source, and target states; keyboard moves between counties and selects the focused one; county detail repeats only supplied facts; desktop labels stay readable and a narrow layout keeps a detail view without sideways overflow.

The pull request description says pan and zoom still change the map view box, and a new turn starts from the whole-state view box `-92 -34 760 1019`. This record did not operate pan, zoom, or pinch.

## Short motion

`tests/ui-motion.test.ts` names these cases: dice motion uses the confirmed rolls once and reduced motion shows them immediately; a correct quiz credits 2 once, and a wrong or skipped quiz credits 0; quiz focus starts on the first choice and Tab is not trapped; quiz and battle input lock only the pending action and a rejection can be retried; phase motion marks a new step once and reduced motion keeps the instruction; motion timing stays short and reduced motion removes it.

The review comment says quiz scoring of +2 once, and 0 for wrong or skip, was unchanged.

## Limits

The box command recorded in the comment does not include the browser gate. No new browser session was run for this record. Pinch zoom was not measured. The four UI test files are what the focused command ran; the comment at an earlier head said those files were not yet in the `npm test` list, and this record does not recheck that list.
