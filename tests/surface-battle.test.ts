import assert from "node:assert/strict";
import { test } from "node:test";
import { engine } from "../src/engine/engine.ts";
import { bindBattle } from "../src/ui/battle.ts";
import { bindTurn } from "../src/ui/turn.ts";
import type { Action, CountyId, GameState, MapPack, QuizPack } from "../src/types.ts";
import {
  createDocument,
  DomButton,
  DomEvent,
  DomInput,
  DomKeyboardEvent,
  installDom,
  useDocument,
  type DomDocument,
  type DomElement,
} from "./ui-dom.ts";

installDom();

test("battle text shows both counties, dice, and each side's losses", () => {
  const harness = battleHarness();
  const fought = attack(harness.state, [0.99, 0.8, 0.0, 0.1], 2);
  assert.equal(fought.phase.kind, "attack");
  const battle = fought.events.find((event) => event.kind === "battle");
  assert.ok(battle && battle.kind === "battle");
  if (!battle || battle.kind !== "battle") return;
  assert.equal(battle.attackLosses, 0);
  assert.equal(battle.defenseLosses, 2);
  harness.map.sourceId = "99001";
  harness.map.targetId = "99002";
  harness.show(fought);
  const dialog = harness.doc.getElementById("battle-dialog");
  assert.equal(dialog?.hidden, false);
  const text = dialog?.textContent ?? "";
  assert.match(text, /County 99001/);
  assert.match(text, /County 99002/);
  assert.match(text, /4 armies/);
  assert.match(text, /3 armies/);
  assert.match(text, /Attack dice 6, 5/);
  assert.match(text, /Defend dice 1, 1/);
  assert.match(text, /Attacker lost 0/);
  assert.match(text, /Defender lost 2/);
  assert.equal(harness.doc.getElementById("occupy-dialog")?.hidden, true);

  const missed = attack(battleState(4, 3), [0.0, 0.99], 1);
  const loss = missed.events.find((event) => event.kind === "battle");
  assert.ok(loss && loss.kind === "battle");
  if (!loss || loss.kind !== "battle") return;
  assert.equal(loss.attackLosses, 1);
  assert.equal(loss.defenseLosses, 0);
  harness.show(missed);
  const again = harness.doc.getElementById("battle-dialog")?.textContent ?? "";
  assert.match(again, /Attacker lost 1/);
  assert.match(again, /Defender lost 0/);
  assert.match(again, /Attack dice 1/);
  assert.match(again, /Defend dice 6/);
});

test("a capture opens move-in and keeps the engine minimum, maximum, and garrison", () => {
  const harness = battleHarness();
  const fought = attack(battleState(4, 1), [0.99, 0.0], 1);
  assert.equal(fought.phase.kind, "occupy");
  if (fought.phase.kind !== "occupy") return;
  harness.show(fought);
  assert.equal(harness.doc.getElementById("battle-dialog")?.hidden, true);
  const occupy = harness.doc.getElementById("occupy-dialog");
  assert.equal(occupy?.hidden, false);
  const text = occupy?.textContent ?? "";
  assert.match(text, /Captured/);
  assert.match(text, /County 99002/);
  assert.match(text, /Attacker lost 0/);
  assert.match(text, /Defender lost 1/);
  assert.match(text, /Leave 1/);
  const input = occupyInput(harness.doc);
  const button = moveButton(harness.doc);
  assert.equal(input.min, "1");
  assert.equal(input.max, "3");
  assert.equal(input.value, "1");
  assert.equal(button.disabled, false);
  assert.equal(harness.doc.activeElement === input, true);

  input.value = "99";
  harness.show(fought);
  assert.equal(input.value, "99");
  assert.equal(button.disabled, true);
  const calls = harness.calls;
  button.click();
  assert.equal(harness.calls, calls);

  input.value = "3";
  harness.show(fought);
  assert.equal(button.disabled, false);
  input.focus();
  occupyForm(harness.doc).dispatchEvent(new DomEvent("submit"));
  assert.equal(harness.calls, calls + 1);
  assert.equal(harness.live.state.phase.kind, "attack");
  const from = harness.live.state.holdings.find((holding) => holding.countyId === county("99001"));
  const taken = harness.live.state.holdings.find((holding) => holding.countyId === county("99002"));
  assert.equal(from?.armies, 1);
  assert.equal(taken?.owner, 0);
  assert.equal(taken?.armies, 3);
});

