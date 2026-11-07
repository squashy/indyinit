# 0001 — Indiana Risk-like rules

## Current Indiana demo precedence

`CONTRACT.md` and later explicit owner decisions control this demo. Conflicting instructions below are historical, not current release gates. The quiz bonus is fixed at +2 once per turn. Use the supplied repository CSV; do not generate replacement trivia. Factual QA, both-checker verdicts, ledger merge and random factual audits are deferred, not completed. Legacy content quotas do not block this CSV import. Structural mapping and security checks remain required. Hidden benchmark truth labels remain private; supplied gameplay correct letters and answers ship. No hosted CI or previews. Changes use branches and PRs with non-author exact-head approval, local box checks and main-only production deployment. The UI must say "Questions unverified" and must not claim the demo is fact-checked.

Status: LOCAL draft for contract-owner review of the economy defaults that are still proposed. Locked user rules are identified below. This file does not authorize board, repository, or deployment action.

Root `CONTRACT.md` controls the current demo, including fixed +2, the tracked CSV, deferred factual QA, and no hosted CI or previews. Proposed details here do not override that policy and do not rewrite structured card ACs. Draft interfaces: `src/types.ts`. Reviewed Nov 7, 2026, America/Indianapolis; the 10:27 AM notes below are historical where they disagree with the later 10:36 AM approval.

## 1. Sources and precedence

Joshua's recorded random-start/random-owned-county quiz and fixed +2 rules override older template tunables and author-generated trivia. CSV is supplied by Joshua and contains gameplay questions, possible answers and correct answers; correct answers ship for static grading. Schema is **settled by PO inspection** (`/workspace/traverse-drafts/b92/csv-inspection.json`): 1,000 rows, all 92 counties, UTF-8 BOM, comma-separated, four supplied choices and correct letter/answer; see CONTRACT.md §5.1 for exact columns. This agent read the inspection report, not the CSV file. Source is recorded in CONTRACT.md §5.1 without assigning meaning to its filename. Target: Joshua’s **“shoot for 3pm eastern”**, approximately **3:00 PM America/Indianapolis** on Nov 7, not a commitment. Public reference https://battle-for-the-92.vercel.app/ confirms 2–6 players, four phases, +2, income formula, eight regions, adjacent attacks, dice/ties, occupation, owned-path fortify, hot-seat/autosave, Total92 and Quick60. Public help text does not establish exact start pools or the second-player advantage. Original SPEC/template/decisions were not available during this review; defaults below are identified from fresh BTT-1 ACs and explicit architectural proposals, not asserted template fidelity.

## 2. Setup — locked random ownership; proposed army defaults

- Indiana pack must validate exactly 92 known counties; **8 regions is expected**, but region names, membership and bonuses are **OPEN**, not verified or invented here. All counties are assigned exactly once; no neutral counties, capital protection or unowned territory.
- 2–6 seats, each human or local computer; seat order is setup order, first seat acts first. No network or accounts. AI is ordinary local code, not runtime AI service.
- Seeded Fisher–Yates shuffle of all county ids, then round-robin deal by seat, giving count differences at most one. Starting ownership is random (locked); this exact even-deal algorithm is proposed. Inject RNG in [0,1); no Math.random inside the engine.
- Proposed **total starting armies per player**, including the one initially put on each assigned county: 2 players:60; 3:45; 4:38; 5:32; 6:28. These pools exceed county allocation in every case.
- Proposed two-player balance default: **second seat receives 15 extra starting armies once**, not each turn. No tunable secondPlayerExtra setting. This is not live-reference-verified or human-approved.
- Proposed remaining-army distribution: repeatedly sample uniformly from that player's held counties and add one until their starting total is placed. This completes setup automatically without a draft/pick phase. One army per county counts inside the total, never in addition. After setup there are no unplaced starting armies.
- Default mode Quick60; Total92 optional. Default mode and army balance are proposed; both modes' thresholds are canonical.

## 3. Turn start and quiz — locked reward, supplied full coverage

