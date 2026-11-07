import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import * as path from "node:path";
import type { ChoiceLetter, CountyId, QuestionId, QuizPack, QuizQuestion, RngSnapshot } from "../src/types.ts";
import { displayedChoices, prepareQuestion } from "../src/quiz/quiz.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const adams = "18001" as CountyId;
const allen = "18003" as CountyId;

test("prepareQuestion stays on the selected county and keeps the correct letter after the shuffle", () => {
  const pack = packOf(adams, allen);
  const pending = prepareQuestion(adams, pack, [], 1, () => 0);
  assert.ok(pending);
  assert.equal(pending.countyId, adams);
  assert.equal(pending.turnSequence, 1);
  const question = pack.counties[adams]?.find((item) => item.id === pending.questionId);
  assert.ok(question);
  assert.equal(question.countyName, "Adams");
  assert.equal(question.prompt.includes(question.countyName), true);
  assert.deepEqual([...pending.choiceOrder].sort(), ["A", "B", "C", "D"]);
  const shown = displayedChoices(question, pending.choiceOrder);
  shown.forEach((text) => {
    assert.equal(typeof text, "string");
    assert.equal(text.includes("<"), false);
  });
  const correctIndex = pending.choiceOrder.indexOf(question.correctLetter);
  assert.equal(shown[correctIndex], question.correctAnswer);
  assert.equal("bonus" in question, false);
});

test("questions are not repeated until that county's pool is exhausted", () => {
  const pack = packOf(adams, allen);
  const first = prepareQuestion(adams, pack, [], 1, () => 0);
  assert.ok(first);
  const second = prepareQuestion(adams, pack, [first.questionId], 2, () => 0);
  assert.ok(second);
  assert.notEqual(second.questionId, first.questionId);
  const third = prepareQuestion(adams, pack, [first.questionId, second.questionId], 3, () => 0);
  assert.ok(third);
  assert.equal(third.countyId, adams);
});

test("corrected keys stay pinned for questions 45, 289, and 356", () => {
  const pack = JSON.parse(readFileSync(path.join(root, "data", "quiz.json"), "utf8")) as QuizPack;
  const byId = new Map<string, QuizQuestion>();
  for (const questions of Object.values(pack.counties)) {
    for (const question of questions) byId.set(question.id, question);
  }
  const expected: readonly { id: string; letter: ChoiceLetter; answer: string }[] = [
    { id: "45", letter: "D", answer: "Commissioner of Patents" },
    { id: "289", letter: "A", answer: "A member of the U.S. House" },
    { id: "356", letter: "A", answer: "Andrew Wylie" },
  ];
  for (const item of expected) {
    const question = byId.get(item.id);
    assert.ok(question, item.id);
    assert.equal(question.choices[item.letter], item.answer);
    assert.equal(question.correctLetter, item.letter);
    assert.equal(question.correctAnswer, item.answer);
  }
});

test("a county with no questions returns null and does not draw", () => {
  const pack = packOf(adams, allen);
  const rng = sequence(0.25);
  const before = rng.snapshot().draws;
  assert.equal(prepareQuestion(allen, { ...pack, counties: { ...pack.counties, [allen]: [] } }, [], 1, () => rng.draw()), null);
  assert.equal(rng.snapshot().draws, before);
});

function packOf(first: CountyId, second: CountyId): QuizPack {
  return {
    version: 1,
    mapDigest: "test",
    sourceDigest: "test",
    counties: {
      [first]: [question(first, "Adams", "a"), question(first, "Adams", "b")],
      [second]: [question(second, "Allen", "a")],
    },
  };
}

function question(countyId: CountyId, countyName: string, suffix: string): QuizQuestion {
  return {
    kind: "multipleChoice",
    id: `${countyId}-${suffix}` as QuestionId,
    countyId,
    countyName,
    countySeat: "Seat",
    established: 1816,
    namedFor: "Name",
    category: "history",
    prompt: `Which seat belongs to ${countyName}?`,
    choices: { A: "Seat", B: "Other", C: "Third", D: "Fourth" },
    correctLetter: "A",
    correctAnswer: "Seat",
    explanation: `${countyName} keeps the supplied explanation.`,
  };
}

function sequence(value: number) {
  let draws = 0;
  return {
    version: 1 as const,
    algorithm: "sequence",
    draw() {
      draws += 1;
      return value;
    },
    snapshot(): RngSnapshot {
      return { version: 1, algorithm: "sequence", seed: String(value), draws };
    },
    restore(snapshot: RngSnapshot) {
      draws = snapshot.draws;
    },
  };
}
