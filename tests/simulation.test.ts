import assert from "node:assert/strict";
import { test } from "node:test";
import { AI_BENCH_SEEDS, parseArgs } from "../scripts/sim/run.ts";
import { aiBenchStream, formatReport, loadIndianaBoard, playGame, resolveOptions, runSimulation, summarizeAiBench } from "../scripts/sim/harness.ts";
import type { AiBenchGame } from "../scripts/sim/harness.ts";

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

test("the ai bench lists 200 seeds and charges unfinished games as 400 turns", () => {
  assert.equal(AI_BENCH_SEEDS.length, 200);
  assert.equal(new Set(AI_BENCH_SEEDS).size, 200);
  assert.deepEqual(AI_BENCH_SEEDS[0], 1);
  assert.deepEqual(AI_BENCH_SEEDS[199], 200);
  assert.equal(aiBenchStream(7, "setup"), "btt33:S7:setup");
  assert.equal(aiBenchStream(7, "combat"), "btt33:S7:combat");
  assert.equal(aiBenchStream(7, "quiz", 1), "btt33:S7:quiz:1");
  assert.equal(aiBenchStream(7, "policy", 0), "btt33:S7:policy:0");
  const games: AiBenchGame[] = [
    { seed: 1, challengerSeat: 0, outcome: "win", winner: 0, turns: 40, playedTurns: 40 },
    { seed: 1, challengerSeat: 1, outcome: "loss", winner: 0, turns: 50, playedTurns: 50 },
    { seed: 2, challengerSeat: 0, outcome: "cap", winner: null, turns: 400, playedTurns: 400 },
    { seed: 2, challengerSeat: 1, outcome: "error", winner: null, turns: 400, playedTurns: 12, error: "bad" },
  ];
  const summary = summarizeAiBench([1, 2], games);
  assert.equal(summary.wins, 1);
  assert.equal(summary.losses, 1);
  assert.equal(summary.caps, 1);
  assert.equal(summary.errors, 1);
  assert.equal(summary.draws, 0);
  assert.equal(summary.medianTurns, 225);
  assert.equal(summary.bySide.seat0Wins, 2);
  assert.equal(summary.bySide.challengerAsSeat0.wins, 1);
  assert.equal(summary.bySide.challengerAsSeat1.losses, 1);
});

test("a short step cap is a result, not an invariant failure", () => {
  const report = runSimulation(board, { seeds: 1, maxSteps: 5, runSeed: "cap" });
  assert.equal(report.failures.length, 0);
  assert.equal(report.capped, 1);
  assert.equal(report.decided, 0);
  assert.match(formatReport(report), /capped=1/);
  assert.match(formatReport(report), /no decided games/);
});
