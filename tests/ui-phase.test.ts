import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { engine } from "../src/engine/engine.ts";
import { bindTurn } from "../src/ui/turn.ts";
import type { Action, CountyId, GameState, MapPack, Phase, QuestionId, QuizPack } from "../src/types.ts";
import {
  createDocument,
  DomButton,
  DomKeyboardEvent,
  installDom,
  useDocument,
  type DomDocument,
  type DomElement,
} from "./ui-dom.ts";

installDom();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const STEPS = [
  ["quiz", "Quiz"],
  ["place", "Place"],
  ["attack", "Attack"],
  ["occupy", "Move-in"],
  ["fortify", "Fortify"],
  ["handoff", "Handoff"],
] as const;

test("the phase stepper names every step and highlights only the real phase", () => {
  for (const kind of ["quiz", "place", "attack", "occupy", "fortify", "handoff", "over"] as const) {
    const harness = boot(kind === "quiz" ? quizState() : phaseState(kind));
    const items = harness.doc.querySelectorAll(".phase-track li");
    assert.deepEqual(items.map((item) => item.dataset.step), STEPS.map(([step]) => step));
    assert.deepEqual(items.map((item) => item.textContent), STEPS.map(([, label]) => label));
    const current = items.filter((item) => item.getAttribute("aria-current") === "step");
    if (kind === "over") {
      assert.equal(current.length, 0);
    } else {
      assert.equal(current.length, 1);
      assert.equal(current[0]?.dataset.step, kind);
    }
    const moveIn = items.find((item) => item.dataset.step === "occupy");
    assert.equal(moveIn?.hidden, kind !== "occupy");
    const instruction = harness.doc.getElementById("phase");
    const action = harness.doc.getElementById("phase-action");
    assert.equal(instruction?.dataset.step, kind);
    assert.match(instruction?.textContent ?? "", /Ada/);
    assert.notEqual(action?.textContent ?? "", "");
  }
});

test("county count stays separate from base reinforcement", () => {
  const quiz = boot(quizState());
  const quizIncome = quiz.doc.getElementById("reinforcement-count");
  assert.equal(quizIncome?.dataset.count, "2");
  assert.equal(quizIncome?.dataset.base, "5");
  assert.equal(quizIncome?.dataset.regions, "4");
  assert.equal(quizIncome?.dataset.quiz, "");
  assert.match(quizIncome?.textContent ?? "", /Counties 2\./);
  assert.match(quizIncome?.textContent ?? "", /Base reinforcement 5\./);
  assert.match(quizIncome?.textContent ?? "", /Regions 4\./);
  assert.doesNotMatch(quizIncome?.textContent ?? "", /Counties 5/);

  const place = boot(placeState());
  const placeIncome = place.doc.getElementById("reinforcement-count");
  assert.equal(placeIncome?.dataset.count, "2");
  assert.equal(placeIncome?.dataset.base, "5");
  assert.equal(placeIncome?.dataset.regions, "4");
  assert.equal(placeIncome?.dataset.quiz, "2");
  assert.equal(placeIncome?.dataset.remaining, "11");
  assert.match(placeIncome?.textContent ?? "", /Question 2\./);
  assert.match(placeIncome?.textContent ?? "", /Armies to place 11\./);
});

test("turn controls follow the phase and a stale end turn does not skip fortify", () => {
  const expectations: Record<string, { attacks: boolean; end: boolean; fortify: boolean }> = {
    quiz: { attacks: false, end: false, fortify: false },
    place: { attacks: false, end: false, fortify: false },
    attack: { attacks: true, end: false, fortify: false },
    occupy: { attacks: false, end: false, fortify: false },
    fortify: { attacks: false, end: true, fortify: true },
    handoff: { attacks: false, end: false, fortify: false },
    over: { attacks: false, end: false, fortify: false },
  };
  for (const [kind, expect] of Object.entries(expectations)) {
    const harness = boot(kind === "quiz" ? quizState() : phaseState(kind as Phase["kind"]));
    assert.equal(visible(harness.doc, "end-attacks"), expect.attacks, kind);
    assert.equal(visible(harness.doc, "end-turn"), expect.end, kind);
    const move = harness.doc.querySelector(".fortify-move");
    assert.equal(Boolean(move instanceof harness.button && !move.hidden), expect.fortify, kind);
  }

  const attack = boot(phaseState("attack"));
  const endTurn = attack.doc.getElementById("end-turn");
  assert.ok(endTurn instanceof attack.button);
  endTurn.hidden = false;
  endTurn.disabled = false;
  endTurn.click();
  assert.equal(attack.live.state.phase.kind, "attack");
  assert.match(attack.doc.getElementById("error-status")?.textContent ?? "", /fortify is not open/);

  const stopping = boot(phaseState("attack"));
  stopping.doc.getElementById("end-attacks")?.click();
  assert.equal(stopping.live.state.phase.kind, "fortify");
  assert.equal(stopping.doc.getElementById("error-status")?.textContent, "");

  const fortify = boot(phaseState("fortify"));
  fortify.doc.getElementById("end-turn")?.click();
  assert.equal(fortify.live.state.phase.kind, "handoff");

  const quiz = boot(quizState());
  const attacks = quiz.doc.getElementById("end-attacks");
  assert.ok(attacks instanceof quiz.button);
  attacks.hidden = false;
  attacks.disabled = false;
  attacks.click();
  assert.equal(quiz.live.state.phase.kind, "quiz");
  assert.match(quiz.doc.getElementById("error-status")?.textContent ?? "", /attacks are not open/);

  const ready = quiz.doc.querySelector(".handoff-ready");
  ready?.click();
  assert.equal(quiz.live.state.phase.kind, "quiz");
  assert.match(quiz.doc.getElementById("error-status")?.textContent ?? "", /no handoff is waiting/);
});

