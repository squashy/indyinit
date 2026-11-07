# 005: Gates before features, enforced in CI

## Current Indiana demo precedence

`CONTRACT.md` and later explicit owner decisions control this demo. Conflicting instructions below are historical, not current release gates. The quiz bonus is fixed at +2 once per turn. Use the supplied repository CSV; do not generate replacement trivia. Factual QA, both-checker verdicts, ledger merge and random factual audits are deferred, not completed. Legacy content quotas do not block this CSV import. Structural mapping and security checks remain required. Hidden benchmark truth labels remain private; supplied gameplay correct letters and answers ship. No hosted CI or previews. Changes use branches and PRs with non-author exact-head approval, local box checks and main-only production deployment. The UI must say "Questions unverified" and must not claim the demo is fact-checked.

**Status:** Gates-before-features remains the working order. Hosted CI as the enforcer is superseded for the current Indiana demo. Run the gates on the box. Do not configure hosted CI or previews.

**Decision:** Build the checks first. Deliberately break rules to confirm the tests notice. The historical wording enforced those checks in hosted CI. That enforcement path is superseded; box checks are the current enforcer.

**Why:** Agents report success confidently, so the system must not depend on their reports. We use three agent tools. The historical plan used hosted CI because it was the only check that applied to all of them. For this demo, the shared enforcer is the box gate command. Simulation found what no one had looked for: first players won about 87% of 2-player games. A rule-breaking check found a blind spot: a wrong quiz bonus got past the tests. The current award stays fixed at +2 once and is not tuned to repair that historical finding.

**Tradeoffs:** A slower first hour of eight. The historical risk was that a broken CI pipeline stopped the day. The current risk is a broken box-gate command. Hosted CI is not the fallback.
