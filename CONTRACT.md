# BattleFor92 — CONTRACT.md (BTT-1)

**Status:** LOCAL design draft for PO vetting; not approval to implement, push, deploy, clear holds, or change board state. Existing card statuses are preserved. Reviewed against fresh read-only story snapshot on Nov 7, 2026, America/Indianapolis.  
**Card:** BTT-1 (`sty_aa5e4c5f`) · Architect: squashy-gb-chuck  
**Drafted:** 2026-11-07 ~10:22am America/Indianapolis  
**Specs location (until committed):** `/workspace/battlefor92/scope/`  
**Target repo:** https://github.com/squashy/indyinit (public; allowlist/card repo fields may still be unset)

---

## Approvals (Joshua via CoS, 10:36am ET 2026-11-07, verbatim)

> "Approve the proposed Vite layout; authorize Chuck to push the contract and source specs to squashy/indyinit as the first commit; allow merge commits after non-author exact-head approval; keep hosted CI and previews off, using box tests and production deploys from main; sign off BTT-1's approves-readying human step."

Effect on this document: §8 layout is **ADOPTED**. Release/CI in §2 is **DECIDED**: no hosted CI, no Vercel previews; tests run on the box; production deploys from `main`. Merges are merge commits after a non-author APPROVE at the exact head. Items in §11 not covered by this quote stay open.

## 0. Purpose

This draft records locked user rules and proposes remaining product rules, release gates, pure-engine interfaces, data formats, and **exclusive per-file ownership** so builders can ship without colliding. Architect designs only: **no coding, no deploy, no main push.**

Reference product (Joshua: “what we are building”): https://battle-for-the-92.vercel.app/

---

## 1. Locked product & stack

| Item | Decision | Authority |
|------|----------|-----------|
| Product | Risk-like game on Indiana’s 92 counties; shared-device hot-seat | Joshua / PO |
| Players | 2–6, each human or computer | PO live review + AC |
| Maps / victory | **Total** = own all 92; **Quick60** = own **at least 60** counties at end of own turn; **65% of 92 = 59.8, rounded UP = 60** (`ceil(0.65*92)`). **Total92** = all 92; UI may label modes Quick/Total | PO confirmed; AC4 |
| Stack | **Vite + TypeScript**, plain **DOM/SVG**, static JSON packs | Joshua via CoS ~10:17am ET |
| Hosting | Static on **Vercel**, **main-only** production | Brief / release plan |
| Out of scope | No backend, no accounts, no runtime AI. Hosted CI, preview and simulation cuts are **OPEN**, not decided. | Joshua / PO rulings |
| Fonts / scripts | **System/local fonts only**; no external Google Fonts; no external scripts | BTT-15 AC (supersedes older Bevan/Overpass/Source Serif 4 note) |
| Visual keep | Parchment/quilt-style county map with labels + army counts; regional bonus panels; phase + trip log; player stats; **separate** county points-of-interest browser (not the quiz) | PO live review |
| Target | Joshua: **“shoot for 3pm eastern”** — Nov 7, approximately **3:00 PM America/Indianapolis**, a target, not a commitment. Freeze/deploy milestones are unapproved and must not imply a later target. | Joshua |

Public material is anonymous. No secrets and no named-bot dependencies in product code.

---

## 2. Release & ownership of implementation (CI/preview cuts DECIDED, see Approvals)

- **Architect does not code or deploy.** Implementation/release owners are external to Architect.
- Coding via **Cursor CloudAgent** on **isolated branches / work snapshots**, not inline box coding of product.
- **Release operator** assembles the **exact combined candidate**, runs **box gates before any main push**, then production deploy + public smoke.
- Box gates (required before main): **typecheck**, **focused rules/data tests**, **production build**, **one local full-turn smoke**.
- After main: necessary prod deploy + public gameplay / assets / headers smoke.
- Few milestone main pushes — do **not** launch one worker per story or auto-push main.
- **Block release:** privacy, secrets, core gameplay failures.
- Privacy, secrets and core gameplay remain blocking. **OPEN:** whether hosted CI, previews, simulations or their release quotas are cut; no proposal or stale card text settles this.
- Current content scope is **minimal CSV parsing and import**. Independent Q&A verification and fact-checking are **deferred**, not import prerequisites; there are **no fact-check quotas now**. General content/coverage/category/choice policy remains OPEN and must not silently override supplied data.

---

## 3. Quiz & setup (user rules locked; explicitly marked defaults/open decisions are not)

### 3.1 Starting counties

- At game start, **all 92 counties** are assigned by **random deal**, each county to **exactly one** player.
- **Even deal** is the default (as even as integer division allows) unless a conflict is found and PO revises.

### 3.2 Turn-start quiz source

- At **each turn start**, pick a **random county the current player owns at that moment**.
- The question **must** come from that county’s quiz pool.

### 3.3 Award

- **Correct** answer: exactly **+2 armies**, **once**, at turn start, **before** placement/reinforcement spend.
- Wrong / skip / repeat attempt / out-of-phase: **0**.
- Fixed **+2** — **not tunable**. No template/default reward override beyond this recorded constant.

### 3.4 Content source

- **Joshua supplies questions and answers as a CSV.**
- **Nobody generates a replacement trivia bank.**
- See **§5 CSV intake**. Generative drafting on BTT-9/BTT-10 is **superseded in product intent**; remapping those Ready cards is a **PO/product follow-up**, not a silent Architect rewrite of Ready ACs (story edit is Inbox-only).

### 3.5 Confirmed CSV; Joshua rule and architect defaults

The schema is confirmed by PO’s `/workspace/traverse-drafts/b92/csv-inspection.json`: 1,000 gameplay questions cover all 92 counties, 8–13 per county, each with four supplied choices and a correct letter/answer. Use that schema (§5.1); no interaction/schema decision remains open for this file.

**Joshua's exact rule:** “If the selected county has no question, draw a question from another county the player currently owns.”