test("handoff focus enters Ready, stays put on rerender, and returns after close", () => {
  const harness = boot(phaseState("attack"));
  const map = harness.doc.getElementById("map");
  map?.focus();
  harness.show(phaseState("handoff"));
  const ready = harness.doc.querySelector(".handoff-ready");
  assert.equal(harness.doc.activeElement === ready, true);

  map?.focus();
  harness.chrome.show(harness.live.state);
  assert.equal(harness.doc.activeElement === map, true);

  ready?.focus();
  ready?.dispatchEvent(new DomKeyboardEvent("keydown", { key: "Tab" }));
  assert.equal(harness.doc.activeElement === ready, true);
  const before = harness.live.state.phase.kind;
  ready?.dispatchEvent(new DomKeyboardEvent("keydown", { key: "Escape" }));
  assert.equal(harness.doc.getElementById("handoff-dialog")?.hidden, false);
  assert.equal(harness.live.state.phase.kind, before);

  ready?.focus();
  const quizBox = harness.doc.getElementById("quiz-dialog");
  if (quizBox) quizBox.hidden = false;
  harness.show(quizState());
  const choice = harness.doc.querySelector("#quiz-choices button");
  assert.equal(harness.doc.activeElement === choice, true);
  assert.equal(harness.doc.getElementById("handoff-dialog")?.hidden, true);
});