test("move-in rejects a bad count once, keeps the county, and ignores a second click", () => {
  const harness = battleHarness();
  const fought = attack(battleState(4, 1), [0.99, 0.0], 1);
  harness.show(fought);
  const input = occupyInput(harness.doc);
  const button = moveButton(harness.doc);
  input.value = "0";
  input.focus();
  occupyForm(harness.doc).dispatchEvent(new DomEvent("submit"));
  assert.equal(harness.calls, 0);
  assert.match(harness.doc.getElementById("occupy-dialog")?.textContent ?? "", /cannot/);
  assert.equal(harness.doc.getElementById("occupy-dialog")?.hidden, false);

  const broken = {
    ...fought,
    holdings: fought.holdings.filter((holding) => holding.countyId !== fought.phase.from),
  };
  if (broken.phase.kind !== "occupy") return;
  harness.show(broken);
  assert.equal(moveButton(harness.doc).disabled, true);
  input.focus();
  occupyForm(harness.doc).dispatchEvent(new DomEvent("submit"));
  assert.equal(harness.calls, 0);

  harness.show(fought);
  input.value = "2";
  let reject = true;
  const real = harness.act;
  harness.act = (action) => {
    if (reject && action.kind === "occupy") {
      harness.calls += 1;
      const status = harness.doc.getElementById("error-status");
      if (status) status.textContent = "move at least the attacking dice and leave one army behind";
      return false;
    }
    return real(action);
  };
  input.focus();
  button.click();
  assert.equal(harness.calls, 1);
  assert.equal(harness.doc.getElementById("occupy-dialog")?.hidden, false);
  assert.match(harness.doc.getElementById("error-status")?.textContent ?? "", /leave one army behind/);
  assert.equal(button.disabled, false);
  reject = false;
  let inside = 0;
  harness.act = (action) => {
    inside += 1;
    button.click();
    return real(action);
  };
  input.focus();
  button.click();
  assert.equal(inside, 1);
  assert.equal(harness.live.state.phase.kind, "attack");
  const source = harness.doc.querySelector("#map [data-county-id='99001']");
  const endAttacks = harness.doc.getElementById("end-attacks");
  assert.equal(harness.doc.activeElement === source || harness.doc.activeElement === endAttacks, true);
});

test("Enter submits move-in only from the focused form, and Escape cannot skip it", () => {
  const harness = battleHarness();
  const fought = attack(battleState(4, 1), [0.99, 0.0], 1);
  harness.show(fought);
  const input = occupyInput(harness.doc);
  input.value = "1";
  harness.doc.getElementById("map")?.focus();
  occupyForm(harness.doc).dispatchEvent(new DomEvent("submit"));
  assert.equal(harness.calls, 0);
  assert.equal(harness.live.state.phase.kind, "occupy");

  input.focus();
  input.dispatchEvent(new DomKeyboardEvent("keydown", { key: "Escape" }));
  assert.equal(harness.doc.getElementById("occupy-dialog")?.hidden, false);
  assert.equal(harness.calls, 0);

  occupyForm(harness.doc).dispatchEvent(new DomEvent("submit"));
  assert.equal(harness.calls, 1);
  assert.equal(harness.live.state.phase.kind, "attack");
});

test("the trip log repeats the engine losses", () => {
  const doc = createDocument();
  useDocument(doc);
  const log = doc.createElement("ol");
  const trip = doc.createElement("section");
  trip.id = "trip-log";
  trip.appendChild(log);
  const phase = doc.createElement("p");
  phase.id = "phase";
  const track = doc.createElement("ol");
  track.className = "phase-track";
  const income = doc.createElement("p");
  income.id = "reinforcement-count";
  const bar = doc.createElement("div");
  bar.className = "status-bar";
  bar.append(phase, track, income);
  const actions = doc.createElement("div");
  actions.className = "turn-actions";
  const endAttacks = doc.createElement("button");
  endAttacks.id = "end-attacks";
  const endTurn = doc.createElement("button");
  endTurn.id = "end-turn";
  actions.append(endAttacks, endTurn);
  const step = doc.createElement("section");
  step.append(bar, actions);
  doc.documentElement.append(step, trip);
  const fought = attack(battleState(4, 3), [0.99, 0.0, 0.2, 0.4], 2);
  const chrome = bindTurn(doc as unknown as Document, () => false, idleMap(), () => fought, () => 0, (run) => run());
  chrome.show(fought);
  const line = log.textContent ?? "";
  assert.match(line, /Attack dice/);
  assert.match(line, /Defend dice/);
  assert.match(line, /Attacker lost/);
  assert.match(line, /Defender lost/);
});

interface BattleHarness {
  doc: DomDocument;
  state: GameState;
  live: { state: GameState };
  map: { sourceId: string | null; targetId: string | null };
  calls: number;
  act: (action: Action) => boolean;
  show(state: GameState): void;
}

