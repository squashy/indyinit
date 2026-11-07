import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { engine } from "../src/engine/engine.ts";
import { bindBattle } from "../src/ui/battle.ts";
import { bindQuiz } from "../src/ui/quiz-dialog.ts";
import { bindTurn } from "../src/ui/turn.ts";
import type { Action, ChoiceLetter, CountyId, GameState, MapPack, QuestionId, QuizPack, QuizQuestion } from "../src/types.ts";
import { createDocument, DomButton, DomKeyboardEvent, installDom, useDocument, type DomDocument } from "./ui-dom.ts";

installDom();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("dice motion uses the confirmed rolls once and reduced motion shows them immediately", () => {
  const harness = motionBattle(false);
  const fought = strike(battleState(), [0.99, 0.0], 1);
  const battle = fought.events.find((event) => event.kind === "battle");
  assert.ok(battle && battle.kind === "battle");
  harness.show(fought);
  const dialog = harness.doc.getElementById("battle-dialog");
  const text = dialog?.textContent ?? "";
  assert.match(text, /Attack dice 6/);
  assert.match(text, /Defend dice 1/);
  assert.match(text, /Attacker lost 0/);
  assert.match(text, /Defender lost 1/);
  assert.equal(dialog?.querySelector(".attack-dice")?.classList.contains("is-rolling"), true);
  const plays = dialog?.dataset.motionPlays;
  harness.show(fought);
  assert.equal(dialog?.dataset.motionPlays, plays);

  const quiet = motionBattle(true);
  quiet.show(fought);
  const quietDialog = quiet.doc.getElementById("battle-dialog");
  assert.equal(quietDialog?.querySelector(".attack-dice")?.classList.contains("is-rolling"), false);
  assert.match(quietDialog?.textContent ?? "", /Attack dice 6/);
  assert.match(quietDialog?.textContent ?? "", /Defender lost 1/);
  const marked = quietDialog?.dataset.motionPlays;
  quiet.show(fought);
  assert.equal(quietDialog?.dataset.motionPlays, marked);

  const shorter = { ...fought, events: fought.events.slice(0, 1) };
  quiet.show(shorter);
  quiet.show(fought);
  assert.notEqual(quietDialog?.dataset.motionPlays, marked);
});

test("a correct quiz credits 2 once, and a wrong or skipped quiz credits 0", () => {
  const correct = quizHarness(false);
  correct.show(correct.state);
  assert.equal(correct.doc.activeElement === correct.choice(0), true);
  assert.match(correct.doc.querySelector(".quiz-unverified")?.textContent ?? "", /Questions unverified/);
  correct.choice(0).click();
  assert.equal(correct.calls, 1);
  assert.equal(correct.live.state.phase.kind, "place");
  if (correct.live.state.phase.kind !== "place") return;
  assert.equal(correct.live.state.phase.income.quiz, 2);
  assert.match(correct.doc.getElementById("quiz-result")?.textContent ?? "", /2/);
  correct.show(correct.live.state);
  correct.choice(0).click();
  assert.equal(correct.calls, 1);

  const wrong = quizHarness(false);
  wrong.show(wrong.state);
  wrong.choice(1).click();
  assert.equal(wrong.live.state.phase.kind, "place");
  if (wrong.live.state.phase.kind !== "place") return;
  assert.equal(wrong.live.state.phase.income.quiz, 0);
  assert.match(wrong.doc.getElementById("quiz-result")?.textContent ?? "", /0/);

  const skipped = quizHarness(false);
  skipped.show(skipped.state);
  skipped.doc.getElementById("skip-quiz")?.click();
  assert.equal(skipped.live.state.phase.kind, "place");
  if (skipped.live.state.phase.kind !== "place") return;
  assert.equal(skipped.live.state.phase.income.quiz, 0);
  assert.match(skipped.doc.getElementById("quiz-result")?.textContent ?? "", /0/);
});

test("quiz focus starts on the first choice and Tab stays in the dialog", () => {
  const harness = quizHarness(false);
  harness.show(harness.state);
  const first = harness.choice(0);
  const skip = harness.doc.getElementById("skip-quiz");
  const dialog = harness.doc.getElementById("quiz-dialog");
  assert.equal(harness.doc.activeElement === first, true);
  assert.equal(dialog?.tagName, "DIALOG");
  assert.equal(dialog?.getAttribute("open") !== null, true);
  assert.ok(skip instanceof DomButton);
  skip.focus();
  skip.dispatchEvent(new DomKeyboardEvent("keydown", { key: "Tab" }));
  assert.equal(harness.doc.activeElement === first, true);
  first.focus();
  first.dispatchEvent(new DomKeyboardEvent("keydown", { key: "Tab", shiftKey: true }));
  assert.equal(harness.doc.activeElement === skip, true);
  const calls = harness.calls;
  first.dispatchEvent(new DomKeyboardEvent("keydown", { key: "Escape" }));
  assert.equal(harness.calls, calls);
  assert.equal(harness.live.state.phase.kind, "quiz");
  assert.equal(first.disabled, false);
  assert.equal(dialog?.hidden, false);
});