**Architect interpretation:** choose uniformly among the other owned counties that have questions. Uniform choice among eligible counties is an interpretation, not part of Joshua's quoted wording.

**Architect default (not Joshua-approved):** if no owned county has any question, skip and award **0**. This is an architect default, not a user-approved decision. All counties have questions in the inspected file, so the fallback is defensive.

Even-as-possible random deal remains a proposed implementation default; random assignment and Quick60 rounding are already resolved.

---

## 4. Explicit draft engine rules (adoption status distinguished)

Detailed, testable rule decisions are in `decisions/0001-rules.md`. This draft resolves the design choices for review, but does not claim human adoption. Items labeled **recommended** are for contract-owner adoption from card ACs — **not** newly Joshua-approved.

### 4.1 Recommended defaults (AC3 / AC4 — awaiting explicit adoption)

| Topic | Recommended default |
|-------|---------------------|
| Starting armies in pool | Even random deal; **one army already counted on each held county** inside the starting pool |
| Indiana pools | **60 / 45 / 38 / 32 / 28** for **2 / 3 / 4 / 5 / 6** players |
| Two-player balance | Fixed **second-player +15** |
| Reinforcement | `max(3, floor(held/3)) + regionBonuses + earnedQuizBonus` where earnedQuizBonus ∈ {0, 2} |
| Region bonus | **OPEN** — no names, membership, bonus values or formula have been verified/adopted. Do not invent them. |
| Region count | **8 expected** from live reference; names, membership and bonuses remain **OPEN**. |
| Combat | Attack **adjacent** enemy only; attacker up to **3** dice, defender up to **2**; **defender wins ties** |
| Capture | Move in **at least** the number of final attacking dice; **leave ≥1** on origin |
| Fortify | **One** optional fortify along a path of **owned** counties |
| AI | Optional; configured **60%** quiz success; uses engine actions only |
| Autosave | `localStorage` in **try/catch**; failure must not block play |

### 4.2 Settled turn / elimination / victory

| Topic | Settlement |
|-------|------------|
| Eliminated players | **Skipped** for turn order; no quiz, income, or actions |
| Occupation | After a successful capture, **mandatory occupation move** completes **before** further attacks/fortify/end-turn |
| Blitz | Optional multi-attack in attack phase; **stops** on capture (mandatory occupation), origin down to one army, explicit cancellation between rolls, or game over; never continues through occupation |
| Victory ordering | Total92 wins immediately after completed occupation of the last enemy county; Quick60 checks ≥60 **at the end of the active player’s own turn**, after optional fortify and **before** next-player handoff. This Total92 timing is a proposed default; reference explicitly pins end-turn timing only for Quick60. First player who meets the mode’s condition wins. Simultaneous multi-winner is impossible under sequential turns. |
| No-question county | Joshua: draw from another currently owned county. Uniform eligible-owned sampling is architect interpretation; if none have questions, skip with 0 is **architect default (not Joshua-approved)**. See §3.5. |

### 4.3 Phase order (per turn)

1. Turn start → select random owned county → quiz (Joshua redraw rule; no-eligible-owned zero-bonus skip is architect default, not Joshua-approved, §3.5)  
2. Apply +2 once if correct (before placement)  
3. Placement / reinforcement  
4. Attacks (optional, adjacent; occupation mandatory on capture)  
5. One optional fortify  
6. End turn → Quick60 win check → handoff only if no winner; Total92 is checked after completed occupation  

---

## 5. CSV parsing and import — current scope

### 5.1 Confirmed source and exact schema

PO inspection record: `/workspace/traverse-drafts/b92/csv-inspection.json`.
Shared-path input: `/workspace/battlefor92/inputs/battle-for-the-92-benchmark-1000_nokey.csv`. The CSV stays at this shared box path; it is **not hosted on Traverse**. Traverse stores references/coordination only.
Original source: `C:\Users\josh\claude\robinhood\battle-for-the-92-benchmark-1000_nokey.csv` on **DESKTOP-LRQJSFF**.

Inspection confirms **1,000 rows**, **all 92 Indiana counties**, **UTF-8 with BOM**, comma separator, CRLF; no ragged rows or blank cells. SHA-256: `11d9f4600036c15aad7fa4e5bc14fcfca9a79946d3327e8c2236e324784418fa`. Coverage is 8–13 questions per county. These are PO inspection results, not a new independent content/fact check by this agent. Filename has no policy meaning.

Exact ordered columns:

```text
Q#,FIPS,County,County Seat,Established,Named For,Category,Question,Choice A,Choice B,Choice C,Choice D,Correct Letter,Correct Answer,Explanation
```

Mapping to output `QuizQuestion` (draft `src/types.ts`):

| CSV field | Output / validation |
|---|---|
| `Q#` | `id`, preserve stable supplied question identifier |
| `FIPS` | `countyId`, five-character known county FIPS; pack **keyed by FIPS** |
| `County` | `countyName` |
| `County Seat` | `countySeat` |
| `Established` | `established`, parse supplied integer |
| `Named For` | `namedFor` |
| `Category` | `category`, preserve supplied text |
| `Question` | `prompt`, preserve supplied text |
| `Choice A`, `Choice B`, `Choice C`, `Choice D` | `choices.A/B/C/D`, **all four** supplied strings retained |
| `Correct Letter` | `correctLetter`, `A` / `B` / `C` / `D` |
| `Correct Answer` | `correctAnswer`; equals supplied choice at `correctLetter` |
| `Explanation` | `explanation`; preserve when present, **optional to display** |

Correct answers **ship as gameplay data** for static grading. Strip the initial BOM before matching headers; use a CSV parser supporting quoted commas/escaped quotes rather than splitting on commas. PO found correct-letter mapping consistent and all counties named in prompts; no new fact-check gate is implied.

### 5.2 Single-parser / single-importer dependency flow (proposed implementation)

`shared-path CSV → BTT-8 parser → BTT-14 importer → public/data/quiz.json → BTT-9/BTT-10 consumers`

