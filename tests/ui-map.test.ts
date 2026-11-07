import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { bindMap } from "../src/ui/map.ts";
import type { CountyId, GameState, MapPack, PlayerId, QuizPack } from "../src/types.ts";
import { createDocument, DomKeyboardEvent, DomMouseEvent, installDom, useDocument, type DomDocument, type DomElement } from "./ui-dom.ts";

installDom();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PATTERNS = ["checker", "triangles", "dots", "diagonal", "crosshatch", "bars"];

test("six players keep a name, a seat, and a pattern in the legend", () => {
  const harness = mapHarness(6);
  harness.view.show(harness.state);
  for (let seat = 0; seat < 6; seat += 1) {
    const node = harness.doc.querySelector(`#map [data-county-id="${18001 + seat}"]`);
    assert.equal(node?.getAttribute("data-owner"), String(seat));
    const row = harness.doc.querySelector(`#player-stats [data-owner="${seat}"] span:not(.player-swatch)`);
    const text = row?.textContent ?? "";
    assert.match(text, new RegExp(`Player ${seat + 1}`));
    assert.match(text, new RegExp(`seat ${seat + 1}`));
    assert.match(text, new RegExp(PATTERNS[seat] ?? "missing"));
    assert.match(text, /1 count/);
  }
  const theme = readFileSync(path.join(root, "src", "styles", "theme.css"), "utf8");
  for (let seat = 0; seat < 6; seat += 1) {
    assert.match(theme, new RegExp(`--owner-${seat}:`));
    assert.match(theme, new RegExp(`\\.player-swatch\\[data-owner="${seat}"\\][^{]*\\{[^}]*background-image`));
  }
});

test("selection is named in text and drawn with selected, source, and target states", () => {
  const harness = mapHarness(2);
  harness.view.show(harness.state);
  const own = countyNode(harness.doc, "18001");
  const enemy = countyNode(harness.doc, "18002");
  own.dispatchEvent(new DomMouseEvent("click"));
  assert.equal(own.classList.contains("is-selected"), true);
  assert.equal(own.classList.contains("is-source"), true);
  assert.match(harness.doc.getElementById("county-info")?.textContent ?? "", /Selected/);
  assert.match(harness.doc.getElementById("county-info")?.textContent ?? "", /Armies leave from here/);
  enemy.dispatchEvent(new DomMouseEvent("click"));
  assert.equal(enemy.classList.contains("is-target"), true);
  assert.match(harness.doc.getElementById("county-info")?.textContent ?? "", /Aiming here/);
  assert.match(harness.doc.getElementById("county-info")?.textContent ?? "", /County 18002/);
});

test("keyboard moves between counties and selects the focused one", () => {
  const harness = mapHarness(2);
  harness.view.show(harness.state);
  const svg = harness.doc.getElementById("map");
  svg?.focus();
  svg?.dispatchEvent(new DomKeyboardEvent("keydown", { key: "ArrowRight" }));
  const enemy = countyNode(harness.doc, "18002");
  assert.equal(enemy.tabIndex, 0);
  enemy.dispatchEvent(new DomKeyboardEvent("keydown", { key: "Enter" }));
  assert.equal(enemy.classList.contains("is-selected"), true);
  assert.match(harness.doc.getElementById("county-info")?.textContent ?? "", /County 18002/);
});

test("county detail repeats only supplied facts", () => {
  const harness = mapHarness(2);
  const withFact = harness.state.config.map.counties[0];
  if (!withFact) return;
  const state = {
    ...harness.state,
    config: {
      ...harness.state.config,
      map: {
        ...harness.state.config.map,
        counties: harness.state.config.map.counties.map((county, index) => index === 0
          ? { ...county, facts: [{ label: "Seat", text: "A supplied seat" }] }
          : county),
      },
    },
  };
  harness.view.show(state);
  countyNode(harness.doc, "18001").dispatchEvent(new DomMouseEvent("click"));
  const info = harness.doc.getElementById("county-info")?.textContent ?? "";
  assert.match(info, /Seat: A supplied seat/);
  assert.doesNotMatch(info, /fact-checked|verified true/i);
  countyNode(harness.doc, "18002").dispatchEvent(new DomMouseEvent("click"));
  assert.match(harness.doc.getElementById("county-info")?.textContent ?? "", /No places were supplied/);
});

