import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parseMapPack } from "../factory/parse-map.ts";
import { createRng, dispatch, engine, load, save } from "../src/engine/engine.ts";
import type { SeededRng, Session } from "../src/engine/engine.ts";
import type {
  Action,
  County,
  CountyId,
  GameConfig,
  GameState,
  MapPack,
  Mode,
  PlayerId,
  QuestionId,
  QuizPack,
  QuizQuestion,
  Rng,
  RngSnapshot,
} from "../src/types.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const indiana = parseMapPack(JSON.parse(readFileSync(path.join(root, "data", "regions", "in", "map.json"), "utf8")));

test("a seeded deal covers every county once and the second seat's extra armies are not repeated", () => {
  const first = open(indiana, 2, "quick60", createRng("deal"));
  const again = open(indiana, 2, "quick60", createRng("deal"));
  assert.deepEqual(again.holdings, first.holdings);
  assert.notDeepEqual(open(indiana, 2, "quick60", createRng("other")).holdings, first.holdings);
  assert.equal(new Set(first.holdings.map((holding) => holding.countyId)).size, indiana.counties.length);
  const counts = seatCounts(first);
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
  assert.equal(armyTotal(first, 0), 60);
  assert.equal(armyTotal(first, 1), 75);
  const three = open(indiana, 3, "total92", createRng("three"));
  assert.equal(armyTotal(three, 0) + armyTotal(three, 1) + armyTotal(three, 2), 45 * 3);
  assert.deepEqual(engine.checkInvariants(first), []);
});

test("the same seed and the same actions produce the same game", () => {
  const leftRng = createRng("match");
  const rightRng = createRng("match");
  let left = open(indiana, 2, "quick60", leftRng);
  let right = open(indiana, 2, "quick60", rightRng);
  assert.deepEqual(left, right);
  for (let turn = 0; turn < 3; turn += 1) {
    for (let step = 0; step < 8; step += 1) {
      const action = scriptedAction(left);
      if (!action || left.phase.kind === "over") break;
      left = apply(left, action, leftRng);
      right = apply(right, action, rightRng);
    }
  }
  assert.deepEqual(left, right);
  assert.deepEqual(leftRng.snapshot(), rightRng.snapshot());
});

test("a reload keeps the pending quiz and an occupation without redrawing them", () => {
  const rng = createRng("reload");
  const state = open(indiana, 2, "quick60", rng);
  assert.equal(state.phase.kind, "quiz");
  if (state.phase.kind !== "quiz") return;
  const saved = engine.serialize({ version: 1, state, rng: rng.snapshot() });
  const loaded = engine.deserialize(saved);
  assert.equal(loaded.ok, true);
  if (!loaded.ok) return;
  assert.deepEqual(loaded.value.state.phase, state.phase);
  const restored = createRng(loaded.value.rng.seed);
  restored.restore(loaded.value.rng);
  const action = answer(state, 0);
  assert.deepEqual(apply(state, action, rng), apply(loaded.value.state, action, restored));

  const battle = reachOccupy();
  const cursor = createRng("occupy");
  const occupied = engine.serialize({ version: 1, state: battle.state, rng: cursor.snapshot() });
  const resumed = engine.deserialize(occupied);
  assert.equal(resumed.ok, true);
  if (!resumed.ok || battle.state.phase.kind !== "occupy") return;
  assert.deepEqual(resumed.value.state.phase, battle.state.phase);
  assert.deepEqual(resumed.value.rng, cursor.snapshot());
  const move = { kind: "occupy" as const, count: battle.state.phase.minimum };
  assert.deepEqual(apply(battle.state, move, constant(0)), apply(resumed.value.state, move, constant(0)));
});

test("an unsupported rng algorithm fails to load and leaves the live session", () => {
  const rng = createRng("live");
  const state = open(indiana, 2, "quick60", rng);
  const session: Session = { state, rng };
  const cursor = rng.snapshot();
  const saved = JSON.parse(save(session)) as { rng: { algorithm: string } };
  saved.rng.algorithm = "xoshiro128**";
  const loaded = load(session, saved);
  assert.equal(loaded.ok, false);
  if (loaded.ok) return;
  assert.equal(loaded.error.code, "INVALID_SAVE");
  assert.match(loaded.error.message, /algorithm/);
  assert.equal(session.state, state);
  assert.equal(session.rng, rng);
  assert.deepEqual(rng.snapshot(), cursor);
  const direct = engine.deserialize(saved);
  assert.equal(direct.ok, false);
});

