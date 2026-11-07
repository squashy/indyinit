# Question bank

## Current Indiana demo precedence

`CONTRACT.md` and later explicit owner decisions control this demo. Conflicting instructions below are historical, not current release gates. The quiz bonus is fixed at +2 once per turn. Use the supplied repository CSV; do not generate replacement trivia. Factual QA, both-checker verdicts, ledger merge and random factual audits are deferred, not completed. Legacy content quotas do not block this CSV import. Structural mapping and security checks remain required. Hidden benchmark truth labels remain private; supplied gameplay correct letters and answers ship. No hosted CI or previews. Changes use branches and PRs with non-author exact-head approval, local box checks and main-only production deployment. The UI must say "Questions unverified" and must not claim the demo is fact-checked.

This note describes the historical benchmark bank. `bank/questions.csv` is not in this repo and is not the importer input. The current input is `inputs/battle-for-the-92-benchmark-1000_nokey.csv`. Its gameplay correct letters ship. The hidden true/fake key described below stays off the repo.

`questions.csv`, in the historical plan, holds true and planted fake questions for every state, shuffled together and unlabeled. Agents treat every row the same.

## Columns

| Column | Example |
|---|---|
| `id` | `q-00421`, unrelated to source or order |
| `state` | `IN` |
| `fips` | `18001` |
| `county` | `Adams` |
| `category` | `seat`, `namesake`, `people`, `landmark` or `history` |
| `question` | Text naming the county |
| `choice_a` to `choice_d` | Four choices |
| `answer` | `A` to `D` |
| `source_url` | Where the claim came from |

## The key

The key lists each ID, whether it is true or fake, and what was altered. It stays off the repo and away from every agent until verdicts lock.

1. **During the day:** the key holder scores states from their own terminal, outside any agent session, and records only totals in the repo.
2. **4:15 PM:** verdicts lock.
3. **4:30 PM:** the key is committed as `bank/revealed.csv`, so anyone can check our catch rate against the verdicts in this repo.

## Scoring reports

- Fakes caught by checker A, by checker B, and by both combined
- True questions wrongly rejected
- How often the checkers disagreed
- Any fake that reached a final quiz, which must be 0

## Limits of this measure

Fakes we wrote only estimate how the pipeline handles natural errors. They may be easier or harder to spot than real mistakes.
