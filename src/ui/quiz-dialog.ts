import { displayedChoices } from "../quiz/quiz.ts";
import type { Action, CountyId, GameState, QuizQuestion } from "../types.ts";

export type Act = (action: Action) => boolean;

export interface QuizDialog {
  show(state: GameState): void;
}

export function bindQuiz(doc: Document, act: Act): QuizDialog {
  const dialog = upgradeQuizDialog(doc, doc.getElementById("quiz-dialog"));
  const county = doc.getElementById("quiz-county");
  const question = doc.getElementById("quiz-question");
  const choices = doc.getElementById("quiz-choices");
  const result = doc.getElementById("quiz-result");
  const skip = doc.getElementById("skip-quiz");
  ensureNotice(doc, dialog);
  if (dialog) retireCoverNote(dialog);

  let submission = false;
  let current: GameState | null = null;
  let shownId = "";

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

  dialog?.addEventListener("cancel", (event) => {
    event.preventDefault();
  });

  dialog?.addEventListener("close", () => {
    if (!dialog || !current || current.phase.kind !== "quiz") return;
    if (!(dialog instanceof HTMLDialogElement) || dialog.open) return;
    dialog.showModal();
    focusFirst(dialog, skip);
  });

  dialog?.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    event.preventDefault();
  });

  dialog?.addEventListener("keydown", (event) => {
    if (!(event instanceof KeyboardEvent) || !(dialog instanceof HTMLElement)) return;
    if (dialog.hidden || dialog.classList.contains("is-settled")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      return;
    }
    if (event.key !== "Tab" || !current || current.phase.kind !== "quiz") return;
    trapFocus(doc, dialog, event);
  });

  return {
    show(state) {
      current = state;
      if (!dialog || !county || !question || !choices || !result) return;
      if (state.phase.kind === "place" && state.phase.quizResult === "noQuestion") {
        county.textContent = "County";
        setCategory(doc, dialog, "");
        question.textContent = "No question was available for the counties you hold.";
        result.textContent = "You get 0 armies.";
        choices.replaceChildren();
        shownId = "";
        settleQuiz(choices, skip);
        settleModal(doc, dialog);
        return;
      }
      if (state.phase.kind !== "quiz") {
        if (state.phase.kind === "place") {
          settleQuiz(choices, skip);
          settleModal(doc, dialog);
        } else hideModal(doc, dialog);
        return;
      }
      choices.hidden = false;
      if (skip instanceof HTMLButtonElement) {
        skip.hidden = false;
        skip.disabled = false;
      }
      const pending = state.phase.pending;
      const found = findQuestion(state, pending.countyId, pending.questionId);
      county.textContent = countyName(state, pending.countyId);
      setCategory(doc, dialog, found?.category ?? "");
      openModal(doc, dialog);
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
        const mark = doc.createElement("span");
        mark.className = "quiz-letter";
        mark.textContent = READING_ORDER[index] ?? "";
        const text = doc.createElement("span");
        text.className = "quiz-choice-text";
        text.textContent = label;
        button.append(mark, text);
        button.addEventListener("click", () => {
          if (button.disabled || submission || !current || current.phase.kind !== "quiz") return;
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
          const chosen = open.choiceOrder[index];
          const outcome = found && chosen === found.correctLetter ? "correct" : "wrong";
          showResult(result, outcome, found);
          lockChoices(choices);
        });
        choices.appendChild(button);
      });
      focusFirst(dialog, skip);
    },
  };
}

function upgradeQuizDialog(doc: Document, host: HTMLElement | null): HTMLElement | null {
  if (!host) return null;
  if (host instanceof HTMLDialogElement) {
    host.classList.add("quiz-overlay");
    host.removeAttribute("role");
    host.removeAttribute("aria-modal");
    host.setAttribute("aria-labelledby", "quiz-county");
    host.setAttribute("closedby", "none");
    return host;
  }
  const dialog = doc.createElement("dialog");
  const id = host.id;
  dialog.className = host.className;
  dialog.classList.add("quiz-overlay");
  dialog.hidden = host.hidden;
  dialog.setAttribute("aria-labelledby", "quiz-county");
  dialog.setAttribute("closedby", "none");
  for (const child of Array.from(host.childNodes)) dialog.appendChild(child);
  host.replaceWith(dialog);
  dialog.id = id;
  host.id = "";
  return dialog;
}

function openModal(doc: Document, dialog: HTMLElement): void {
  dialog.hidden = false;
  dialog.classList.add("quiz-overlay");
  dialog.classList.remove("is-settled");
  if (dialog instanceof HTMLDialogElement && !dialog.open) dialog.showModal();
  setBackgroundInert(doc, dialog, true);
}

