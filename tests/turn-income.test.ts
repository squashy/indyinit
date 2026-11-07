import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createRng, engine, type SeededRng } from "../src/engine/engine.ts";
import { quizCountyLabel, quizOutcomeText, UNVERIFIED_NOTICE } from "../src/ui/quiz-dialog.ts";
import { readGamePacks, type GamePacks } from "../src/ui/setup.ts";
import { phaseText, reinforcementCount, reinforcementText } from "../src/ui/turn.ts";
import type { Action, GameState, Player, QuizQuestion } from "../src/types.ts";

test("a correct answer shows the engine income, including +2 once", () => {
  const session = openGame("income-correct");
  const opened = session.state;
  assert.equal(opened.phase.kind, "quiz");
  if (opened.phase.kind !== "quiz") return;
  const question = mustQuestion(opened);
  const pending = opened.phase.pending;
  const holding = opened.holdings.find((item) => item.countyId === pending.countyId);
  assert.equal(holding?.owner, opened.activePlayer);
  assert.equal(question.countyId, pending.countyId);
  assert.equal(quizCountyLabel(opened), opened.config.map.counties.find((county) => county.id === pending.countyId)?.name);
  assert.equal(phaseText(opened).includes("Question"), true);
  assert.equal(phaseText(opened).includes("Ada"), true);
  const before = reinforcementCount(opened);
  const index = pending.choiceOrder.indexOf(question.correctLetter);
  assert.equal(index >= 0, true);
  const answered = act(session, {
    kind: "answerQuiz",
    turnSequence: opened.turnSequence,
    questionId: pending.questionId,
    answer: { kind: "choice", index },
  });
  assert.equal(answered.phase.kind, "place");
  if (answered.phase.kind !== "place") return;
  const income = answered.phase.income.base + answered.phase.income.regions + answered.phase.income.quiz;
  assert.equal(answered.phase.quizResult, "correct");
  assert.equal(answered.phase.income.quiz, 2);
  assert.equal(answered.phase.remaining, income);
  assert.equal(reinforcementCount(answered), income);
  assert.equal(reinforcementCount(answered) - before, 2);
  assert.equal(reinforcementText(answered), `Armies to place: ${income}`);
  assert.equal(quizOutcomeText(question, "correct", reinforcementCount(answered)), `Right. +2 armies. Armies to place: ${income}.`);
  assert.equal(phaseText(answered).includes("Place armies"), true);
  assert.equal(phaseText(answered).includes(String(income)), true);
  const again = engine.reduce(answered, {
    kind: "answerQuiz",
    turnSequence: answered.turnSequence,
    questionId: question.id,
    answer: { kind: "choice", index },
  }, () => 0);
  assert.equal(again.ok, false);
  assert.equal(reinforcementCount(again.state), income);
  if (again.state.phase.kind === "place") assert.equal(again.state.phase.income.quiz, 2);
});

test("a skip or a wrong answer adds 0 and shows the supplied answer", () => {
  const skipped = finishQuiz("income-skip", "skip");
  assert.equal(skipped.state.phase.kind, "place");
  if (skipped.state.phase.kind !== "place") return;
  const skippedIncome = skipped.state.phase.income.base + skipped.state.phase.income.regions + skipped.state.phase.income.quiz;
  assert.equal(skipped.state.phase.quizResult, "skipped");
  assert.equal(skipped.state.phase.income.quiz, 0);
  assert.equal(skipped.state.phase.remaining, skippedIncome);
  assert.equal(reinforcementCount(skipped.state), skippedIncome);
  assert.equal(reinforcementCount(skipped.state) - skipped.before, 0);
  const skippedText = quizOutcomeText(skipped.question, "skipped", reinforcementCount(skipped.state));
  assert.equal(skippedText.includes("+0"), true);
  assert.equal(skippedText.includes(skipped.question.correctAnswer), true);
  if (skipped.question.explanation) assert.equal(skippedText.includes(skipped.question.explanation), true);

  const wrong = finishQuiz("income-wrong", "wrong");
  assert.equal(wrong.state.phase.kind, "place");
  if (wrong.state.phase.kind !== "place") return;
  const wrongIncome = wrong.state.phase.income.base + wrong.state.phase.income.regions + wrong.state.phase.income.quiz;
  assert.equal(wrong.state.phase.quizResult, "wrong");
  assert.equal(wrong.state.phase.income.quiz, 0);
  assert.equal(reinforcementCount(wrong.state), wrongIncome);
  assert.equal(reinforcementCount(wrong.state) - wrong.before, 0);
  const wrongText = quizOutcomeText(wrong.question, "wrong", reinforcementCount(wrong.state));
  assert.equal(wrongText.includes("+0"), true);
  assert.equal(wrongText.includes(wrong.question.correctAnswer), true);
  if (wrong.question.explanation) assert.equal(wrongText.includes(wrong.question.explanation), true);
  assert.equal(/fact-checked/i.test(wrongText), false);
});