1. **BTT-8 alone owns `factory/parse-quiz-csv.ts`.** Pure function `parseQuizCsv(text: string): { rows: readonly CsvQuestionRow[]; report: CsvValidationReport }`; text in, typed rows plus structural diagnostics out. No file I/O, fetching, output writes or fact-checking. Report row/field errors and missing coverage/categories/choices separately. Use confirmed §5.1 BOM/CSV/header mapping; no invented content or unagreed-column rejection.
2. **BTT-14 alone owns `factory/import-quiz.ts`.** Build script reads the shared-path CSV, calls BTT-8's parser, maps parsed rows to `QuizQuestion`, and is the **only writer of `public/data/quiz.json`**. It does not implement a second parser. Structural errors use the agreed validation report; fact-checking/checker verdicts never block conversion.
3. **BTT-9/BTT-10 are downstream consumers only**, for their county ranges. Inputs are only `public/data/quiz.json` and `QuizQuestion` from `src/types.ts`, never raw CSV. No converter, parser, importer or runtime-pack-write duties. Any county-range structural/coverage reports are separate outputs, not prerequisites of import or independent Q&A/fact checks.
4. **Joshua, 10:27 AM America/Indianapolis:** “don't spend anytime yet on verifying q&a”. Independent checker/verification/fact-check work is **deferred and never blocks conversion**; no fact-check quotas or ship-rule/verdict prerequisites.

`CsvValidationReport` is proposed to contain per-row/field errors, warnings and separate coverage/category/choice summaries; it validates structure/mapping, not historical truth. No parser/importer is implemented by this local design edit.

### 5.3 Card reconciliation and precedence

Fresh read-only card titles/structured ACs still describe BTT-8 gates/merge code, BTT-9/10 authored county shards and BTT-14 sole assembly. They do not clearly mandate multiple CSV parsers/importers; the single-parser/single-importer proposal preserves BTT-14's sole-writer role. BTT-9/10 consume the imported pack only; their older conversion proposal is removed. Direct user deltas and structured ACs take precedence over proposed §13 implementation details until approved; unresolved AC reconciliation must not be bypassed by status/lane changes. BTT-11/12 independent checker work remains deferred. No new stories or board changes.

### 5.4 Quota policy — OPEN

Neither the older PO CSV proposal nor legacy **4 questions / 3 categories / seat / choice minimums** silently overrides Joshua's supplied CSV. Validation produces separate coverage/category/choice reports and flags product-policy questions; it does not invent content or reject rows for unagreed columns. There are **no fact-check quotas now**. Any future gameplay coverage or choice policy requires an explicit decision; do not convert an old AC quota into an import prerequisite.

---

## 6. Pure engine API (AC1)

### 6.1 Principles

- Engine is **pure**: no DOM, no `fetch`, no `localStorage`, no timers.
- State is **serializable** JSON; `serialize` / `deserialize` round-trip.
- **RNG injected** (`() => number` in `[0,1)` or dice helper interface); tests use seeded RNG.
- Invalid actions return **unchanged state** + structured error; never throw away the match.
- No hard-coded county names/counts — all from map pack.

### 6.2 Shared API / draft types

`src/types.ts` beside this document is the draft for future repository `src/types.ts`, exclusively owned by **BTT-1**. It is declarations only, not a product implementation. It controls pack, ledger, action and engine-result shapes; examples elsewhere must conform to it. Every boundary parses `unknown`; TypeScript alone does not validate JSON or CSV.

- `createGame(config, rng)` → discriminated success/error result; validates 2–6 seats and pack compatibility.
- `reduce(state, action, rng)` → `{ok:true,state,events}` or `{ok:false,state,error}`; invalid actions return the **original state**, no RNG consumption, no events.
- `serialize(saveEnvelope)` → versioned JSON; `deserialize(raw:unknown)` → validated result. Save includes RNG state/cursor through the adapter for replay; function values are never serialized.
- `checkInvariants(state)` → diagnostics. Serialization must preserve pending quiz, occupation minimum, phase, turn sequence, reinforcement pool and consumed answer status.
- Engine owns random county choice at turn start; BTT-13 draws within that county's imported question pool using the injected RNG, shuffles supplied choices, and stores the selected question/mapping for this turn. No repeat county preference: it would bias the required random draw. Avoid question repeats **within a selected county** until its pool is exhausted.
- UI submits a question id and answer token, **not a trusted `correct:boolean`**; the engine checks the pending question/mapping and phase. Neither arbitrary held county nor repeated answer can earn a second bonus. AI uses the same action path.
- Explicit `occupy` phase blocks all unrelated actions until mandatory capture movement completes. Handoff cannot grant income a second time. A single turn sequence id binds quiz result and phase events.

The schema is settled: **four supplied choices A–D**, supplied correct letter and correct-answer string. Do not substitute typed answers or generate choices. Shuffling display order must preserve a displayed-index → original-letter mapping; grade against the stored correct letter, and keep all four original choices in the data pack. Explanations are supplied and optional to show.

### 6.3 DOM interfaces (surface contracts)

UI modules own DOM; engine never touches it.

| Surface | Responsibilities |
|---------|------------------|
| Setup | 2–6 players, human/computer toggles, mode Total/Quick, Start / Continue |
| Map | SVG counties; labels; army badges; `data-owner` 0–5; selection classes `is-selected` / `is-source` / `is-target` |
| Turn chrome | Phase indicator, reinforcement count (includes +2 when earned), handoff |
| Quiz dialog | Names + highlights quiz county; correct → show +2; wrong/skip → show answer/explanation, +0 |
| Battle | Attack/defend dice UX |
| POI browser | Separate from quiz; county info only |
| Stats / regions | Player stats + regional bonus panels |
| Trip log | Append-only phase/battle/quiz lines |

Text insertion uses **`textContent` only** (no `innerHTML` for game/quiz strings).

