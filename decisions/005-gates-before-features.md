# 005: Gates before features, enforced in CI

**Status:** Accepted

**Decision:** Build the checks first and enforce them in CI. Deliberately break rules to confirm the tests notice.

**Why:** Agents report success confidently, so the system must not depend on their reports. We use three agent tools, and only CI applies to all of them. Simulation found what no one had looked for: first players won about 87% of 2-player games. A rule-breaking check found a blind spot: a wrong quiz bonus got past the tests.

**Tradeoffs:** A slower first hour of eight. If CI itself breaks late in the day, everything waits on it.
