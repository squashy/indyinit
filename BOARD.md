# Board

Work is tracked on [traverseit.io](https://traverseit.io). Tickets are the unit of work: any operator's agent may take any unblocked ticket. This file defines tickets independently of how a tool connects to the board.

## Ticket format

```
Title:       Short and specific
Role:        designer | dev | content | fact-checker-a | fact-checker-b
Files:       Exact paths this ticket may change
Blocked by:  Ticket IDs
Done when:   A command or check that proves it
```

## Rules

- One agent per ticket. Move it to In Progress before starting.
- Branch `t-<id>`. The pull request links the ticket.
- Tickets that touch `site/js/` or `gates/` run one at a time, so a core change never collides with another. State tickets touch only that state's data and may run in parallel.
- Columns: Backlog, In Progress, In Review, Done, Blocked.
- A person moves a ticket to Done by merging it.
- Blocked more than 20 minutes: tell the other operator.

## Opening backlog

| # | Ticket | Role | Blocked by |
|---|---|---|---|
| 1 | Repo layout, `CONTRACT.md` from template, Vercel project, CI skeleton | dev | |
| 2 | Map builder and map gate | dev | 1 |
| 3 | Engine rule tests and rule-breaking check | dev | 1 |
| 4 | Simulation and tuning harness | dev | 3 |
| 5 | Quiz, ledger and security gates | dev | 1 |
| 6 | Browser gate at phone, Chromebook and desktop sizes | dev | 1 |
| 7 | Prove a bad pull request is blocked | dev | 2, 3, 5, 6 |
| 8 | Page structure and core visual system | designer | 1 |
| 9 | Engine and computer player | dev | 3 |
| 10 | UI wiring | dev | 8, 9 |
| 11 | Verdict merge step, sample of 50 | dev | 5 |
| 12 | Fact-check sample, checker A | fact-checker-a | 11 |
| 13 | Fact-check sample, checker B | fact-checker-b | 11 |
| 14 | Indiana: full fact-check, A and B | both | 12, 13 |
| 15 | Indiana: gaps, explanations, theme | content, designer | 14 |
| 16 | Indiana: tune, gates, deploy | dev | 10, 15 |
| 17 | `build-state` runbook prompt, tested on Ohio | dev | 16 |
| 18 to 22 | Louisiana, Wyoming, Michigan, Virginia, Texas | build-state | 17 |
| 23+ | Bonus states, in `STATES.md` order | build-state | 22 |
