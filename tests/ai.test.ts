import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parseMapPack } from "../factory/parse-map.ts";
import { baselinePolicy, chooseAction, DEFAULT_COMPUTER_CONFIG, isComputerTurn, playTurn } from "../src/ai/ai.ts";
import { createRng, engine } from "../src/engine/engine.ts";
import type { SeededRng } from "../src/engine/engine.ts";
import type { County, CountyId, GameEvent, GameState, MapPack, Phase, PlayerId, QuestionId, QuizPack, QuizQuestion, Rng } from "../src/types.ts";

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

const zero: Rng = () => 0;
const byCounty = new Map(indiana.counties.map((county) => [county.id, county]));

test("completing a region beats an easier attack outside it", () => {
  const region = indiana.regions.find((item) => item.counties.length >= 8);
  assert.ok(region);
  if (!region) return;
  const gap = region.counties.find((countyId) => region.counties.some((other) => other !== countyId && (byCounty.get(other)?.neighbors ?? []).includes(countyId)));
  assert.ok(gap);
  if (!gap) return;
  const outside = indiana.counties.find((county) => !region.counties.includes(county.id) && county.neighbors.some((neighbor) => !region.counties.includes(neighbor)));
  assert.ok(outside);
  if (!outside) return;
  const keep = new Set<string>([outside.id]);
  for (const other of indiana.regions) {
    if (other.id === region.id) continue;
    const blocker = other.counties.find((countyId) => countyId !== outside.id);
    if (blocker) keep.add(blocker);
  }
  const state = paint((county) => {
    if (county.id === gap) return { owner: 1, armies: 2 };
    if (county.id === outside.id) return { owner: 1, armies: 1 };
    if (keep.has(county.id)) return { owner: 1, armies: 9 };
    if (region.counties.includes(county.id)) return { owner: 0, armies: county.neighbors.includes(gap) ? 8 : 1 };
    if (county.neighbors.includes(outside.id)) return { owner: 0, armies: 14 };
    return { owner: 1, armies: 9 };
  }, { kind: "attack" }, 4, 2);
  const action = chooseAction(state, zero);
  assert.equal(action?.kind, "attack");
  if (action?.kind !== "attack") return;
  assert.equal(action.to, gap);
});

test("breaking a finished opponent region beats an easier raid", () => {
  const region = indiana.regions[0];
  assert.ok(region);
  if (!region) return;
  const gap = region.counties.find((countyId) => (byCounty.get(countyId)?.neighbors ?? []).some((neighbor) => !region.counties.includes(neighbor)));
  assert.ok(gap);
  if (!gap) return;
  const blockers = new Set<string>();
  for (const other of indiana.regions) {
    if (other.id === region.id) continue;
    const blocker = other.counties.find((countyId) => countyId !== gap);
    if (blocker) blockers.add(blocker);
    const second = other.counties.find((countyId) => countyId !== gap && countyId !== blocker);
    if (second) blockers.add(second);
  }
  const easy = [...blockers][0];
  assert.ok(easy);
  if (!easy) return;
  const state = paint((county) => {
    if (region.counties.includes(county.id)) return { owner: 1, armies: county.id === gap ? 2 : 4 };
    if (blockers.has(county.id)) return { owner: 1, armies: county.id === easy ? 1 : 8 };
    if (county.neighbors.includes(gap as CountyId) || county.neighbors.includes(easy as CountyId)) return { owner: 0, armies: 12 };
    return { owner: 0, armies: 1 };
  }, { kind: "attack" }, 4, 2);
  const action = chooseAction(state, zero);
  assert.equal(action?.kind, "attack");
  if (action?.kind !== "attack") return;
  assert.ok(region.counties.includes(action.to));
});

