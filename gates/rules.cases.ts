import assert from "node:assert/strict";
import type { Action, CountyId, GameEvent, GameState, PlayerCount, PlayerId } from "../src/types.ts";
import type { SeededRng, Tools } from "./rules.engine.ts";
import { drawRng, play } from "./rules.engine.ts";
import {
  armyTotal,
  baseIncome,
  countyName,
  drawForFace,
  emptyQuiz,
  fullRegions,
  gameConfig,
  holding,
  isChoiceOrder,
  loadPack,
  neighborsOf,
  ownedBy,
  pairDice,
  questionId,
  quickTarget,
  quizPack,
  regionBonus,
  reinforcement,
  startingPool,
  withRegionBonus,
} from "./rules.fixture.ts";
import {
  acknowledge,
  answerCorrect,
  answerOrSkip,
  answerWrong,
  correctChoice,
  endTurnFromAttack,
  mustOk,
  openGame,
  openingWithFrontier,
  placeAll,
  pursue,
  quietHandoff,
  requirePhase,
  skipQuiz,
  winningRolls,
} from "./rules.play.ts";

export type RuleCase = {
  readonly name: string;
  readonly needs: "engine" | "prepareQuestion";
  readonly run: (tools: Tools) => void;
};

export const ruleCases: readonly RuleCase[] = [
  { name: "setup deals every county once", needs: "engine", run: setup },
  { name: "a correct answer awards exactly two once", needs: "engine", run: quizAward },
  { name: "no question is an explicit skip for zero", needs: "engine", run: noQuestion },
  { name: "reinforcement uses the recorded formula", needs: "engine", run: reinforcementCase },
  { name: "illegal actions return the same state", needs: "engine", run: illegal },
  { name: "an invalid action does not advance the rng", needs: "engine", run: rngStays },
  { name: "a stale or duplicate answer never gives a second bonus", needs: "engine", run: noSecondBonus },
  { name: "the same seed and actions give the same game", needs: "engine", run: sameSeed },
  { name: "a mid-quiz reload keeps the same choices", needs: "engine", run: reload },
  { name: "a repeated handoff never gives repeated income", needs: "engine", run: repeatedHandoff },
  { name: "region bonus is the full-region pack total", needs: "engine", run: regions },
  { name: "dice ties cost the attacker and highest dice are paired", needs: "engine", run: dice },
  { name: "capture moves in at least the attacking dice", needs: "engine", run: capture },
  { name: "fortify follows one owned path", needs: "engine", run: fortify },
  { name: "quick win is checked at the end of the turn", needs: "engine", run: quickWin },
  { name: "total win is checked after occupation", needs: "engine", run: totalWin },
  { name: "prepareQuestion returns choices or null", needs: "prepareQuestion", run: prepare },
];