function battleHarness(): BattleHarness {
  const doc = createDocument();
  useDocument(doc);
  doc.documentElement.append(battleShell(doc));
  const live = { state: battleState(4, 3) };
  const map = { sourceId: "99001" as string | null, targetId: "99002" as string | null };
  const harness = {
    doc,
    state: live.state,
    live,
    map,
    calls: 0,
    act(action: Action): boolean {
      harness.calls += 1;
      const result = engine.reduce(live.state, action, () => 0);
      const status = doc.getElementById("error-status");
      if (!result.ok) {
        if (status) status.textContent = result.error.message;
        return false;
      }
      live.state = result.state;
      if (status) status.textContent = "";
      battle.show(live.state);
      return true;
    },
    show(state: GameState) {
      live.state = state;
      battle.show(state);
    },
  };
  const battle = bindBattle(doc as unknown as Document, (action) => harness.act(action), {
    show() {},
    selected: () => null,
    source: () => (map.sourceId ? county(map.sourceId) : null),
    target: () => (map.targetId ? county(map.targetId) : null),
  });
  return harness;
}

function battleShell(doc: DomDocument): DomElement {
  const root = doc.createElement("div");
  const status = doc.createElement("p");
  status.id = "error-status";
  const battle = doc.createElement("section");
  battle.id = "battle-dialog";
  battle.hidden = true;
  for (const name of ["battle-matchup", "attack-dice", "defend-dice", "battle-outcome"]) {
    const line = doc.createElement("p");
    line.className = name;
    battle.append(line);
  }
  const occupy = doc.createElement("section");
  occupy.id = "occupy-dialog";
  occupy.hidden = true;
  const summary = doc.createElement("p");
  const form = doc.createElement("form");
  form.className = "occupy-form";
  const input = doc.createElement("input");
  input.setAttribute("name", "occupy-count");
  const button = doc.createElement("button");
  button.className = "occupy-move";
  if (button instanceof DomButton) button.type = "submit";
  button.textContent = "Move armies";
  form.append(input, button);
  occupy.append(summary, form);
  const endAttacks = doc.createElement("button");
  endAttacks.id = "end-attacks";
  const map = doc.createElement("svg");
  map.id = "map";
  for (const id of ["99001", "99002", "99003"]) {
    const countyNode = doc.createElement("g");
    countyNode.setAttribute("data-county-id", id);
    map.append(countyNode);
  }
  root.append(status, battle, occupy, endAttacks, map);
  return root;
}

function attack(state: GameState, faces: readonly number[], dice: 1 | 2 | 3): GameState {
  let cursor = 0;
  const result = engine.reduce(state, { kind: "attack", from: county("99001"), to: county("99002"), dice }, () => {
    const face = faces[cursor] ?? 0;
    cursor += 1;
    return face;
  });
  assert.equal(result.ok, true);
  if (!result.ok) return state;
  return result.state;
}

function battleState(fromArmies: number, toArmies: number): GameState {
  const map = pairMap();
  return {
    version: 1,
    config: {
      players: [
        { id: 0, label: "Ada", kind: "human" },
        { id: 1, label: "Bea", kind: "human" },
      ],
      mode: "total92",
      map,
      quiz: emptyQuiz(map),
    },
    activePlayer: 0,
    turnSequence: 2,
    holdings: [
      { countyId: county("99001"), owner: 0, armies: fromArmies },
      { countyId: county("99002"), owner: 1, armies: toArmies },
      { countyId: county("99003"), owner: 1, armies: 1 },
    ],
    phase: { kind: "attack" },
    asked: [],
    events: [{ kind: "phase", phase: "attack", turnSequence: 2, player: 0 }],
  };
}

function pairMap(): MapPack {
  return {
    version: 1,
    id: "indiana",
    digest: "battle-pair",
    viewBox: [0, 0, 2, 2],
    outline: "",
    counties: [
      countyRecord("99001", ["99002"]),
      countyRecord("99002", ["99001", "99003"]),
      countyRecord("99003", ["99002"]),
    ],
    regions: [],
  };
}

function countyRecord(id: string, neighbors: readonly string[]): MapPack["counties"][number] {
  return {
    id: county(id),
    name: `County ${id}`,
    path: "",
    centroid: [0, 0],
    neighbors: neighbors.map(county),
    regionId: "north" as MapPack["regions"][number]["id"],
    facts: [],
  };
}

function emptyQuiz(map: MapPack): QuizPack {
  return { version: 1, mapDigest: map.digest, sourceDigest: "none", counties: {} as QuizPack["counties"] };
}

function county(id: string): CountyId {
  return id as CountyId;
}

function occupyInput(doc: DomDocument): DomInput {
  const input = doc.querySelector("#occupy-dialog input[name='occupy-count']");
  if (!(input instanceof DomInput)) throw new Error("occupy input missing");
  return input;
}

function moveButton(doc: DomDocument): DomButton {
  const button = doc.querySelector(".occupy-move");
  if (!(button instanceof DomButton)) throw new Error("move button missing");
  return button;
}

function occupyForm(doc: DomDocument): DomElement {
  const form = doc.querySelector(".occupy-form");
  if (!form) throw new Error("occupy form missing");
  return form;
}

function idleMap() {
  return { show() {}, selected: () => null, source: () => null, target: () => null };
}