test("the last counties of a nearly beaten player are taken before an easier leader county", () => {
  const anchor = indiana.counties.find((county) => county.neighbors.length >= 2);
  assert.ok(anchor);
  if (!anchor) return;
  const last = anchor.neighbors[0];
  const leaderCounty = anchor.neighbors[1];
  assert.ok(last && leaderCounty);
  if (!last || !leaderCounty) return;
  const holes = new Set<string>();
  for (const region of indiana.regions) {
    const hole = region.counties.find((countyId) => countyId !== anchor.id && countyId !== last && countyId !== leaderCounty);
    if (hole) holes.add(hole);
  }
  const state = paint((county) => {
    if (county.id === anchor.id) return { owner: 0, armies: 10 };
    if (county.id === last) return { owner: 2, armies: 2 };
    if (county.id === leaderCounty) return { owner: 1, armies: 1 };
    if (holes.has(county.id)) return { owner: 0, armies: 1 };
    return { owner: 1, armies: 2 };
  }, { kind: "attack" }, 3, 3);
  const action = chooseAction(state, zero);
  assert.equal(action?.kind, "attack");
  if (action?.kind !== "attack") return;
  assert.equal(action.to, last);
});

test("equal attacks go after the leader", () => {
  const anchor = indiana.counties.find((county) => county.neighbors.length >= 2);
  assert.ok(anchor);
  if (!anchor) return;
  const leaderCounty = anchor.neighbors[0];
  const trailerCounty = anchor.neighbors[1];
  assert.ok(leaderCounty && trailerCounty);
  if (!leaderCounty || !trailerCounty) return;
  const trailer = new Set<string>();
  for (const region of indiana.regions) {
    const hole = region.counties.find((countyId) => countyId !== leaderCounty && countyId !== trailerCounty && countyId !== anchor.id);
    if (hole) trailer.add(hole);
  }
  trailer.add(trailerCounty);
  const state = paint((county) => {
    if (county.id === anchor.id) return { owner: 0, armies: 8 };
    if (county.neighbors.includes(anchor.id) && county.id !== leaderCounty && county.id !== trailerCounty) return { owner: 0, armies: 1 };
    if (county.id === leaderCounty) return { owner: 1, armies: 2 };
    if (trailer.has(county.id)) return { owner: 2, armies: 2 };
    return { owner: 1, armies: 2 };
  }, { kind: "attack" }, 4, 3);
  const action = chooseAction(state, zero);
  assert.equal(action?.kind, "attack");
  if (action?.kind !== "attack") return;
  assert.equal(action.to, leaderCounty);
});

test("a thin edge is refused early and taken late or when someone is close to winning", () => {
  const from = indiana.counties.find((county) => county.neighbors.length > 0);
  assert.ok(from);
  if (!from) return;
  const target = from.neighbors[0];
  assert.ok(target);
  if (!target) return;
  let ours = 0;
  const early = paint((county) => {
    if (county.id === from.id) return { owner: 0, armies: 4 };
    if (county.id === target) return { owner: 1, armies: 3 };
    if (ours < 40) {
      ours += 1;
      return { owner: 0, armies: 1 };
    }
    return { owner: 1, armies: 3 };
  }, { kind: "attack" }, 2, 2);
  assert.equal(chooseAction(early, zero)?.kind, "endAttacks");
  const late = { ...early, turnSequence: 40 };
  const pressed = chooseAction(late, zero);
  assert.equal(pressed?.kind, "attack");
  if (pressed?.kind === "attack") assert.equal(pressed.from, from.id);
  const close = paint((county) => {
    if (county.id === from.id) return { owner: 0, armies: 4 };
    return { owner: 1, armies: 3 };
  }, { kind: "attack" }, 2, 2);
  const closing = chooseAction(close, zero);
  assert.equal(closing?.kind, "attack");
  if (closing?.kind === "attack") assert.equal(closing.from, from.id);
});

test("fortify marches along an owned path the baseline will not cross", () => {
  const enemy = indiana.counties.find((county) => county.neighbors.length >= 2);
  assert.ok(enemy);
  if (!enemy) return;
  const near = new Set<string>([enemy.id, ...enemy.neighbors]);
  for (const neighbor of enemy.neighbors) for (const next of byCounty.get(neighbor)?.neighbors ?? []) near.add(next);
  const source = indiana.counties.find((county) => !near.has(county.id));
  assert.ok(source);
  if (!source) return;
  const state = paint((county) => {
    if (county.id === enemy.id) return { owner: 1, armies: 4 };
    if (county.id === source.id) return { owner: 0, armies: 8 };
    return { owner: 0, armies: 1 };
  }, { kind: "fortify" }, 6, 2);
  assert.equal(baselinePolicy(state, zero)?.kind, "skipFortify");
  const action = chooseAction(state, zero);
  assert.equal(action?.kind, "fortify");
  if (action?.kind !== "fortify") return;
  assert.equal(action.from, source.id);
  assert.equal(action.count, 7);
  assert.equal(source.neighbors.includes(action.to), false);
  const moved = engine.reduce(state, action, zero);
  assert.equal(moved.ok, true);
});

