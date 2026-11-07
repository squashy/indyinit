# 006: Where people stay in the loop

**Status:** Accepted

**Decision:** Agents write code, open pull requests and take tickets. People merge, and merging to `main` deploys. People also change bars, rule on fact disagreements, audit 15 random questions per state plus flagged items, and hold the key.

**Why:** Autonomy goes where mistakes are cheap and tests catch them. Merging keeps one human decision between an agent and a child, without adding a release step to an eight-hour day.

**Hard history:** Questions on topics like slavery, the removal of Native peoples, lynching or the Klan follow the same process as any question. The writing brief requires honest, age-appropriate language, but we add no separate review, which keeps the pipeline uniform and fast. The risk is that wording suited to neither a child nor a teacher could ship. A real classroom release would add a dedicated review first.

**Tradeoffs:** Most questions will not be read by a person. We state that plainly to judges.
