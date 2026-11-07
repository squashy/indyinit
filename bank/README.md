# Question bank

`questions.csv` holds true and planted fake questions for every state, shuffled together and unlabeled. Agents treat every row the same.

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
