# Pass/fail bars

Each bar is an automated gate unless marked otherwise. Gates run by one command for any state, and CI blocks any pull request that fails them. Changing a bar takes a person and a row in `FAILURES.md`.

## Facts

Scored by the key holder, per state and overall. These numbers come from outside the agents' reach, so they are the ones we trust most.

| Measure | Bar | Why |
|---|---|---|
| Fake questions reaching a final quiz | **0** | Blocks release. A fake that ships teaches a child something false |
| Fakes caught, with both checkers combined | At least 90% | Measures the pipeline |
| True questions wrongly rejected | At most 10% | A pipeline that rejects everything would catch every fake |
| Shipped questions with two passing verdicts or a person's ruling | 100% | Automated check on the ledger |
| Sources on every `confirmed` or `corrected` verdict | 100% | Automated check on the ledger |
| Human audit | A random 15 questions per state plus everything flagged, 0 wrong answers | Practice prototype: 15 of 15 answers right, 3 wording fixes |

We also report each checker's catch rate alone and how often they disagreed. That shows what the second AI adds.

## Map

- Territory count matches the state's manifest
- Graph connected; adjacency symmetric; no county its own neighbor
- Every connection added by hand has a reason
- Regions contiguous; each county in exactly one; at least 2 regions with at least 2 counties each; no placeholder names
- At least 14 territories
- `map.json` under 200 KB (Texas in practice: 95 KB)

## Quiz

- Every county has at least 4 questions across at least 3 categories
- A seat question for every county with a seat, whose answer equals the seat field
- 4 unique choices; answer in range; no duplicate questions; the county named in the question
- No HTML in any text
- Reading level of explanations is reported per state, with a target of grade 5. This is reported and does not block

## Rules and balance

- All rule tests pass on every state's map
- At least 6 deliberately broken rules, all caught by the tests
- Simulated games all finish with a valid winner, no state corruption, and armies conserved
- **Knowledge matters:** in simulated 2-player games between a player who always answers correctly and one who never does, with seats balanced, the correct player wins 60% to 75% of at least 100 games. The tuner raises `quizBonus` until this passes, never going below 2
- **Fair start:** 2-player first-mover win rate between 35% and 65% over at least 100 games per mode. The tuner adjusts `secondPlayerExtra` per state
- **Game length:** 4-player median of at most 35 rounds in Total and 25 in Quick. If a state misses, the builder adds regions and retests. If Total still misses, the state offers Quick only and says so. If Quick misses, the state does not ship

Tuning order: game length, then quiz reward, then second-player armies.

## Browser

Real clicks, at phone, 1366x768 Chromebook and desktop sizes, on the local build and the preview URL:

- A full human turn: quiz, reinforce, attack, fortify, handoff
- Reinforcement total matches the formula, including the quiz reward
- The quiz never hides the highlighted county
- No console errors, failed requests or sideways scrolling

## Security

- No `innerHTML` with game or quiz text; no `eval`; no external scripts; no secrets in shipped files
- No file containing the answer key before verdicts lock
- Content-Security-Policy, X-Content-Type-Options and Referrer-Policy headers set
- Security review run, with findings resolved or listed in `SCORECARD.md`

## Portability

- No state names or hard-coded counts in `js/` or `gates/`
- A new state requires no game code changes