test("a mid-quiz save and load keeps the question, choice order, and cursor", () => {
  const rng = createRng("mid-quiz");
  const state = open(indiana, 2, "quick60", rng);
  assert.equal(state.phase.kind, "quiz");
  if (state.phase.kind !== "quiz") return;
  const questionId = state.phase.pending.questionId;
  const choiceOrder = [...state.phase.pending.choiceOrder];
  const cursor = rng.snapshot();
  const session: Session = { state, rng };
  const saved = save(session);
  rng.draw();
  session.state = apply(state, answer(state, 0), createRng("elsewhere"));
  assert.notEqual(session.state.phase.kind, "quiz");
  assert.notDeepEqual(rng.snapshot(), cursor);
  const loaded = load(session, saved);
  assert.equal(loaded.ok, true);
  if (!loaded.ok || session.state.phase.kind !== "quiz") return;
  assert.equal(session.state.phase.pending.questionId, questionId);
  assert.deepEqual([...session.state.phase.pending.choiceOrder], choiceOrder);
  assert.deepEqual(session.rng.snapshot(), cursor);
  assert.equal(session.rng, rng);
});

test("an invalid draw during combat or shuffle is rejected and the cursor stays", () => {
  const setup = constant(0);
  let state = open(linkedMap(), 2, "total92", setup, questionsFor(linkedMap(), () => true));
  state = clearQuizAndPlace(state);
  const pair = attackPair(state, (armies) => armies >= 1);
  assert.ok(pair);
  if (!pair) return;
  const rng = scriptedCursor([0.2, 1]);
  const session: Session = { state, rng };
  const cursor = rng.snapshot();
  const attacked = dispatch(session, { kind: "attack", from: pair.from, to: pair.to, dice: 1 });
  assert.equal(attacked.ok, false);
  if (attacked.ok) return;
  assert.match(attacked.error.message, /RNG/);
  assert.equal(attacked.state, state);
  assert.equal(session.state, state);
  assert.deepEqual(rng.snapshot(), cursor);
  assert.deepEqual(session.rng.snapshot(), cursor);

  const live = open(tinyMap(), 2, "total92", createRng("shuffle-live"), emptyPack(tinyMap()));
  const shuffle = scriptedCursor([0.1, 1]);
  const before = shuffle.snapshot();
  const created = engine.createGame(live.config, inject(shuffle));
  assert.equal(created.ok, false);
  if (!created.ok) {
    assert.equal(created.error.code, "INVALID_INPUT");
    assert.match(created.error.message, /RNG/);
  }
  assert.deepEqual(shuffle.snapshot(), before);
  assert.equal(live.phase.kind, "place");
});

test("a successful transition advances the cursor exactly once", () => {
  let state = open(tinyMap(), 2, "total92", constant(0), emptyPack(tinyMap()));
  for (let guard = 0; guard < 6 && state.phase.kind !== "handoff"; guard += 1) {
    const action = scriptedAction(state);
    if (!action) break;
    state = apply(state, action, constant(0));
  }
  assert.equal(state.phase.kind, "handoff");
  if (state.phase.kind !== "handoff") return;
  const rng = createRng("once");
  const session: Session = { state, rng };
  const before = rng.snapshot().draws;
  const result = dispatch(session, { kind: "acknowledgeHandoff", turnSequence: state.turnSequence });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(session.state, result.state);
  assert.equal(session.state.phase.kind, "place");
  assert.equal(rng.snapshot().draws, before + 1);
  const saved = save(session);
  const reloaded = engine.deserialize(saved);
  assert.equal(reloaded.ok, true);
  if (!reloaded.ok) return;
  assert.equal(reloaded.value.rng.draws, before + 1);
  assert.deepEqual(reloaded.value.state, session.state);
});

