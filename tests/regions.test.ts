import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { atlasJson, buildState } from "../factory/build-map.ts";
import { parseMapPack, parseRegionFile } from "../factory/parse-map.ts";
import { createRng, engine, openTurn, regionStanding, reinforcementBreakdown } from "../src/engine/engine.ts";
import type { SeededRng } from "../src/engine/engine.ts";
import { bindMap } from "../src/ui/map.ts";
import type { Action, County, CountyId, GameConfig, GameState, MapPack, PlayerId, QuestionId, QuizPack, QuizQuestion, RngSnapshot } from "../src/types.ts";
import { createDocument, DomMouseEvent, installDom, useDocument, type DomDocument, type DomElement } from "./ui-dom.ts";

installDom();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const APPROVED = [
  { name: "Dunes & Michiana", id: "dunes-michiana", bonus: 6, counties: ["Elkhart", "Fulton", "Jasper", "LaPorte", "Lake", "Marshall", "Newton", "Porter", "Pulaski", "St. Joseph", "Starke"] },
  { name: "Lakes & Three Rivers", id: "lakes-three-rivers", bonus: 6, counties: ["Adams", "Allen", "DeKalb", "Huntington", "Kosciusko", "LaGrange", "Noble", "Steuben", "Wells", "Whitley"] },
  { name: "Wabash Valley", id: "wabash-valley", bonus: 8, counties: ["Benton", "Carroll", "Clinton", "Fountain", "Montgomery", "Parke", "Putnam", "Tippecanoe", "Vermillion", "Vigo", "Warren", "White"] },
  { name: "Gas Belt", id: "gas-belt", bonus: 9, counties: ["Blackford", "Cass", "Delaware", "Grant", "Henry", "Howard", "Jay", "Madison", "Miami", "Randolph", "Tipton", "Wabash"] },
  { name: "Crossroads", id: "crossroads", bonus: 7, counties: ["Boone", "Hamilton", "Hancock", "Hendricks", "Johnson", "Marion", "Morgan", "Shelby"] },
  { name: "Whitewater & Ohio Shore", id: "whitewater-ohio-shore", bonus: 7, counties: ["Dearborn", "Decatur", "Fayette", "Franklin", "Jefferson", "Jennings", "Ohio", "Ripley", "Rush", "Switzerland", "Union", "Wayne"] },
  { name: "Hoosier Hills", id: "hoosier-hills", bonus: 9, counties: ["Bartholomew", "Brown", "Clark", "Crawford", "Floyd", "Harrison", "Jackson", "Lawrence", "Monroe", "Orange", "Owen", "Scott", "Washington"] },
  { name: "Pocket & Coal Country", id: "pocket-coal-country", bonus: 7, counties: ["Clay", "Daviess", "Dubois", "Gibson", "Greene", "Knox", "Martin", "Perry", "Pike", "Posey", "Spencer", "Sullivan", "Vanderburgh", "Warrick"] },
] as const;