function setup(tools: Tools): void {
  const { map, referenceTerritories } = loadPack();
  const territories = map.counties.length;
  for (const count of [2, 3, 4, 5, 6] as const) {
    const state = openGame(tools, count, "quick60", `setup-${count}`);
    assert.equal(state.holdings.length, territories, "every county is dealt");
    assert.equal(new Set(state.holdings.map((item) => item.countyId)).size, territories, "no county is dealt twice");
    const counts = new Map<PlayerId, number>();
    for (const item of state.holdings) {
      assert.ok(item.armies >= 1, "every county starts with an army");
      counts.set(item.owner, (counts.get(item.owner) ?? 0) + 1);
    }
    const sizes = [...counts.values()];
    assert.equal(sizes.reduce((sum, value) => sum + value, 0), territories);
    assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, "the deal is as even as it can be");
    for (const player of state.config.players) {
      const expected = startingPool(count, player.id, territories, referenceTerritories);
      assert.equal(armyTotal(state, player.id), expected, `seat ${player.id} pool`);
      assert.ok(expected >= (counts.get(player.id) ?? 0), "the starting army is already on the county");
    }
    assert.equal(state.activePlayer, 0);
    assert.equal(tools.engine.checkInvariants(state).length, 0);
  }
  const rejected = tools.engine.createGame(
    { players: [{ id: 0, label: "Seat 1", kind: "human" }], mode: "quick60", map, quiz: quizPack(map) },
    () => 0,
  );
  assert.equal(rejected.ok, false);
  const seven = tools.engine.createGame(
    {
      ...gameConfig(map, quizPack(map), 2, "quick60"),
      players: [0, 1, 2, 3, 4, 5, 0].map((id, index) => ({
        id: id as PlayerId,
        label: `Seat ${index + 1}`,
        kind: "human" as const,
      })),
    },
    () => 0,
  );
  assert.equal(seven.ok, false);
  const used = tools.createRng("setup-used");
  const cursor = used.snapshot().draws;
  const state = mustCreate(tools, 2, used);
  assert.ok(used.snapshot().draws > cursor, "setup consumes the injected rng");
  assert.equal(state.holdings.length, territories);
  const alternate = owners(openGame(tools, 2, "quick60", "setup-a"));
  const changed = ["setup-b", "setup-c", "setup-d"].some((seed) => owners(openGame(tools, 2, "quick60", seed)) !== alternate);
  assert.equal(changed, true, "a different seed deals a different map");
}

function quizAward(tools: Tools): void {
  const state = openGame(tools, 2, "quick60", "award");
  const phase = requirePhase(state, "quiz");
  const player = state.activePlayer;
  assert.equal(ownedBy(state, player).includes(phase.pending.countyId), true, "the quiz county is owned");
  assert.equal(isChoiceOrder(phase.pending.choiceOrder), true);
  const name = countyName(state, phase.pending.countyId);
  const pool = state.config.quiz.counties[phase.pending.countyId] ?? [];
  const question = pool.find((item) => item.id === phase.pending.questionId);
  assert.ok(question, "the question comes from the selected county");
  assert.equal(question?.countyName, name);
  assert.equal(question?.prompt.includes(name), true, "the question names the county");
  const owned = ownedBy(state, player).length;
  const regions = regionBonus(state, player);
  const correct = answerCorrect(tools, structuredClone(state));
  const wrong = answerWrong(tools, structuredClone(state));
  const skipped = skipQuiz(tools, structuredClone(state));
  const correctPhase = requirePhase(correct, "place");
  const wrongPhase = requirePhase(wrong, "place");
  const skippedPhase = requirePhase(skipped, "place");
  assert.equal(correctPhase.income.quiz, 2);
  assert.equal(correctPhase.quizResult, "correct");
  assert.equal(correctPhase.remaining, reinforcement(owned, regions, 2));
  assert.equal(wrongPhase.income.quiz, 0);
  assert.equal(wrongPhase.quizResult, "wrong");
  assert.equal(skippedPhase.income.quiz, 0);
  assert.equal(skippedPhase.quizResult, "skipped");
  assert.equal(wrongPhase.remaining, reinforcement(owned, regions, 0));
  assert.equal(skippedPhase.remaining, wrongPhase.remaining);
  assert.equal(armyTotal(correct, player), armyTotal(state, player), "the bonus stays in the pool until placement");
  const again = play(tools, correct, {
    kind: "answerQuiz",
    turnSequence: phase.pending.turnSequence,
    questionId: phase.pending.questionId,
    answer: { kind: "choice", index: correctChoice(state) },
  });
  assert.equal(again.ok, false);
  if (!again.ok) assert.equal(again.state, correct);
  const handoff = quietHandoff(tools, openGame(tools, 2, "quick60", "award-source"));
  const low = acknowledge(tools, structuredClone(handoff), () => 0);
  const high = acknowledge(tools, structuredClone(handoff), () => 0.999999);
  const lowPhase = requirePhase(low, "quiz");
  const highPhase = requirePhase(high, "quiz");
  assert.equal(ownedBy(low, low.activePlayer).includes(lowPhase.pending.countyId), true);
  assert.equal(ownedBy(high, high.activePlayer).includes(highPhase.pending.countyId), true);
  assert.notEqual(lowPhase.pending.countyId, highPhase.pending.countyId, "the injected rng picks the quiz county");
}

