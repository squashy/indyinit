import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parseQuizCsv } from "../factory/parse-quiz-csv.ts";
import { checkQuestion, checkShippedPack, checkShippedQuiz, formatQuizResult } from "./quiz-check.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("structural failures name the broken question", () => {
  const repeated = checkQuestion(question({
    choices: { A: "Same", B: "Same", C: "Third", D: "Fourth" },
    correctAnswer: "Same",
  }));
  assert.deepEqual(repeated, [{ code: "choices", detail: "q-1: choices are not unique" }]);

  const letter = checkQuestion(question({ correctLetter: "B", correctAnswer: "Decatur" }));
  assert.deepEqual(letter, [{ code: "correct-letter", detail: "q-1: correct answer does not match choice B" }]);

  const unnamed = checkQuestion(question({ prompt: "Which city is the seat?" }));
  assert.deepEqual(unnamed, [{ code: "county-name", detail: "q-1: prompt does not name the county" }]);

  const html = checkQuestion(question({ prompt: "Which city is the seat of Adams? <b>Decatur</b>" }));
  assert.deepEqual(html, [{ code: "html", detail: "q-1: prompt contains HTML" }]);
});

test("a shipped pack fails closed under 4 questions, under 3 categories, or without a seat answer", () => {
  const map = { digest: "ab".repeat(32), counties: [{ id: "18001", name: "Adams" }] };
  const thin = checkShippedPack(packOf([question()]), map);
  assert.equal(thin.coverage.minimaEnforced, true);
  assert.equal(thin.coverage.countiesUnderFour, 1);
  assert.equal(thin.coverage.countiesUnderThreeCategories, 1);
  assert.ok(thin.errors.some((error) => error.detail === "18001: fewer than 4 questions"));
  assert.ok(thin.errors.some((error) => error.detail === "18001: fewer than 3 categories"));
  assert.equal(thin.errors.some((error) => error.detail.includes("county seat")), false);
  assert.equal(formatQuizResult(thin).startsWith("quiz structure: FAIL"), true);

  const twoCategories = checkShippedPack(packOf([
    question({ id: "q-1", category: "history" }),
    question({ id: "q-2", category: "history", prompt: "Which history belongs to Adams?", correctLetter: "B", correctAnswer: "Berne" }),
    question({ id: "q-3", category: "landmark", prompt: "Which landmark belongs to Adams?", correctLetter: "C", correctAnswer: "Geneva" }),
    question({ id: "q-4", category: "landmark", prompt: "Which other landmark belongs to Adams?", correctLetter: "D", correctAnswer: "Monroe" }),
  ]), map);
  assert.equal(twoCategories.errors.some((error) => error.detail === "18001: fewer than 4 questions"), false);
  assert.ok(twoCategories.errors.some((error) => error.detail === "18001: fewer than 3 categories"));

  const noSeat = checkShippedPack(packOf([
    question({ id: "q-1", category: "history", correctLetter: "B", correctAnswer: "Berne" }),
    question({ id: "q-2", category: "landmark", prompt: "Which landmark belongs to Adams?", correctLetter: "C", correctAnswer: "Geneva" }),
    question({ id: "q-3", category: "people", prompt: "Which person belongs to Adams?", correctLetter: "D", correctAnswer: "Monroe" }),
    question({ id: "q-4", category: "namesake", prompt: "Which namesake belongs to Adams?", correctLetter: "B", correctAnswer: "Berne" }),
  ]), map);
  assert.deepEqual(noSeat.errors.map((error) => error.detail), ["18001: no question answers with the county seat"]);
  assert.equal(noSeat.coverage.countiesWithoutSeatAnswer, 1);

  const clean = checkShippedPack(packOf([
    question({ id: "q-1", category: "seat" }),
    question({ id: "q-2", category: "history", prompt: "Which history belongs to Adams?", correctLetter: "B", correctAnswer: "Berne" }),
    question({ id: "q-3", category: "landmark", prompt: "Which landmark belongs to Adams?", correctLetter: "C", correctAnswer: "Geneva" }),
    question({ id: "q-4", category: "people", prompt: "Which person belongs to Adams?", correctLetter: "D", correctAnswer: "Monroe" }),
  ]), map);
  assert.deepEqual(clean.errors, []);
  const text = formatQuizResult(clean);
  assert.equal(text.startsWith("quiz structure: PASS"), true);
  assert.match(text, /minima: enforced for the shipped pack/);
  assert.equal(text.includes("ledger: not-implemented"), true);
  assert.equal(text.includes("ledger: pass"), false);
  assert.equal(text.includes("historical fact check: not-run"), true);
});

