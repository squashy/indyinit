# 007: Board-driven work across several AI tools

**Status:** Accepted

**Decision:** A traverseit.io board holds the work. Claude Code, GrokBot and Cursor cloud agents take the next unblocked ticket, whichever operator runs them. `AGENTS.md` holds the shared rules, and `CLAUDE.md` imports it.

**Why:** Two people should each use the tools they are fastest with. Pulling from one queue keeps both busy, and tickets give a visible record from intent to pull request.

**Tradeoffs:** With no fixed lanes, collisions are possible. We limit them three ways: each ticket lists its files, core tickets run one at a time, and state tickets touch only that state's data. Different tools also behave differently, and Claude-only hooks do not protect the others, so CI is the enforcement.
