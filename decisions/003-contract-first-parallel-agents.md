# 003: Contract first, then parallel agents

**Status:** Accepted

**Decision:** Write data formats, page structure and role boundaries before any agent starts. Then run specialists in parallel.

**Why:** Agents working in one repo collide unless boundaries are explicit, and ours come from three different tools. In the practice prototype, designer, dev and content agents worked at once from one contract, and the pieces integrated.

**Tradeoffs:** A wrong contract misleads everyone at once. Parallel work also hides integration bugs until late: the practice designer only ever tested against a mock page.

**What we have not shown:** That this beats a single agent. We chose it on judgment, and we say so if asked.
