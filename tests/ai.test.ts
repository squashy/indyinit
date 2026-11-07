import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parseMapPack } from "../factory/parse-map.ts";
import { chooseAction, DEFAULT_COMPUTER_CONFIG, isComputerTurn, playTurn } from "../src/ai/ai.ts";
import { createRng, engine } from "../src/engine/engine.ts";
import type { SeededRng } from "../src/engine/engine.ts";
import type { County, GameEvent, GameState, MapPack, PlayerId, QuestionId, QuizPack, QuizQuestion, Rng } from "../src/types.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const indiana = parseMapPack(JSON.parse(readFileSync(path.join(root, "data", "regions", "in", "map.json"), "utf8")));

test("defaults are 60% quiz success with a finite step bound", () => {
  assert.equal(DEFAULT_COMPUTER_CONFIG.quizSuccess, 0.6);
  assert.ok(Number.isSafeInteger(DEFAULT_COMPUTER_CONFIG.maxSteps) && DEFAULT_COMPUTER_CONFIG.maxSteps > 0);
});

test("a computer turn reaches handoff within the step bound", () => {
  const rng = createRng("turn");
  const state = open(rng, 2);
  assert.equal(isComputerTurn(state), true);
  const result = playTurn(state, draw(rng), {}, draw(createRng("turn-ai")));
  assert.equal(result.stopped, "handoff");
  assert.ok(result.steps <= DEFAULT_COMPUTER_CONFIG.maxSteps);
  assert.equal(result.actions.length, result.steps);
  assert.equal(result.state.activePlayer, state.activePlayer);
  assert.equal(isComputerTurn(result.state), false);
  assert.deepEqual(engine.checkInvariants(result.state), []);
});

test("the hard step bound stops a turn early and returns the accepted state", () => {
  const rng = createRng("bound");
  const state = open(rng, 2);
  const result = playTurn(state, draw(rng), { maxSteps: 1 }, draw(createRng("bound-ai")));
  assert.equal(result.stopped, "stepLimit");
  assert.equal(result.steps, 1);
  assert.notEqual(result.state.phase.kind, "quiz");
  const none = playTurn(state, draw(rng), { maxSteps: 0 });
  assert.equal(none.steps, 0);
  assert.equal(none.state, state);
});

test("the input state is never mutated", () => {
  const rng = createRng("frozen");
  const state = open(rng, 3);
  const copy = structuredClone(state);
  deepFreeze(state);
  const random = draw(createRng("frozen-ai"));
  assert.ok(chooseAction(state, random));
  const result = playTurn(state, draw(rng), {}, random);
  assert.equal(result.stopped, "handoff");
  assert.deepEqual(state, copy);
});

test("every chosen action is legal across many seeded all-computer turns", () => {
  for (const seats of [2, 4, 6]) {
    const rng = createRng(`legal-${seats}`);
    const random = draw(createRng(`legal-ai-${seats}`));
    let state = open(rng, seats);
    let turns = 0;
    for (; turns < 60 && state.phase.kind !== "over"; turns += 1) {
      // Step-wise: each chosen action must be accepted by the engine.
      for (let step = 0; step < DEFAULT_COMPUTER_CONFIG.maxSteps; step += 1) {
        const action = chooseAction(state, random);
        if (!action) break;
        const result = engine.reduce(state, action, draw(rng));
        assert.equal(result.ok, true, `${seats} seats, turn ${turns}: ${action.kind} rejected`);
        if (!result.ok) return;
        state = result.state;
      }
      assert.ok(state.phase.kind === "handoff" || state.phase.kind === "over", `turn ${turns} ended in ${state.phase.kind}`);
      assert.deepEqual(engine.checkInvariants(state), []);
      if (state.phase.kind === "handoff") state = handoff(state, rng);
    }
    assert.ok(turns > 0);
  }
});

