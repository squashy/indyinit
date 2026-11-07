# Runbook: November 7

## Current Indiana demo precedence

`CONTRACT.md` and later explicit owner decisions control this demo. Conflicting instructions below are historical, not current release gates. The quiz bonus is fixed at +2 once per turn. Use the supplied repository CSV; do not generate replacement trivia. Factual QA, both-checker verdicts, ledger merge and random factual audits are deferred, not completed. Legacy content quotas do not block this CSV import. Structural mapping and security checks remain required. Hidden benchmark truth labels remain private; supplied gameplay correct letters and answers ship. No hosted CI or previews. Changes use branches and PRs with non-author exact-head approval, local box checks and main-only production deployment. The UI must say "Questions unverified" and must not claim the demo is fact-checked.

The schedule below is the historical benchmark day. Hosted CI, the fact-check sample, quiz tuning, verdict freeze, and publishing `bank/revealed.csv` are not current demo gates. Box checks and non-author exact-head review are the current path. Production deploys only from `main`.

Submissions close at exactly 5:00 PM on Devpost, with no late entries.

## Schedule

| Time | Goal | If we miss it |
|---|---|---|
| 9:00 | Kickoff. Commit this kit as the first commit. Seed the board | |
| 9:00 to 10:15 | Foundation: CI, gates, bad pull request blocked | Keep map, quiz and rule gates; drop the rest to a later ticket |
| 10:15 to 12:00 | Game core playable on Indiana | Nothing else starts until one turn plays |
| 12:00 | **First Devpost draft submitted** | Do it anyway |
| 12:00 to 12:30 | Fact pipeline on the 50-question sample, scored | Fix before scaling |
| 12:30 | Lunch; agents keep running | |
| 1:00 to 2:00 | Indiana fully checked, tuned and live | Everything else waits. Indiana is the pilot |
| 2:00 to 3:45 | Proving states | See cut rule below |
| 3:45 to 4:15 | Bonus states, polish | |
| **4:15** | **Freeze.** Verdicts lock; unresolved disagreements are rejected | No exceptions |
| 4:15 to 4:30 | Final scoring; commit `bank/revealed.csv` | |
| 4:30 to 4:50 | Scorecard, Devpost final, rehearse | |
| 4:50 | Submit | |
| 5:00 | Judges at our table | |

**Cut rule:** when time runs short, cut states instead of skipping gates, from the end of this order: Indiana, Ohio, Louisiana, Wyoming, Michigan, Virginia, Texas. A state not shipped is listed with its reason.

## Proving states

| State | What it tests |
|---|---|
| Ohio | Similar to Indiana, so failures expose hidden Indiana assumptions |
| Louisiana | Parishes, so any hard-coded "county" shows up |
| Wyoming | Small and slow, testing the game-length fallback |
| Michigan | A bridge to the Upper Peninsula |
| Virginia | Independent cities with no seat, a cut-off Eastern Shore, and repeated names |
| Texas | Largest at 254, testing speed and phone legibility |

## Devpost

One teammate creates the project and adds the other. It needs the project name, a short description of what it does and how it was built, and the public repo link.

## At the table: about 5 minutes per judge

Any teammate may be asked, so both of us can give this demo and answer every question below.

1. **Our plan (20 seconds):** "We aimed for Wildcard and Community Impact, and the factory is how we built it."
2. **Who and why (40 seconds):** A fourth grader in Indiana studying state history. AI can write that content, but how would you know it's true?
3. **Play it (60 seconds):** One turn on a phone. A correct answer earns armies, and simulation shows knowledge changes who wins.
4. **The trust number (60 seconds):** "We planted fakes. Two AIs from different vendors caught X%, and none reached a child. The key is in the repo, so check us."
5. **The machinery (60 seconds):** A ticket on the board, an agent's pull request, a blocked bad change, and a new state with no code changes.
6. **Where AI needed correcting (30 seconds):** One real row from today's `FAILURES.md`.
7. **What's next (10 seconds):** A real fourth-grade class.

Have open before the judge arrives: the production URL on a phone, the repo, CI, the board, `SCORECARD.md`, `FAILURES.md`.

## Questions judges may ask

**What did you decide, and what did the AI decide?** We decided the problem, the audience, the bars, the ship rule and what needs a person. Agents wrote the code and checked facts inside those limits. `decisions/` and `FAILURES.md` show this.

**Where did the AI need correcting?** Use today's rows in `FAILURES.md`.

**Why two AIs?** Each may have blind spots, and a shared blind spot is how a fake reaches a child. We compare each one's catch rate alone with both together: (today's numbers).

**Why several agents and tools at all?** We use the tools we're each fastest in, and the board and CI hold it together. We have not shown this beats one agent.

**How do you know your fakes are realistic?** We don't fully. They only estimate how the pipeline handles natural errors.

**How much did a person actually read?** A random 15 per state, flagged items and disagreements. Most questions weren't read by a person.

**How do you handle hard history for nine-year-olds?** Same process as all questions, with an honest and age-appropriate writing brief. We know that's not enough for a real classroom, and it's the first review we'd add.

**What stops a fake reaching a child if a gate is bypassed?** A person's merge and the ledger check in CI. Bypassing either takes a deliberate human act, recorded in the repo's history.

**What does a state cost?** (today's numbers from `metrics/runs.csv`)

**What breaks first with a whole district on it?** Hosting shouldn't, since it's static files. Content trust would: more use means more people finding errors, and we'd need a way for teachers to report them.

**Does anyone actually learn from this?** We don't have that evidence yet. It's the next thing to test.

**Did you build this before today?** We prototyped before the contest to learn, and those lessons are in `FAILURES.md`. No code came with us; the commit history shows today's build.