function noQuestion(tools: Tools): void {
  const { map } = loadPack();
  const state = openGame(tools, 2, "quick60", "no-question", emptyQuiz(map));
  const player = state.activePlayer;
  assert.equal(state.phase.kind, "place");
  const phase = requirePhase(state, "place");
  assert.equal(phase.income.quiz, 0);
  assert.ok(phase.quizResult === "noQuestion" || phase.quizResult === "skipped");
  assert.equal(phase.remaining, reinforcement(ownedBy(state, player).length, regionBonus(state, player), 0));
  assert.equal(armyTotal(state, player), startingPool(2, player, map.counties.length, loadPack().referenceTerritories));
}

function reinforcementCase(tools: Tools): void {
  const state = openGame(tools, 2, "quick60", "income");
  const phase = requirePhase(state, "quiz");
  const player = state.activePlayer;
  const owned = ownedBy(state, player).length;
  assert.equal(phase.baseIncome, baseIncome(owned));
  assert.equal(phase.regionIncome, regionBonus(state, player));
  const placed = placeAll(tools, answerCorrect(tools, state), ownedBy(state, player)[0] ?? phase.pending.countyId);
  assert.equal(placed.phase.kind, "attack");
  assert.equal(armyTotal(placed, player), armyTotal(state, player) + reinforcement(owned, regionBonus(state, player), 2));
}

function illegal(tools: Tools): void {
  const seeded = tools.createRng("illegal");
  let state = mustCreate(tools, 2, seeded);
  const phase = requirePhase(state, "quiz");
  const player = state.activePlayer;
  const mine = ownedBy(state, player)[0];
  const enemy = state.holdings.find((item) => item.owner !== player)?.countyId;
  if (!mine || !enemy) throw new Error("the deal produced no border");
  expectRejected(tools, state, { kind: "attack", from: mine, to: enemy, dice: 1 }, seeded);
  expectRejected(tools, state, { kind: "endAttacks" }, seeded);
  expectRejected(tools, state, { kind: "place", countyId: mine, count: 1 }, seeded);
  state = answerCorrect(tools, state);
  const place = requirePhase(state, "place");
  expectRejected(tools, state, { kind: "place", countyId: enemy, count: 1 }, seeded);
  expectRejected(tools, state, { kind: "place", countyId: mine, count: place.remaining + 1 }, seeded);
  expectRejected(tools, state, { kind: "place", countyId: mine, count: 0 }, seeded);
  state = placeAll(tools, state, mine);
  expectRejected(tools, state, {
    kind: "answerQuiz",
    turnSequence: phase.pending.turnSequence,
    questionId: phase.pending.questionId,
    answer: { kind: "choice", index: 0 },
  }, seeded);
  expectRejected(tools, state, { kind: "attack", from: mine, to: mine, dice: 1 }, seeded);
  const far = state.holdings.find((item) => item.owner !== player && !neighborsOf(state, mine).includes(item.countyId))?.countyId;
  if (far) expectRejected(tools, state, { kind: "attack", from: mine, to: far, dice: 1 }, seeded);
  expectRejected(tools, state, { kind: "attack", from: mine, to: enemy, dice: 4 as 1 }, seeded);
  if (holding(state, mine).armies < 4) {
    expectRejected(tools, state, { kind: "attack", from: mine, to: enemy, dice: 3 }, seeded);
  }
}