Proposed stable DOM contract (BTT-15 creates; BTT-16/17 bind): `#app`, `#setup`, `#player-list`, `#mode`, `#start-game`, `#continue-game`, `svg#map`, `#county-info` (separate POI browser), `#regions`, `#player-stats`, `#phase`, `#reinforcement-count`, `#trip-log`, `#quiz-dialog`, `#quiz-county`, `#quiz-question`, `#quiz-choices`, `#quiz-result`, `#skip-quiz`, `#battle-dialog`, `#occupy-dialog`, `#end-attacks`, `#end-turn`, `#handoff-dialog`, `#winner-dialog`, `#error-status`. County groups use `[data-county-id]`, `[data-owner="0".."5"]`, `.county`, `.county-label`, `.army-badge`, `.is-selected`, `.is-source`, `.is-target`, `.is-quiz-county`. DOM ids/classes are frozen only when layout is adopted. Keyboard county navigation, visible focus, 44px targets, non-color player cues and reduced motion are required; dialogs must not obscure the highlighted county. `#trip-log` is an accessible live region. Decorative map art is not a source of quiz facts.

---

## 7. Data formats

### 7.1 Map pack — `data/regions/in/map.json`

- Exactly **92** known Indiana county FIPS (odd county codes), five-character strings `18001`–`18183`; preserve leading zeros for generic pack compatibility.
- Adjacency list **symmetric**, no self-neighbors, graph connected.
- Fields (minimum): `viewBox`, per-county `id`, `name`, `path`/`outline`, `centroid`, `neighbors[]`, `regionId`.
- Region borders / outlines as needed for quilt rendering.
- Target size &lt; 200 KB (nonblocking unless gameplay fails).

### 7.2 Region pack — `regions/in/region.json`

- **8 is the expected region count** from the live reference. Exact **names, membership and bonuses are OPEN**, unverified and not invented here.
- Data review must establish membership and intended contiguity/coverage before a complete region pack is claimed. No invented formula or placeholder bonuses may be presented as reference data.

### 7.3 Quiz pack — `public/data/quiz.json` (BTT-14 sole writer)

Minimal imported gameplay data: county binding, stable question id, question text, supplied possible answers and supplied correct-answer mapping. Exact field mapping is settled in §5.1. Category/explanation/source fields are included only if supplied; their absence is reported, not filled or rejected under unagreed quotas. Retain exactly the four supplied choices and correct letter; no one-choice conversion or typed-answer replacement. Correct answers **ship as gameplay data** and are available to the static grader.

Pack is keyed by FIPS with per-county question arrays. No claim ids, independent verdicts, fact checks or person ship rulings are required to import this file. Deferred ledger shapes in the declaration draft are not import requirements.

### 7.4 Ledger / claims / verdicts — DEFERRED

The claim shards, checker verdicts, resolutions and strict ship-rule design are **deferred workstreams**, not part of minimal CSV parsing/import. Their reserved paths/owners in §9 are retained for traceability only and impose **no import dependency or fact-check quota**. They must not prevent BTT-14 importing Joshua's supplied gameplay Q&A. No independent Q&A verification or fact-checking runs as part of this task.

### 7.5 CSV (ingress only)

Not shipped to clients. Converted offline into shards / quiz pack.

---

## 8. Vite / TypeScript layout — ADOPTED (Joshua, 10:36am ET)

Proposed reconciliation of planned `site/js/*.js` paths to a single Vite tree. **All proposed product modules are `.ts`.**

```
indyinit/
  package.json
  tsconfig.json
  vite.config.ts
  vercel.json                 # security headers; static
  index.html                  # Vite entry
  DESIGN.md
  src/
    types.ts                   # BTT-1 shared contract
    main.ts
    panzoom.ts                 # BTT-16
    sound.ts                   # BTT-17, optional local sound only
    engine/engine.ts
    ai/ai.ts
    quiz/quiz.ts
    ui/setup.ts
    ui/map.ts
    ui/turn.ts
    ui/quiz-dialog.ts
    ui/battle.ts
    styles.css
    styles/theme.css
  public/
    assets/**
    data/quiz.json             # current minimal CSV import output
  data/
    regions/in/map.json
  decisions/0001-rules.md
  factory/
    import-quiz.ts             # BTT-14 minimal CSV import
    parse-quiz-csv.ts          # BTT-8 sole pure parser
    build-map.ts
    merge-verdicts.ts          # DEFERRED; not an import prerequisite
  gates/
    map.*
    rules.*
    mutants.*
    quiz.*
    ledger.*
    security.*
  regions/in/
    region.json
    claims-c1.jsonl
    drafts-c1.jsonl
    claims-c2.jsonl
    drafts-c2.jsonl
    verdicts.a.jsonl
    verdicts.b.jsonl
    resolutions.jsonl          # HUMAN-ONLY, DEFERRED; no bot owns/writes it
  scripts/                    # lean box gate runners (BTT-2)
    box-gate.mjs              # BTT-2 runner; no scripts/** blanket ownership
    sim/run.ts                 # BTT-7 only, if introduced
  tests/                       # vitest; per-file owners below
```

Path migration cheat-sheet:

| Planned (card AC) | Canonical |
|-------------------|-----------|
| `site/js/engine.js` | `src/engine/engine.ts` |
| `site/js/ai.js` | `src/ai/ai.ts` |
| `site/js/quiz.js` | `src/quiz/quiz.ts` |
| `site/js/ui/setup.js` | `src/ui/setup.ts` |
| `site/js/ui/map.js` | `src/ui/map.ts` |
| `site/js/ui/turn.js` | `src/ui/turn.ts` |
| `site/js/ui/quiz-dialog.js` | `src/ui/quiz-dialog.ts` |
| `site/js/ui/battle.js` | `src/ui/battle.ts` |
| `site/js/main.js` | `src/main.ts` |
| `site/index.html` | `index.html` |
| `site/css/**` | `src/styles.css` + `src/styles/**` |
| `site/assets/**` | `public/assets/**` |
| `site/regions/in/map.json` | `data/regions/in/map.json` |
| `site/regions/in/quiz.json` | `public/data/quiz.json` |
| `site/regions/in/theme.css` | `src/styles/theme.css` |
| `factory/build-map.*` | `factory/build-map.ts` (+ helpers under `factory/` owned by same card) |
| `gates/*` | `gates/*` (TypeScript or colocated fixtures; same card) |