test("the approved regions are the only membership source and resolve names to map FIPS", () => {
  const manifestText = readFileSync(path.join(root, "regions", "in", "region.json"), "utf8");
  const manifest = parseRegionFile(JSON.parse(manifestText));
  const built = buildState(manifest, atlasJson());
  const packed = readFileSync(path.join(root, "data", "regions", "in", "map.json"), "utf8");
  assert.equal(packed, `${JSON.stringify(built.map, null, 2)}\n`);
  const byName = new Map(built.map.counties.map((county) => [county.name, county.id]));
  assert.equal(byName.get("LaPorte"), built.map.counties.find((county) => county.name === "LaPorte")?.id);
  assert.equal(byName.get("St. Joseph"), built.map.counties.find((county) => county.name === "St. Joseph")?.id);
  assert.equal(manifest.regions.length, APPROVED.length);
  assert.equal(built.map.regions.length, APPROVED.length);
  const seen = new Set<string>();
  for (const [index, approved] of APPROVED.entries()) {
    const source = manifest.regions[index];
    const region = built.map.regions[index];
    assert.ok(source && region);
    assert.equal(source.id, approved.id);
    assert.equal(source.name, approved.name);
    assert.equal(source.bonus, approved.bonus);
    assert.deepEqual([...source.counties], [...approved.counties]);
    assert.equal(region.id, approved.id);
    assert.equal(region.name, approved.name);
    assert.equal(region.bonus, approved.bonus);
    assert.equal(region.counties.length, approved.counties.length);
    const resolved = approved.counties.map((name) => {
      const fips = byName.get(name);
      assert.equal(typeof fips, "string", name);
      assert.equal(/^\d{5}$/.test(fips ?? ""), true);
      return fips;
    });
    assert.deepEqual([...region.counties], resolved);
    for (const name of approved.counties) {
      assert.equal(seen.has(name), false, name);
      seen.add(name);
      assert.equal(built.map.counties.find((county) => county.name === name)?.regionId, approved.id);
    }
    assert.equal(region.borderPath.length > 0, true);
    assert.equal(region.borderPath.includes("M"), true);
  }
  assert.equal(seen.size, 92);
  assert.equal(built.map.counties.length, 92);
  assert.equal(manifestText.includes("central-indiana"), false);
  assert.equal(packed.includes("central-indiana"), false);
  assert.equal(/"\d{5}"/.test(manifestText), false);
  for (const file of ["src/engine/engine.ts", "src/ui/map.ts", "src/ui/turn.ts", "src/types.ts"]) {
    const source = readFileSync(path.join(root, file), "utf8");
    assert.equal(source.includes("Dunes & Michiana"), false, file);
    assert.equal(source.includes("central-indiana"), false, file);
  }
  const dunes = built.map.regions.find((region) => region.id === "dunes-michiana");
  const laporte = byName.get("LaPorte");
  const joseph = byName.get("St. Joseph");
  assert.ok(dunes && laporte && joseph);
  assert.equal(dunes.counties.includes(laporte), true);
  assert.equal(dunes.counties.includes(joseph), true);
});