function rngStays(tools: Tools): void {
  const seeded = tools.createRng("cursor");
  const state = mustCreate(tools, 2, seeded);
  const phase = requirePhase(state, "quiz");
  const mine = ownedBy(state, state.activePlayer)[0];
  const enemy = state.holdings.find((item) => item.owner !== state.activePlayer)?.countyId;
  if (!mine || !enemy) throw new Error("the deal produced no border");
  const before = cursor(seeded);
  const result = play(tools, state, { kind: "attack", from: mine, to: enemy, dice: 1 }, drawRng(seeded));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.state, state);
  assert.deepEqual(cursor(seeded), before);
  assert.equal(phase.kind, "quiz");
}

function noSecondBonus(tools: Tools): void {
  const state = openGame(tools, 2, "quick60", "second");
  const phase = requirePhase(state, "quiz");
  const stale = play(tools, state, {
    kind: "answerQuiz",
    turnSequence: phase.pending.turnSequence + 1,
    questionId: phase.pending.questionId,
    answer: { kind: "choice", index: correctChoice(state) },
  });
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.equal(stale.state, state);
  const once = answerCorrect(tools, state);
  const place = requirePhase(once, "place");
  const owned = ownedBy(state, state.activePlayer).length;
  assert.equal(place.remaining, reinforcement(owned, regionBonus(state, state.activePlayer), 2));
  const duplicate = play(tools, once, {
    kind: "answerQuiz",
    turnSequence: phase.pending.turnSequence,
    questionId: phase.pending.questionId,
    answer: { kind: "choice", index: correctChoice(state) },
  });
  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) assert.equal(duplicate.state, once);
  assert.equal(requirePhase(once, "place").income.quiz, 2);
}

function sameSeed(tools: Tools): void {
  const first = scripted(tools, "same-seed");
  const second = scripted(tools, "same-seed");
  assert.deepEqual(second, first);
  const other = scripted(tools, "other-seed");
  assert.notDeepEqual(owners(other), owners(first));
}

function reload(tools: Tools): void {
  const seeded = tools.createRng("reload");
  const state = mustCreate(tools, 2, seeded);
  const phase = requirePhase(state, "quiz");
  const choiceOrder = [...phase.pending.choiceOrder];
  const question = phase.pending.questionId;
  const envelope = { version: 1 as const, state, rng: seeded.snapshot() };
  const saved = tools.engine.serialize(envelope);
  seeded.draw();
  answerCorrect(tools, structuredClone(state));
  const restored = tools.engine.deserialize(saved);
  assert.equal(restored.ok, true);
  if (!restored.ok) return;
  assert.deepEqual(restored.value.state, state);
  assert.deepEqual(restored.value.rng, envelope.rng);
  const restoredPhase = requirePhase(restored.value.state, "quiz");
  assert.deepEqual([...restoredPhase.pending.choiceOrder], choiceOrder);
  assert.equal(restoredPhase.pending.questionId, question);
  const control = tools.createRng("reload");
  mustCreate(tools, 2, control);
  seeded.restore(restored.value.rng);
  assert.equal(seeded.draw(), control.draw());
  const broken = tools.engine.deserialize("not-json");
  assert.equal(broken.ok, false);
}

function repeatedHandoff(tools: Tools): void {
  const start = openGame(tools, 2, "quick60", "handoff");
  const first = start.activePlayer;
  const second = start.config.players.find((player) => player.id !== first)?.id;
  if (second === undefined) throw new Error("missing second seat");
  const firstArmies = armyTotal(start, first);
  const secondArmies = armyTotal(start, second);
  const handoff = quietHandoff(tools, start);
  const income = reinforcement(ownedBy(start, first).length, regionBonus(start, first), 2);
  assert.equal(armyTotal(handoff, first), firstArmies + income);
  assert.equal(armyTotal(handoff, second), secondArmies);
  const once = acknowledge(tools, handoff, () => 0);
  assert.equal(once.activePlayer, requirePhase(handoff, "handoff").nextPlayer);
  assert.equal(armyTotal(once, second), secondArmies);
  assert.equal(armyTotal(once, first), firstArmies + income);
  const base = once.phase.kind === "quiz" ? once.phase.baseIncome : requirePhase(once, "place").income.base;
  assert.equal(base, baseIncome(ownedBy(once, once.activePlayer).length));
  const twice = play(tools, once, { kind: "acknowledgeHandoff", turnSequence: once.turnSequence });
  if (!twice.ok) assert.equal(twice.state, once);
  assert.deepEqual(twice.state, once);
  assert.equal(armyTotal(twice.state, second), secondArmies);
}

