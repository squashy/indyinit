import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { engine } from "../src/engine/engine.ts";
import { bindQuiz } from "../src/ui/quiz-dialog.ts";
import type { Action, ChoiceLetter, CountyId, GameState, MapPack, QuestionId, QuizPack, QuizQuestion } from "../src/types.ts";
import { createDocument, DomButton, DomEvent, DomKeyboardEvent, DomMouseEvent, installDom, useDocument, type DomDocument, type DomElement } from "./ui-dom.ts";

installDom();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("the turn-start quiz opens as a modal over an inert board", () => {
  const harness = openQuiz(false);
  harness.show(harness.state);
  const dialog = quizDialog(harness.doc);
  const app = harness.doc.getElementById("app");
  const background = harness.doc.getElementById("background-control");
  assert.equal(dialog.tagName, "DIALOG");
  assert.equal(dialog.classList.contains("quiz-overlay"), true);
  assert.equal(dialog.getAttribute("open") !== null, true);
  assert.equal(dialog.hidden, false);
  assert.equal(app?.inert, true);
  assert.equal(dialog.inert, false);
  assert.equal(harness.doc.querySelector(".quiz-unverified")?.textContent, "Questions unverified");
  assert.equal(harness.doc.getElementById("quiz-county")?.textContent, "County 99001");
  assert.equal(harness.doc.getElementById("quiz-category")?.textContent, "Place");
  assert.equal(harness.doc.getElementById("quiz-question")?.textContent, "Which seat?");
  assert.deepEqual(
    [...harness.doc.querySelectorAll(".quiz-letter")].map((node) => node.textContent),
    ["A", "B", "C", "D"],
  );
  assert.deepEqual(
    [...harness.doc.querySelectorAll(".quiz-choice-text")].map((node) => node.textContent),
    ["Alpha", "Bravo", "Cairo", "Delta"],
  );
  assert.equal(harness.doc.activeElement === harness.choice(0), true);
  assert.equal(dialog.classList.contains("is-entering"), true);
  background?.focus();
  assert.equal(harness.doc.activeElement === harness.choice(0), true);
  assert.equal(harness.calls, 0);
  harness.show(harness.state);
  assert.equal(harness.calls, 0);
  assert.equal(harness.live.state.phase.kind, "quiz");
});

test("Tab keeps focus inside the quiz dialog", () => {
  const harness = openQuiz(false);
  harness.show(harness.state);
  const dialog = quizDialog(harness.doc);
  const first = harness.choice(0);
  const second = harness.choice(1);
  const lastChoice = harness.choice(3);
  const skip = harness.doc.getElementById("skip-quiz");
  assert.ok(skip instanceof DomButton);
  assert.equal(harness.doc.activeElement === first, true);
  first.dispatchEvent(new DomKeyboardEvent("keydown", { key: "Tab" }));
  assert.equal(harness.doc.activeElement === second, true);
  lastChoice.focus();
  lastChoice.dispatchEvent(new DomKeyboardEvent("keydown", { key: "Tab" }));
  assert.equal(harness.doc.activeElement === skip, true);
  skip.dispatchEvent(new DomKeyboardEvent("keydown", { key: "Tab" }));
  assert.equal(harness.doc.activeElement === first, true);
  first.dispatchEvent(new DomKeyboardEvent("keydown", { key: "Tab", shiftKey: true }));
  assert.equal(harness.doc.activeElement === skip, true);
  assert.equal(dialog.contains(harness.doc.activeElement), true);
  assert.equal(harness.calls, 0);
});

test("Escape, the backdrop, and a close request do not skip or award", () => {
  const harness = openQuiz(false);
  harness.show(harness.state);
  const dialog = quizDialog(harness.doc);
  const first = harness.choice(0);
  assert.equal(typeof dialog.close, "function");
  first.dispatchEvent(new DomKeyboardEvent("keydown", { key: "Escape" }));
  dialog.dispatchEvent(new DomEvent("cancel"));
  dialog.dispatchEvent(new DomMouseEvent("click"));
  dialog.close?.();
  assert.equal(harness.calls, 0);
  assert.equal(harness.live.state.phase.kind, "quiz");
  assert.equal(dialog.getAttribute("open") !== null, true);
  assert.equal(dialog.hidden, false);
  assert.equal(first.disabled, false);
  assert.equal(harness.doc.getElementById("quiz-result")?.textContent, "");
});

test("a correct answer scores 2 once across rerender, repeat clicks, and dismissal", () => {
  const harness = openQuiz(false);
  harness.show(harness.state);
  const dialog = quizDialog(harness.doc);
  harness.choice(0).click();
  assert.equal(harness.calls, 1);
  assert.equal(harness.live.state.phase.kind, "place");
  if (harness.live.state.phase.kind !== "place") return;
  assert.equal(harness.live.state.phase.income.quiz, 2);
  assert.match(harness.doc.getElementById("quiz-result")?.textContent ?? "", /2 armies/);
  assert.equal(dialog.getAttribute("open"), null);
  assert.equal(harness.doc.getElementById("app")?.inert, false);
  harness.show(harness.live.state);
  harness.choice(0).click();
  harness.choice(0).dispatchEvent(new DomMouseEvent("click"));
  dialog.dispatchEvent(new DomKeyboardEvent("keydown", { key: "Escape" }));
  dialog.dispatchEvent(new DomEvent("cancel"));
  assert.equal(harness.calls, 1);
  assert.equal(harness.live.state.phase.income.quiz, 2);
});