test("quiz and battle input lock only the pending action and a rejection can be retried", () => {
  const harness = quizHarness(false);
  harness.show(harness.state);
  const choice = harness.choice(0);
  let release = false;
  const real = harness.act;
  harness.act = (action) => {
    choice.click();
    if (!release) {
      harness.calls += 1;
      const status = harness.doc.getElementById("error-status");
      if (status) status.textContent = "that quiz is not the one on this turn";
      return false;
    }
    return real(action);
  };
  choice.click();
  assert.equal(harness.calls, 1);
  assert.equal(choice.disabled, false);
  release = true;
  choice.click();
  assert.equal(harness.calls, 2);
  assert.equal(harness.live.state.phase.kind, "place");
  if (harness.live.state.phase.kind === "place") assert.equal(harness.live.state.phase.income.quiz, 2);
});

test("phase motion marks a new step once and reduced motion keeps the instruction", () => {
  const harness = phaseHarness(false);
  harness.show(phase("attack"));
  const section = harness.doc.getElementById("phase")?.closest("section");
  assert.equal(section?.classList.contains("is-entering"), true);
  const moves = section?.dataset.phaseMoves;
  harness.show(harness.live.state);
  assert.equal(section?.dataset.phaseMoves, moves);
  harness.show(phase("fortify"));
  assert.notEqual(section?.dataset.phaseMoves, moves);
  assert.match(harness.doc.getElementById("phase")?.textContent ?? "", /Ada/);

  const quiet = phaseHarness(true);
  quiet.show(phase("quiz"));
  const quietSection = quiet.doc.getElementById("phase")?.closest("section");
  assert.equal(quietSection?.classList.contains("is-entering"), false);
  assert.match(quiet.doc.getElementById("phase")?.textContent ?? "", /Ada/);
  assert.match(quiet.doc.getElementById("quiz-dialog")?.textContent ?? "", /Questions unverified|/);
});

test("motion timing stays short and reduced motion removes it", () => {
  const css = readFileSync(path.join(root, "src", "styles.css"), "utf8");
  assert.match(css, /transition:\s*opacity\s+160ms/);
  assert.match(css, /animation:\s*phase-in\s+160ms/);
  assert.match(css, /animation:\s*dice-in\s+400ms/);
  assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*\.is-rolling[\s\S]*animation:\s*none/);
  assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*\.is-entering[\s\S]*animation:\s*none/);
});

function motionBattle(reduced: boolean): { doc: DomDocument; show(state: GameState): void } {
  const doc = createDocument();
  doc.reducedMotion = reduced;
  useDocument(doc);
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
  occupy.append(doc.createElement("p"));
  doc.documentElement.append(battle, occupy);
  const view = bindBattle(doc as unknown as Document, () => false, {
    show() {},
    selected: () => null,
    source: () => county("99001"),
    target: () => county("99002"),
  });
  return { doc, show: (state) => view.show(state) };
}

function quizHarness(reduced: boolean): {
  doc: DomDocument;
  state: GameState;
  live: { state: GameState };
  calls: number;
  act: (action: Action) => boolean;
  show(state: GameState): void;
  choice(index: number): DomButton;
} {
  const doc = createDocument();
  doc.reducedMotion = reduced;
  useDocument(doc);
  const dialog = doc.createElement("section");
  dialog.id = "quiz-dialog";
  dialog.hidden = true;
  const countyName = doc.createElement("h2");
  countyName.id = "quiz-county";
  const question = doc.createElement("p");
  question.id = "quiz-question";
  const choices = doc.createElement("div");
  choices.id = "quiz-choices";
  const result = doc.createElement("p");
  result.id = "quiz-result";
  const skip = doc.createElement("button");
  skip.id = "skip-quiz";
  const status = doc.createElement("p");
  status.id = "error-status";
  dialog.append(countyName, question, choices, result, skip);
  doc.documentElement.append(status, dialog);
  const state = quizState();
  const live = { state };
  const harness = {
    doc,
    state,
    live,
    calls: 0,
    act(action: Action): boolean {
      harness.calls += 1;
      const reducedResult = engine.reduce(live.state, action, () => 0);
      if (!reducedResult.ok) {
        status.textContent = reducedResult.error.message;
        return false;
      }
      live.state = reducedResult.state;
      status.textContent = "";
      quiz.show(live.state);
      return true;
    },
    show(next: GameState) {
      live.state = next;
      quiz.show(next);
    },
    choice(index: number): DomButton {
      const button = choices.querySelectorAll("button")[index];
      if (!(button instanceof DomButton)) throw new Error("missing choice");
      return button;
    },
  };
  const quiz = bindQuiz(doc as unknown as Document, (action) => harness.act(action));
  return harness;
}