function regions(tools: Tools): void {
  const { map } = loadPack();
  // The shipped bonuses are still draft zeros. A copy uses 1 so the suite can see the pack field added.
  const probed = withRegionBonus(map, 1);
  for (let seed = 1; seed <= 2500; seed += 1) {
    const state = openGame(tools, 2, "quick60", `region-${seed}`, quizPack(probed), probed);
    const full = fullRegions(state, state.activePlayer);
    if (full.length === 0) continue;
    const phase = requirePhase(state, "quiz");
    const bonus = full.reduce((sum, region) => sum + region.bonus, 0);
    assert.equal(phase.regionIncome, bonus);
    assert.ok(bonus > 0 && bonus < probed.regions.length);
    return;
  }
  throw new Error("no opening fully owned a region");
}

function dice(tools: Tools): void {
  const field = stackedBattle(tools);
  const tieDraws = faces(4);
  let draws = 0;
  const tied = play(tools, field.state, { kind: "attack", from: field.from, to: field.small, dice: 1 }, () => {
    draws += 1;
    return tieDraws();
  });
  assert.equal(tied.ok, true);
  if (!tied.ok) return;
  assert.ok(draws >= 1, "combat rolls the injected rng");
  assert.equal(holding(tied.state, field.from).armies, holding(field.state, field.from).armies - 1);
  assert.equal(holding(tied.state, field.small).armies, holding(field.state, field.small).armies);
  assert.equal(tied.state.phase.kind, "attack");
  assertLosses(tied.events, pairDice([4], [4]));

  const compared = play(
    tools,
    structuredClone(field.state),
    { kind: "attack", from: field.from, to: field.large, dice: 2 },
    sequence([1, 6, 6, 2]),
  );
  assert.equal(compared.ok, true);
  if (!compared.ok) return;
  const expected = pairDice([1, 6], [6, 2]);
  assert.equal(holding(compared.state, field.from).armies, holding(field.state, field.from).armies - expected.attackLosses);
  assert.equal(holding(compared.state, field.large).armies, holding(field.state, field.large).armies - expected.defenseLosses);
  assertLosses(compared.events, expected);

  const unpaired = play(
    tools,
    structuredClone(field.state),
    { kind: "attack", from: field.from, to: field.small, dice: 2 },
    sequence([6, 1, 6]),
  );
  assert.equal(unpaired.ok, true);
  if (!unpaired.ok) return;
  assert.equal(holding(unpaired.state, field.from).armies, holding(field.state, field.from).armies - 1);
  assert.equal(holding(unpaired.state, field.small).armies, holding(field.state, field.small).armies);
}