test("a wrong answer and a skip score 0 once", () => {
  const wrong = openQuiz(false);
  wrong.show(wrong.state);
  wrong.choice(1).click();
  assert.equal(wrong.calls, 1);
  assert.equal(wrong.live.state.phase.kind, "place");
  if (wrong.live.state.phase.kind !== "place") return;
  assert.equal(wrong.live.state.phase.income.quiz, 0);
  assert.match(wrong.doc.getElementById("quiz-result")?.textContent ?? "", /0 armies/);
  wrong.choice(1).click();
  wrong.show(wrong.live.state);
  assert.equal(wrong.calls, 1);
  assert.equal(wrong.live.state.phase.income.quiz, 0);

  const skipped = openQuiz(false);
  skipped.show(skipped.state);
  skipped.doc.getElementById("skip-quiz")?.click();
  assert.equal(skipped.calls, 1);
  assert.equal(skipped.live.state.phase.kind, "place");
  if (skipped.live.state.phase.kind !== "place") return;
  assert.equal(skipped.live.state.phase.income.quiz, 0);
  assert.match(skipped.doc.getElementById("quiz-result")?.textContent ?? "", /0 armies/);
  skipped.doc.getElementById("skip-quiz")?.click();
  assert.equal(skipped.calls, 1);
  assert.equal(skipped.live.state.phase.income.quiz, 0);
});

test("reduced motion skips the quiz entrance", () => {
  const quiet = openQuiz(true);
  quiet.show(quiet.state);
  const dialog = quizDialog(quiet.doc);
  assert.equal(dialog.tagName, "DIALOG");
  assert.equal(dialog.classList.contains("is-entering"), false);
  assert.equal(dialog.getAttribute("open") !== null, true);
});

test("quiz overlay styles stay on the quiz dialog", () => {
  const css = readFileSync(path.join(root, "src", "styles.css"), "utf8");
  const start = css.indexOf("/* quiz overlay */");
  const end = css.indexOf("/* end quiz overlay */");
  assert.ok(start >= 0 && end > start);
  const overlay = css.slice(start, end);
  assert.match(overlay, /#quiz-dialog\.quiz-overlay:modal\s*\{[^}]*background:\s*var\(--blue\)/);
  assert.match(overlay, /#quiz-dialog\.quiz-overlay:modal\s*\{[^}]*border:[^;]*var\(--gold\)/);
  assert.match(overlay, /#quiz-dialog\.quiz-overlay:modal\s*\{[^}]*box-shadow:/);
  assert.match(overlay, /#quiz-dialog\.quiz-overlay::backdrop\s*\{[^}]*var\(--blue-deep\)/);
  assert.match(overlay, /#quiz-dialog\.quiz-overlay:modal #quiz-county\s*\{[^}]*color:\s*var\(--gold\)/);
  assert.match(overlay, /#quiz-dialog\.quiz-overlay:modal #quiz-question\s*\{[^}]*#fff/);
  assert.match(overlay, /#quiz-dialog\.quiz-overlay:modal #quiz-choices button\s*\{[^}]*background:\s*var\(--paper-card\)/);
  assert.match(overlay, /@media\s*\(min-width:\s*821px\)\s*\{[^}]*#quiz-dialog\.quiz-overlay:modal #quiz-choices\s*\{[^}]*grid-template-columns:\s*1fr 1fr/);
  assert.match(overlay, /grid-template-columns:\s*1fr;/);
  assert.doesNotMatch(overlay, /backdrop-filter|linear-gradient|radial-gradient/);
  assert.doesNotMatch(overlay, /\.landing|\.setup-screen|#battle-dialog|#occupy-dialog|#handoff-dialog/);
});

function quizDialog(doc: DomDocument): DomElement & { close?: () => void; inert?: boolean } {
  const dialog = doc.getElementById("quiz-dialog");
  if (!dialog) throw new Error("missing quiz dialog");
  return dialog;
}

function openQuiz(reduced: boolean): {
  doc: DomDocument;
  state: GameState;
  live: { state: GameState };
  calls: number;
  show(state: GameState): void;
  choice(index: number): DomButton;
} {
  const doc = createDocument();
  doc.reducedMotion = reduced;
  useDocument(doc);
  const app = doc.getElementById("app");
  const background = doc.createElement("button");
  background.id = "background-control";
  background.textContent = "Map";
  app?.append(background);
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
  skip.textContent = "Skip";
  dialog.append(countyName, question, choices, result, skip);
  doc.documentElement.append(dialog);
  const state = quizState();
  const live = { state };
  const harness = {
    doc,
    state,
    live,
    calls: 0,
    show(next: GameState) {
      live.state = next;
      quiz.show(next);
    },
    choice(index: number): DomButton {
      const button = doc.getElementById("quiz-choices")?.querySelectorAll("button")[index];
      if (!(button instanceof DomButton)) throw new Error("missing choice");
      return button;
    },
  };
  const quiz = bindQuiz(doc as unknown as Document, (action: Action) => {
    harness.calls += 1;
    const reducedResult = engine.reduce(live.state, action, () => 0);
    if (!reducedResult.ok) return false;
    live.state = reducedResult.state;
    quiz.show(live.state);
    return true;
  });
  return harness;
}

function quizState(): GameState {
  const map = tinyMap();
  const question = sampleQuestion(county("99001"));
  return {
    version: 1,
    config: {
      players: [
        { id: 0, label: "Seat 1", kind: "human" },
        { id: 1, label: "Seat 2", kind: "human" },
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

function sampleQuestion(id: CountyId): QuizQuestion {
  const choices: Record<ChoiceLetter, string> = { A: "Alpha", B: "Bravo", C: "Cairo", D: "Delta" };
  return {
    kind: "multipleChoice",
    id: "q-overlay" as QuestionId,
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
    digest: "overlay",
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
