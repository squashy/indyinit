import { displayedChoices } from "../quiz/quiz.ts";
import type { GameState, QuizQuestion } from "../types.ts";

export const UNVERIFIED_NOTICE = "Questions unverified";

export type QuizOutcome = "correct" | "wrong" | "skipped";

export function quizCountyLabel(state: GameState): string | null {
  if (state.phase.kind !== "quiz") return null;
  const id = state.phase.pending.countyId;
  return state.config.map.counties.find((county) => county.id === id)?.name ?? null;
}

export function questionForPending(state: GameState): QuizQuestion | null {
  if (state.phase.kind !== "quiz") return null;
  const pending = state.phase.pending;
  return state.config.quiz.counties[pending.countyId]?.find((question) => question.id === pending.questionId) ?? null;
}

export function quizOutcomeText(question: QuizQuestion, result: QuizOutcome, armiesToPlace: number): string {
  const total = `Armies to place: ${armiesToPlace}.`;
  if (result === "correct") return `Right. +2 armies. ${total}`;
  const lead = result === "skipped" ? "Skipped. +0 armies." : "Wrong. +0 armies.";
  const explanation = question.explanation ? ` ${question.explanation}` : "";
  return `${lead} ${total} The answer is ${question.correctAnswer}.${explanation}`;
}

export interface QuizDialogController {
  reset(): void;
  showQuestion(state: GameState): void;
  showOutcome(question: QuizQuestion, countyName: string, result: QuizOutcome, armiesToPlace: number): void;
  hide(): void;
}

export function bindQuizDialog(
  doc: Document,
  handlers: {
    answer(index: number): void;
    skip(): void;
    continue(): void;
  },
): QuizDialogController {
  const dialog = doc.getElementById("quiz-dialog");
  const county = doc.getElementById("quiz-county");
  const prompt = doc.getElementById("quiz-question");
  const choices = doc.getElementById("quiz-choices");
  const result = doc.getElementById("quiz-result");
  const skip = doc.getElementById("skip-quiz");
  const notice = dialog instanceof HTMLElement ? ensureNotice(doc, dialog) : null;
  const continueButton = dialog instanceof HTMLElement ? ensureContinue(doc, dialog, handlers.continue) : null;
  let shownKey = "";

  skip?.addEventListener("click", () => {
    handlers.skip();
  });

  return {
    reset() {
      shownKey = "";
      if (choices) choices.replaceChildren();
      if (result) result.textContent = "";
      if (continueButton) continueButton.hidden = true;
      if (skip instanceof HTMLElement) skip.hidden = false;
    },
    showQuestion(state) {
      if (!(dialog instanceof HTMLElement) || state.phase.kind !== "quiz") return;
      const question = questionForPending(state);
      if (!question) return;
      const key = `${state.turnSequence}:${question.id}`;
      writeNotice(notice);
      if (county) county.textContent = quizCountyLabel(state) ?? question.countyName;
      if (prompt) prompt.textContent = question.prompt;
      if (key !== shownKey && choices) {
        choices.replaceChildren();
        const labels = displayedChoices(question, state.phase.pending.choiceOrder);
        labels.forEach((text, index) => {
          const button = doc.createElement("button");
          button.type = "button";
          button.textContent = text;
          button.dataset.choiceIndex = String(index);
          button.addEventListener("click", () => {
            handlers.answer(index);
          });
          choices.append(button);
        });
        const first = choices.querySelector("button");
        if (first instanceof HTMLButtonElement) first.focus();
        shownKey = key;
      }
      setChoiceDisabled(choices, false);
      if (result) result.textContent = "";
      if (skip instanceof HTMLElement) skip.hidden = false;
      if (continueButton) continueButton.hidden = true;
      dialog.hidden = false;
    },
    showOutcome(question, countyName, outcome, armiesToPlace) {
      if (!(dialog instanceof HTMLElement)) return;
      writeNotice(notice);
      if (county) county.textContent = countyName;
      if (prompt) prompt.textContent = question.prompt;
      if (result) result.textContent = quizOutcomeText(question, outcome, armiesToPlace);
      setChoiceDisabled(choices, true);
      if (skip instanceof HTMLElement) skip.hidden = true;
      if (continueButton) continueButton.hidden = false;
      dialog.hidden = false;
      shownKey = "";
    },
    hide() {
      if (dialog instanceof HTMLElement) dialog.hidden = true;
    },
  };
}

function ensureNotice(doc: Document, dialog: HTMLElement): HTMLElement {
  const existing = doc.getElementById("quiz-unverified");
  if (existing instanceof HTMLElement) return existing;
  const notice = doc.createElement("p");
  notice.id = "quiz-unverified";
  const question = doc.getElementById("quiz-question");
  if (question?.parentElement === dialog) dialog.insertBefore(notice, question);
  else dialog.prepend(notice);
  return notice;
}

function ensureContinue(doc: Document, dialog: HTMLElement, onContinue: () => void): HTMLButtonElement {
  const existing = doc.getElementById("quiz-continue");
  if (existing instanceof HTMLButtonElement) return existing;
  const button = doc.createElement("button");
  button.type = "button";
  button.id = "quiz-continue";
  button.className = "secondary";
  button.textContent = "Continue";
  button.hidden = true;
  button.addEventListener("click", onContinue);
  dialog.append(button);
  return button;
}

function writeNotice(notice: HTMLElement | null): void {
  if (notice) notice.textContent = UNVERIFIED_NOTICE;
}

function setChoiceDisabled(choices: Element | null, disabled: boolean): void {
  if (!choices) return;
  for (const node of Array.from(choices.querySelectorAll("button"))) {
    if (node instanceof HTMLButtonElement) node.disabled = disabled;
  }
}