test("reinforcements split across two fronts and stack on one front", () => {
  const separated = separateEnemies();
  assert.ok(separated);
  if (!separated) return;
  const [left, right] = separated;
  const multi = paint((county) => {
    if (county.id === left || county.id === right) return { owner: 1, armies: 8 };
    return { owner: 0, armies: 1 };
  }, placePhase(4), 5, 2);
  const gained = new Map<string, number>();
  let cursor = multi;
  while (cursor.phase.kind === "place") {
    const action = chooseAction(cursor, zero);
    assert.equal(action?.kind, "place");
    if (action?.kind !== "place") return;
    const before = cursor.holdings.find((item) => item.countyId === action.countyId)?.armies ?? 0;
    const applied = engine.reduce(cursor, action, zero);
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    const after = applied.state.holdings.find((item) => item.countyId === action.countyId)?.armies ?? 0;
    gained.set(action.countyId, (gained.get(action.countyId) ?? 0) + (after - before));
    cursor = applied.state;
  }
  const leftTouch = [...gained.keys()].some((countyId) => (byCounty.get(left)?.neighbors ?? []).includes(countyId as CountyId));
  const rightTouch = [...gained.keys()].some((countyId) => (byCounty.get(right)?.neighbors ?? []).includes(countyId as CountyId));
  assert.equal(leftTouch, true);
  assert.equal(rightTouch, true);
  const singleEnemy = indiana.counties.find((county) => county.neighbors.length >= 2);
  assert.ok(singleEnemy);
  if (!singleEnemy) return;
  const spear = singleEnemy.neighbors[0];
  assert.ok(spear);
  if (!spear) return;
  const single = paint((county) => {
    if (county.id === singleEnemy.id) return { owner: 1, armies: 6 };
    if (county.id === spear) return { owner: 0, armies: 5 };
    return { owner: 0, armies: 1 };
  }, placePhase(5), 5, 2);
  const stacked = chooseAction(single, zero);
  assert.deepEqual(stacked, { kind: "place", countyId: spear, count: 5 });
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

function placePhase(remaining: number): Phase {
  return { kind: "place", remaining, income: { base: remaining, regions: 0, quiz: 0 }, quizResult: "wrong" };
}

function paint(
  assign: (county: County) => { owner: PlayerId; armies: number },
  phase: Phase,
  turnSequence: number,
  seats: number,
): GameState {
  return {
    version: 1,
    config: {
      players: Array.from({ length: seats }, (_, index) => ({ id: index as PlayerId, label: `Seat ${index + 1}`, kind: "computer" as const })),
      mode: "total92",
      map: indiana,
      quiz: questionsFor(indiana),
    },
    activePlayer: 0,
    turnSequence,
    holdings: indiana.counties.map((county) => {
      const painted = assign(county);
      return { countyId: county.id, owner: painted.owner, armies: painted.armies };
    }),
    phase,
    asked: [],
    events: [],
  };
}

function separateEnemies(): readonly [CountyId, CountyId] | null {
  for (let left = 0; left < indiana.counties.length; left += 1) {
    const first = indiana.counties[left];
    if (!first) continue;
    for (let right = left + 1; right < indiana.counties.length; right += 1) {
      const second = indiana.counties[right];
      if (!second) continue;
      if (first.neighbors.includes(second.id) || second.neighbors.includes(first.id)) continue;
      const shared = first.neighbors.some((neighbor) => second.neighbors.includes(neighbor));
      if (shared) continue;
      return [first.id, second.id];
    }
  }
  return null;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