No two cards own one file. Claim shards merge **only** under BTT-14. Runtime quiz destination is **`public/data/quiz.json`** per latest instruction. Map path/layout remains proposed: root map JSON must be imported/bundled by Vite or explicitly moved to public data, never fetched from a non-public root URL. No competing quiz tree. Claim-shard merging is deferred, not a dependency of CSV import.

---

## 9. Exclusive ownership map

### 9.1 TSV (exclusive file → card)

```tsv
path	card
scope/CONTRACT.md	BTT-1
decisions/0001-rules.md	BTT-1
src/types.ts	BTT-1
package.json	BTT-2
tsconfig.json	BTT-2
vite.config.ts	BTT-2
vercel.json	BTT-2
scripts/box-gate.mjs	BTT-2
package-lock.json	BTT-2
.gitignore	BTT-2
vitest.config.ts	BTT-2
factory/build-map.ts	BTT-3
factory/build-map.*	BTT-3
regions/in/region.json	BTT-3
data/regions/in/map.json	BTT-3
gates/map.*	BTT-3
gates/rules.*	BTT-4
gates/mutants.*	BTT-4
tests/rules.test.ts	BTT-4
tests/mutants.test.ts	BTT-4
src/engine/engine.ts	BTT-5
src/ai/ai.ts	BTT-6
tests/ai.test.ts	BTT-6
scripts/sim/**	BTT-7
gates/sim.*	BTT-7
tests/simulation.test.ts	BTT-7
gates/quiz.*	BTT-8
gates/ledger.*	BTT-8
gates/security.*	BTT-8
factory/parse-quiz-csv.ts	BTT-8
factory/merge-verdicts.ts	BTT-8
factory/merge-verdicts.*	BTT-8
tests/content-gates.test.ts	BTT-8
reports/quiz-c1.json	BTT-9
regions/in/claims-c1.jsonl	BTT-9
regions/in/drafts-c1.jsonl	BTT-9
reports/quiz-c2.json	BTT-10
regions/in/claims-c2.jsonl	BTT-10
regions/in/drafts-c2.jsonl	BTT-10
regions/in/verdicts.a.jsonl	BTT-11
regions/in/verdicts.b.jsonl	BTT-12
src/quiz/quiz.ts	BTT-13
tests/quiz.test.ts	BTT-13
public/data/quiz.json	BTT-14
factory/import-quiz.ts	BTT-14
regions/in/resolutions.jsonl	HUMAN-ONLY (DEFERRED; no bot owner)
regions/in/claims.jsonl	BTT-14
regions/in/coverage.json	BTT-14
index.html	BTT-15
src/styles.css	BTT-15
src/styles/**	BTT-15
public/assets/**	BTT-15
DESIGN.md	BTT-15
src/ui/setup.ts	BTT-16
src/ui/map.ts	BTT-16
src/panzoom.ts	BTT-16
src/ui/turn.ts	BTT-17
src/ui/quiz-dialog.ts	BTT-17
src/ui/battle.ts	BTT-17
src/main.ts	BTT-17
src/sound.ts	BTT-17
gates/browser.*	BTT-18
tests/browser/**	BTT-18
release/verification.md	BTT-19
```

### 9.2 Card summary

| Card | Owns (exclusive) | Notes |
|------|------------------|-------|
| **BTT-1** | `scope/CONTRACT.md`, `decisions/0001-rules.md`, draft `src/types.ts` | Design-only |
| **BTT-2** | Vite skeleton, `package.json`, `tsconfig`, `vercel.json`, lean box gate **runner scripts** | Not product logic |
| **BTT-3** | `factory/build-map.*`, `regions/in/region.json`, `data/regions/in/map.json`, `gates/map.*` | |
| **BTT-4** | `gates/rules.*`, `gates/mutants.*` | |
| **BTT-5** | `src/engine/engine.ts` | was `site/js/engine.js` |
| **BTT-6** | `src/ai/ai.ts` | was `site/js/ai.js` |
| **BTT-7** | Reserved simulation harness | Cuts/quotas OPEN |
| **BTT-8** | `factory/parse-quiz-csv.ts`, focused parser/security tests; old ledger/merge files deferred | Sole pure CSV parser |
| **BTT-9** | `reports/quiz-c1.json`; old claim/draft paths deferred | Imported-quiz consumer only; no raw CSV/conversion |
| **BTT-10** | `reports/quiz-c2.json`; old claim/draft paths deferred | Imported-quiz consumer only; no raw CSV/conversion |
| **BTT-11** | `regions/in/verdicts.a.jsonl` | **DEFERRED**, no import dependency |
| **BTT-12** | `regions/in/verdicts.b.jsonl` | **DEFERRED**, no import dependency |
| **BTT-13** | `src/quiz/quiz.ts` | was `site/js/quiz.js` |
| **BTT-14** | `public/data/quiz.json`, `factory/import-quiz.ts`; sole minimal importer | No fact-check prerequisite |
| **BTT-15** | `index.html`, `src/styles/**`, `public/assets/**`, `DESIGN.md` | System fonts |
| **BTT-16** | `src/ui/setup.ts`, `src/ui/map.ts` | |
| **BTT-17** | `src/ui/turn.ts`, `quiz-dialog.ts`, `battle.ts`, `src/main.ts` | |
| **BTT-18** | Optional a11y/responsive | Nonblocking |
| **BTT-19** | No exclusive product files | Release operator |

Shared claim/shard files are **DEFERRED**; their reserved ownership is not an import requirement. Table paths are future repo-relative; local design files live beside this document under `scope/`. Entries with same-card exact/glob overlap are redundant aliases, not extra owners. No broad `scripts/**` owner may swallow BTT-7's simulation files. BTT-18 reports UI defects to BTT-15/16/17 rather than editing their files. BTT-19 records evidence, not product edits.

