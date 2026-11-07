# Contract acceptance

Requirement `sty_aa5e4c5f`. This pull request adds the record. It does not edit the contract, the decision record, or the shared types, and it does not repeat the review.

## Original commits

| Commit | What it adds |
|---|---|
| [`98adc1310ba0ea3d870ee30941a58480d99bbf50`](https://github.com/squashy/indyinit/commit/98adc1310ba0ea3d870ee30941a58480d99bbf50) | `CONTRACT.md`, `decisions/0001-rules.md`, `src/types.ts` |
| [`7e68f16d113a75d8795bfc690f0c76e554c63244`](https://github.com/squashy/indyinit/commit/7e68f16d113a75d8795bfc690f0c76e554c63244) | Specification kit: `SPEC.md`, `BARS.md`, `AGENTS.md`, `README.md`, `RUNBOOK.md`, `STATES.md`, `BOARD.md`, `SCORECARD.md`, `FAILURES.md`, `CONTRACT.template.md`, `bank/README.md`, decisions `001` through `008`, `metrics/README.md`, `metrics/runs.csv`, and the four role briefs under `.claude/agents/` |

An existing review of those two commits is recorded at 8/10. This pull request does not repeat that review and does not change the score.

[Pull request 3](https://github.com/squashy/indyinit/pull/3) merged as [`b7e51528e7de36d98220a3bebfcd79160b6595a8`](https://github.com/squashy/indyinit/commit/b7e51528e7de36d98220a3bebfcd79160b6595a8). It added `tmp-btt-1-pr.md` and did not carry this story id. That merge is left unchanged.

## What the contract commit contains

Read from `98adc131` and still present on this branch's `CONTRACT.md` and `src/types.ts`:

- A fixed award of exactly +2 armies, once, before placement. A repeated answer cannot earn a second bonus. Wrong and skip show +0.
- Engine state is serializable. The random source is an injected `() => number` in `[0, 1)`, and the adapter keeps serializable cursor state. `src/types.ts` declares `Rng`, `Phase`, `Action`, `ParseResult`, and `ReduceResult`.
- Four supplied choices, letters A–D, and a displayed-index answer token. The grader uses the stored letter, not a trusted correct flag.
- Data formats for the map pack, the region pack, and the quiz pack, plus a deferred ledger.
- The DOM surface list in contract section 6.3, including setup, map, quiz, battle, stats, regions, and the trip log. Game text is `textContent`.
- Section 9 maps each listed path to one owner. The contract, the decision records, the root specs, and `src/types.ts` are the files from these commits.

The decision record states the same +2 rule and writes the other economy numbers as proposed defaults. It does not adopt region names or bonus values.

## Left open

- Region count is the expected 8. Names, membership, and bonus values stay open. No names or amounts are adopted here.
- Factual checking of the supplied questions stays deferred. This record does not check them.
- Ledger, verdicts, and the ship-rule merge stay deferred.
- The contract's own acceptance section says the draft types are not runtime validators, and that review did not play a game or claim that the gates had passed.

Those open and deferred items are why the recorded review is 8/10 rather than a claim that every later rule is closed.