1. Skip eliminated seats. Increment turn sequence once. Snapshot current player's owned counties.
2. Locked: draw a **random currently owned county**, then ask a question from that county's imported CSV-derived pool; display/highlight its name. Uniform selection is the proposed interpretation of random. No preference for unasked counties; that biases selection. Within the selected county, draw among unasked questions until exhausted, then reset that county's question history.
3. The confirmed CSV has `Q#, FIPS, County, County Seat, Established, Named For, Category, Question, Choice A, Choice B, Choice C, Choice D, Correct Letter, Correct Answer, Explanation`. Preserve all four choices A–D, correct letter and answer. Key questions by FIPS. Explanation is optional to show. No generated distractors, typed-answer replacement, columns or filler. Display shuffling retains original correct-letter mapping.
4. No timer. Bind the pending question and county to this turn sequence. UI sends question id/answer token; engine evaluates the pending question, not a trusted caller correctness flag. On first valid correct submission add **exactly 2** to the current turn's reinforcement pool. Wrong or explicit skip awards **0**. Close quiz on first answer/skip, including wrong answers. Repeated, stale, foreign-county and out-of-phase submissions award **0** and leave state unchanged if illegal. No extra award on Continue or duplicate event processing.
5. Wrong/skip shows the correct answer and only a supplied explanation. Missing explanation is not permission to write one. Quiz and POI browsing are distinct.
6. **Joshua's exact rule:** “If the selected county has no question, draw a question from another county the player currently owns.” **Architect interpretation:** choose uniformly among other owned counties that have questions. **Architect default (not Joshua-approved):** if no owned county has questions, skip with **0 bonus**. This is an architect default, not a user-approved decision. All counties have questions in the supplied file, so the default is defensive.

## 4. Reinforcements and regions

- Income per turn: `max(3, floor(ownedCountyCount / 3)) + sum(fullyOwnedRegionBonuses) + earnedQuizBonus`, with earnedQuizBonus **0 or 2 only**. Quiz resolves before spending any pool. Compute base/regions once from turn-start ownership; no mid-turn extra region income.
- All new armies must be placed on currently owned counties before attacking. Positive integer placements only, at most remaining pool; no overdraw or enemy placement. When pool reaches zero advance to attack exactly once.
- **Region names, membership and bonuses are OPEN.** The live reference establishes **8 as the expected count**, not verified details. No formula, made-up region names, memberships or bonus values are adopted here. Resolve reviewed data before claiming live region parity; UI and engine must consume the same eventual data.
- No card/trip exchange bonus, escalating trades, army cap or second-seat recurring income. Pools, deployments, casualties and quiz income are separately accounted; army total is not conserved across turns.

## 5. Attack, dice, capture and blitz

- Attack optional and repeatable. Origin belongs to active player, has at least 2 armies; target belongs to an enemy and shares a real border. Corner contact is not adjacency. Reject wrong phase/unknown county/self-attack and nonintegral counts with original state and no RNG use.
- Attacker chooses 1..min(3, originArmies-1) dice; defender automatically rolls min(2, targetArmies). Fair integer d6 from injected RNG. Sort each side descending; compare corresponding pairs up to the smaller count. Lower die loses one army; ties cost the **attacker** one. Unpaired dice do nothing.
- Target at zero enters explicit **occupation** state. Store origin, target and final attacking-dice count. Capturing player must move `n` armies where finalDiceCount <= n <= originArmies-1. No other action is legal until occupation completes. After movement target owner changes, target has >=1 army, source >=1. During transient occupation, zero armies are permitted only on that pending target; deserialize/invariants recognize this state.
- Ownership/elimination and Total92 win are evaluated **after occupation**, never while target is zero. No card transfer on elimination. Repeated occupation submission is rejected.
- Roll means one combat roll. Blitz repeats legal rolls with maximum available dice until capture, source down to one, or cancellation between rolls. Blitz stops at capture for mandatory occupation; it cannot chain to another target or choose movement silently. UI yields between finite batches so Stop/rest controls respond. AI follows same legal steps and has a finite turn budget; exhaustion ends attacks, not an invented winner.
- If no legal attacks remain, player can end attacks. Even if legal attacks remain player may stop. End attacks advances to fortify. No mandatory attack.