test("the supplied parser fixture passes and a digest mismatch fails", () => {
  const parsed = parseQuizCsv(readFileSync(path.join(root, "factory", "fixtures", "quiz-sample.csv"), "utf8"));
  assert.equal(parsed.report.errors.length, 0);
  assert.equal(parsed.rows.length, 3);
  for (const row of parsed.rows) assert.deepEqual(checkQuestion(fromRow(row)), []);

  const pack = packOf([
    question({ id: "q-1", category: "seat" }),
    question({ id: "q-2", category: "history", prompt: "Which history belongs to Adams?", correctLetter: "B", correctAnswer: "Berne" }),
    question({ id: "q-3", category: "landmark", prompt: "Which landmark belongs to Adams?", correctLetter: "C", correctAnswer: "Geneva" }),
    question({ id: "q-4", category: "people", prompt: "Which person belongs to Adams?", correctLetter: "D", correctAnswer: "Monroe" }),
  ]);
  const mismatch = checkShippedPack(pack, { digest: "ef".repeat(32), counties: [{ id: "18001", name: "Adams" }] });
  assert.deepEqual(mismatch.errors, [{ code: "digest", detail: "mapDigest does not match the map" }]);
});

test("the shipped quiz pack passes structural checks and reports coverage", () => {
  const result = checkShippedQuiz(root);
  assert.deepEqual(result.errors, []);
  assert.equal(result.coverage.minimaEnforced, true);
  assert.equal(result.coverage.ledger, "not-implemented");
  assert.equal(result.coverage.historicalFactCheck, "not-run");
  assert.equal(result.coverage.mapCountiesMissingFromPack, 0);
  console.log(formatQuizResult(result));
});

function packOf(items: readonly Record<string, unknown>[]): Record<string, unknown> {
  return {
    version: 1,
    mapDigest: "ab".repeat(32),
    sourceDigest: "cd".repeat(32),
    counties: { "18001": items },
  };
}

function question(patch: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "q-1",
    countyId: "18001",
    countyName: "Adams",
    countySeat: "Decatur",
    namedFor: "John Quincy Adams",
    category: "history",
    prompt: "Which city is the seat of Adams?",
    choices: { A: "Decatur", B: "Berne", C: "Geneva", D: "Monroe" },
    correctLetter: "A",
    correctAnswer: "Decatur",
    explanation: "Decatur is the seat.",
    ...patch,
  };
}

function fromRow(row: {
  readonly "Q#": string;
  readonly County: string;
  readonly "County Seat": string;
  readonly "Named For": string;
  readonly Category: string;
  readonly Question: string;
  readonly "Choice A": string;
  readonly "Choice B": string;
  readonly "Choice C": string;
  readonly "Choice D": string;
  readonly "Correct Letter": string;
  readonly "Correct Answer": string;
  readonly Explanation: string;
}): Record<string, unknown> {
  return question({
    id: row["Q#"],
    countyName: row.County,
    countySeat: row["County Seat"],
    namedFor: row["Named For"],
    category: row.Category,
    prompt: row.Question,
    choices: { A: row["Choice A"], B: row["Choice B"], C: row["Choice C"], D: row["Choice D"] },
    correctLetter: row["Correct Letter"],
    correctAnswer: row["Correct Answer"],
    explanation: row.Explanation,
  });
}