test("the quiz notice says questions are unverified", () => {
  assert.equal(UNVERIFIED_NOTICE, "Questions unverified");
  assert.equal(/fact-checked/i.test(UNVERIFIED_NOTICE), false);
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.equal(html.includes(">Questions unverified<"), true);
  assert.equal(/fact-checked/i.test(html), false);
  assert.equal(html.includes('src="/src/main.ts"'), true);
});

function finishQuiz(seed: string, how: "skip" | "wrong"): { state: GameState; question: QuizQuestion; before: number } {
  const session = openGame(seed);
  const opened = session.state;
  assert.equal(opened.phase.kind, "quiz");
  if (opened.phase.kind !== "quiz") throw new Error("expected a quiz");
  const question = mustQuestion(opened);
  const before = reinforcementCount(opened);
  const index = opened.phase.pending.choiceOrder.indexOf(question.correctLetter);
  assert.equal(index >= 0, true);
  const action: Action = how === "skip"
    ? { kind: "skipQuiz", turnSequence: opened.turnSequence, questionId: opened.phase.pending.questionId }
    : {
        kind: "answerQuiz",
        turnSequence: opened.turnSequence,
        questionId: opened.phase.pending.questionId,
        answer: { kind: "choice", index: (index + 1) % 4 },
      };
  return { state: act(session, action), question, before };
}

function openGame(seed: string): { state: GameState; rng: SeededRng } {
  const rng = createRng(seed);
  const packs = loadPacks();
  const created = engine.createGame({
    players: players(),
    mode: "quick60",
    map: packs.map,
    quiz: packs.quiz,
  }, () => rng.draw());
  if (!created.ok) throw new Error(created.error.message);
  return { state: created.value, rng };
}

function act(session: { state: GameState; rng: SeededRng }, action: Action): GameState {
  const result = engine.reduce(session.state, action, () => session.rng.draw());
  if (!result.ok) throw new Error(result.error.message);
  session.state = result.state;
  return result.state;
}

function mustQuestion(state: GameState): QuizQuestion {
  if (state.phase.kind !== "quiz") throw new Error("expected a quiz");
  const pending = state.phase.pending;
  const question = state.config.quiz.counties[pending.countyId]?.find((item) => item.id === pending.questionId);
  if (!question) throw new Error("the pending question is missing");
  return question;
}

function players(): readonly Player[] {
  return [
    { id: 0, label: "Ada", kind: "human" },
    { id: 1, label: "Sam", kind: "human" },
  ];
}

let packs: GamePacks | null = null;

function loadPacks(): GamePacks {
  if (packs) return packs;
  const mapRaw: unknown = JSON.parse(readFileSync(new URL("../data/regions/in/map.json", import.meta.url), "utf8"));
  const quizRaw: unknown = JSON.parse(readFileSync(new URL("../data/quiz.json", import.meta.url), "utf8"));
  const parsed = readGamePacks(mapRaw, quizRaw);
  if (!parsed.ok) throw new Error(parsed.error.message);
  packs = parsed.value;
  return packs;
}
