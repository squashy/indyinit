# 008: Tune balance per state by simulation

**Status:** Accepted

**Decision:** The factory simulates each state and sets its quiz reward and second-player armies to meet the bars. If a state runs long, the builder adds regions, then falls back to Quick mode only.

**Why:** A correct answer was worth 2 of the 17 armies on Indiana's first turn, so knowing history barely affected who won. For an educational game, that is the central flaw. Fixed numbers also do not carry across maps: Wyoming has 23 counties and Texas has 254. Simulation is cheap: 330 Indiana games ran in about 31 seconds in practice.

**Tradeoffs:** Simulated players are not children, so tuned numbers are a starting point. The knowledge-matters band is our judgment, and it has not been measured yet. A reward set too high makes the map strategy pointless, which is why the bar has a ceiling.