test("desktop phase controls sit in a dock so the page itself does not scroll", () => {
  const html = readFileSync(path.join(root, "index.html"), "utf8");
  const css = readFileSync(path.join(root, "src", "styles.css"), "utf8");
  const dockAt = html.indexOf('class="phase-dock"');
  const restAt = html.indexOf('class="side-rest"');
  assert.ok(dockAt >= 0 && restAt > dockAt);
  const dock = html.slice(dockAt, restAt);
  for (const id of ["phase", "phase-action", "reinforcement-count", "end-attacks", "end-turn", "quiz-dialog", "battle-dialog", "occupy-dialog", "handoff-dialog"]) {
    assert.match(dock, new RegExp(`id="${id}"`));
  }
  assert.match(dock, /data-step="quiz"/);
  assert.match(dock, /data-step="place"[^>]*>Place</);
  assert.match(dock, /data-step="attack"/);
  assert.match(dock, /data-step="occupy"[^>]*>Move-in</);
  assert.match(dock, /data-step="fortify"/);
  assert.match(dock, /data-step="handoff"[^>]*>Handoff</);
  assert.match(css, /\.phase-dock\s*\{[^}]*overflow:\s*auto/);
  assert.match(css, /\.phase-dialogs[^{]*\{[^}]*overflow:\s*auto/);
  assert.match(css, /#app\s*\{[^}]*overflow:\s*hidden/);
  assert.match(css, /#app\s*\{[^}]*max-height:\s*100dvh/);
  assert.match(css, /@media\s*\(max-width:\s*820px\)[\s\S]*\.side\s*\{[^}]*overflow:\s*visible/);
});

interface Harness {
  doc: DomDocument;
  live: { state: GameState };
  chrome: { show(state: GameState): void };
  button: typeof DomButton;
  show(state: GameState): void;
}

function boot(state: GameState): Harness {
  const doc = createDocument();
  useDocument(doc);
  const shell = phaseShell(doc);
  doc.documentElement.appendChild(shell);
  const live = { state };
  let chrome: { show(state: GameState): void } = { show() {} };
  const act = (action: Action): boolean => {
    const result = engine.reduce(live.state, action, () => 0);
    const status = doc.getElementById("error-status");
    if (!result.ok) {
      if (status) status.textContent = result.error.message;
      return false;
    }
    live.state = result.state;
    if (status) status.textContent = "";
    chrome.show(live.state);
    return true;
  };
  chrome = bindTurn(doc as unknown as Document, act, idleMap(), () => live.state, () => 0, (run) => run());
  chrome.show(live.state);
  return {
    doc,
    live,
    chrome,
    button: DomButton,
    show(next) {
      live.state = next;
      chrome.show(next);
    },
  };
}

function visible(doc: DomDocument, id: string): boolean {
  const node = doc.getElementById(id);
  return Boolean(node && !node.hidden && !(node instanceof DomButton && node.disabled));
}

function phaseShell(doc: DomDocument): DomElement {
  const side = el(doc, "div", "side");
  const dock = el(doc, "div", "phase-dock");
  const status = el(doc, "p");
  status.id = "error-status";
  const step = el(doc, "section");
  const bar = el(doc, "div", "status-bar");
  const phase = el(doc, "p");
  phase.id = "phase";
  const track = el(doc, "ol", "phase-track");
  const income = el(doc, "p");
  income.id = "reinforcement-count";
  const action = el(doc, "p", "phase-action");
  action.id = "phase-action";
  const actions = el(doc, "div", "turn-actions");
  const endAttacks = el(doc, "button");
  endAttacks.id = "end-attacks";
  const endTurn = el(doc, "button");
  endTurn.id = "end-turn";
  actions.append(endAttacks, endTurn);
  bar.append(phase, track, income);
  step.append(bar, action, actions);
  const dialogs = el(doc, "div", "phase-dialogs");
  dialogs.append(quizDialog(doc), battleDialog(doc), occupyDialog(doc), handoffDialog(doc), winnerDialog(doc));
  dock.append(status, step, dialogs);
  const mapColumn = el(doc, "div", "map-column");
  const map = el(doc, "svg");
  map.id = "map";
  mapColumn.append(map);
  side.append(dock, mapColumn);
  return side;
}

function quizDialog(doc: DomDocument): DomElement {
  const dialog = el(doc, "section");
  dialog.id = "quiz-dialog";
  dialog.hidden = true;
  const choices = el(doc, "div");
  choices.id = "quiz-choices";
  const choice = el(doc, "button");
  choice.textContent = "A sample";
  choices.append(choice);
  const skip = el(doc, "button");
  skip.id = "skip-quiz";
  dialog.append(choices, skip);
  return dialog;
}

function battleDialog(doc: DomDocument): DomElement {
  const dialog = el(doc, "section");
  dialog.id = "battle-dialog";
  dialog.hidden = true;
  return dialog;
}

function occupyDialog(doc: DomDocument): DomElement {
  const dialog = el(doc, "section");
  dialog.id = "occupy-dialog";
  dialog.hidden = true;
  const input = el(doc, "input");
  input.setAttribute("name", "occupy-count");
  dialog.append(input);
  return dialog;
}

function handoffDialog(doc: DomDocument): DomElement {
  const dialog = el(doc, "section");
  dialog.id = "handoff-dialog";
  dialog.hidden = true;
  const copy = el(doc, "p");
  const ready = el(doc, "button", "handoff-ready");
  ready.textContent = "Ready";
  dialog.append(copy, ready);
  return dialog;
}

function winnerDialog(doc: DomDocument): DomElement {
  const dialog = el(doc, "section");
  dialog.id = "winner-dialog";
  dialog.hidden = true;
  dialog.append(el(doc, "p"));
  return dialog;
}

function el(doc: DomDocument, tag: string, className = ""): DomElement {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  return node;
}

function idleMap() {
  return {
    show() {},
    selected: () => null,
    source: () => null,
    target: () => null,
  };
}

function quizState(): GameState {
  const state = baseState();
  return {
    ...state,
    phase: {
      kind: "quiz",
      pending: {
        questionId: "q1" as QuestionId,
        countyId: county("99001"),
        turnSequence: 1,
        choiceOrder: ["A", "B", "C", "D"],
      },
      baseIncome: 5,
      regionIncome: 4,
    },
  };
}

function placeState(): GameState {
  return {
    ...baseState(),
    phase: {
      kind: "place",
      remaining: 11,
      income: { base: 5, regions: 4, quiz: 2 },
      quizResult: "correct",
    },
  };
}

function phaseState(kind: Phase["kind"]): GameState {
  const state = baseState();
  if (kind === "quiz") return quizState();
  if (kind === "place") return placeState();
  if (kind === "occupy") {
    return {
      ...state,
      phase: { kind: "occupy", from: county("99001"), to: county("99002"), minimum: 1, previousOwner: 1 },
    };
  }
  if (kind === "handoff") return { ...state, phase: { kind: "handoff", nextPlayer: 1 } };
  if (kind === "over") return { ...state, phase: { kind: "over", winner: 0, mode: "total92" } };
  if (kind === "fortify") return { ...state, phase: { kind: "fortify" } };
  return { ...state, phase: { kind: "attack" } };
}

function baseState(): GameState {
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
    turnSequence: 1,
    holdings: [
      { countyId: county("99001"), owner: 0, armies: 4 },
      { countyId: county("99002"), owner: 0, armies: 2 },
      { countyId: county("99003"), owner: 1, armies: 1 },
    ],
    phase: { kind: "attack" },
    asked: [],
    events: [],
  };
}

function pairMap(): MapPack {
  return {
    version: 1,
    id: "indiana",
    digest: "phase-pair",
    viewBox: [0, 0, 10, 10],
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
