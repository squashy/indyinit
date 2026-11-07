# Browser gate report

Run against the local production build (`npm run build` then this gate's preview). Optional misses do not block release. A core row blocks only when it is a real gameplay obstruction.

## Core

- pass: desktop quiz names the highlighted county. White / 18181 Owner: `src/ui/quiz-dialog.ts and src/ui/map.ts`.
- pass: desktop questions unverified. Questions unverified Owner: `src/ui/quiz-dialog.ts`.
- pass: desktop dialog does not cover the quiz county. county false column false Owner: `src/styles.css`.
- pass: desktop no sideways scroll. false Owner: `src/styles.css`.
- pass: shipped prompt found. Lake Shafer and Lake Freeman, near Monticello in White County, were created by d Owner: `data/quiz.json`.
- pass: correct answer shows +2 once. Right. You get 2 armies, one time. Owner: `src/ui/quiz-dialog.ts`.
- pass: reinforcement matches engine income. Armies to place: 17. Counties 15, regions 0, question 2. Owner: `src/ui/turn.ts`.
- pass: a legal enemy attack exists. {"from":"18003","to":"18001"} Owner: `src/ui/map.ts`.
- pass: attack selects an enemy target. {"source":"18003","target":"18001"} Owner: `src/ui/map.ts`.
- pass: a connected friendly fortify destination exists. {"source":"18003","friend":"18033","disconnected":"18005","enemy":"18001"} Owner: `src/ui/map.ts`.
- pass: enemy fortify is rejected. Pick a county to move from, then a connected county you hold. Owner: `src/ui/map.ts and src/ui/turn.ts`.
- pass: disconnected fortify is rejected. Pick a county to move from, then a connected county you hold. Owner: `src/ui/map.ts and src/ui/turn.ts`.
- pass: fortify moves exactly one army. 17->16, 1->2 Owner: `src/ui/turn.ts`.
- pass: human handoff is shown. Hand the screen to Bo. Owner: `src/ui/turn.ts`.
- pass: skip scores 0. Armies to place: 15. Counties 15, regions 0, question 0. Owner: `src/ui/quiz-dialog.ts`.
- pass: continue restores the saved deal. 92 owned counties restored Owner: `src/ui/setup.ts`.
- pass: desktop no page errors. none Owner: `src/main.ts`.
- pass: chromebook quiz names the highlighted county. Perry / 18123 Owner: `src/ui/quiz-dialog.ts and src/ui/map.ts`.
- pass: chromebook questions unverified. Questions unverified Owner: `src/ui/quiz-dialog.ts`.
- pass: chromebook dialog does not cover the quiz county. county false column false Owner: `src/styles.css`.
- pass: chromebook no sideways scroll. false Owner: `src/styles.css`.
- pass: chromebook no page errors. none Owner: `src/main.ts`.
- pass: phone quiz names the highlighted county. Miami / 18103 Owner: `src/ui/quiz-dialog.ts and src/ui/map.ts`.
- pass: phone questions unverified. Questions unverified Owner: `src/ui/quiz-dialog.ts`.
- pass: phone dialog does not cover the quiz county. county false column false Owner: `src/styles.css`.
- pass: phone no sideways scroll. false Owner: `src/styles.css`.
- pass: phone no page errors. none Owner: `src/main.ts`.

## Optional

- pass: desktop 44px quiz targets. 5 controls Owner: `src/styles.css`.
- pass: desktop distinct player patterns. 6 background images Owner: `src/styles/theme.css`.
- pass: desktop trip log live region. polite Owner: `index.html`.
- pass: keyboard county focus. {"before":"map","after":"18001","ring":"none"} Owner: `src/ui/map.ts`.
- pass: reduced motion shortens transitions. 1e-05s Owner: `src/styles.css`.
- pass: chromebook 44px quiz targets. 5 controls Owner: `src/styles.css`.
- pass: chromebook distinct player patterns. 6 background images Owner: `src/styles/theme.css`.
- pass: chromebook trip log live region. polite Owner: `index.html`.
- pass: phone 44px quiz targets. 5 controls Owner: `src/styles.css`.
- pass: phone distinct player patterns. 6 background images Owner: `src/styles/theme.css`.
- pass: phone trip log live region. polite Owner: `index.html`.

## Not checked

- Screen reader speech for the trip log was not listened to. The live-region attributes were checked.
- No color-vision simulator was run. Player swatches were checked for distinct pattern images.
- Pinch zoom was not performed.
- Computer attack play was not checked. That behavior belongs to the AI owner, not this gate.
- A hosted preview URL was not used. This run used the local production build.

No core gameplay obstruction was observed in this run.

## Visual reference gaps

Compared with the forwarded Indiana map close-up and game board. The pictured remaining count and the Reinforce step are the existing place phase, not new rules. Nothing in this section was edited. Follow-up belongs to the owners below, not to this gate.

- County names are drawn on every county and collide with the army numbers. The reference map keeps the number as the mark and does not label every county at the default zoom. Files: `index.html`, `src/styles.css` (BTT-15); `src/ui/map.ts` only if the badge text node changes (BTT-16).
- Army badges are small user-unit circles. The reference uses larger bold white numerals inside solid circular tokens. File: `src/styles.css` (BTT-15).
- A two-player game is blue rings and gold stripes. The reference two-player board is blue with a checker and orange with a triangle pattern. The six-seat palette can stay; the two-player pair is the gap. File: `src/styles/theme.css` (BTT-15).
- County borders are a brown stitch. The reference borders are thin and dark, with a clear state outline. File: `src/styles.css` (BTT-15).
- The reference map sits in a labeled frame: Lake Michigan, Illinois, Ohio River, Michigan, Ohio, Kentucky, and a compass. Those labels are absent. File: `index.html` (BTT-15).
- The reference sidebar is a short phase rail: player, Quiz / Reinforce / Attack / Fortify, a large armies-left number, and one place action. This build uses a long stack and the sentences in `src/ui/turn.ts` (`This step: …`, `Armies to place: N. Counties …`). Files: `index.html` and `src/styles.css` (BTT-15), `src/ui/turn.ts` (BTT-17).
- The picture also shows Shift-click to place all, Undo, Sound, and Menu. Those are not engine rules and were not added. Sound remains the no-op in `src/sound.ts` (BTT-17). A menu, undo, or place-all control would be new product behavior, not a visual token change.
- Parchment, a large map on the left, and a panel on the right already match the board’s arrangement. The quiz county stays in the map pane while the question sits below or beside it.