## 6. Fortify and end of turn

- After attacks, at most **one optional** fortification: different owned source/target connected by a path consisting entirely of owned counties, moving a positive integer no greater than sourceArmies-1. Intermediate counties are unchanged. Enemy bridges invalidate path. Result leaves at least one at source. Successful fortify ends the turn; skipping fortify also ends it. No zero-distance or repeated fortification.
- Evaluate Quick60 before handoff. If no winner, select next non-eliminated seat circularly and show handoff for a human recipient; computer proceeds with visible pacing. Acknowledge handoff starts that recipient's quiz once; repeated acknowledgement does nothing.
- Eliminated player has zero counties, receives no income/quiz/actions and never appears as active recipient. If only one seat remains it holds every county and Total92 resolves after the final occupation.

## 7. Win conditions and ordering

- **Quick60:** at least 60 owned counties **at the end of that player's own turn**. This is `ceil(65% × 92) = ceil(59.8) = 60`, not 59, not “strictly greater than 65%” and not a conflicting older threshold. Reaching 60 during attacks does not end Quick60 before optional fortify.
- **Total92:** all 92 counties. Proposed timing is immediately after mandatory occupation completes for final capture. Public help explicitly pins end-of-own-turn timing for Quick but not Total; this timing is an architectural default for adoption.
- Ordering: resolve losses → pending occupation → finish occupation → mark elimination → Total92 check → resume attack if no winner. For Quick: end attacks → optional fortify → end-turn threshold check → winner OR next-seat handoff. Never hand off before testing Quick victory.
- Winner terminal state accepts no game actions, adds no more income and schedules no next quiz. No draws, timed victories, round limit or simulation “timeout winner.” Legitimate terminal games are not stalls.

## 8. Cards, trips, browsing and saves

No territory cards, deck, sets, trading or trip bonus are established by the reference help. **Not included.** “Trip log” means phase/quiz/combat narrative, not a tradable resource. Adding cards would be a new product decision. County POI browser is separate educational UI; show only supplied pack facts and do not infer trivia from decorative labels.

Autosave after each accepted action with guarded localStorage reads/writes. Save envelope version, pack compatibility, game config, current phase, pending quiz/mapping, occupation, pool, turn sequence/history and RNG cursor/state are validated on Continue. Corrupt/incompatible save produces a clear recoverable message; do not grant quiz twice or silently reset. Storage failure never blocks live play. Pure engine performs no storage, timers, network or DOM effects; adapters own them.

## 9. AI and verification

Optional computer player uses legal engine actions only and a proposed 60% quiz-correct probability, sampling via injected RNG. It must submit a real correct/incorrect token; no direct army mutation or bonus action. Wrong token must actually be wrong. Do not fabricate answer choices for this purpose. If no approved quiz interaction exists, implementation is blocked, not permission to bypass grading. UI can skip animation but not change logical outcome. Bound actions per turn and yield to browser; no infinite battle loop.

Focused tests: exact 92-county deal coverage and seed variation; pools counting county armies; second-seat extra once; uniform-source selection via controlled RNG; county/name binding; correct +2 once; wrong/skip/repeat/out-of-phase 0; missing-content redraw from another owned county, and zero-bonus skip when no owned county has questions as architect default (not Joshua-approved); income and eventual adopted region data; dice/ties; mandatory occupation; blitz stop; owned-path fortify; eliminated-seat skipping; Total/Quick timing; round-trip saves; invalid action returns original state without RNG use. Regression accounting is initial + created - casualties, not constant total. Simulations report balance, never tune the locked +2.

## 10. Departures and open adoption