test("an invalid action returns the same state and does not advance the RNG", () => {
  const rng = createRng("invalid");
  const state = open(indiana, 2, "quick60", rng);
  const before = rng.snapshot();
  const result = engine.reduce(state, { kind: "endAttacks" }, () => rng.draw());
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.state, state);
  assert.deepEqual(rng.snapshot(), before);
});

test("a correct answer adds exactly 2 once, and a stale or second answer adds nothing", () => {
  const rng = createRng("award");
  const state = open(indiana, 2, "quick60", rng);
  assert.equal(state.phase.kind, "quiz");
  if (state.phase.kind !== "quiz") return;
  const before = rng.snapshot();
  const staleAction: Action = {
    kind: "answerQuiz",
    turnSequence: state.turnSequence + 1,
    questionId: state.phase.pending.questionId,
    answer: { kind: "choice", index: correctIndex(state) },
  };
  const stale = engine.reduce(state, staleAction, () => rng.draw());
  assert.equal(stale.ok, false);
  if (stale.ok) return;
  assert.equal(stale.state, state);
  assert.deepEqual(rng.snapshot(), before);
  const correct = apply(state, answer(state, correctIndex(state)), rng);
  assert.equal(correct.phase.kind, "place");
  if (correct.phase.kind !== "place") return;
  assert.equal(correct.phase.income.quiz, 2);
  assert.equal(correct.phase.remaining, correct.phase.income.base + correct.phase.income.regions + 2);
  assert.equal(correct.phase.income.base, Math.max(3, Math.floor(seatCounts(state)[state.activePlayer]! / 3)));
  const duplicate = engine.reduce(correct, answer(state, correctIndex(state)), () => rng.draw());
  assert.equal(duplicate.ok, false);
  if (duplicate.ok) return;
  assert.equal(duplicate.state, correct);
  const owned = correct.holdings.find((holding) => holding.owner === correct.activePlayer);
  assert.ok(owned);
  const placed = apply(correct, { kind: "place", countyId: owned.countyId, count: correct.phase.remaining }, rng);
  assert.equal(armyTotal(placed) - armyTotal(state), correct.phase.remaining);
});

test("a wrong answer and a skip add zero", () => {
  const wrong = open(indiana, 2, "quick60", createRng("wrong"));
  const skipped = open(indiana, 2, "quick60", createRng("skip"));
  assert.equal(wrong.phase.kind, "quiz");
  assert.equal(skipped.phase.kind, "quiz");
  if (wrong.phase.kind !== "quiz" || skipped.phase.kind !== "quiz") return;
  const missed = apply(wrong, answer(wrong, (correctIndex(wrong) + 1) % 4), createRng("wrong-answer"));
  const passed = apply(skipped, { kind: "skipQuiz", turnSequence: skipped.turnSequence, questionId: skipped.phase.pending.questionId }, createRng("skip-answer"));
  assert.equal(missed.phase.kind, "place");
  assert.equal(passed.phase.kind, "place");
  if (missed.phase.kind !== "place" || passed.phase.kind !== "place") return;
  assert.equal(missed.phase.income.quiz, 0);
  assert.equal(passed.phase.income.quiz, 0);
  assert.equal(missed.phase.quizResult, "wrong");
  assert.equal(passed.phase.quizResult, "skipped");
});

test("acknowledging a handoff twice does not grant income twice", () => {
  const rng = createRng("handoff");
  let state = open(indiana, 2, "quick60", rng);
  for (let guard = 0; guard < 8 && state.phase.kind !== "handoff"; guard += 1) {
    const action = scriptedAction(state);
    if (!action) break;
    state = apply(state, action, rng);
  }
  assert.equal(state.phase.kind, "handoff");
  if (state.phase.kind !== "handoff") return;
  const armies = armyTotal(state);
  const next = apply(state, { kind: "acknowledgeHandoff", turnSequence: state.turnSequence }, rng);
  assert.equal(armyTotal(next), armies);
  assert.equal(next.phase.kind, "quiz");
  if (next.phase.kind !== "quiz") return;
  const owned = seatCounts(next)[next.activePlayer] ?? 0;
  assert.equal(next.phase.baseIncome, Math.max(3, Math.floor(owned / 3)));
  assert.equal(next.phase.regionIncome, regionIncome(next, next.activePlayer));
  const before = rng.snapshot();
  const repeated = engine.reduce(next, { kind: "acknowledgeHandoff", turnSequence: state.turnSequence }, () => rng.draw());
  assert.equal(repeated.ok, false);
  if (repeated.ok) return;
  assert.equal(repeated.state, next);
  assert.deepEqual(rng.snapshot(), before);
});

