import assert from "node:assert/strict";
import { test } from "node:test";
import { parseArgs } from "../scripts/sim/run.ts";
import { formatReport, loadIndianaBoard, playGame, resolveOptions, runSimulation } from "../scripts/sim/harness.ts";

const board = loadIndianaBoard();

test("the sim command defaults to 50 seeds and a 0.6 quiz coin", () => {
  assert.deepEqual(parseArgs([]), { help: false, options: {} });
  assert.deepEqual(resolveOptions({}), {
    seeds: 50,
    players: 2,
    mode: "quick60",
    success: 0.6,
    maxSteps: 2000,
    runSeed: "sim",
  });
  assert.equal(parseArgs(["--help"]).help, true);
  assert.throws(() => parseArgs(["--mode", "blitz"]), /quick60 or total92/);
});

test("the same seeds play the same games", () => {
  const options = { seeds: 2, maxSteps: 40, runSeed: "repeat" };
  const left = runSimulation(board, options);
  const right = runSimulation(board, options);
  assert.deepEqual(left, right);
  assert.equal(left.failures.length, 0);
  assert.equal(left.counties, 92);
  assert.equal(left.games.length, 2);
  assert.ok(left.quizAnswered > 0);
});

test("a sure answer takes the fixed quiz award and a miss does not", () => {
  const correct = playGame(board, resolveOptions({ seeds: 1, success: 1, maxSteps: 1, runSeed: "award" }), 0);
  const missed = playGame(board, resolveOptions({ seeds: 1, success: 0, maxSteps: 1, runSeed: "award" }), 0);
  assert.deepEqual(correct.failures, []);
  assert.deepEqual(missed.failures, []);
  assert.deepEqual(correct.quiz[0], { answered: 1, correct: 1 });
  assert.deepEqual(missed.quiz[0], { answered: 1, correct: 0 });
  assert.equal(correct.outcome, "cap");
});

test("a short step cap is a result, not an invariant failure", () => {
  const report = runSimulation(board, { seeds: 1, maxSteps: 5, runSeed: "cap" });
  assert.equal(report.failures.length, 0);
  assert.equal(report.capped, 1);
  assert.equal(report.decided, 0);
  assert.match(formatReport(report), /capped=1/);
  assert.match(formatReport(report), /no decided games/);
});