- Vite/TypeScript supersedes vanilla JS; no runtime AI/backend/accounts. The Vite layout in `CONTRACT.md` §8 is **ADOPTED**. The earlier note that the layout was still only proposed is superseded for that adopted tree. Region names, membership, and bonuses remain **OPEN**.
- Current content scope is minimal CSV parsing and import of the tracked file `inputs/battle-for-the-92-benchmark-1000_nokey.csv`. `/workspace/battlefor92/inputs/battle-for-the-92-benchmark-1000_nokey.csv` is the original intake copy only. Remote builders must not depend on that shared box path. The approved pack **name** remains `public/data/quiz.json`. The tracked pack is `data/quiz.json`. `CONTRACT.md` §8.1 records that split. Do not create a second pack or treat this note as adopting a new path. Report missing coverage, categories, and choices separately. Neither legacy 4-question/3-category/seat/choice minima nor an older CSV proposal silently overrides supplied data. Do not reject rows over unagreed columns or fabricate content. **Quota policy OPEN; no fact-check quotas now. Independent Q&A verification, fact-checking, and claim ship rules are deferred, not Done, and are not import prerequisites.**
- Single CSV flow: tracked CSV → **BTT-8** pure `factory/parse-quiz-csv.ts` (text → typed rows + validation report, no I/O) → **BTT-14** sole importer `factory/import-quiz.ts`, explicit `--csv`, `--map`, and `--out` → one quiz pack (`CONTRACT.md` §8.1) → optional **BTT-9/10** reports. Those reports are not import or release prerequisites. No overlapping converters or importers. BTT-9/10 read the imported pack and `QuizQuestion` from `src/types.ts`, never raw CSV.
- Joshua, 10:27 AM America/Indianapolis: **“don't spend anytime yet on verifying q&a”**. Independent checker/verification/fact-check work is deferred and never blocks conversion. `resolutions.jsonl` is **human-only and deferred**, not BTT-14-owned. No board changes or new stories.
- Hosted CI and Vercel previews are **decided off** by the 10:36 AM ET approval. The earlier sentence that those cuts were OPEN is superseded. Simulation quotas remain **OPEN**. Box checks, then production deploys from `main` after non-author exact-head approval. This file authorizes no external action.

## 11. Open items

1. Expected eight regions: **names, membership and bonuses OPEN**; no invented specifics.
2. General gameplay quota policy for future inputs: report missing coverage/categories/choices separately, no unagreed-column rejection or fabrication. **No fact-check quotas now.** Independent Q&A verification/fact-checking are deferred, not import gates.
3. **Architect default adoption:** uniform eligible-owned choice is architect interpretation; no-eligible-owned skip-with-0 is architect default (not Joshua-approved). BARS no-key rule concerns hidden true/fake benchmark labels, not gameplay answer fields. Gameplay correct answers ship; hidden labels/truth key must not ship.
4. Hosted CI and Vercel previews are **decided off**. The older open-conflict note is superseded. Simulation cuts, quotas, and final release evidence still need reconciliation.
5. Proposed setup pools, even-deal implementation, automatic placement, second-seat +15, AI probability, default mode and Total92 timing require adoption.
6. Interfaces, exclusive ownership of files not yet reserved, and human review of still-proposed economy defaults. The approved quiz destination **name** remains `public/data/quiz.json`. The tracked path is `data/quiz.json` (`CONTRACT.md` §8.1). That split is unresolved. This item does not adopt a new path.
7. Implementation/release operator, merger, unresolved hold and authorized AC-update route; no board/external action allowed here.
8. Original SPEC/template differences not reviewed; no approved freeze/deployment milestones. Joshua’s “shoot for 3pm eastern” target is approximately **3:00 PM America/Indianapolis** on Nov 7, not a commitment.

**Confirmed:** exact schema/FIPS binding and full county coverage in the supplied file; four choices, gameplay correct letter/answer and optional explanation; random setup/owned-county quiz, +2 once and Quick60=60. **Joshua rule:** draw from another owned county if selected county has no question. **Architect interpretation:** uniform eligible-owned choice. **Architect default (not Joshua-approved):** skip with 0 if no owned county has questions; not a user-approved decision. BTT-8 parser → BTT-14 sole importer → one quiz pack → optional BTT-9/10 reports; verification deferred, not Done; no new stories. Intake checksum and PR 9 provenance stay in `CONTRACT.md` §5.1. BTT-1 maps to CONTRACT.md §14. Proposed §13 details do not override the current demo policy and do not rewrite structured card ACs.
