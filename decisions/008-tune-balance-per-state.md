# 008: Tune balance per state by simulation

## Current Indiana demo precedence

`CONTRACT.md` and later explicit owner decisions control this demo. Conflicting instructions below are historical, not current release gates. The quiz bonus is fixed at +2 once per turn. Use the supplied repository CSV; do not generate replacement trivia. Factual QA, both-checker verdicts, ledger merge and random factual audits are deferred, not completed. Legacy content quotas do not block this CSV import. Structural mapping and security checks remain required. Hidden benchmark truth labels remain private; supplied gameplay correct letters and answers ship. No hosted CI or previews. Changes use branches and PRs with non-author exact-head approval, local box checks and main-only production deployment. The UI must say "Questions unverified" and must not claim the demo is fact-checked.

**Status:** Superseded for the current Indiana demo. The historical decision is retained. The quiz award is fixed at +2 once per correct answer and is not tuned. Simulation quotas remain OPEN.

**Decision (historical):** The factory simulates each state and sets its quiz reward and second-player armies to meet the bars. If a state runs long, the builder adds regions, then falls back to Quick mode only. Do not apply the quiz-reward tuner to this demo.

**Why:** A correct answer was worth 2 of the 17 armies on Indiana's first turn, so knowing history barely affected who won. For an educational game, that is the central flaw. Fixed numbers also do not carry across maps: Wyoming has 23 counties and Texas has 254. Simulation is cheap: 330 Indiana games ran in about 31 seconds in practice.

**Tradeoffs:** Simulated players are not children, so tuned numbers are a starting point. The knowledge-matters band is our judgment, and it has not been measured yet. A reward set too high makes the map strategy pointless, which is why the bar has a ceiling.