test("a player with no question gets an explicit zero bonus, and an empty county redraws to one they hold", () => {
  const empty = open(indiana, 2, "quick60", createRng("empty"), emptyPack(indiana));
  assert.equal(empty.phase.kind, "place");
  if (empty.phase.kind !== "place") return;
  assert.equal(empty.phase.quizResult, "noQuestion");
  assert.equal(empty.phase.income.quiz, 0);
  assert.equal(empty.events.some((event) => event.kind === "quizResolved" && event.bonus === 0 && event.countyId === null), true);

  const probe = open(tinyMap(), 2, "quick60", constant(0), questionsFor(tinyMap(), () => true));
  assert.equal(probe.phase.kind, "quiz");
  if (probe.phase.kind !== "quiz") return;
  const pending = probe.phase.pending;
  const owned = probe.holdings.filter((holding) => holding.owner === probe.activePlayer).map((holding) => holding.countyId);
  assert.ok(owned.length >= 2);
  const alternate = owned.find((countyId) => countyId !== pending.countyId);
  assert.ok(alternate);
  const redrawn = open(tinyMap(), 2, "quick60", constant(0), questionsFor(tinyMap(), (countyId) => countyId === alternate));
  assert.equal(redrawn.phase.kind, "quiz");
  if (redrawn.phase.kind !== "quiz") return;
  const redrawnPending = redrawn.phase.pending;
  assert.equal(redrawnPending.countyId, alternate);
  const askedCounty = redrawn.config.map.counties.find((county) => county.id === alternate);
  const question = redrawn.config.quiz.counties[alternate]?.find((item) => item.id === redrawnPending.questionId);
  assert.equal(question?.countyName, askedCounty?.name);
});

test("region income is the adopted bonus for a fully held region and zero otherwise", () => {
  const map = pairMap();
  const state = open(map, 2, "quick60", createRng("region"), questionsFor(map, () => true));
  assert.equal(state.phase.kind, "quiz");
  if (state.phase.kind !== "quiz") return;
  const bonusCounty = "99001" as CountyId;
  const owner = state.holdings.find((holding) => holding.countyId === bonusCounty)?.owner;
  assert.equal(state.phase.regionIncome, owner === state.activePlayer ? 5 : 0);
  assert.equal(state.phase.baseIncome, 3);
});

