import { displayedChoices } from "../quiz/quiz.ts";
import type { Action, CountyId, GameState, QuizQuestion } from "../types.ts";

export type Act = (action: Action) => boolean;

export interface QuizDialog {
  show(state: GameState): void;
}

export function bindQuiz(doc: Document, act: Act): QuizDialog {
  const dialog = doc.getElementById("quiz-dialog");
  const county = doc.getElementById("quiz-county");
  const question = doc.getElementById("quiz-question");
  const choices = doc.getElementById("quiz-choices");
  const result = doc.getElementById("quiz-result");
  const skip = doc.getElementById("skip-quiz");
  ensureNotice(doc, dialog);

  let submission = false;

  skip?.addEventListener("click", () => {
    const state = current;
    if (submission || !state || state.phase.kind !== "quiz") return;
    const pending = state.phase.pending;
    const found = findQuestion(state, pending.countyId, pending.questionId);
    submission = true;
    const ok = act({ kind: "skipQuiz", turnSequence: state.turnSequence, questionId: pending.questionId });
    submission = false;
    if (ok) {
      showResult(result, "skipped", found);
      lockChoices(choices);
    }
  });

  let current: GameState | null = null;
  let shownId = "";

  dialog?.addEventListener("keydown", (event) => {
    if (!(event instanceof KeyboardEvent) || !(dialog instanceof HTMLElement) || dialog.hidden) return;
    if (!current || current.phase.kind !== "quiz") return;
    if (event.key !== "Escape") return;
    event.preventDefault();
  });

  return {
    show(state) {
      current = state;
      if (!dialog || !county || !question || !choices || !result) return;
      if (state.phase.kind === "place" && state.phase.quizResult === "noQuestion") {
        county.textContent = "County";
        question.textContent = "No question was available for the counties you hold.";
        result.textContent = "You get 0 armies.";
        choices.replaceChildren();
        shownId = "";
        settleQuiz(choices, skip);
        show(dialog);
        return;
      }
      if (state.phase.kind !== "quiz") {
        if (state.phase.kind === "place") settleQuiz(choices, skip);
        else hide(dialog);
        return;
      }
      choices.hidden = false;
      if (skip instanceof HTMLButtonElement) {
        skip.hidden = false;
        skip.disabled = false;
      }
      const pending = state.phase.pending;
      const found = findQuestion(state, pending.countyId, pending.questionId);
      const name = countyName(state, pending.countyId);
      county.textContent = name;
      show(dialog);
      if (shownId !== pending.questionId) {
        if (reducedMotion()) dialog.classList.remove("is-entering");
        else dialog.classList.add("is-entering");
      }
      if (shownId === pending.questionId && shownId !== "") return;
      shownId = pending.questionId;
      question.textContent = found?.prompt ?? "";
      result.textContent = "";
      choices.replaceChildren();
      const labels = found ? displayedChoices(found, pending.choiceOrder) : [];
      labels.forEach((label, index) => {
        const button = doc.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.addEventListener("click", () => {
          if (submission || !current || current.phase.kind !== "quiz") return;
          const open = current.phase.pending;
          submission = true;
          const ok = act({
            kind: "answerQuiz",
            turnSequence: current.turnSequence,
            questionId: open.questionId,
            answer: { kind: "choice", index },
          });
          submission = false;
          if (!ok) return;
          const letter = open.choiceOrder[index];
          const outcome = found && letter === found.correctLetter ? "correct" : "wrong";
          showResult(result, outcome, found);
          lockChoices(choices);
        });
        choices.appendChild(button);
      });
      const firstChoice = choices.querySelector("button");
      if (firstChoice instanceof HTMLButtonElement) firstChoice.focus();
      else if (skip instanceof HTMLButtonElement) skip.focus();
    },
  };
}

function ensureNotice(doc: Document, dialog: HTMLElement | null): void {
  if (!dialog || dialog.querySelector(".quiz-unverified")) return;
  const note = doc.createElement("p");
  note.className = "quiz-unverified";
  note.textContent = "Questions unverified";
  dialog.insertBefore(note, dialog.firstChild);
}

function showResult(result: HTMLElement | null, outcome: "correct" | "wrong" | "skipped", found: QuizQuestion | undefined): void {
  if (!result) return;
  const answer = found?.correctAnswer ?? "";
  if (outcome === "correct") {
    result.textContent = "Right. You get 2 armies, one time.";
    return;
  }
  const lead = outcome === "skipped" ? "Skipped." : "Not this time.";
  const note = found?.explanation ? ` ${found.explanation}` : "";
  result.textContent = answer === "" ? `${lead} You get 0 armies.${note}` : `${lead} The answer is ${answer}. You get 0 armies.${note}`;
}

function lockChoices(choices: HTMLElement | null): void {
  if (!choices) return;
  for (const button of Array.from(choices.querySelectorAll("button"))) {
    if (button instanceof HTMLButtonElement) button.disabled = true;
  }
}

function settleQuiz(choices: HTMLElement | null, skip: HTMLElement | null): void {
  lockChoices(choices);
  if (choices) choices.hidden = true;
  if (skip instanceof HTMLButtonElement) {
    skip.disabled = true;
    skip.hidden = true;
  }
}

function findQuestion(state: GameState, countyId: CountyId, questionId: string): QuizQuestion | undefined {
  return state.config.quiz.counties[countyId]?.find((item) => item.id === questionId);
}

function countyName(state: GameState, countyId: CountyId): string {
  return state.config.map.counties.find((county) => county.id === countyId)?.name ?? "County";
}

function reducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function show(dialog: HTMLElement): void {
  dialog.hidden = false;
  const scroller = dialog.closest(".phase-dialogs");
  if (scroller instanceof HTMLElement) scroller.scrollTop = 0;
}

function hide(dialog: HTMLElement): void {
  dialog.hidden = true;
}
