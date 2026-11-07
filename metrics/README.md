# Metrics

One row in `runs.csv` for each finished ticket. This is the evidence for cost, repeatability and how often a person stepped in.

| Column | Meaning |
|---|---|
| `timestamp` | When the row was added |
| `ticket` | Board ticket ID |
| `tool` | `claude`, `grok` or `cursor` |
| `state` | Abbreviation, or blank |
| `territories` | County count |
| `minutes` | Wall-clock time |
| `tokens` | Tokens used; prefix `~` if estimated |
| `est_cost_usd` | Estimated cost, if known |
| `gate_failures` | Failures before passing |
| `human_interventions` | Times a person had to step in |
| `questions_in` | Bank questions for this state |
| `questions_shipped` | In the final quiz |
| `notes` | Anything unusual |

## Practice baseline

Rough numbers from the practice prototype, read from agent usage reports. They may double-count and were not measured for this purpose. Today's measured numbers replace them.

| Agent | Tokens |
|---|---|
| Designer | About 229,000 |
| Dev | About 227,000 |
| Content | About 312,000 |
| Each fact-check batch (5 seen) | About 138,000 to 167,000 |
| Second-pass check | About 117,000 |