function capture(tools: Tools): void {
  const field = stackedBattle(tools);
  let state = structuredClone(field.state);
  let guard = 0;
  while (holding(state, field.small).armies > 1) {
    const rolled = play(tools, state, { kind: "attack", from: field.from, to: field.small, dice: 1 }, winningRolls());
    if (!rolled.ok) throw new Error(rolled.error.message);
    state = rolled.state;
    if (state.phase.kind === "occupy") throw new Error("the defender still had an army");
    guard += 1;
    if (guard > 12) throw new Error("the defender was not reduced");
  }
  const killing = play(tools, state, { kind: "attack", from: field.from, to: field.small, dice: 3 }, sequence([6, 6, 6, 1]));
  assert.equal(killing.ok, true);
  if (!killing.ok) return;
  const phase = requirePhase(killing.state, "occupy");
  assert.equal(phase.minimum, 3);
  assert.equal(phase.from, field.from);
  assert.equal(phase.to, field.small);
  assert.equal(holding(killing.state, field.small).armies, 0);
  assert.equal(tools.engine.checkInvariants(killing.state).length, 0);
  const short = play(tools, killing.state, { kind: "occupy", count: phase.minimum - 1 });
  assert.equal(short.ok, false);
  if (!short.ok) assert.equal(short.state, killing.state);
  const source = holding(killing.state, field.from).armies;
  const moved = mustOk(tools, killing.state, { kind: "occupy", count: phase.minimum });
  assert.equal(holding(moved, field.from).owner, field.state.activePlayer);
  assert.equal(holding(moved, field.from).armies, source - phase.minimum);
  assert.ok(holding(moved, field.from).armies >= 1);
  assert.equal(holding(moved, field.small).owner, field.state.activePlayer);
  assert.equal(holding(moved, field.small).armies, phase.minimum);
  const repeat = play(tools, moved, { kind: "occupy", count: phase.minimum });
  assert.equal(repeat.ok, false);
  if (!repeat.ok) assert.equal(repeat.state, moved);
}

function fortify(tools: Tools): void {
  const { map } = loadPack();
  let opening: GameState | null = null;
  let pair: { from: CountyId; to: CountyId } | null = null;
  for (let seed = 1; seed <= 30 && !pair; seed += 1) {
    const state = openGame(tools, 2, "quick60", `fortify-${seed}`, quizPack(map), map);
    pair = ownedEdge(state, state.activePlayer);
    opening = state;
  }
  if (!opening || !pair) throw new Error("no owned path on the pack");
  let state = answerOrSkip(tools, opening);
  state = placeAll(tools, state, pair.from);
  if (state.phase.kind === "attack") state = mustOk(tools, state, { kind: "endAttacks" });
  const ready = state;
  requirePhase(ready, "fortify");
  const before = armies(ready);
  const moved = mustOk(tools, structuredClone(ready), { kind: "fortify", from: pair.from, to: pair.to, count: 1 });
  assert.equal(holding(moved, pair.from).armies, (before.get(pair.from) ?? 0) - 1);
  assert.equal(holding(moved, pair.to).armies, (before.get(pair.to) ?? 0) + 1);
  assert.ok(holding(moved, pair.from).armies >= 1);
  assert.ok(moved.phase.kind === "handoff" || moved.phase.kind === "over");
  const again = play(tools, moved, { kind: "fortify", from: pair.from, to: pair.to, count: 1 });
  assert.equal(again.ok, false);
  if (!again.ok) assert.equal(again.state, moved);
  const enemy = neighborsOf(ready, pair.from).find((countyId) => holding(ready, countyId).owner !== ready.activePlayer);
  if (enemy) expectRejected(tools, ready, { kind: "fortify", from: pair.from, to: enemy, count: 1 }, tools.createRng("fortify-enemy"));
  expectRejected(tools, ready, { kind: "fortify", from: pair.from, to: pair.from, count: 1 }, tools.createRng("fortify-self"));
  const tooMany = holding(ready, pair.from).armies;
  expectRejected(tools, ready, { kind: "fortify", from: pair.from, to: pair.to, count: tooMany }, tools.createRng("fortify-all"));
  const hop = ownedHop(ready, ready.activePlayer, pair.from);
  if (hop) {
    const hopped = mustOk(tools, structuredClone(ready), { kind: "fortify", from: pair.from, to: hop.to, count: 1 });
    assert.equal(holding(hopped, hop.via).armies, before.get(hop.via) ?? 0, "an intermediate county stays put");
    assert.equal(holding(hopped, hop.to).armies, (before.get(hop.to) ?? 0) + 1);
  }
}