test("playTurn never stops on a rejection over a seeded game", () => {
  const rng = createRng("play");
  const random = draw(createRng("play-ai"));
  let state = open(rng, 3);
  for (let turn = 0; turn < 45 && state.phase.kind !== "over"; turn += 1) {
    const result = playTurn(state, draw(rng), {}, random);
    assert.ok(result.stopped === "handoff" || result.stopped === "over", `turn ${turn} stopped: ${result.stopped}`);
    state = result.state;
    if (state.phase.kind === "handoff") state = handoff(state, rng);
  }
});

test("quiz answers are correct about 60% of the time over a seeded sample", () => {
  const rng = createRng("quiz-sample");
  const state = open(rng, 2);
  assert.equal(state.phase.kind, "quiz");
  if (state.phase.kind !== "quiz") return;
  const pending = state.phase.pending;
  const question = state.config.quiz.counties[pending.countyId]?.find((item) => item.id === pending.questionId);
  assert.ok(question);
  const correct = pending.choiceOrder.indexOf(question.correctLetter);
  const random = draw(createRng("quiz-rate"));
  const trials = 4000;
  let hits = 0;
  for (let trial = 0; trial < trials; trial += 1) {
    const action = chooseAction(state, random);
    assert.ok(action && action.kind === "answerQuiz");
    if (action.kind !== "answerQuiz") return;
    assert.ok(action.answer.index >= 0 && action.answer.index < 4);
    if (action.answer.index === correct) hits += 1;
  }
  const rate = hits / trials;
  assert.ok(Math.abs(rate - 0.6) < 0.03, `observed quiz rate ${rate}`);
});

test("the engine grades the computer's answer and awards only its fixed +2", () => {
  const rng = createRng("grade");
  const state = open(rng, 2);
  const right = playTurn(state, draw(createRng("grade-a")), { maxSteps: 1, quizSuccess: 1 });
  const wrong = playTurn(state, draw(createRng("grade-b")), { maxSteps: 1, quizSuccess: 0 });
  const bonus = (events: readonly GameEvent[]) => events.flatMap((event) => (event.kind === "quizResolved" ? [event.bonus] : []));
  assert.deepEqual(bonus(right.events), [2]);
  assert.deepEqual(bonus(wrong.events), [0]);
  assert.ok(right.actions.every((action) => action.kind !== "skipQuiz"));
});

test("human seats are not computer turns", () => {
  const rng = createRng("human");
  const state = open(rng, 2, "human");
  assert.equal(isComputerTurn(state), false);
});

function open(rng: SeededRng, seats: number, kind: "human" | "computer" = "computer"): GameState {
  const result = engine.createGame(
    {
      players: Array.from({ length: seats }, (_, index) => ({ id: index as PlayerId, label: `Seat ${index + 1}`, kind })),
      mode: "quick60",
      map: indiana,
      quiz: questionsFor(indiana),
    },
    draw(rng),
  );
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function handoff(state: GameState, rng: SeededRng): GameState {
  const result = engine.reduce(state, { kind: "acknowledgeHandoff", turnSequence: state.turnSequence }, draw(rng));
  if (!result.ok) throw new Error(result.error.message);
  return result.state;
}

function draw(rng: SeededRng): Rng {
  return () => rng.draw();
}

function questionsFor(map: MapPack): QuizPack {
  const counties: Record<string, QuizQuestion[]> = {};
  for (const county of map.counties) counties[county.id] = [makeQuestion(county, "1"), makeQuestion(county, "2")];
  return { version: 1, mapDigest: map.digest, sourceDigest: "ai-fixture", counties: counties as QuizPack["counties"] };
}

function makeQuestion(county: County, suffix: string): QuizQuestion {
  return {
    kind: "multipleChoice",
    id: `${county.id}-${suffix}` as QuestionId,
    countyId: county.id,
    countyName: county.name,
    countySeat: "Seat",
    established: 1816,
    namedFor: "Name",
    category: "history",
    prompt: `Which seat belongs to ${county.name}?`,
    choices: { A: "Seat", B: "Other", C: "Third", D: "Fourth" },
    correctLetter: "A",
    correctAnswer: "Seat",
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
