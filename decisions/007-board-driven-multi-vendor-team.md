# 007: Board-driven work across several AI tools

## Current Indiana demo precedence

`CONTRACT.md` and later explicit owner decisions control this demo. Conflicting instructions below are historical, not current release gates. The quiz bonus is fixed at +2 once per turn. Use the supplied repository CSV; do not generate replacement trivia. Factual QA, both-checker verdicts, ledger merge and random factual audits are deferred, not completed. Legacy content quotas do not block this CSV import. Structural mapping and security checks remain required. Hidden benchmark truth labels remain private; supplied gameplay correct letters and answers ship. No hosted CI or previews. Changes use branches and PRs with non-author exact-head approval, local box checks and main-only production deployment. The UI must say "Questions unverified" and must not claim the demo is fact-checked.

**Status:** Accepted for the shared board and the multi-tool queue. The hosted-CI sentence below is superseded for the current Indiana demo.

**Decision:** A traverseit.io board holds the work. Claude Code, GrokBot and Cursor cloud agents take the next unblocked ticket, whichever operator runs them. `CONTRACT.md` controls the current demo. `AGENTS.md` holds the shared working agreement subject to that contract, and `CLAUDE.md` imports it.

**Why:** Two people should each use the tools they are fastest with. Pulling from one queue keeps both busy, and tickets give a visible record from intent to pull request.

**Tradeoffs:** With no fixed lanes, collisions are possible. We limit them three ways: each ticket lists its files, core tickets run one at a time, and state tickets touch only that state's data. Different tools also behave differently, and Claude-only hooks do not protect the others. Historical enforcement was hosted CI. Superseded for the current demo: box checks enforce the gates, and hosted CI and previews stay off.