function quickWin(tools: Tools): void {
  const start = openingWithFrontier(tools, "quick60", "quick");
  const seat = start.activePlayer;
  const goal = quickTarget(start.config.map.counties.length);
  const early = pursue(tools, start, seat, goal - 1, true);
  assert.equal(ownedBy(early, seat).length, goal - 1);
  assert.notEqual(early.phase.kind, "over");
  const ended = endTurnFromAttack(tools, structuredClone(early));
  assert.equal(ended.phase.kind, "handoff");
  assert.equal(ownedBy(ended, seat).length, goal - 1);
  const atGoal = pursue(tools, structuredClone(early), seat, goal, true);
  assert.notEqual(atGoal.phase.kind, "over");
  assert.equal(ownedBy(atGoal, seat).length, goal);
  const won = endTurnFromAttack(tools, atGoal);
  const over = requirePhase(won, "over");
  assert.equal(over.winner, seat);
  assert.equal(over.mode, "quick60");
  const later = play(tools, won, { kind: "endAttacks" });
  assert.equal(later.ok, false);
  if (!later.ok) assert.equal(later.state, won);
}

function totalWin(tools: Tools): void {
  const start = openingWithFrontier(tools, "total92", "total");
  const seat = start.activePlayer;
  const territories = start.config.map.counties.length;
  const atQuick = pursue(tools, start, seat, quickTarget(territories), false);
  assert.notEqual(atQuick.phase.kind, "over");
  const won = pursue(tools, atQuick, seat, territories, false);
  const over = requirePhase(won, "over");
  assert.equal(over.winner, seat);
  assert.equal(over.mode, "total92");
  assert.equal(ownedBy(won, seat).length, territories);
  const other = won.config.players.find((player) => player.id !== seat);
  if (other) assert.equal(ownedBy(won, other.id).length, 0);
}

function prepare(tools: Tools): void {
  const prepareQuestion = tools.prepareQuestion;
  if (!prepareQuestion) throw new Error("prepareQuestion missing");
  const { map } = loadPack();
  const county = map.counties[0];
  if (!county) throw new Error("the pack has no counties");
  const pack = quizPack(map);
  const pending = prepareQuestion(county.id, pack, [], 1, () => 0);
  assert.ok(pending, "a county with a question returns a pending question");
  if (!pending) return;
  assert.equal(pending.countyId, county.id);
  assert.equal(pending.turnSequence, 1);
  assert.equal(pending.questionId, questionId(county));
  assert.equal(isChoiceOrder(pending.choiceOrder), true);
  const low = prepareQuestion(county.id, pack, [], 1, () => 0);
  const high = prepareQuestion(county.id, pack, [], 1, () => 0.999999);
  assert.ok(low && high);
  if (low && high) assert.notEqual(low.choiceOrder.join(""), high.choiceOrder.join(""), "choice order uses the injected rng");
  const empty = prepareQuestion(county.id, emptyQuiz(map), [], 1, () => 0);
  assert.equal(empty, null);
}

function stackedBattle(tools: Tools): { state: GameState; from: CountyId; small: CountyId; large: CountyId } {
  const { map } = loadPack();
  for (let seed = 1; seed <= 40; seed += 1) {
    const opened = openGame(tools, 2, "quick60", `battle-${seed}`, quizPack(map), map);
    let state = answerOrSkip(tools, opened);
    const from = ownedBy(state, state.activePlayer).find((countyId) => neighborsOf(state, countyId).some((neighbor) => holding(state, neighbor).owner !== state.activePlayer));
    if (!from || state.phase.kind !== "place") continue;
    state = placeAll(tools, state, from);
    if (state.phase.kind !== "attack" || holding(state, from).armies < 4) continue;
    const enemies = neighborsOf(state, from).filter((countyId) => holding(state, countyId).owner !== state.activePlayer);
    const small = enemies.find((countyId) => holding(state, countyId).armies === 1);
    const large = enemies.find((countyId) => holding(state, countyId).armies >= 2);
    if (small && large) return { state, from, small, large };
  }
  throw new Error("no stacked battle on the pack");
}

