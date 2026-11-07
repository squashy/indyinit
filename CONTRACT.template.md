# Build contract template

Copied to `CONTRACT.md` by the first ticket. It is how agents from different tools work in parallel without colliding. Reusable for another project: keep the structure and replace the formats.

## File ownership by role

A ticket names its role, and the role limits which files it may change.

| Role | Files |
|---|---|
| Designer | `site/index.html`, `site/css/**`, `site/assets/**`, `site/regions/<abbr>/theme.css`, `DESIGN.md` |
| Dev | `site/js/**`, `factory/**`, `gates/**`, `package.json`, CI |
| Content | `site/regions/<abbr>/quiz.json`, `regions/<abbr>/claims.jsonl` (new claims only) |
| Fact-checker A | `regions/<abbr>/verdicts.a.jsonl` |
| Fact-checker B | `regions/<abbr>/verdicts.b.jsonl` |
| Any | A new row in `FAILURES.md` or `metrics/runs.csv` |
| Person | `BARS.md`, `STATES.md`, `decisions/`, `regions/<abbr>/resolutions.jsonl`, `SCORECARD.md` results |

## Layout

```
site/                   everything that ships
  index.html, css/, js/ one game core
  regions/<abbr>/       map.json, quiz.json, theme.css
regions/<abbr>/         region.json, claims.jsonl, verdicts.a.jsonl, verdicts.b.jsonl, resolutions.jsonl (not shipped)
factory/                map builder, pipeline scripts
gates/                  all tests and checks
bank/questions.csv      input, not shipped
```

The page picks its state from `?state=<abbr>`. All fetches are relative.

## Game rules

- 2 to 6 players, each human on a shared device or computer.
- **Setup:** counties dealt evenly at random, each with 1 army. Remaining armies are placed at random.
- **Starting armies, N = territories, p = players:** `max(ceil(N/p) + p, round(BASE[p] * N/92))`, with BASE = 2:60, 3:45, 4:38, 5:32, 6:28.
- **Second player in a 2-player game** gets `map.meta.balance.secondPlayerExtra` extra armies, tuned per state. The tuner starts from `round(15 * N/92)`.
- **Turn:** Quiz, Reinforce, Attack, Fortify.
- **Quiz:** picks a county the player holds, favoring ones not yet asked, with no time limit. A correct answer earns `map.meta.balance.quizBonus` armies, tuned per state and never below 2. The right answer and explanation always show. Computer players succeed 60% of the time. The highlighted county must stay visible at every screen size.
- **Reinforcements:** `max(3, floor(held/3))` + region bonuses + quiz bonus.
- **Region bonus:** `max(2, round(0.33 * size + 0.21 * border crossings))`.
- **Attack:** up to 3 attacking dice (armies minus 1), up to 2 defending. Highest pairs compared; ties go to the defender. On capture, move in at least the dice rolled, up to all but 1. Offers Roll and Blitz.
- **Fortify:** one move, along a path of your own counties. Optional.
- **Winning:** Total (all N), or Quick (`ceil(0.65 * N)` at the end of your own turn). `map.meta.balance.modes` lists the modes a state offers.
- Autosave to localStorage in try/catch, with Continue on the setup screen.

## Engine API

`js/engine.js` is pure, with no DOM, and all randomness comes from an injected rng. Actions return `{ ok: true, ... }`, or `{ ok: false, error }` with state unchanged.

- **Exports:** `createEngine(map, rng)`, `createRng(seed)`, `startArmies(p, N, balance)` returning `{ base, secondPlayerExtra }`, `quickWinCount(N)`, `AI_QUIZ_SUCCESS`
- **Engine:** `newGame`, `allFips`, `income`, `regionsHeld`, `countOwned`, `countiesOf`, `armiesOf`, `setQuiz`, `answerQuiz`, `skipQuiz`, `simulateQuiz`, `place`, `undoPlace`, `attack`, `blitz`, `moveIn`, `fortify`, `fortifyTargets`, `endPhase`, `serialize`, `deserialize`, `checkInvariants`
- `js/ai.js`: `aiStep(engine, state)`, `aiPlayTurn(engine, state)`
- `js/quiz.js`: `loadQuiz(url)`, `pickQuestion(state, data, engine, rng)`, `prepareQuestion(data, pick, rng)`

## `regions/<abbr>/region.json`

