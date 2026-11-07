# Scorecard

Organized by the Indy Init rubric, and filled in from real results on the day. Empty means not done. Every result needs its evidence.

## The Build

| Rubric asks | Result | Evidence |
|---|---|---|
| Something real that judges can use | | Production URL |
| How AI shaped the process | | Board, pull requests, `FAILURES.md` |
| Where AI needed correcting | | `FAILURES.md` rows from today |
| Our why | Fourth graders learn their county's history; AI content needs proof | `SPEC.md` |
| Steady commit history | | Repo |
| Tests and pipeline working | | CI link |

## Wildcard: surprise us, swing big

| Claim | Result | Evidence |
|---|---|---|
| States live, of 7 committed | | Production URL |
| Bonus states live | | |
| States not shipped, with reasons | | |
| Fake questions planted | | `bank/revealed.csv` |
| Fakes caught by both checkers combined | | Key holder's score |
| Fakes caught by checker A alone, and checker B alone | | Key holder's score |
| Fakes reaching a final quiz (must be 0) | | Key holder's score |
| True questions wrongly rejected | | Key holder's score |
| Checker disagreement rate | | Verdict files |

## Community Impact: who is better off

| Claim | Result | Evidence |
|---|---|---|
| Indiana counties covered, of 92 | | `site/regions/in/` |
| Shipped Indiana questions with sources | | Ledger |
| Knowing history changes who wins | | Knowledge-matters simulation |
| Works on a phone and a Chromebook-size screen | | Browser gate |
| Reading level of explanations | | Quiz gate report |
| Someone not on the team played it | | Who, and what happened |

## Software Factory: how we built it

| Claim | Result | Evidence |
|---|---|---|
| Built from an empty repo using committed specs | | Commit history |
| Same process across Claude, GrokBot and Cursor | | Pull requests |
| Bad pull request blocked | | Link |
| New state with no code changes | | Commit diff |
| Time, tokens and interventions per state | | `metrics/runs.csv` |

## Known limits

We say these before anyone asks:

- Most questions were not read by a person.
- Hard-history questions had no separate review.
- Our fakes only estimate how the pipeline handles natural errors.
- Sources can be wrong.
- Balance comes from simulated players, not children.
- No fourth grader or teacher has tested it, so we have no evidence yet that anyone learns from it.
- Not tested on: (filled in on the day)