test("region bonuses follow the turn-start snapshot and do not change the base or quiz award", () => {
  const map = timingMap();
  const quiz = questionsFor(map);
  const started = open(map, quiz);
  assert.equal(started.phase.kind, "quiz");
  if (started.phase.kind !== "quiz") return;
  assert.deepEqual(ownedNames(started, 0), ["99002", "99004", "99006"]);
  assert.deepEqual(ownedNames(started, 1), ["99001", "99003", "99005"]);
  assert.equal(started.phase.baseIncome, 3);
  assert.equal(started.phase.regionIncome, 6);
  assert.deepEqual(started.phase.regionLines?.map((line) => [line.name, line.bonus]), [["North", 6]]);
  const standing = regionStanding(started, 0);
  assert.deepEqual(standing.find((region) => region.name === "North"), { id: "north", name: "North", held: 3, total: 3, bonus: 6 });
  assert.deepEqual(standing.find((region) => region.name === "West"), { id: "west", name: "West", held: 1, total: 2, bonus: 4 });
  assert.deepEqual(standing.find((region) => region.name === "South"), { id: "south", name: "South", held: 0, total: 3, bonus: 9 });
  assert.equal(regionStanding(started, 1).find((region) => region.name === "South")?.held, 3);
  const breakdown = reinforcementBreakdown(started);
  assert.deepEqual(breakdown, { base: 3, quiz: null, regions: [{ id: "north", name: "North", bonus: 6 }] });

  const repeated = openTurn(started, started.activePlayer, () => 0);
  assert.equal(repeated, started);
  const saved = engine.serialize({ version: 1, state: started, rng: createRng("region-save").snapshot() });
  const loaded = engine.deserialize(saved);
  assert.equal(loaded.ok, true);
  if (!loaded.ok) return;
  assert.deepEqual(loaded.value.state, started);
  const resumed = openTurn(loaded.value.state, loaded.value.state.activePlayer, () => 0);
  assert.equal(resumed, loaded.value.state);
  assert.equal(armyTotal(resumed, 0), armyTotal(started, 0));

  const correct = apply(started, answer(started, correctIndex(started)), constant(0));
  assert.equal(correct.phase.kind, "place");
  if (correct.phase.kind !== "place") return;
  assert.equal(correct.phase.income.base, 3);
  assert.equal(correct.phase.income.quiz, 2);
  assert.equal(correct.phase.income.regions, 6);
  assert.equal(correct.phase.remaining, 11);
  assert.deepEqual(correct.phase.income.lines?.map((line) => line.bonus), [6]);

  const missed = open(map, quiz);
  const passed = open(map, quiz);
  const wrong = apply(missed, answer(missed, (correctIndex(missed) + 1) % 4), constant(0));
  const skipped = apply(passed, skip(passed), constant(0));
  assert.equal(wrong.phase.kind, "place");
  assert.equal(skipped.phase.kind, "place");
  if (wrong.phase.kind !== "place" || skipped.phase.kind !== "place") return;
  assert.equal(wrong.phase.income.quiz, 0);
  assert.equal(skipped.phase.income.quiz, 0);
  assert.equal(wrong.phase.income.base, 3);
  assert.equal(skipped.phase.remaining, 9);
  assert.equal(wrong.phase.remaining, 9);

  let state = apply(started, skip(started), constant(0));
  assert.equal(state.phase.kind, "place");
  if (state.phase.kind !== "place") return;
  const seat = state.holdings.find((holding) => holding.owner === state.activePlayer);
  assert.ok(seat);
  state = apply(state, { kind: "place", countyId: seat.countyId, count: state.phase.remaining }, constant(0));
  const beforeCapture = armyTotal(state, 0);
  const grant = state.turnGrant;
  state = apply(state, { kind: "attack", from: "99002" as CountyId, to: "99001" as CountyId, dice: 1 }, sequence([0.99, 0]));
  assert.equal(state.phase.kind, "occupy");
  if (state.phase.kind !== "occupy") return;
  state = apply(state, { kind: "occupy", count: state.phase.minimum }, constant(0));
  assert.equal(state.holdings.find((holding) => holding.countyId === ("99001" as CountyId))?.owner, 0);
  assert.equal(armyTotal(state, 0), beforeCapture);
  assert.deepEqual(state.turnGrant, grant);
  assert.equal(reinforcementBreakdown(state)?.regions.some((line) => line.name === "West"), false);
  assert.equal(regionStanding(state, 0).find((region) => region.name === "West")?.held, 2);
  assert.equal(openTurn(state, state.activePlayer, () => 0), state);

  const captured = engine.serialize({ version: 1, state, rng: createRng("region-capture").snapshot() });
  const resumedCapture = engine.deserialize(captured);
  assert.equal(resumedCapture.ok, true);
  if (!resumedCapture.ok) return;
  assert.deepEqual(resumedCapture.value.state.turnGrant, grant);
  assert.equal(openTurn(resumedCapture.value.state, 0, () => 0), resumedCapture.value.state);

  state = apply(state, { kind: "endAttacks" }, constant(0));
  state = apply(state, { kind: "skipFortify" }, constant(0));
  assert.equal(state.phase.kind, "handoff");
  if (state.phase.kind !== "handoff") return;
  state = apply(state, { kind: "acknowledgeHandoff", turnSequence: state.turnSequence }, constant(0));
  assert.equal(state.activePlayer, 1);
  assert.equal(state.phase.kind, "quiz");
  if (state.phase.kind !== "quiz") return;
  assert.equal(state.phase.baseIncome, 3);
  assert.equal(state.phase.regionIncome, 0);
  assert.deepEqual(state.phase.regionLines, []);
  assert.equal(regionStanding(state, 1).find((region) => region.name === "South")?.held, 2);

  state = apply(state, skip(state), constant(0));
  const defender = state.holdings.find((holding) => holding.owner === 1);
  assert.ok(defender);
  assert.equal(state.phase.kind, "place");
  if (state.phase.kind !== "place") return;
  state = apply(state, { kind: "place", countyId: defender.countyId, count: state.phase.remaining }, constant(0));
  state = apply(state, { kind: "endAttacks" }, constant(0));
  state = apply(state, { kind: "skipFortify" }, constant(0));
  assert.equal(state.phase.kind, "handoff");
  if (state.phase.kind !== "handoff") return;
  const once = openTurn(state, state.phase.nextPlayer, () => 0);
  const twice = openTurn(once, once.activePlayer, () => 0);
  assert.equal(twice, once);
  assert.equal(once.phase.kind, "quiz");
  if (once.phase.kind !== "quiz") return;
  assert.equal(once.activePlayer, 0);
  assert.equal(once.phase.baseIncome, 3);
  assert.equal(once.phase.regionIncome, 10);
  assert.deepEqual(once.phase.regionLines?.map((line) => [line.name, line.bonus]), [["North", 6], ["West", 4]]);
  assert.equal(armyTotal(twice, 0), armyTotal(once, 0));
});

