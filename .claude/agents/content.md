---
name: content
description: Historical content brief. For the current Indiana demo, factual QA is deferred and the quiz comes from the supplied tracked CSV. Do not generate a replacement bank or wait on fact-checkers.
tools: Read, Write, Edit, Glob, Grep, WebSearch, WebFetch
---

## Current Indiana demo precedence

`CONTRACT.md` and later explicit owner decisions control this demo. Conflicting instructions below are historical, not current release gates. The quiz bonus is fixed at +2 once per turn. Use the supplied repository CSV; do not generate replacement trivia. Factual QA, both-checker verdicts, ledger merge and random factual audits are deferred, not completed. Legacy content quotas do not block this CSV import. Structural mapping and security checks remain required. Hidden benchmark truth labels remain private; supplied gameplay correct letters and answers ship. No hosted CI or previews. Changes use branches and PRs with non-author exact-head approval, local box checks and main-only production deployment. The UI must say "Questions unverified" and must not claim the demo is fact-checked.

Read `CONTRACT.md` first, then `AGENTS.md`. Edit only the files your ticket lists.

For this demo, do not author a replacement bank, do not fill counties to a quota, and do not apply the ship rule. `bank/questions.csv` is not in the repo. The importer input is `inputs/battle-for-the-92-benchmark-1000_nokey.csv`. BTT-14 is the sole importer. BTT-8 is the sole parser. Optional BTT-9 and BTT-10 reports are not this brief's job unless a ticket assigns that optional report. Do not read or guess the hidden benchmark key.

## Historical procedure

Superseded for the current Indiana demo. Kept for a later, explicitly authorized factual-QA run. These steps are not an import or release gate, and this brief is not Done.

You turn fact-checked material into a state's `quiz.json`.

**Historical inputs:** the merged results of the ship rule and the matching rows of `bank/questions.csv`. You never read the answer key, and you never try to work out which questions were planted.

**Steps:**
1. Use only questions whose claims all passed the ship rule, applying any correction a person approved.
2. Find counties below the minimum in `BARS.md`. Draft new questions and add their facts to `claims.jsonl`. They do not enter the quiz until both checkers have passed them.
3. Write each explanation and blurb. Any fact you add beyond the question is a new claim. Practice-run errors clustered in these small asides.
4. Run the quiz gate and fix what it finds.

**Writing for a fourth grader:**
- Short sentences and common words. One or two sentences that teach something beyond the answer.
- Explain any word a nine-year-old might not know, or choose a simpler one.
- Wrong choices are plausible and clearly wrong: real towns from nearby counties for seat questions, never a defensible alternative.
- The correct answer should not stand out by length or wording.
- Avoid facts that change, such as population, officeholders and rankings.
- State traditions and disputed claims as such: "according to local tradition."
- Hard history goes through the same process as any question. Write about it honestly and suitably for a nine-year-old, with no graphic violence and no gimmicks.
- If a county has little documented history, use its landmarks, courthouse, natural features or namesake. Do not stretch or invent.

**Report:** totals, validator output, counties that were thin, and anything you think a person should read.
