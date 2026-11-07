# Battle for the 92

An original conquest game that teaches Indiana fourth graders their own county's history, where knowing it wins you armies. Every question has been checked by two independent AIs, and we planted fakes to measure how well that works.

Built at Indy Init on November 7. This first commit is the plan and question bank; everything that runs was built on the day, and the commit history shows it.

## Start here

| File | Purpose |
|---|---|
| `SPEC.md` | What we're building, why, and what "done" means |
| `AGENTS.md` | Rules every agent follows, whichever tool runs it |
| `CLAUDE.md` | Imports those rules for Claude Code |
| `BOARD.md` | Ticket format and opening backlog |
| `CONTRACT.template.md` | Formats and role boundaries that let agents work in parallel |
| `.claude/agents/` | Designer, dev, content and fact-checker briefs |
| `BARS.md` | The pass/fail numbers |
| `STATES.md` | The seven contest states and all 51 jurisdictions |
| `bank/` | Question bank and how it's scored |
| `decisions/` | Choices we made, with their tradeoffs |
| `FAILURES.md` | Where the AI needed correcting, and what we changed |
| `SCORECARD.md` | Results by judging category |
| `metrics/` | Time, tokens and interventions per ticket |
| `RUNBOOK.md` | The day's schedule and the demo |

To begin, an agent reads `SPEC.md` and takes ticket 1 from `BOARD.md`.