function settleModal(doc: Document, dialog: HTMLElement): void {
  if (dialog instanceof HTMLDialogElement && dialog.open) dialog.close();
  dialog.hidden = false;
  dialog.classList.add("quiz-overlay", "is-settled");
  setBackgroundInert(doc, dialog, false);
}

function hideModal(doc: Document, dialog: HTMLElement): void {
  if (dialog instanceof HTMLDialogElement && dialog.open) dialog.close();
  dialog.classList.remove("is-settled");
  dialog.hidden = true;
  setBackgroundInert(doc, dialog, false);
}

function setBackgroundInert(doc: Document, dialog: HTMLElement, inert: boolean): void {
  const root = doc.getElementById("app");
  if (!(root instanceof HTMLElement)) return;
  const visit = (node: Element): void => {
    if (node === dialog || dialog.contains(node)) return;
    if (node.contains(dialog)) {
      for (const child of Array.from(node.children)) visit(child);
      return;
    }
    if (node instanceof HTMLElement) node.inert = inert;
  };
  visit(root);
}

function trapFocus(doc: Document, dialog: HTMLElement, event: KeyboardEvent): void {
  const items = focusables(dialog);
  const first = items[0];
  const last = items[items.length - 1];
  if (!first || !last) return;
  const active = doc.activeElement;
  const index = active instanceof HTMLElement ? items.indexOf(active) : -1;
  const nextIndex = event.shiftKey
    ? (index <= 0 ? items.length - 1 : index - 1)
    : (index < 0 || index >= items.length - 1 ? 0 : index + 1);
  const next = items[nextIndex];
  if (!next) return;
  event.preventDefault();
  next.focus();
}

function focusables(root: HTMLElement): HTMLElement[] {
  const nodes = Array.from(root.querySelectorAll("button, input, select, textarea"));
  const items: HTMLElement[] = [];
  for (const node of nodes) {
    if (!(node instanceof HTMLElement) || !isShown(node)) continue;
    if ((node instanceof HTMLButtonElement || node instanceof HTMLInputElement || node instanceof HTMLSelectElement) && node.disabled) continue;
    items.push(node);
  }
  return items;
}

function isShown(node: HTMLElement): boolean {
  let current: Element | null = node;
  while (current) {
    if (current instanceof HTMLElement && current.hidden) return false;
    current = current.parentElement;
  }
  return true;
}

function focusFirst(dialog: HTMLElement, skip: HTMLElement | null): void {
  const firstChoice = dialog.querySelector("#quiz-choices button");
  if (firstChoice instanceof HTMLButtonElement && !firstChoice.disabled) firstChoice.focus();
  else if (skip instanceof HTMLButtonElement && !skip.disabled && !skip.hidden) skip.focus();
}

function ensureNotice(doc: Document, dialog: HTMLElement | null): void {
  if (!dialog || dialog.querySelector(".quiz-unverified")) return;
  const note = doc.createElement("p");
  note.className = "quiz-unverified";
  note.textContent = "Questions unverified";
  dialog.insertBefore(note, dialog.firstChild);
}

function retireCoverNote(dialog: HTMLElement): void {
  for (const node of Array.from(dialog.querySelectorAll("p"))) {
    if (!(node instanceof HTMLElement) || node.id || node.classList.contains("quiz-unverified")) continue;
    if ((node.textContent ?? "").includes("does not cover")) {
      node.classList.add("quiz-cover-note");
      node.hidden = true;
    }
  }
}

function setCategory(doc: Document, dialog: HTMLElement, text: string): void {
  const line = categoryLine(doc, dialog);
  line.textContent = text;
  line.hidden = text === "";
}

function categoryLine(doc: Document, dialog: HTMLElement): HTMLElement {
  const existing = dialog.querySelector(".quiz-category");
  if (existing instanceof HTMLElement) return existing;
  const line = doc.createElement("p");
  line.className = "quiz-category";
  line.id = "quiz-category";
  const county = dialog.querySelector("#quiz-county");
  if (county instanceof HTMLElement) insertAfter(county, line);
  else dialog.appendChild(line);
  return line;
}

function insertAfter(anchor: HTMLElement, node: HTMLElement): void {
  const parent = anchor.parentElement;
  if (!parent) return;
  const kids = Array.from(parent.childNodes);
  const index = kids.indexOf(anchor);
  const next = index >= 0 ? kids[index + 1] ?? null : null;
  parent.insertBefore(node, next);
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

const READING_ORDER = ["A", "B", "C", "D"] as const;