test("ties cost the attacker, a capture moves armies in, and quick victory waits until the turn ends", () => {
  const map = linkedMap();
  let state = open(map, 2, "total92", constant(0), questionsFor(map, () => true));
  state = clearQuizAndPlace(state);
  const tie = attackPair(state, (targetArmies) => targetArmies > 1);
  assert.ok(tie);
  const tied = apply(state, { kind: "attack", from: tie.from, to: tie.to, dice: 1 }, sequence([0.5, 0.5, 0.5]));
  const from = tied.holdings.find((holding) => holding.countyId === tie.from);
  const to = tied.holdings.find((holding) => holding.countyId === tie.to);
  assert.equal(from?.armies, tie.fromArmies - 1);
  assert.equal(to?.armies, tie.toArmies);

  const capture = attackPair(state, (targetArmies) => targetArmies === 1);
  assert.ok(capture);
  const fought = apply(state, { kind: "attack", from: capture.from, to: capture.to, dice: 1 }, sequence([0.99, 0]));
  assert.equal(fought.phase.kind, "occupy");
  if (fought.phase.kind !== "occupy") return;
  assert.equal(fought.phase.minimum, 1);
  const moved = apply(fought, { kind: "occupy", count: 1 }, constant(0));
  assert.equal(moved.holdings.find((holding) => holding.countyId === capture.to)?.owner, state.activePlayer);
  assert.equal(moved.phase.kind === "over", false);

  const fortifying = apply(state, { kind: "endAttacks" }, constant(0));
  assert.equal(fortifying.phase.kind, "fortify");
  const source = fortifying.holdings.find((holding) => holding.owner === fortifying.activePlayer && holding.armies > 1);
  const destination = fortifying.holdings.find((holding) => holding.owner === fortifying.activePlayer && holding.countyId !== source?.countyId);
  const enemy = fortifying.holdings.find((holding) => holding.owner !== fortifying.activePlayer);
  assert.ok(source && destination && enemy);
  const blocked = engine.reduce(fortifying, { kind: "fortify", from: source.countyId, to: enemy.countyId, count: 1 }, () => 0);
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.equal(blocked.state, fortifying);
  const shifted = apply(fortifying, { kind: "fortify", from: source.countyId, to: destination.countyId, count: 1 }, constant(0));
  assert.equal(shifted.holdings.find((holding) => holding.countyId === source.countyId)?.armies, source.armies - 1);
  assert.equal(shifted.phase.kind === "fortify", false);

  let quick = open(pairMap(), 2, "quick60", constant(0), questionsFor(pairMap(), () => true));
  quick = clearQuizAndPlace(quick);
  quick = grind(quick);
  assert.equal(quick.phase.kind, "attack");
  quick = apply(quick, { kind: "endAttacks" }, constant(0));
  quick = apply(quick, { kind: "skipFortify" }, constant(0));
  assert.equal(quick.phase.kind, "over");
  if (quick.phase.kind !== "over") return;
  assert.equal(quick.phase.mode, "quick60");

  let total = open(pairMap(), 2, "total92", constant(0), questionsFor(pairMap(), () => true));
  total = clearQuizAndPlace(total);
  total = grind(total);
  assert.equal(total.phase.kind, "over");
  if (total.phase.kind !== "over") return;
  assert.equal(total.phase.mode, "total92");
  const late = engine.reduce(total, { kind: "endAttacks" }, () => 0);
  assert.equal(late.ok, false);
});

function open(map: MapPack, seats: number, mode: Mode, rng: SeededRng, quiz = questionsFor(map, () => true)): GameState {
  const result = engine.createGame(config(map, seats, mode, quiz), () => rng.draw());
  if (!result.ok) throw new Error(result.error.message);
  assert.deepEqual(engine.checkInvariants(result.value), []);
  return result.value;
}

function apply(state: GameState, action: Action, rng: SeededRng): GameState {
  const result = engine.reduce(state, action, () => rng.draw());
  if (!result.ok) throw new Error(result.error.message);
  assert.deepEqual(engine.checkInvariants(result.state), []);
  const snapshot = rng.snapshot();
  const cursor = snapshot.algorithm === "mulberry32" ? snapshot : { version: 1 as const, algorithm: "mulberry32", seed: "round-trip", draws: 0 };
  const saved = engine.serialize({ version: 1, state: result.state, rng: cursor });
  const loaded = engine.deserialize(saved);
  if (!loaded.ok) throw new Error(loaded.error.message);
  assert.deepEqual(loaded.value.state, result.state);
  return result.state;
}

function config(map: MapPack, seats: number, mode: Mode, quiz: QuizPack): GameConfig {
  return {
    players: Array.from({ length: seats }, (_, index) => ({
      id: index as PlayerId,
      label: `Seat ${index + 1}`,
      kind: "human" as const,
    })),
    mode,
    map,
    quiz,
  };
}

function questionsFor(map: MapPack, include: (countyId: CountyId) => boolean): QuizPack {
  const counties: Record<string, QuizQuestion[]> = {};
  for (const county of map.counties) {
    counties[county.id] = include(county.id) ? [makeQuestion(county, "1"), makeQuestion(county, "2")] : [];
  }
  return { version: 1, mapDigest: map.digest, sourceDigest: "rules-fixture", counties: counties as QuizPack["counties"] };
}

function emptyPack(map: MapPack): QuizPack {
  return { version: 1, mapDigest: map.digest, sourceDigest: "empty", counties: {} };
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
    explanation: `${county.name} uses the supplied explanation.`,
  };
}

