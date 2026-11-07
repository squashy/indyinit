import assert from "node:assert/strict";
import * as path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { answerKeyIssues, formatSafetyResult, sourceSafetyIssues, scanTrackedTree } from "./security-check.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("planted unsafe sources and answer-key files fail", () => {
  const html = sourceSafetyIssues([{ path: "src/ui/quiz.ts", text: "nameEl.innerHTML = question.prompt;\n" }]);
  assert.deepEqual(html, [{ code: "innerHTML", detail: "src/ui/quiz.ts:1 assigns innerHTML" }]);

  const evaluated = sourceSafetyIssues([{ path: "src/main.ts", text: "function run() {\n  eval(playerCode);\n}\n" }]);
  assert.deepEqual(evaluated, [{ code: "eval", detail: "src/main.ts:2 calls eval" }]);

  const remote = sourceSafetyIssues([{ path: "index.html", text: '<script src="https://example.test/app.js"></script>\n' }]);
  assert.deepEqual(remote, [{ code: "external-script", detail: "index.html:1 loads an external script" }]);

  const key = answerKeyIssues(["bank/answer-key.csv"]);
  assert.deepEqual(key, [{ code: "answer-key", detail: "bank/answer-key.csv is a tracked answer-key CSV" }]);
  assert.equal(formatSafetyResult(html).startsWith("security: FAIL"), true);
  assert.equal(formatSafetyResult(html).includes("ledger: not-implemented"), true);
});

test("local scripts, text assignment, and the nokey gameplay CSV pass", () => {
  const local = sourceSafetyIssues([
    { path: "index.html", text: '<script type="module" src="/src/main.ts"></script>\n' },
    { path: "src/ui/quiz.ts", text: "nameEl.textContent = question.prompt;\n" },
    { path: "factory/geometry-source.ts", text: 'export const censusUrl = "https://www2.census.gov/geo/example.zip";\n' },
  ]);
  assert.deepEqual(local, []);
  assert.deepEqual(answerKeyIssues(["inputs/battle-for-the-92-benchmark-1000_nokey.csv", "factory/fixtures/quiz-sample.csv", "metrics/runs.csv"]), []);
});

test("the current tree has no tracked safety findings", () => {
  const result = scanTrackedTree(root);
  assert.deepEqual(result.issues, []);
  const text = formatSafetyResult(result.issues);
  assert.equal(text.includes("security: PASS"), true);
  assert.equal(text.includes("ledger: pass"), false);
  console.log(text);
});