test("desktop labels stay readable and narrow keeps a detail view without sideways overflow", () => {
  const css = readFileSync(path.join(root, "src", "styles.css"), "utf8");
  const html = readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(css, /\.county-label\s*\{[^}]*font-size:\s*(?!0\b)\d/);
  assert.match(css, /@media\s*\(max-width:\s*820px\)[\s\S]*\.county-label\s*\{[^}]*font-size:\s*0/);
  assert.match(css, /html\s*\{[^}]*overflow-x:\s*clip/);
  assert.match(css, /\.county\.is-source[^{]*\{[^}]*stroke-dasharray|\.county\.is-source \.county-shape\s*\{[^}]*stroke-dasharray/);
  assert.match(css, /\.county\.is-target \.county-shape\s*\{[^}]*stroke-dasharray/);
  assert.match(html, /class="compass"/);
  assert.match(html, /Questions unverified|id="county-info"/);
  assert.match(readFileSync(path.join(root, "src", "ui", "quiz-dialog.ts"), "utf8"), /Questions unverified/);
});

function mapHarness(seats: number): { doc: DomDocument; state: GameState; view: ReturnType<typeof bindMap> } {
  const doc = createDocument();
  useDocument(doc);
  const column = doc.createElement("div");
  column.className = "map-column";
  const svg = doc.createElement("svg");
  svg.id = "map";
  const ids = Array.from({ length: Math.max(seats, 2) }, (_item, index) => String(18001 + index));
  for (const id of ids) {
    const county = doc.createElement("g");
    county.className = "county";
    county.setAttribute("data-county-id", id);
    county.tabIndex = -1;
    const label = doc.createElement("text");
    label.className = "county-label";
    const badge = doc.createElement("text");
    badge.className = "army-badge-count";
    county.append(label, badge);
    svg.append(county);
  }
  column.append(svg);
  const stats = doc.createElement("ul");
  stats.id = "player-stats";
  for (let seat = 0; seat < 6; seat += 1) {
    const row = doc.createElement("li");
    row.setAttribute("data-owner", String(seat));
    const swatch = doc.createElement("span");
    swatch.className = "player-swatch";
    const name = doc.createElement("span");
    name.textContent = `Seat ${seat + 1} · ${PATTERNS[seat]}`;
    row.append(swatch, name);
    stats.append(row);
  }
  const info = doc.createElement("section");
  info.id = "county-info";
  const status = doc.createElement("p");
  status.id = "error-status";
  doc.documentElement.append(column, stats, info, status);
  const state = mapState(seats);
  return { doc, state, view: bindMap(doc as unknown as Document) };
}

function countyNode(doc: DomDocument, id: string): DomElement {
  const node = doc.querySelector(`#map [data-county-id="${id}"]`);
  if (!node) throw new Error(`missing ${id}`);
  return node;
}

function mapState(seats: number): GameState {
  const ids = Array.from({ length: Math.max(seats, 2) }, (_item, index) => String(18001 + index));
  const map: MapPack = {
    version: 1,
    id: "indiana",
    digest: "map-visual",
    viewBox: [0, 0, 30, 10],
    outline: "",
    counties: ids.map((id, index) => ({
      id: id as CountyId,
      name: `County ${id}`,
      path: "",
      centroid: [index * 10, 0] as const,
      neighbors: ids.filter((other) => other !== id) as CountyId[],
      regionId: "north" as MapPack["regions"][number]["id"],
      facts: [],
    })),
    regions: [],
  };
  return {
    version: 1,
    config: {
      players: Array.from({ length: seats }, (_item, index) => ({
        id: index as PlayerId,
        label: `Player ${index + 1}`,
        kind: "human" as const,
      })),
      mode: "total92",
      map,
      quiz: { version: 1, mapDigest: map.digest, sourceDigest: "none", counties: {} } as QuizPack,
    },
    activePlayer: 0,
    turnSequence: 1,
    holdings: ids.map((id, index) => ({
      countyId: id as CountyId,
      owner: (index < seats ? index : 0) as PlayerId,
      armies: index === 0 ? 3 : 2,
    })),
    phase: { kind: "attack" },
    asked: [],
    events: [],
  };
}