function scriptedAction(state: GameState): Action | null {
  const phase = state.phase;
  if (phase.kind === "quiz") return answer(state, 0);
  if (phase.kind === "place") {
    const owned = state.holdings.find((holding) => holding.owner === state.activePlayer);
    if (!owned) return null;
    const action: Action = { kind: "place", countyId: owned.countyId, count: phase.remaining };
    return action;
  }
  if (phase.kind === "attack") return { kind: "endAttacks" };
  if (phase.kind === "occupy") {
    const action: Action = { kind: "occupy", count: phase.minimum };
    return action;
  }
  if (phase.kind === "fortify") return { kind: "skipFortify" };
  if (phase.kind === "handoff") {
    const action: Action = { kind: "acknowledgeHandoff", turnSequence: state.turnSequence };
    return action;
  }
  return null;
}

function answer(state: GameState, index: number): Action {
  if (state.phase.kind !== "quiz") throw new Error("expected a quiz");
  return { kind: "answerQuiz", turnSequence: state.turnSequence, questionId: state.phase.pending.questionId, answer: { kind: "choice", index } };
}

function correctIndex(state: GameState): number {
  if (state.phase.kind !== "quiz") throw new Error("expected a quiz");
  const pending = state.phase.pending;
  const question = state.config.quiz.counties[pending.countyId]?.find((item) => item.id === pending.questionId);
  if (!question) throw new Error("missing question");
  const index = pending.choiceOrder.indexOf(question.correctLetter);
  if (index < 0) throw new Error("missing correct choice");
  return index;
}

function clearQuizAndPlace(state: GameState): GameState {
  const rng = constant(0);
  let next = state;
  if (next.phase.kind === "quiz") next = apply(next, answer(next, 0), rng);
  if (next.phase.kind === "place") {
    const owned = next.holdings.find((holding) => holding.owner === next.activePlayer);
    if (!owned) throw new Error("missing county");
    next = apply(next, { kind: "place", countyId: owned.countyId, count: next.phase.remaining }, rng);
  }
  return next;
}

function grind(state: GameState): GameState {
  let next = state;
  for (let step = 0; step < 200 && next.phase.kind !== "over"; step += 1) {
    if (next.phase.kind === "occupy") {
      next = apply(next, { kind: "occupy", count: next.phase.minimum }, constant(0));
      if (next.phase.kind === "over") return next;
      continue;
    }
    if (next.phase.kind !== "attack") break;
    const pair = attackPair(next, () => true);
    if (!pair) break;
    const dice = Math.min(3, pair.fromArmies - 1) as 1 | 2 | 3;
    next = apply(next, { kind: "attack", from: pair.from, to: pair.to, dice }, sequence([0.99, 0.99, 0.99, 0, 0]));
  }
  return next;
}

function attackPair(state: GameState, acceptTarget: (armies: number) => boolean): { from: CountyId; to: CountyId; fromArmies: number; toArmies: number } | null {
  for (const from of state.holdings) {
    if (from.owner !== state.activePlayer || from.armies < 2) continue;
    const neighbors = state.config.map.counties.find((county) => county.id === from.countyId)?.neighbors ?? [];
    for (const countyId of neighbors) {
      const to = state.holdings.find((holding) => holding.countyId === countyId);
      if (!to || to.owner === state.activePlayer || !acceptTarget(to.armies)) continue;
      return { from: from.countyId, to: to.countyId, fromArmies: from.armies, toArmies: to.armies };
    }
  }
  return null;
}

function reachOccupy(): { state: GameState; rng: SeededRng } {
  const rng = constant(0);
  let state = open(linkedMap(), 2, "total92", rng, questionsFor(linkedMap(), () => true));
  state = clearQuizAndPlace(state);
  const pair = attackPair(state, (armies) => armies === 1);
  if (!pair) throw new Error("no one-army target");
  state = apply(state, { kind: "attack", from: pair.from, to: pair.to, dice: 1 }, sequence([0.99, 0]));
  if (state.phase.kind !== "occupy") throw new Error("capture did not open occupation");
  return { state, rng };
}

