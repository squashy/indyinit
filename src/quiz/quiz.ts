import type { ChoiceLetter, CountyId, PendingQuestion, QuestionId, QuizPack, QuizQuestion, QuizSelector, Rng } from "../types.ts";

const LETTERS: readonly ChoiceLetter[] = ["A", "B", "C", "D"];

export function prepareQuestion(
  selectedCounty: CountyId,
  quizPack: QuizPack,
  askedIds: readonly QuestionId[],
  turnSequence: number,
  rng: Rng,
): PendingQuestion | null {
  const pool = (quizPack.counties[selectedCounty] ?? []).filter(
    (question) => question.countyId === selectedCounty && isPlainQuestion(question),
  );
  if (pool.length === 0) return null;
  const seen = new Set(askedIds);
  const unseen = pool.filter((question) => !seen.has(question.id));
  const source = unseen.length > 0 ? unseen : pool;
  const index = drawIndex(rng, source.length);
  const question = source[index];
  if (!question) return null;
  return {
    questionId: question.id,
    countyId: selectedCounty,
    turnSequence,
    choiceOrder: shuffleChoiceOrder(rng),
  };
}

export function displayedChoices(question: QuizQuestion, order: readonly ChoiceLetter[]): readonly string[] {
  return order.map((letter) => question.choices[letter]);
}

export const quiz: QuizSelector = { prepareQuestion };

function shuffleChoiceOrder(rng: Rng): readonly [ChoiceLetter, ChoiceLetter, ChoiceLetter, ChoiceLetter] {
  const order: ChoiceLetter[] = [...LETTERS];
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swap = drawIndex(rng, index + 1);
    const current = order[index];
    const other = order[swap];
    if (current === undefined || other === undefined) throw new Error("choice shuffle lost a letter");
    order[index] = other;
    order[swap] = current;
  }
  const [first, second, third, fourth] = order;
  if (!first || !second || !third || !fourth) throw new Error("choice shuffle lost a letter");
  return [first, second, third, fourth];
}

function drawIndex(rng: Rng, count: number): number {
  const sample = rng();
  const index = Math.floor(sample * count);
  if (!(sample >= 0 && sample < 1) || index < 0 || index >= count) {
    throw new Error("RNG draw was outside [0, 1)");
  }
  return index;
}

function isPlainQuestion(question: QuizQuestion): boolean {
  return [
    question.prompt,
    question.countyName,
    question.countySeat,
    question.namedFor,
    question.category,
    question.correctAnswer,
    question.explanation ?? "",
    question.choices.A,
    question.choices.B,
    question.choices.C,
    question.choices.D,
  ].every((text) => typeof text === "string" && !text.includes("<") && !text.includes(">"));
}