Integration points: BTT-1 owns shared declarations; BTT-2 package scripts/config only; BTT-3 exports map/region packs; BTT-5 owns reducer; BTT-13 owns question selection helpers; BTT-8 owns the sole pure `factory/parse-quiz-csv.ts`; BTT-14 owns the sole build importer and `public/data/quiz.json`; BTT-9/10 read only the imported quiz and shared `QuizQuestion`, never raw CSV; independent verification, fact-checking and ship-rule merge are deferred; BTT-17 composes all modules in `src/main.ts`. UI renderers accept state/view data and dispatch typed actions, never mutate state. Requests to change another owner's file go to that owner; no named bot identity is embedded in code. New files need an ownership reservation before parallel work starts.

---

## 10. Security & privacy gates (product)

- No `innerHTML` with game/quiz text; no `eval`; no external scripts; no secrets/private notes/rulings in client output.
- The CSV supplies **questions, possible answers and correct answers**. Correct answers **ship as gameplay data** for static grading. The filename adds no policy semantics.
- The original **BARS no-key rule concerns hidden true/fake benchmark labels**, not gameplay answer fields. Do not expose those labels or their truth key. **Gameplay correct answers ship**. The source filename itself confers no additional policy meaning.
- Headers via `vercel.json` (BTT-2). Privacy/secrets/core gameplay failures remain blocking.

---

## 11. Open items

1. **Region data:** expected count **8**; names, membership and bonuses remain **OPEN**. No invented specifics or formula.
2. **General quota policy:** coverage, category, seat and choice minima remain product-policy questions for future inputs; report gaps separately, no unagreed-column rejection or fabrication. This file already covers every county and supplies four choices. **No fact-check quotas now.** Independent verification/fact-checking are deferred, not import prerequisites.
3. **Fallback adoption:** uniform choice among eligible owned counties is architect interpretation; skip-with-0 if none have questions is an **architect default (not Joshua-approved)**. BARS no-key scope is clarified in §10, not an open gameplay-answer prohibition.
4. **Release conflict:** Ready card text **forbids hosted CI and previews**, while this contract treats those cuts as **OPEN pending the user’s ruling via CoS**. Do not silently choose either. Simulation/quota cuts and final release evidence also remain OPEN.
5. **Economy/default adoption:** starting pools, even-deal implementation, automatic initial-army placement, second-seat +15, AI probability, default mode and Total92 timing require adoption. Region bonus data separately OPEN.
6. **Layout/interfaces:** remaining proposed map/module layout, exclusive ownership and declaration/interface adoption. Quiz output is fixed as `public/data/quiz.json`; deferred ledger types are not import requirements.
7. **Execution authority:** implementation/release operators, merger, human hold and documented AC-update route; no board/external action is authorized here.
8. **Source/design review:** original SPEC/template/decisions not supplied for this review; human contract/rules review remains outstanding.
9. **Milestones:** Joshua's **“shoot for 3pm eastern”** means approximately **3:00 PM America/Indianapolis** on Nov 7, not a hard commitment; no approved freeze/deploy timetable.

**Confirmed:** exact schema/headers/FIPS mapping; all counties have questions; four choices and gameplay correct letter/answer ship; Quick60 = 60, random ownership and +2 once. **Joshua rule:** draw from another owned county when selected county has no question. **Architect interpretation:** uniform eligible-owned choice. **Architect default (not Joshua-approved):** if none have questions, skip with 0. CSV flow: BTT-8 parser → BTT-14 importer → quiz.json → BTT-9/10 consumers. Verification/fact-checking deferred. No board edits.

---

## 12. Out of scope for Architect on this card

- Changing status/lane/AC, clearing human step `hst_79b5bc39`, or treating PO notes as user execution approval.  
- Pushing to GitHub, opening PRs, coding, deploying.  
- Inventing Joshua approvals for recommended defaults.  
- Silently rewriting Ready content-card ACs.

---



## 13. Per-card proposed implementation details and PO AC deltas

This is a **proposed implementation reconciliation**, not a board edit. Each §13.n proposes implementation details and references §9 ownership; it does **not control or override** direct user deltas or structured ACs. **Direct user deltas and structured ACs take precedence until these proposed details are approved**; unresolved conflicts need an authorized reconciliation, not a lane/status bypass. Historical PO notes are context only. Ready text forbids hosted CI/previews; contract cuts remain **OPEN pending the user's ruling via CoS**. **BTT-1 maps to §14.**

| Card | Proposed detail section | Referenced sections |
| BTT-1 | §14 | Whole-contract acceptance review |
|---|---|---|
| BTT-2 | §13.2 | §2 + 8–9; §9 ownership |
| BTT-3 | §13.3 | §7.1–7.2 + 9; §9 ownership |
| BTT-4 | §13.4 | §3–4 + 6; §9 ownership |
| BTT-5 | §13.5 | §4 + 6; §9 ownership |
| BTT-6 | §13.6 | §4.1 + 6; §9 ownership |
| BTT-7 | §13.7 | §2 + 4; §9 ownership |
| BTT-8 | §13.8 | §5.4 + 7.3–7.4 + 10; §9 ownership |
| BTT-9 | §13.9 | §5 + 7.4; §9 ownership |
| BTT-10 | §13.10 | §5 + 7.4; §9 ownership |
| BTT-11 | §13.11 | §7.4; §9 ownership |
| BTT-12 | §13.12 | §7.4; §9 ownership |
| BTT-13 | §13.13 | §3.2–3.5 + 6.2; §9 ownership |
| BTT-14 | §13.14 | §5.4 + 7.3–7.4; §9 ownership |
| BTT-15 | §13.15 | §1 + 6.3; §9 ownership |
| BTT-16 | §13.16 | §3.1 + 6.3; §9 ownership |
| BTT-17 | §13.17 | §3.2–3.5 + 4 + 6.3; §9 ownership |
| BTT-18 | §13.18 | §2 + 6.3; §9 ownership |
| BTT-19 | §13.19 | §2 + 10; §9 ownership |

