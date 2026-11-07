# Browser gate report

Run against the local production build (`npm run build` then this gate's preview). Optional misses do not block release. A core row blocks only when it is a real gameplay obstruction.

## Core

- pass: desktop quiz names the highlighted county. Washington / 18175 Owner: `src/ui/quiz-dialog.ts and src/ui/map.ts`.
- pass: desktop questions unverified. Questions unverified Owner: `src/ui/quiz-dialog.ts`.
- pass: desktop dialog does not cover the quiz county. county false column false Owner: `src/styles.css`.
- pass: desktop no sideways scroll. false Owner: `src/styles.css`.
- pass: desktop keyboard reaches the map and Skip. continue-game,SUMMARY,BUTTON,skip-quiz,BODY,A,map,INPUT,start-game Owner: `index.html and src/ui/map.ts`.
- pass: desktop keyboard moves county focus. map -> 18143 -> 18019 Owner: `src/ui/map.ts`.
- pass: desktop shipped prompt found. John Hay, born in Salem, in Washington County, in 1838, served as personal secre Owner: `data/quiz.json`.
- pass: desktop correct answer shows +2 once. Right. You get 2 armies, one time. Owner: `src/ui/quiz-dialog.ts`.
- pass: desktop reinforcement matches engine income. Armies to place: 17. Counties 15, regions 0, question 2. Owner: `src/ui/turn.ts`.
- pass: desktop second correct answer does not add armies. Armies to place: 17. Counties 15, regions 0, question 2. armies 135 Owner: `src/ui/quiz-dialog.ts`.
- pass: desktop a legal enemy attack exists. {"from":"18001","to":"18003"} Owner: `src/ui/map.ts`.
- pass: desktop attack selects an enemy target. {"source":"18001","target":"18003"} Owner: `src/ui/map.ts`.
- pass: desktop a connected friendly fortify destination exists. {"source":"18001","friend":"18179","disconnected":"18007","enemy":"18003"} Owner: `src/ui/map.ts`.
- pass: desktop enemy fortify is rejected. Pick a county to move from, then a connected county you hold. Owner: `src/ui/map.ts and src/ui/turn.ts`.
- pass: desktop disconnected fortify is rejected. Pick a county to move from, then a connected county you hold. Owner: `src/ui/map.ts and src/ui/turn.ts`.
- pass: desktop fortify moves exactly one army. 17->16, 1->2 Owner: `src/ui/turn.ts`.
- pass: desktop human handoff is shown. Hand the screen to Bo. Owner: `src/ui/turn.ts`.
- pass: desktop skip scores 0. Armies to place: 15. Counties 15, regions 0, question 0. Owner: `src/ui/quiz-dialog.ts`.
- pass: desktop continue restores owners, armies, player, and phase. player 1 place seq 2 Armies to place: 15. Counties 15, regions 0, question 0. Owner: `src/ui/setup.ts`.
- pass: desktop no page errors. none Owner: `src/main.ts`.
- pass: chromebook quiz names the highlighted county. Marion / 18097 Owner: `src/ui/quiz-dialog.ts and src/ui/map.ts`.
- pass: chromebook questions unverified. Questions unverified Owner: `src/ui/quiz-dialog.ts`.
- pass: chromebook dialog does not cover the quiz county. county false column false Owner: `src/styles.css`.
- pass: chromebook no sideways scroll. false Owner: `src/styles.css`.
- pass: chromebook keyboard reaches the map and Skip. continue-game,SUMMARY,BUTTON,skip-quiz,BODY,A,map,INPUT,start-game Owner: `index.html and src/ui/map.ts`.
- pass: chromebook keyboard moves county focus. map -> 18059 -> 18145 Owner: `src/ui/map.ts`.
- pass: chromebook shipped prompt found. Which of these is the county seat of Marion County? Owner: `data/quiz.json`.
- pass: chromebook correct answer shows +2 once. Right. You get 2 armies, one time. Owner: `src/ui/quiz-dialog.ts`.
- pass: chromebook reinforcement matches engine income. Armies to place: 17. Counties 15, regions 0, question 2. Owner: `src/ui/turn.ts`.
- pass: chromebook second correct answer does not add armies. Armies to place: 17. Counties 15, regions 0, question 2. armies 135 Owner: `src/ui/quiz-dialog.ts`.
- pass: chromebook a legal enemy attack exists. {"from":"18001","to":"18075"} Owner: `src/ui/map.ts`.
- pass: chromebook attack selects an enemy target. {"source":"18001","target":"18075"} Owner: `src/ui/map.ts`.
- pass: chromebook a connected friendly fortify destination exists. {"source":"18001","friend":"18003","disconnected":"18007","enemy":"18005"} Owner: `src/ui/map.ts`.
- pass: chromebook enemy fortify is rejected. Pick a county to move from, then a connected county you hold. Owner: `src/ui/map.ts and src/ui/turn.ts`.
- pass: chromebook disconnected fortify is rejected. Pick a county to move from, then a connected county you hold. Owner: `src/ui/map.ts and src/ui/turn.ts`.
- pass: chromebook fortify moves exactly one army. 18->17, 1->2 Owner: `src/ui/turn.ts`.
- pass: chromebook human handoff is shown. Hand the screen to Bo. Owner: `src/ui/turn.ts`.
- pass: chromebook skip scores 0. Armies to place: 15. Counties 15, regions 0, question 0. Owner: `src/ui/quiz-dialog.ts`.
- pass: chromebook continue restores owners, armies, player, and phase. player 1 place seq 2 Armies to place: 15. Counties 15, regions 0, question 0. Owner: `src/ui/setup.ts`.
- pass: chromebook no page errors. none Owner: `src/main.ts`.
- pass: phone quiz names the highlighted county. Jefferson / 18077 Owner: `src/ui/quiz-dialog.ts and src/ui/map.ts`.
- pass: phone questions unverified. Questions unverified Owner: `src/ui/quiz-dialog.ts`.
- pass: phone dialog does not cover the quiz county. county false column false Owner: `src/styles.css`.
- pass: phone no sideways scroll. false Owner: `src/styles.css`.
- pass: phone keyboard reaches the map and Skip. continue-game,SUMMARY,BUTTON,skip-quiz,BODY,A,map,INPUT,start-game Owner: `index.html and src/ui/map.ts`.
- pass: phone keyboard moves county focus. map -> 18155 -> 18019 Owner: `src/ui/map.ts`.
- pass: phone shipped prompt found. Which college in Jefferson County is known as Indiana's oldest private college? Owner: `data/quiz.json`.
- pass: phone correct answer shows +2 once. Right. You get 2 armies, one time. Owner: `src/ui/quiz-dialog.ts`.
- pass: phone reinforcement matches engine income. Armies to place: 17. Counties 15, regions 0, question 2. Owner: `src/ui/turn.ts`.
- pass: phone second correct answer does not add armies. Armies to place: 17. Counties 15, regions 0, question 2. armies 135 Owner: `src/ui/quiz-dialog.ts`.
- pass: phone a legal enemy attack exists. {"from":"18005","to":"18031"} Owner: `src/ui/map.ts`.
- pass: phone attack selects an enemy target. {"source":"18005","target":"18031"} Owner: `src/ui/map.ts`.
- pass: phone a connected friendly fortify destination exists. {"source":"18005","friend":"18013","disconnected":"18017","enemy":"18001"} Owner: `src/ui/map.ts`.
- pass: phone enemy fortify is rejected. Pick a county to move from, then a connected county you hold. Owner: `src/ui/map.ts and src/ui/turn.ts`.
- pass: phone disconnected fortify is rejected. Pick a county to move from, then a connected county you hold. Owner: `src/ui/map.ts and src/ui/turn.ts`.
- pass: phone fortify moves exactly one army. 17->16, 1->2 Owner: `src/ui/turn.ts`.
- pass: phone human handoff is shown. Hand the screen to Bo. Owner: `src/ui/turn.ts`.
- pass: phone skip scores 0. Armies to place: 15. Counties 15, regions 0, question 0. Owner: `src/ui/quiz-dialog.ts`.
- pass: phone continue restores owners, armies, player, and phase. player 1 place seq 2 Armies to place: 15. Counties 15, regions 0, question 0. Owner: `src/ui/setup.ts`.
- pass: phone no page errors. none Owner: `src/main.ts`.

## Optional

- pass: desktop 44px quiz targets. 5 controls Owner: `src/styles.css`.
- pass: desktop distinct player patterns. 6 background images Owner: `src/styles/theme.css`.
- pass: desktop trip log live region. polite Owner: `index.html`.
- pass: reduced motion shortens transitions. 1e-05s Owner: `src/styles.css`.
- pass: chromebook 44px quiz targets. 5 controls Owner: `src/styles.css`.
- pass: chromebook distinct player patterns. 6 background images Owner: `src/styles/theme.css`.
- pass: chromebook trip log live region. polite Owner: `index.html`.
- pass: reduced motion shortens transitions. 1e-05s Owner: `src/styles.css`.
- pass: phone 44px quiz targets. 5 controls Owner: `src/styles.css`.
- pass: phone distinct player patterns. 6 background images Owner: `src/styles/theme.css`.
- pass: phone trip log live region. polite Owner: `index.html`.
- pass: reduced motion shortens transitions. 1e-05s Owner: `src/styles.css`.

## Not checked

- Screen reader speech for the trip log was not listened to. The live-region attributes were checked.
- No color-vision simulator was run. Player swatches were checked for distinct pattern images.
- Pinch zoom was not performed.
- Computer attack play was not checked. That behavior belongs to the AI owner, not this gate.
- A hosted preview URL was not used. This run used the local production build.

No core gameplay obstruction was observed in this run.

## Local visual integration

This branch stays on the browser gate. It does not contain the visual follow-up. A local merge of that follow-up `49cb9231289c43fb33365a2dece294b6e88480e1` with gate `4c4a047a2276b22ff4a0218b8d2ae5b2c420b980` is `cbf7ba25984b863cc9e7c424df603b1fabda8693`. That merge was not pushed.

On that local build, Chromebook 1366 completed a full human turn. A second correct answer stayed at question 2 and 135 armies. An enemy fortify and a disconnected fortify were rejected with the armies unchanged. A connected fortify moved exactly one army, 17 to 16 and 1 to 2. Continue restored player 1, phase place, turn sequence 2, and the same 92 owner and army pairs. Tab reached the map and Skip, and the arrow keys moved county focus.

Phone 390 on that same build could not click a quiz choice or Skip. The sticky phase card in `src/styles.css` is 191px tall and the side pane is 162px tall, so the click lands on `#phase`. Re-running this gate on that merge records `phone correct choice receives the click` as a failure with that target. Desktop and Chromebook on that merge pass the same full-turn checks. The product file is not changed on this branch.
