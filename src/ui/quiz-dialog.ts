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

  skip?.addEventListener("click", () => {
    const state = current;
    if (!state || state.phase.kind !== "quiz") return;
    const pending = state.phase.pending;
    const found = findQuestion(state, pending.countyId, pending.questionId);
    if (act({ kind: "skipQuiz", turnSequence: state.turnSequence, questionId: pending.questionId })) {
      showResult(result, "skipped", found);
      lockChoices(choices);
    }
  });

  let current: GameState | null = null;
  let shownId = "";

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
        show(dialog);
        return;
      }
      if (state.phase.kind !== "quiz") {
        if (state.phase.kind !== "place") hide(dialog);
        return;
      }
      const pending = state.phase.pending;
      const found = findQuestion(state, pending.countyId, pending.questionId);
      const name = countyName(state, pending.countyId);
      county.textContent = name;
      show(dialog);
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
          if (!current || current.phase.kind !== "quiz") return;
          const open = current.phase.pending;
          if (!act({
            kind: "answerQuiz",
            turnSequence: current.turnSequence,
            questionId: open.questionId,
            answer: { kind: "choice", index },
          })) return;
          const letter = open.choiceOrder[index];
          const outcome = found && letter === found.correctLetter ? "correct" : "wrong";
          showResult(result, outcome, found);
          lockChoices(choices);
        });
        choices.appendChild(button);
      });
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

function findQuestion(state: GameState, countyId: CountyId, questionId: string): QuizQuestion | undefined {
  return state.config.quiz.counties[countyId]?.find((item) => item.id === questionId);
}

function countyName(state: GameState, countyId: CountyId): string {
  return state.config.map.counties.find((county) => county.id === countyId)?.name ?? "County";
}

function show(dialog: HTMLElement): void {
  dialog.hidden = false;
  dialog.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function hide(dialog: HTMLElement): void {
  dialog.hidden = true;
}