### 13.2 BTT-2 — proposed implementation detail

Proposed detail references §2 + 8–9 and §9. Vite/TS static build; local typecheck, focused tests, build, full-turn smoke. Hosted CI/preview cuts are OPEN, irrespective of older card wording. Implementation capability owner remains unresolved.

**PO CSV AC delta:** none recorded for this card in csvrule-comments.json.

### 13.3 BTT-3 — proposed implementation detail

Proposed detail references §7.1–7.2 + 9 and §9. Map has exactly 92 valid FIPS, shared-border adjacency (corners do not count), connected symmetric graph; self/asymmetric fixtures fail. Expect eight regions; names, membership and bonuses OPEN, no invented specifics. Payload target is not a release blocker absent gameplay breakage.

**PO CSV AC delta:** none recorded for this card in csvrule-comments.json.

### 13.4 BTT-4 — proposed implementation detail

Proposed detail references §3–4 + 6 and §9. Focused rule tests include setup coverage, RNG-driven quiz source, county naming, dice/ties, occupation, unchanged-state invalid actions, income, wins. Test +3 and double-award regressions; any quota cut must be reconciled under §11 rather than assumed from older card text.

**PO CSV AC delta** (cmt_8e0e994c): AC2/AC3: add tests that the initial allocation covers all 92 counties exactly once with seeded randomization; the quiz source county is owned by the current player at quiz time and is chosen by the injected RNG; the question shown names that county; wrong/skipped give 0; correct gives exactly +2 once.

### 13.5 BTT-5 — proposed implementation detail

Proposed detail references §4 + 6 and §9. Pure reducer and serialization/invariants. County choice is engine-owned, question draw delegated to BTT-13 under same injected RNG. Raw UI correctness booleans are not authoritative; grade supplied four-choice/correct-letter mapping.

**PO CSV AC delta** (cmt_a6789d75): AC3: engine draws the quiz county at random (injected RNG) from counties the current player owns at turn start; setup deals counties randomly; award stays exactly +2 once.

### 13.6 BTT-6 — proposed implementation detail

Proposed detail references §4.1 + 6 and §9. Optional computer opponents use legal engine actions, finite turn steps and 60% quiz success proposal; never mutate state or import runtime AI. Bound AI attack work and return control to UI.

**PO CSV AC delta:** none recorded for this card in csvrule-comments.json.

### 13.7 BTT-7 — proposed implementation detail

Proposed detail references §2 + 4 and §9. Reserved seeded simulation work reports validity and balance if retained; simulation cuts are OPEN. Army accounting includes initial pools + reinforcement + earned quiz - battle casualties, not a false constant-total conservation claim. Whether to retain or cut old simulation quotas is OPEN, not settled here.

**PO CSV AC delta:** none recorded for this card in csvrule-comments.json.

### 13.8 BTT-8 — proposed implementation detail

BTT-8 owns **only one pure CSV parser module**, `factory/parse-quiz-csv.ts`, plus focused structural/schema/security checks. Function contract: CSV text → typed `CsvQuestionRow[]` plus validation report; no I/O or pack writing. BTT-14 calls it. Coverage/category/choice reports are separate policy diagnostics; no invented content. Joshua's 10:27 AM America/Indianapolis deferral: **“don't spend anytime yet on verifying q&a”**. Checker/verification/fact-check work is deferred and **never blocks conversion**; both-checker-verdict and ship-rule prerequisites are superseded. Historical PO comment cmt_e0655685 is traceability only.

### 13.9 BTT-9 — proposed implementation detail

For Adams through Jennings, **consume only `public/data/quiz.json` and the shared `QuizQuestion` type**; never read raw CSV. No parser, converter, importer or quiz-pack-write duties. Proposed optional structural/coverage report: `reports/quiz-c1.json`; independent verification/fact-checking remains deferred and cannot block conversion. Old authored-shard/conversion requests are historical and require AC reconciliation, not duplicate import code.

### 13.10 BTT-10 — proposed implementation detail

For Johnson through Whitley, **consume only `public/data/quiz.json` and the shared `QuizQuestion` type**; never read raw CSV. No parser, converter, importer or quiz-pack-write duties. Proposed optional structural/coverage report: `reports/quiz-c2.json`; verification/fact-checking remains deferred. Missing-question handling references §3.5: Joshua's other-owned-county rule; uniform eligible-owned choice is architect interpretation, and skip-with-0 if no owned county has questions is **architect default (not Joshua-approved)**.

### 13.11 BTT-11 — proposed implementation detail — verification DEFERRED

**DEFERRED workstream.** Old content/shard drafting, independent Q&A verification and fact-checking are not import prerequisites. No fact-check quota or required checker verdict applies now. Do not start this work or change the board state. Current CSV flow is BTT-8 parser → BTT-14 importer → `public/data/quiz.json` → BTT-9/10 consumers, using the confirmed §5.1 schema.

**Historical, superseded where inconsistent with latest ruling:**
**PO CSV AC delta** (cmt_c44a6121): Input changes from author claim shards to the user-supplied CSV (converted per contract). Independence rules stay. Verify supplied questions/answers against sources; source/category columns may not exist in the CSV. Waits on the upload.

### 13.12 BTT-12 — proposed implementation detail — verification DEFERRED

**DEFERRED workstream.** Old content/shard drafting, independent Q&A verification and fact-checking are not import prerequisites. No fact-check quota or required checker verdict applies now. Do not start this work or change the board state. Current CSV flow is BTT-8 parser → BTT-14 importer → `public/data/quiz.json` → BTT-9/10 consumers, using the confirmed §5.1 schema.

**Historical, superseded where inconsistent with latest ruling:**
**PO CSV AC delta** (cmt_684c6ff1): Input changes from author claim shards to the user-supplied CSV (converted per contract). Independence rules stay. Verify supplied questions/answers against sources; source/category columns may not exist in the CSV. Waits on the upload.