function phaseHarness(reduced: boolean): { doc: DomDocument; live: { state: GameState }; show(state: GameState): void } {
  const doc = createDocument();
  doc.reducedMotion = reduced;
  useDocument(doc);
  const section = doc.createElement("section");
  const phaseNode = doc.createElement("p");
  phaseNode.id = "phase";
  const track = doc.createElement("ol");
  track.className = "phase-track";
  const income = doc.createElement("p");
  income.id = "reinforcement-count";
  const bar = doc.createElement("div");
  bar.className = "status-bar";
  bar.append(phaseNode, track, income);
  const actions = doc.createElement("div");
  actions.className = "turn-actions";
  const endAttacks = doc.createElement("button");
  endAttacks.id = "end-attacks";
  const endTurn = doc.createElement("button");
  endTurn.id = "end-turn";
  actions.append(endAttacks, endTurn);
  section.append(bar, actions);
  const quiz = doc.createElement("section");
  quiz.id = "quiz-dialog";
  const notice = doc.createElement("p");
  notice.className = "quiz-unverified";
  notice.textContent = "Questions unverified";
  const choices = doc.createElement("div");
  choices.id = "quiz-choices";
  const choice = doc.createElement("button");
  choice.textContent = "Alpha";
  choices.append(choice);
  quiz.append(notice, choices);
  doc.documentElement.append(section, quiz);
  const live = { state: phase("attack") };
  const chrome = bindTurn(doc as unknown as Document, () => false, { show() {}, selected: () => null, source: () => null, target: () => null }, () => live.state, () => 0, (run) => run());
  return {
    doc,
    live,
    show(next) {
      live.state = next;
      chrome.show(next);
    },
  };
}

function strike(state: GameState, faces: readonly number[], dice: 1 | 2 | 3): GameState {
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

function battleState(): GameState {
  const map = tinyMap();
  return {
    version: 1,
    config: {
      players: [
        { id: 0, label: "Ada", kind: "human" },
        { id: 1, label: "Bea", kind: "human" },
      ],
      mode: "total92",
      map,
      quiz: { version: 1, mapDigest: map.digest, sourceDigest: "none", counties: {} } as QuizPack,
    },
    activePlayer: 0,
    turnSequence: 3,
    holdings: [
      { countyId: county("99001"), owner: 0, armies: 4 },
      { countyId: county("99002"), owner: 1, armies: 2 },
      { countyId: county("99003"), owner: 1, armies: 1 },
    ],
    phase: { kind: "attack" },
    asked: [],
    events: [{ kind: "phase", phase: "attack", turnSequence: 3, player: 0 }],
  };
}

function quizState(): GameState {
  const map = tinyMap();
  const question = sampleQuestion(county("99001"));
  return {
    version: 1,
    config: {
      players: [
        { id: 0, label: "Ada", kind: "human" },
        { id: 1, label: "Bea", kind: "human" },
      ],
      mode: "total92",
      map,
      quiz: {
        version: 1,
        mapDigest: map.digest,
        sourceDigest: "none",
        counties: { [county("99001")]: [question] },
      } as QuizPack,
    },
    activePlayer: 0,
    turnSequence: 4,
    holdings: [
      { countyId: county("99001"), owner: 0, armies: 2 },
      { countyId: county("99002"), owner: 0, armies: 1 },
      { countyId: county("99003"), owner: 1, armies: 1 },
    ],
    phase: {
      kind: "quiz",
      pending: {
        questionId: question.id,
        countyId: question.countyId,
        turnSequence: 4,
        choiceOrder: ["A", "B", "C", "D"],
      },
      baseIncome: 3,
      regionIncome: 0,
    },
    asked: [],
    events: [],
  };
}

function phase(kind: "attack" | "fortify" | "quiz"): GameState {
  if (kind === "quiz") return quizState();
  return { ...battleState(), phase: { kind } };
}

function sampleQuestion(id: CountyId): QuizQuestion {
  const choices: Record<ChoiceLetter, string> = { A: "Alpha", B: "Bravo", C: "Cairo", D: "Delta" };
  return {
    kind: "multipleChoice",
    id: "q-motion" as QuestionId,
    countyId: id,
    countyName: "County 99001",
    countySeat: "Seat",
    established: 1816,
    namedFor: "A supplied name",
    category: "Place",
    prompt: "Which seat?",
    choices,
    correctLetter: "A",
    correctAnswer: "Alpha",
    explanation: "Supplied.",
  };
}

function tinyMap(): MapPack {
  return {
    version: 1,
    id: "indiana",
    digest: "motion",
    viewBox: [0, 0, 3, 3],
    outline: "",
    counties: ["99001", "99002", "99003"].map((id, index) => ({
      id: county(id),
      name: `County ${id}`,
      path: "",
      centroid: [index, 0] as const,
      neighbors: ["99001", "99002", "99003"].filter((other) => other !== id).map(county),
      regionId: "north" as MapPack["regions"][number]["id"],
      facts: [],
    })),
    regions: [],
  };
}

function county(id: string): CountyId {
  return id as CountyId;
}
