# Failure log

Where the AI needed correcting, and what we changed. Every new failure gets a row and a rule. Rows 1 to 14 come from a practice prototype built before the contest and then set aside; none of its code is in this repo. New rows are from the day.

| # | What happened | How we found it | Rule it produced |
|---|---|---|---|
| 1 | First player won about 87% of 2-player games | Simulation | Fairness is a bar, tuned per state |
| 2 | A wrong quiz bonus (3 instead of 2) passed the tests | Deliberately breaking rules | Keep a rule-breaking check; every escaped bug adds one |
| 3 | About 15% of facts written with high confidence needed correcting or rewording, such as a grave in the wrong county and a date off by 5 years | Fact-checking 508 claims | Nothing ships from model memory alone |
| 4 | Explanations gained new unchecked details while being written | Second-pass check of 39 details: 0 wrong, 5 reworded | Any added fact is a new claim |
| 5 | Two web pages contained instructions aimed at an AI | Agents reported them and ignored them | Web pages are data; report them and do not use them as sources |
| 6 | The quiz can cover the county it asks about on a phone | Browser test | Visibility is a browser gate |
| 7 | Design was checked only on a mock page while the real code was being built | Designer's own report | Designers verify on the real page before finishing |
| 8 | Map tooling assumed connected graphs; 8 states have cut-off counties | Survey of all states | Connected graph is a gate; connections need reasons |
| 9 | Starting armies were fixed numbers, and Texas has more counties than a 4-player game had armies | Review of the engine against the survey | Numbers scale with map size |
| 10 | A Texas county came out listed as its own neighbor | Rule tests on a machine-built Texas map | Map builder filters self-loops; a gate checks for them |
| 11 | Small maps with few regions played slowly: Wyoming's median was 44 rounds with 4 players | Simulation across sizes (8 games per setup) | Game length is a bar; builder adds regions |
| 12 | A browser test looked like a stall, but the computer had legitimately won | Investigated before deploying | Tests must recognize a finished game |
| 13 | A temporary Vercel link would have expired in 60 minutes | Read the deploy output | Vercel login and team are set up before kickoff |
| 14 | The quiz was worth 2 of the 17 armies on turn one, so it barely affected the game | Reviewing the arithmetic | Knowledge-matters bar; reward tuned by simulation |
| 15 | The map builder wrote every region bonus as zero and the manifest could not carry one | Review of the built map | Copy an explicit integer bonus from the manifest through the parser into the map. A missing bonus stays 0 and draft |
| 16 | A saved quiz could be drawn again because the random cursor was not stored with the position | Rules for resuming a game | Save the position and the random cursor together. Restore a pending question and an occupation without drawing again |