### 13.13 BTT-13 — proposed implementation detail

Draw a random owned county first, then a question from its pool. Do not bias toward unasked counties; within-county question-repeat avoidance may be used. Four-choice/correct-letter mapping survives display shuffling. Joshua: **“If the selected county has no question, draw a question from another county the player currently owns.”** Uniform eligible-owned choice is architect interpretation; if none have questions, skip with 0 is **architect default (not Joshua-approved)**, an architect default. All counties have questions in the supplied file. The old missing-question-open comment is superseded by this explicit distinction.

### 13.14 BTT-14 — proposed implementation detail

BTT-14 is the **sole importer**, `factory/import-quiz.ts`: read shared-path CSV, call BTT-8's single pure parser, map typed rows to `QuizQuestion`, and alone write **`public/data/quiz.json`**. No second CSV parser, no BTT-9/10 converter dependency. Correct answers ship. Joshua's 10:27 AM America/Indianapolis deferral: **“don't spend anytime yet on verifying q&a”**. Checker/verification/fact-check work is deferred and **never blocks conversion**; no both-checker-verdict, audit, resolution or ship-rule prerequisite. `resolutions.jsonl` is **human-only and deferred**, never owned/written by BTT-14. Historical cmt_9b097555 verdict wording is superseded.

### 13.15 BTT-15 — proposed implementation detail

Proposed detail references §1 + 6.3 and §9. Parchment/quilt map, labels, army counts, stats/regions/log and separate POI browser. DOM ids/classes §6.3, system/local fonts, accessible non-color cues and 44px targets. No new unsourced historical copy.

**PO CSV AC delta:** none recorded for this card in csvrule-comments.json.

### 13.16 BTT-16 — proposed implementation detail

Proposed detail references §3.1 + 6.3 and §9. Setup displays engine random deal, never county picking. Human/computer seats 2–6, Start/Continue, guarded autosave; map owns selections and panzoom; county info stays separate from quiz.

**PO CSV AC delta** (cmt_86125ac4): Setup: counties are assigned randomly at game start (engine-owned); the UI shows the result and does not let players pick counties.

### 13.17 BTT-17 — proposed implementation detail

Proposed detail references §3.2–3.5 + 4 + 6.3 and §9. Compose main entry, quiz/turn/battle dialogs, occupation and handoff; highlight actual randomly chosen county. Display exact engine pool, +2 only once, wrong/skip 0. Supplied explanation is optional to show; no independent verification prerequisite. Optional sound does not block play.

**PO CSV AC delta** (cmt_1288d61a): AC2: the quiz dialog names and highlights the randomly chosen owned county the question comes from; correct shows +2 once; wrong/skip adds 0.

### 13.18 BTT-18 — proposed implementation detail

Proposed detail references §2 + 6.3 and §9. Real browser checks cover phone, Chromebook and desktop as optional expanded evidence; core obstruction blocks release, paperwork quotas do not. Own browser gate/test files only; do not patch other cards’ CSS/UI.

**PO CSV AC delta:** none recorded for this card in csvrule-comments.json.

### 13.19 BTT-19 — proposed implementation detail

Proposed detail references §2 + 10 and §9. Release operator records exact combined candidate checks before any authorized main push; production assets/gameplay/headers smoke after authorized deploy. Hosted CI, preview and simulation cuts are **OPEN**; do not treat older current-AC cuts as adopted. Other release evidence needs reconciliation under §11. Design author performs none of these external actions.

**PO CSV AC delta:** none recorded for this card in csvrule-comments.json.

## 14. BTT-1 mapping, acceptance review and verification status

**BTT-1 → §14**. Proposed implementation details in §13 do not override direct user deltas or structured ACs until approved.

Policy corrected per latest Joshua/PO rulings on Nov 7, 2026, through approximately 10:29 AM America/Indianapolis. Earlier review assertions about mandatory fact-checking or decided release cuts are superseded. The CSV source itself has not been read by this agent; confirmed schema/coverage are taken from PO’s csv-inspection.json.

| Fresh BTT-1 AC | Coverage / remaining review |
|---|---|
| AC1: API, serializable state, RNG, pack/ledger, DOM, exclusive TS files, BTT-14-only merge | §§6–9, local `src/types.ts`; ownership overlaps corrected (no blanket scripts/**). Actual downstream file-list migration still requires authorized card route. |
| AC2: locked held-county +2 once; wrong/skip/repeat/out-of-phase zero | §3, §6.2, decision record §§2–3. No invented human approval. |
| AC3: proposed economy/setup; region specifics OPEN | §4.1, decision record §§2–4; economy defaults proposed; region names/membership/bonuses OPEN and invented formula removed. |
| AC4: explicit combat, occupation, fortify, win, AI, autosave, elimination, blitz, missing question | §4, decision record §§3–9; Joshua: draw from another owned county; uniform eligible-owned choice is architect interpretation; skip-with-0 if none have questions is **architect default (not Joshua-approved)**. Full coverage confirmed by PO. |
| AC5: release cuts OPEN; content quota policy OPEN and fact work deferred; exclusive ownership/no named-bot product dependencies | §§1–2, 5.4, 9–13. Latest rulings override historical card proposals; see §11. |

Review performed: fresh read-only `traverse stories list --json`, BTT-1 comments cmt_de1a1438/cmt_b1066d8b/cmt_c045adf1, local plan.json and csvrule-comments.json, public reference page text. Reference text confirms dice, eight regions, +2, reinforcement, fortify and Quick60 end-turn win. It does **not** establish exact starting pools, second-seat +15 or region membership/bonuses. No live game was played in this review; PO's prior +2 observation is attributed, not retested. No claims of original template comparison, complete implementation, executable gates passing, human acceptance or board changes. A person still must read this contract and decision record. Local draft types are not runtime validators.

*End of CONTRACT.md draft — BTT-1*