test("the map renders region borders and names the county region", () => {
  const harness = borderHarness();
  harness.view.show(harness.state);
  const paths = harness.doc.querySelectorAll("#map .region-border");
  assert.equal(paths.length, 2);
  const split = harness.doc.querySelector('#map [data-region-id="split"]');
  assert.equal(split?.getAttribute("d"), "M0,0L1,0M9,9L10,9");
  assert.equal((split?.getAttribute("d") ?? "").match(/M/g)?.length, 2);
  const whole = harness.doc.querySelector('#map [data-region-id="whole"]');
  assert.equal(whole?.getAttribute("d"), "M2,2L3,2");
  assert.equal(harness.doc.querySelector("#map .region-borders")?.getAttribute("pointer-events"), "none");
  countyNode(harness.doc, "18001").dispatchEvent(new DomMouseEvent("click"));
  assert.equal(countyNode(harness.doc, "18001").classList.contains("is-selected"), true);
  const info = harness.doc.getElementById("county-info")?.textContent ?? "";
  assert.match(info, /Region: Split\./);
  const listed = harness.doc.querySelectorAll("#regions li");
  assert.equal(listed.length, 2);
  assert.match(listed[0]?.textContent ?? "", /Split: 1 of 2\. Bonus 5\./);
  assert.match(listed[1]?.textContent ?? "", /Whole: 0 of 1\. Bonus 3\./);

  const css = `${readFileSync(path.join(root, "src", "styles", "theme.css"), "utf8")}\n${readFileSync(path.join(root, "src", "styles.css"), "utf8")}`;
  const html = readFileSync(path.join(root, "index.html"), "utf8");
  const map = parseMapPack(JSON.parse(readFileSync(path.join(root, "data", "regions", "in", "map.json"), "utf8")));
  for (const region of map.regions) {
    assert.equal(html.includes(`data-region-id="${region.id}"`), true);
    assert.equal(html.includes(region.borderPath), true);
  }
  assert.match(css, /--region-border-width:\s*2\.6/);
  assert.match(css, /--region-border-color:\s*#101820/);
  assert.match(css, /\.region-border\s*\{[^}]*stroke:\s*var\(--region-border-color\)/);
  assert.match(css, /\.region-border\s*\{[^}]*stroke-width:\s*var\(--region-border-width\)/);
  assert.match(css, /\.county-shape\s*\{[^}]*stroke-width:\s*0\.8/);
});

function ownedNames(state: GameState, player: PlayerId): string[] {
  return state.holdings.filter((holding) => holding.owner === player).map((holding) => holding.countyId);
}

function armyTotal(state: GameState, player: PlayerId): number {
  return state.holdings.reduce((total, holding) => total + (holding.owner === player ? holding.armies : 0), 0);
}

function open(map: MapPack, quiz: QuizPack): GameState {
  const rng = constant(0);
  const result = engine.createGame(config(map, quiz), () => rng.draw());
  if (!result.ok) throw new Error(result.error.message);
  assert.deepEqual(engine.checkInvariants(result.value), []);
  return result.value;
}

function apply(state: GameState, action: Action, rng: SeededRng): GameState {
  const result = engine.reduce(state, action, () => rng.draw());
  if (!result.ok) throw new Error(result.error.message);
  assert.deepEqual(engine.checkInvariants(result.state), []);
  const saved = engine.serialize({ version: 1, state: result.state, rng: createRng("round-trip").snapshot() });
  const loaded = engine.deserialize(saved);
  if (!loaded.ok) throw new Error(loaded.error.message);
  assert.deepEqual(loaded.value.state, result.state);
  return result.state;
}

function answer(state: GameState, index: number): Action {
  if (state.phase.kind !== "quiz") throw new Error("expected a quiz");
  return { kind: "answerQuiz", turnSequence: state.turnSequence, questionId: state.phase.pending.questionId, answer: { kind: "choice", index } };
}

function skip(state: GameState): Action {
  if (state.phase.kind !== "quiz") throw new Error("expected a quiz");
  return { kind: "skipQuiz", turnSequence: state.turnSequence, questionId: state.phase.pending.questionId };
}

function correctIndex(state: GameState): number {
  if (state.phase.kind !== "quiz") throw new Error("expected a quiz");
  const pending = state.phase.pending;
  const question = state.config.quiz.counties[pending.countyId]?.find((item) => item.id === pending.questionId);
  if (!question) throw new Error("missing question");
  const index = pending.choiceOrder.indexOf(question.correctLetter);
  if (index < 0) throw new Error("missing correct choice");
  return index;
}

function config(map: MapPack, quiz: QuizPack): GameConfig {
  return {
    players: [
      { id: 0, label: "Seat 1", kind: "human" },
      { id: 1, label: "Seat 2", kind: "human" },
    ],
    mode: "total92",
    map,
    quiz,
  };
}

function timingMap(): MapPack {
  const ids = ["99001", "99002", "99003", "99004", "99005", "99006"];
  const neighbors: Record<string, string[]> = {
    "99001": ["99002"],
    "99002": ["99001", "99003"],
    "99003": ["99002", "99004"],
    "99004": ["99003", "99005"],
    "99005": ["99004", "99006"],
    "99006": ["99005"],
  };
  return {
    version: 1,
    id: "indiana",
    digest: "region-timing",
    viewBox: [0, 0, 10, 10],
    outline: "M0,0L1,0",
    counties: ids.map((id) => ({
      id: id as CountyId,
      name: `County ${id}`,
      path: "M0,0L1,0L1,1Z",
      centroid: [0, 0] as const,
      neighbors: (neighbors[id] ?? []) as CountyId[],
      regionId: (id === "99001" || id === "99002" ? "west" : id === "99003" || id === "99005" ? "south" : "north") as MapPack["regions"][number]["id"],
      facts: [],
    })),
    regions: [
      region("north", "North", ["99002", "99004", "99006"], 6),
      region("south", "South", ["99001", "99003", "99005"], 9),
      region("west", "West", ["99001", "99002"], 4),
    ],
  };
}

function region(id: string, name: string, counties: readonly string[], bonus: number, borderPath = "M0,0L1,0"): MapPack["regions"][number] {
  return {
    id: id as MapPack["regions"][number]["id"],
    name,
    counties: counties as CountyId[],
    borderPath,
    bonus,
    review: "reviewed",
  };
}

function questionsFor(map: MapPack): QuizPack {
  const counties: Record<string, QuizQuestion[]> = {};
  for (const county of map.counties) counties[county.id] = [makeQuestion(county)];
  return { version: 1, mapDigest: map.digest, sourceDigest: "region-fixture", counties: counties as QuizPack["counties"] };
}

function makeQuestion(county: County): QuizQuestion {
  return {
    kind: "multipleChoice",
    id: `q-${county.id}` as QuestionId,
    countyId: county.id,
    countyName: county.name,
    countySeat: "Seat",
    established: 1816,
    namedFor: "Name",
    category: "history",
    prompt: `Which seat belongs to ${county.name}?`,
    choices: { A: "Seat", B: "Other", C: "Third", D: "Fourth" },
    correctLetter: "A",
    correctAnswer: "Seat",
  };
}

function constant(value: number): SeededRng {
  let draws = 0;
  return {
    version: 1,
    algorithm: "constant",
    draw() {
      draws += 1;
      return value;
    },
    snapshot(): RngSnapshot {
      return { version: 1, algorithm: "constant", seed: String(value), draws };
    },
    restore(snapshot) {
      draws = snapshot.draws;
    },
  };
}

function sequence(values: readonly number[]): SeededRng {
  let draws = 0;
  return {
    version: 1,
    algorithm: "sequence",
    draw() {
      const value = values[draws] ?? 0;
      draws += 1;
      return value;
    },
    snapshot(): RngSnapshot {
      return { version: 1, algorithm: "sequence", seed: values.join(","), draws };
    },
    restore(snapshot) {
      draws = snapshot.draws;
    },
  };
}

function borderHarness(): { doc: DomDocument; state: GameState; view: ReturnType<typeof bindMap> } {
  const doc = createDocument();
  useDocument(doc);
  const column = doc.createElement("div");
  column.className = "map-column";
  const svg = doc.createElement("svg");
  svg.id = "map";
  for (const id of ["18001", "18003", "18005"]) {
    const county = doc.createElement("g");
    county.className = "county";
    county.setAttribute("data-county-id", id);
    const label = doc.createElement("text");
    label.className = "county-label";
    const badge = doc.createElement("text");
    badge.className = "army-badge-count";
    county.append(label, badge);
    svg.append(county);
  }
  column.append(svg);
  const regions = doc.createElement("section");
  regions.id = "regions";
  regions.append(doc.createElement("ul"));
  const info = doc.createElement("section");
  info.id = "county-info";
  const status = doc.createElement("p");
  status.id = "error-status";
  doc.documentElement.append(column, regions, info, status);
  const state = borderState();
  return { doc, state, view: bindMap(doc as unknown as Document) };
}

function borderState(): GameState {
  const ids = ["18001", "18003", "18005"];
  const map: MapPack = {
    version: 1,
    id: "indiana",
    digest: "region-borders",
    viewBox: [0, 0, 30, 10],
    outline: "M0,0L1,0",
    counties: ids.map((id, index) => ({
      id: id as CountyId,
      name: `County ${id}`,
      path: "",
      centroid: [index * 10, 0] as const,
      neighbors: ids.filter((other) => other !== id) as CountyId[],
      regionId: (index === 2 ? "whole" : "split") as MapPack["regions"][number]["id"],
      facts: [],
    })),
    regions: [
      region("split", "Split", ["18001", "18003"], 5, "M0,0L1,0M9,9L10,9"),
      region("whole", "Whole", ["18005"], 3, "M2,2L3,2"),
    ],
  };
  return {
    version: 1,
    config: {
      players: [
        { id: 0, label: "Seat 1", kind: "human" },
        { id: 1, label: "Seat 2", kind: "human" },
      ],
      mode: "total92",
      map,
      quiz: { version: 1, mapDigest: map.digest, sourceDigest: "none", counties: {} } as QuizPack,
    },
    activePlayer: 0,
    turnSequence: 1,
    holdings: [
      { countyId: "18001" as CountyId, owner: 0, armies: 3 },
      { countyId: "18003" as CountyId, owner: 1, armies: 2 },
      { countyId: "18005" as CountyId, owner: 1, armies: 2 },
    ],
    phase: { kind: "attack" },
    asked: [],
    events: [],
  };
}

function countyNode(doc: DomDocument, id: string): DomElement {
  const node = doc.querySelector(`#map [data-county-id="${id}"]`);
  if (!node) throw new Error(`missing ${id}`);
  return node;
}
