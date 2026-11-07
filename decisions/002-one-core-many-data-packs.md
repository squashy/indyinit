# 002: One game core, one data pack per state

**Status:** Accepted

**Decision:** One repo and one deployment. Each state is a folder of data: map, quiz, theme and tuned balance numbers, selected with `?state=in`.

**Why:** A fix reaches all states at once, and it proves the factory works: a new state means new data and no new code.

**Tradeoffs:** A bad core change can break every state, so core changes run the gates across all shipped states. States cannot have custom rules, which is why jurisdictions with very few counties are out of scope today.

**Evidence:** In a practice sweep, with armies scaled to map size, the same engine finished games on maps from 14 to 254 territories.
