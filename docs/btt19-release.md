# BTT-19 release check

Run this on one combined candidate after its dependencies are installed. The check pins that commit, runs the checks already declared in the repo, and writes a JSON report outside the tree.

```sh
npm ci
node scripts/btt19-release-check.mjs
```

Optional flags are `--root <candidate>` and `--out <directory>`. The evidence directory must sit outside the candidate. The default is a `btt19-release` directory in the system temp folder. Leave that file uncommitted.

## How to read the report

The `sha` is the full HEAD the check pinned. `exactCommittedCandidate` is true only for a clean worktree at that full SHA. A dirty tree still records the SHA, and `representation` says it is not exact committed release evidence. The file name ends in `-dirty` or `unpinned` in those cases.

`automatedVerdict` covers the machine checks. `releaseVerdict` stays blocked while manual smoke is pending. Exit 1 with `automated: pass` means the machine checks passed and the release record is still open. Exit 0 is only a finished release record.

| Evidence | Meaning |
|---|---|
| `executed` | The command ran. `pass` is an observed success. `fail` and `skipped` are not passes. |
| `inspected` | A file in this tree or its build output was read. |
| `missing` | A required command or shipped file was not there. |
| `manual` / `pending` | Local full-turn or public smoke. This tool does not open a browser or claim the smoke ran. |
| `deferred` / `not-run` | Historical checking. The check has no fact-check result. |

A skipped gate, including one that exits 0, stays an executed skip. `historicalFactCheck`, `localFullTurn`, and `publicSmoke` stay `not-run` or `pending` on every run.

## What it runs

The commands come from `package.json` and the gate names in `scripts/box-gate.mjs`:

- `npm run typecheck`
- `npm run gates -- <name>` once for each discovered gate
- `npm run build` once

It does not run the full test script a second time and it does not start a second build. Declared response headers are copied from `vercel.json` into the report. The script does not keep its own copy of that policy.

## Shipped files

These block `automatedVerdict` when they are absent or do not match the accepted build output:

- `data/regions/*/map.json`, copied to `dist/data/regions/*/map.json`
- `data/quiz.json`, copied to `dist/data/quiz.json`, with its `mapDigest` equal to the map digest
- `index.html` loading a local module file, and `dist/index.html` loading a built script that is present

`vite.config.ts` copies the `data` directory to `dist/data` at the end of the build. That is the quiz source this check follows. A pack only under `public/` is not that source. The shipped file still has to be structurally valid and bound to the map digest.

A library bundle without `dist/index.html` is a missing UI entry. The build command can pass and the UI row can still be blocked. The check does not write the quiz pack, the map, or stand-in questions.

Draft region bonuses and empty county facts are counted on the map row. They are existing pack data, not a new approval.

## Local full turn

Serve the `dist` directory from this clean SHA with the installed Vite preview:

```sh
node_modules/.bin/vite preview --host 127.0.0.1 --port 4173
```

Play one two-player game and keep your own notes with the report SHA, the browser, and what you saw:

1. The page loads, and the map and quiz requests succeed, with no failed requests or console errors.
2. Both players are human. Every county on the map is owned once.
3. The question on screen is the pending question for the highlighted owned county. The choices stay in the pending order when the screen redraws.
4. A correct answer adds 2 once. Submitting it again does not add more. A wrong answer or a skip adds 0.
5. Place the armies the game offers. An illegal placement does not spend armies or advance the turn. Attack an adjacent county and read the losses the game reports.
6. After a capture, finish occupation before another attack, a fortify, or the end of the turn. Move at least the final attack dice and leave one army behind.
7. End attacks. Fortify along counties you own, or skip. End the turn. The quick-win check happens before the handoff. Acknowledge the next player once.
8. Save during a quiz or a pending occupation and reload. The question, choice order, phase, and random cursor return. A save the game does not support leaves the live session in place.

The report keeps `localFullTurn` pending. A blocked turn blocks the release.

## After deploy

Deploy that same SHA, then request the live page and the built files:

```sh
curl -sI "$BASE/"
curl -sI "$BASE/data/quiz.json"
curl -sI "$BASE/data/regions/in/map.json"
curl -sI "$BASE/<script src from dist/index.html>"
```

The page is HTML. The quiz and map are JSON. The script is JavaScript. A data or script URL that comes back as HTML is a failed smoke. Compare each response's header values with the header list in the candidate's `vercel.json` and in the evidence file. Play one turn. The candidate pin is the `sha` in the evidence file. Record that you deployed that commit; this check does not ask the host for a deployment id.

`publicSmoke` stays pending until you have done that yourself. The static header row is only the file on disk.

## Tool tests

```sh
node --test tests/btt19-release-check.test.mjs
```