function scripted(tools: Tools, seed: string): GameState {
  const { map } = loadPack();
  const seeded = tools.createRng(seed);
  let state = mustCreate(tools, 2, seeded);
  const rng = drawRng(seeded);
  if (state.phase.kind === "quiz") state = answerCorrect(tools, state, rng);
  const county = [...ownedBy(state, state.activePlayer)].sort((a, b) => (a < b ? -1 : 1))[0];
  if (!county) throw new Error("the active player owns nothing");
  if (state.phase.kind === "place") state = placeAll(tools, state, county, rng);
  if (state.phase.kind === "attack") state = mustOk(tools, state, { kind: "endAttacks" }, rng);
  if (state.phase.kind === "fortify") state = mustOk(tools, state, { kind: "skipFortify" }, rng);
  if (state.phase.kind === "handoff") state = acknowledge(tools, state, rng);
  assert.equal(state.config.map.digest, map.digest);
  return state;
}

function mustCreate(tools: Tools, count: PlayerCount, seeded: SeededRng): GameState {
  const { map } = loadPack();
  const result = tools.engine.createGame(gameConfig(map, quizPack(map), count, "quick60"), drawRng(seeded));
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function expectRejected(tools: Tools, state: GameState, action: Action, seeded: SeededRng): void {
  const before = cursor(seeded);
  const result = play(tools, state, action, drawRng(seeded));
  assert.equal(result.ok, false, action.kind);
  if (!result.ok) assert.equal(result.state, state, action.kind);
  assert.deepEqual(cursor(seeded), before, action.kind);
}

function cursor(seeded: SeededRng): { seed: string; draws: number } {
  const snapshot = seeded.snapshot();
  return { seed: snapshot.seed, draws: snapshot.draws };
}

function owners(state: GameState): string {
  return [...state.holdings]
    .sort((a, b) => (a.countyId < b.countyId ? -1 : 1))
    .map((item) => `${item.countyId}:${item.owner}`)
    .join(",");
}

function faces(face: number): () => number {
  return () => drawForFace(face);
}

function sequence(order: readonly number[]): () => number {
  let index = 0;
  return () => {
    const face = order[index] ?? order[order.length - 1] ?? 1;
    index += 1;
    return drawForFace(face);
  };
}

function assertLosses(events: readonly GameEvent[], expected: { attackLosses: number; defenseLosses: number }): void {
  const battle = events.find((event) => event.kind === "battle");
  if (!battle || battle.kind !== "battle") return;
  assert.equal(battle.attackLosses, expected.attackLosses);
  assert.equal(battle.defenseLosses, expected.defenseLosses);
}

function armies(state: GameState): Map<CountyId, number> {
  return new Map(state.holdings.map((item) => [item.countyId, item.armies]));
}

function ownedEdge(state: GameState, player: PlayerId): { from: CountyId; to: CountyId } | null {
  for (const from of ownedBy(state, player)) {
    for (const to of neighborsOf(state, from)) {
      if (to !== from && holding(state, to).owner === player) return { from, to };
    }
  }
  return null;
}

function ownedHop(state: GameState, player: PlayerId, from: CountyId): { to: CountyId; via: CountyId } | null {
  const owned = new Set(ownedBy(state, player));
  const parent = new Map<CountyId, CountyId | null>([[from, null]]);
  const queue = [from];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    for (const next of neighborsOf(state, current)) {
      if (!owned.has(next) || parent.has(next)) continue;
      parent.set(next, current);
      queue.push(next);
      const via = parent.get(current);
      if (via && current !== from) return { to: next, via: current };
    }
  }
  return null;
}