```json
{
  "abbr": "in", "name": "Indiana", "fips": "18",
  "unit": "county", "unitPlural": "counties",
  "title": "Battle for the 92", "expectedTerritories": 92,
  "establishedRange": [1790, 1860], "noSeat": [],
  "adjacencyOverrides": [{ "a": "Name", "b": "Name", "reason": "Real crossing" }],
  "regions": [{ "id": "dunes", "name": "Dunes & Michiana", "territories": ["Lake"] }]
}
```

## `site/regions/<abbr>/map.json`

```json
{
  "meta": { "abbr": "in", "name": "Indiana", "unit": "county", "unitPlural": "counties", "title": "Battle for the 92", "fipsPrefix": "18",
    "balance": { "quizBonus": 2, "secondPlayerExtra": 15, "modes": ["total", "quick"] } },
  "viewBox": "0 0 600 917", "stateOutline": "<path d>", "regionBorders": "<path d>",
  "links": [{ "a": "fips", "b": "fips", "reason": "...", "path": "<path d>" }],
  "regions": [{ "id": "...", "name": "...", "bonus": 3, "counties": ["18089"] }],
  "counties": [{ "fips": "18001", "name": "Adams", "region": "...", "path": "<d>", "centroid": [0, 0], "neighbors": ["18003"] }]
}
```

Remove any county listed as its own neighbor. Machine-drawn regions keep `"draft": true` until a person reviews them.

## `site/regions/<abbr>/quiz.json`

```json
{ "18001": {
  "name": "Adams", "seat": "Decatur", "established": 1836, "namedFor": "John Quincy Adams",
  "blurb": "One or two sentences.",
  "questions": [{
    "id": "q-00421", "category": "seat|namesake|people|landmark|history",
    "q": "Text naming the county", "choices": ["A", "B", "C", "D"], "answer": 0,
    "explain": "One or two sentences that teach something.",
    "claims": ["in-18001-003"]
  }]
} }
```

## Fact ledger, one JSON object per line

`regions/<abbr>/claims.jsonl` lists what must be true:

```json
{ "id": "in-18001-003", "questionId": "q-00421", "fips": "18001", "claim": "Plain statement of the fact" }
```

`verdicts.a.jsonl` and `verdicts.b.jsonl` each hold one checker's independent judgment:

```json
{ "claimId": "in-18001-003", "checker": "claude|grok", "verdict": "confirmed|corrected|unconfirmed|false",
  "correction": null, "source": { "url": "...", "title": "..." }, "note": "" }
```

`resolutions.jsonl` holds a person's ruling on a disagreement:

```json
{ "claimId": "in-18001-003", "ruling": "ship|reject", "correction": null, "source": { "url": "...", "title": "..." }, "by": "name" }
```

**Ship rule:** a claim ships if both checkers say `confirmed`, or a person rules `ship`. Anything else, including any `corrected` verdict, is a disagreement. A disagreement unresolved at freeze is rejected. A question ships only if all its claims ship.

## Page contract

`index.html` provides these; `js/` binds to them; styling comes only from the state classes and `data-owner`.

- **Setup `#setup-screen`:** `#player-rows`, `<template id="player-row-template">` with `.player-name`, `.player-type`, `.player-swatch`, `.player-remove`; `#add-player`, `#win-mode`, `#start-game`, `#continue-game`, `#how-to-play`
- **Game `#game-screen`:** `#map-container`, `#turn-banner` (`.turn-player`, `.turn-phase`), `#phase-steps`, `#phase-hint`, `#reinforce-count`, `#end-phase`, `#undo-place`, `#player-list`, `#region-list`, `#county-panel`, `#game-log`, `#menu-button`, `#sound-toggle`
- **Map (injected as `svg#map`):** `path.county[data-fips][data-owner]`, `path.region-borders`, `path.state-outline`, `path.link`, `g.badge[data-fips][data-owner]` containing `.badge-count`, `text.county-label[data-fips]`
- **State classes:** `.is-selected`, `.is-source`, `.is-target`, `.is-quiz`, `.is-dimmed`, `.just-captured`
- **Dialogs:** `#quiz-dialog` (`.quiz-county`, `.quiz-category`, `.quiz-question`, `.quiz-choices`, `.quiz-choice`, `.is-correct`, `.is-wrong`, `.quiz-result`, `.quiz-explain`, `.quiz-continue`), `#battle-dialog` (`.battle-roll`, `.battle-blitz`, `.battle-retreat`, `.die[data-value]`), `#move-dialog` (`.move-range`, `.move-confirm`), `#handoff-dialog` (`.handoff-go`), `#win-dialog`, `#help-dialog`, `#menu-dialog`
- Player colors are `--p0` to `--p5`, with a non-color cue for each.