function seatCounts(state: GameState): number[] {
  const counts = Array.from({ length: state.config.players.length }, () => 0);
  for (const holding of state.holdings) {
    const current = counts[holding.owner];
    if (current !== undefined) counts[holding.owner] = current + 1;
  }
  return counts;
}

function armyTotal(state: GameState, player?: PlayerId): number {
  return state.holdings.reduce((total, holding) => total + (player === undefined || holding.owner === player ? holding.armies : 0), 0);
}

function regionIncome(state: GameState, player: PlayerId): number {
  const owned = new Set(state.holdings.filter((holding) => holding.owner === player).map((holding) => holding.countyId));
  return state.config.map.regions.reduce((total, region) => {
    return region.counties.every((countyId) => owned.has(countyId)) ? total + region.bonus : total;
  }, 0);
}

function pairMap(): MapPack {
  return mapOf(
    [
      ["99001", ["99002"], "north"],
      ["99002", ["99001"], "south"],
    ],
    [
      ["north", ["99001"], 5],
      ["south", ["99002"], 0],
    ],
  );
}

function tinyMap(): MapPack {
  return mapOf(
    [
      ["99001", ["99002", "99003"], "north"],
      ["99002", ["99001", "99003"], "north"],
      ["99003", ["99001", "99002"], "north"],
    ],
    [["north", ["99001", "99002", "99003"], 0]],
  );
}

function linkedMap(): MapPack {
  const ids = ["99001", "99002", "99003", "99004"];
  return mapOf(
    ids.map((id) => [id, ids.filter((other) => other !== id), "north"]),
    [["north", ids, 0]],
  );
}

function mapOf(counties: readonly (readonly [string, readonly string[], string])[], regions: readonly (readonly [string, readonly string[], number])[]): MapPack {
  return {
    version: 1,
    id: "indiana",
    digest: `tiny-${counties.map((county) => county[0]).join("-")}`,
    viewBox: [0, 0, 10, 10],
    outline: "M0,0L1,0",
    counties: counties.map(([id, neighbors, region]) => ({
      id: id as CountyId,
      name: `County ${id}`,
      path: "M0,0L1,0L1,1Z",
      centroid: [0, 0],
      neighbors: neighbors as CountyId[],
      regionId: region as MapPack["regions"][number]["id"],
      facts: [],
    })),
    regions: regions.map(([id, members, bonus]) => ({
      id: id as MapPack["regions"][number]["id"],
      name: `Region ${id}`,
      counties: members as CountyId[],
      borderPath: "M0,0L1,0",
      bonus,
      review: "draft",
    })),
  };
}

function scriptedCursor(values: readonly number[]): SeededRng {
  let draws = 0;
  return {
    version: 1,
    algorithm: "scripted",
    draw() {
      const value = values[draws] ?? Number.NaN;
      draws += 1;
      return value;
    },
    snapshot() {
      return { version: 1, algorithm: "scripted", seed: values.join(","), draws };
    },
    restore(snapshot) {
      draws = snapshot.draws;
    },
  };
}

function inject(rng: SeededRng): Rng {
  const draw: Rng = () => rng.draw();
  return Object.assign(draw, {
    draw: () => rng.draw(),
    snapshot: () => rng.snapshot(),
    restore: (snapshot: RngSnapshot) => {
      rng.restore(snapshot);
    },
  });
}

function constant(value: number): SeededRng {
  let draws = 0;
  return {
    version: 1,
    algorithm: "constant",
    draw() {
      draws += 1;
      return value;
    },
    snapshot(): RngSnapshot {
      return { version: 1, algorithm: "constant", seed: String(value), draws };
    },
    restore(snapshot) {
      draws = snapshot.draws;
    },
  };
}

function sequence(values: readonly number[]): SeededRng {
  let draws = 0;
  return {
    version: 1,
    algorithm: "sequence",
    draw() {
      const value = values[draws] ?? 0;
      draws += 1;
      return value;
    },
    snapshot(): RngSnapshot {
      return { version: 1, algorithm: "sequence", seed: values.join(","), draws };
    },
    restore(snapshot) {
      draws = snapshot.draws;
    },
  };
}
