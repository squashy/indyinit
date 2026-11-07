# 004: Two independent checkers, planted fakes, published key

## Current Indiana demo precedence

`CONTRACT.md` and later explicit owner decisions control this demo. Conflicting instructions below are historical, not current release gates. The quiz bonus is fixed at +2 once per turn. Use the supplied repository CSV; do not generate replacement trivia. Factual QA, both-checker verdicts, ledger merge and random factual audits are deferred, not completed. Legacy content quotas do not block this CSV import. Structural mapping and security checks remain required. Hidden benchmark truth labels remain private; supplied gameplay correct letters and answers ship. No hosted CI or previews. Changes use branches and PRs with non-author exact-head approval, local box checks and main-only production deployment. The UI must say "Questions unverified" and must not claim the demo is fact-checked.

**Status:** Deferred for the current Indiana demo. Historical decision retained for future explicitly authorized factual QA. It is not Done, and it is not an import or release gate.

**Decision:** Claude and GrokBot judge every claim separately against sources, without seeing each other's verdicts. A question ships only if both confirm it or a person resolves their disagreement. The bank includes planted fakes neither can identify, and a person scores the results. We publish the key at the end of the day so judges can check the score.

**Why:** In practice, about 75 of 508 first-pass facts (about 15%) needed correcting or rewording, despite being written with high confidence. That shows what a checker changed, not what it missed. Planted fakes measure misses. A second vendor reduces the chance that both share one blind spot, and comparing them shows what the second AI actually adds.

**Tradeoffs:** Double the cost and time. Requiring agreement rejects more true questions, especially for small counties with few sources, and disagreements need a person's time. Anything unresolved at freeze is rejected, so we fail safe and may ship fewer questions. Both checkers rely on web sources that can be wrong, and two pages in practice contained instructions aimed at an AI.

**If GrokBot is unavailable:** A fresh Claude session with no shared context runs as checker B. It shares a vendor with checker A, so it is weaker, and the scorecard says so.

**Limits:** Catch rate on our fakes only estimates the rate on natural errors.
