# Shell and setup acceptance

This record cites merged work and the reviews already attached to it. It does not re-run a browser, and it does not treat an unmerged pull request as proof of main.

## Page shell

Requirement `sty_525b5cdb`.

[Pull request 6](https://github.com/squashy/indyinit/pull/6) merged as [`9ebcce8f489d4d0958ed9bbd8acb58fa286afda8`](https://github.com/squashy/indyinit/commit/9ebcce8f489d4d0958ed9bbd8acb58fa286afda8). The reviewed head was `12a4f5450785b6002c7574fd435e8d167c9b5e46`. Both commits are ancestors of this main.

The review comment on that head reports:

- `npm ci` succeeded, `npx tsc --noEmit` exited 0, `npm test` passed 49 tests, and `npm run build` succeeded.
- A headless browser opened the production preview at 320 and 1440. That report says `scrollWidth` matched the viewport, 92 counties were present, no external `http` URL was used, and the page reported no errors.
- The same comment maps the page to the contract hooks, six non-color patterns, a visible focus ring, reduced motion, 44px controls, and system fonts.

That browser result is the review's report. This pull request did not repeat it. Viewport checks at 390, 1366, and 1440 that sit on an unmerged pull request are not used here.

At the time of that review the controls were not wired. The page entry was merged later. This record does not add a new browser measurement of that entry.

## Setup and map

Requirement `sty_44610837`.

[Pull request 7](https://github.com/squashy/indyinit/pull/7) merged as [`e014f9d48c32ede212a27b900d949599ad86182d`](https://github.com/squashy/indyinit/commit/e014f9d48c32ede212a27b900d949599ad86182d). The reviewed heads were `bbe3c79e4c55e9cfb184bf010af84cfb9d67a361` and `d3c77088665da6612a4660bad86cf1df0cbca629`. Both reviews are on the merged pull request, and the merge is an ancestor of this main.

The first review comment reports typecheck, 49 passing tests, and a production build for `src/ui/setup.ts`, `src/ui/map.ts`, and `src/panzoom.ts`. It calls the result module-scope approval. It also says a browser pass existed as author evidence and was not reproduced in that review. No browser log is attached to the pull request. That is the missing browser artifact. The recorded module review still stands, and this pull request does not request another one.

The second review comment, on the storage-getter fix, reports five interface checks: lazy binding, Start with a throwing storage getter and 92 holdings, persist with that getter, a Continue read error, and a round trip through explicit storage. Those checks are the review's runtime report, not a browser run. The comment said they were not yet a committed test.

Main now contains two committed tests in `tests/shell-setup.test.ts`: a blocked storage getter does not resume or throw while saving, and a store that throws on read or write leaves the session unreplaced. Those tests arrived with the merged requirements record, whose review reports 59 passing tests. They lock the blocked-storage paths. They do not replace the review's Start and Continue round-trip report, and they are not a browser measurement.
