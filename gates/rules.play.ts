import type { Action, CountyId, GameState, PlayerId, Rng } from "../src/types.ts";
import type { Tools } from "./rules.engine.ts";
import { drawRng, mustGame, play } from "./rules.engine.ts";
import {
  drawForFace,
  gameConfig,
  holding,
  loadPack,
  neighborsOf,
  ownedBy,
  quizPack,
} from "./rules.fixture.ts";
import type { Mode, PlayerCount, QuizPack } from "../src/types.ts";

export function openGame(tools: Tools, count: PlayerCount, mode: Mode, seed: string, quiz?: QuizPack, map = loadPack().map): GameState {
  const seeded = tools.createRng(seed);
  return mustGame(tools, gameConfig(map, quiz ?? quizPack(map), count, mode), seeded);
}

export function freshRng(tools: Tools, seed: string): Rng {
  return drawRng(tools.createRng(seed));
}

export function requirePhase<Kind extends GameState["phase"]["kind"]>(state: GameState, kind: Kind): Extract<GameState["phase"], { kind: Kind }> {
  if (state.phase.kind !== kind) throw new Error(`expected ${kind}, found ${state.phase.kind}`);
  const phase = state.phase;
  return phase as Extract<GameState["phase"], { kind: Kind }>;
}

export function correctChoice(state: GameState): number {
  const phase = requirePhase(state, "quiz");
  const pool = state.config.quiz.counties[phase.pending.countyId] ?? [];
  const question = pool.find((item) => item.id === phase.pending.questionId);
  if (!question) throw new Error("pending question is not in that county's pool");
  const index = phase.pending.choiceOrder.indexOf(question.correctLetter);
  if (index < 0) throw new Error("choice order dropped the correct letter");
  return index;
}

export function answerCorrect(tools: Tools, state: GameState, rng: Rng = () => 0): GameState {
  const phase = requirePhase(state, "quiz");
  return mustOk(tools, state, {
    kind: "answerQuiz",
    turnSequence: phase.pending.turnSequence,
    questionId: phase.pending.questionId,
    answer: { kind: "choice", index: correctChoice(state) },
  }, rng);
}

export function answerWrong(tools: Tools, state: GameState, rng: Rng = () => 0): GameState {
  const phase = requirePhase(state, "quiz");
  return mustOk(tools, state, {
    kind: "answerQuiz",
    turnSequence: phase.pending.turnSequence,
    questionId: phase.pending.questionId,
    answer: { kind: "choice", index: (correctChoice(state) + 1) % 4 },
  }, rng);
}

export function skipQuiz(tools: Tools, state: GameState, rng: Rng = () => 0): GameState {
  const phase = requirePhase(state, "quiz");
  return mustOk(tools, state, {
    kind: "skipQuiz",
    turnSequence: phase.pending.turnSequence,
    questionId: phase.pending.questionId,
  }, rng);
}

export function placeAll(tools: Tools, state: GameState, countyId: CountyId, rng: Rng = () => 0): GameState {
  let current = state;
  let guard = 0;
  while (current.phase.kind === "place") {
    const remaining = current.phase.remaining;
    if (remaining <= 0) throw new Error("place phase stalled");
    const whole = play(tools, current, { kind: "place", countyId, count: remaining }, rng);
    if (whole.ok) {
      current = whole.state;
      guard += 1;
      if (guard > 4) throw new Error("place phase stalled");
      continue;
    }
    const one = play(tools, current, { kind: "place", countyId, count: 1 }, rng);
    if (!one.ok) throw new Error(one.error.message);
    current = one.state;
    guard += 1;
    if (guard > remaining + 2) throw new Error("place phase stalled");
  }
  return current;
}

export function endAttacks(tools: Tools, state: GameState): GameState {
  return mustOk(tools, state, { kind: "endAttacks" });
}

export function skipFortify(tools: Tools, state: GameState): GameState {
  return mustOk(tools, state, { kind: "skipFortify" });
}

export function acknowledge(tools: Tools, state: GameState, rng: Rng = () => 0): GameState {
  const phase = requirePhase(state, "handoff");
  return mustOk(tools, state, { kind: "acknowledgeHandoff", turnSequence: state.turnSequence }, rng, phase.nextPlayer);
}

export function quietHandoff(tools: Tools, state: GameState): GameState {
  let current = answerOrSkip(tools, state);
  const player = current.activePlayer;
  const border = borderCounty(current, player) ?? ownedBy(current, player)[0];
  if (!border) throw new Error("the active player owns nothing");
  if (current.phase.kind === "place") current = placeAll(tools, current, border);
  if (current.phase.kind === "attack") current = endAttacks(tools, current);
  if (current.phase.kind === "fortify") current = skipFortify(tools, current);
  requirePhase(current, "handoff");
  return current;
}

export function mustOk(tools: Tools, state: GameState, action: Action, rng: Rng = () => 0, note?: PlayerId): GameState {
  const result = play(tools, state, action, rng);
  if (!result.ok) throw new Error(`${action.kind} rejected${note === undefined ? "" : ` for seat ${note}`}: ${result.error.message}`);
  return result.state;
}

export function answerOrSkip(tools: Tools, state: GameState, rng: Rng = () => 0): GameState {
  if (state.phase.kind === "quiz") return answerCorrect(tools, state, rng);
  return state;
}

export function winningRolls(): Rng {
  let index = 0;
  return () => {
    const face = index === 0 ? 6 : 1;
    index += 1;
    return drawForFace(face);
  };
}

export function pursue(tools: Tools, state: GameState, seat: PlayerId, goal: number, singleTurn: boolean): GameState {
  let current = state;
  let cursor: CountyId | undefined;
  for (let step = 0; step < 800 && ownedBy(current, seat).length < goal; step += 1) {
    if (current.phase.kind === "over") return current;
    if (singleTurn && current.activePlayer !== seat) throw new Error("the turn ended before the goal");
    if (current.activePlayer !== seat) {
      current = passStep(tools, current);
      continue;
    }
    const stepped = conquerStep(tools, current, seat, cursor);
    cursor = stepped.cursor;
    current = stepped.state;
    if (current.config.mode === "quick60" && current.phase.kind === "over") {
      throw new Error("quick win must wait until the turn ends");
    }
  }
  if (ownedBy(current, seat).length < goal) {
    throw new Error(`stopped at ${ownedBy(current, seat).length} of ${goal} during ${current.phase.kind}`);
  }
  return current;
}

export function endTurnFromAttack(tools: Tools, state: GameState): GameState {
  let current = state;
  if (current.phase.kind === "occupy") current = finishOccupy(tools, current, true);
  if (current.phase.kind === "attack") current = endAttacks(tools, current);
  if (current.phase.kind === "fortify") current = skipFortify(tools, current);
  return current;
}

export function openingWithFrontier(tools: Tools, mode: Mode, label: string): GameState {
  const { map } = loadPack();
  for (let seed = 1; seed <= 40; seed += 1) {
    const state = openGame(tools, 2, mode, `${label}-${seed}`, quizPack(map), map);
    const border = bestBorder(state, state.activePlayer);
    if (border && enemyComponent(state, border.enemy) >= 20) return state;
  }
  throw new Error("no opening frontier on the pack");
}

function conquerStep(tools: Tools, state: GameState, seat: PlayerId, cursor: CountyId | undefined): { state: GameState; cursor: CountyId | undefined } {
  if (state.phase.kind === "quiz") return { state: answerCorrect(tools, state), cursor };
  if (state.phase.kind === "place") {
    const target = borderCounty(state, seat) ?? cursor ?? ownedBy(state, seat)[0];
    if (!target) throw new Error("nowhere to place");
    return { state: placeAll(tools, state, target), cursor: target };
  }
  if (state.phase.kind === "occupy") {
    const landed = state.phase.to;
    return { state: finishOccupy(tools, state, false), cursor: landed };
  }
  if (state.phase.kind === "attack") {
    const move = bestAttack(state, seat, cursor);
    if (!move) return { state: endAttacks(tools, state), cursor };
    return { state: oneWinningAttack(tools, state, move.from, move.to), cursor: move.from };
  }
  if (state.phase.kind === "fortify") return { state: skipFortify(tools, state), cursor };
  if (state.phase.kind === "handoff") return { state: acknowledge(tools, state, freshRng(tools, `handoff-${state.turnSequence}`)), cursor };
  throw new Error(`unexpected ${state.phase.kind}`);
}

function passStep(tools: Tools, state: GameState): GameState {
  if (state.phase.kind === "quiz") return skipQuiz(tools, state);
  if (state.phase.kind === "place") {
    const countyId = ownedBy(state, state.activePlayer)[0];
    if (!countyId) throw new Error("an eliminated seat became active");
    return placeAll(tools, state, countyId);
  }
  if (state.phase.kind === "attack") return endAttacks(tools, state);
  if (state.phase.kind === "fortify") return skipFortify(tools, state);
  if (state.phase.kind === "handoff") return acknowledge(tools, state, freshRng(tools, `pass-${state.turnSequence}`));
  if (state.phase.kind === "occupy") return finishOccupy(tools, state, true);
  return state;
}

function oneWinningAttack(tools: Tools, state: GameState, from: CountyId, to: CountyId): GameState {
  const before = holding(state, to).armies;
  const result = play(tools, state, { kind: "attack", from, to, dice: 1 }, winningRolls());
  if (!result.ok) throw new Error(result.error.message);
  if (result.state.phase.kind !== "occupy" && holding(result.state, to).armies >= before) {
    throw new Error("scripted attack did not reduce the defender");
  }
  if (result.state.config.mode === "total92" && result.state.phase.kind === "over") {
    throw new Error("total win must wait until occupation finishes");
  }
  return result.state;
}

function finishOccupy(tools: Tools, state: GameState, minimumOnly: boolean): GameState {
  const phase = requirePhase(state, "occupy");
  const sourceArmies = holding(state, phase.from).armies;
  const count = minimumOnly ? phase.minimum : sourceArmies - 1;
  if (count < phase.minimum || count > sourceArmies - 1) throw new Error("occupation count is outside the legal range");
  const next = mustOk(tools, state, { kind: "occupy", count });
  const territories = next.config.map.counties.length;
  const owned = ownedBy(next, next.phase.kind === "over" ? next.phase.winner : state.activePlayer).length;
  if (next.config.mode === "total92" && owned === territories && next.phase.kind !== "over") {
    throw new Error("total win must follow the last occupation");
  }
  if (next.config.mode === "quick60" && next.phase.kind === "over") {
    throw new Error("quick win must wait until the turn ends");
  }
  return next;
}

export function bestAttack(state: GameState, player: PlayerId, prefer?: CountyId): { from: CountyId; to: CountyId } | null {
  if (prefer && holding(state, prefer).owner === player && holding(state, prefer).armies >= 2) {
    const to = weakestEnemy(state, prefer, player);
    if (to) return { from: prefer, to };
  }
  let choice: { from: CountyId; to: CountyId; armies: number } | null = null;
  for (const from of ownedBy(state, player)) {
    if (holding(state, from).armies < 2) continue;
    const to = weakestEnemy(state, from, player);
    if (!to) continue;
    const armies = holding(state, from).armies;
    if (!choice || armies > choice.armies) choice = { from, to, armies };
  }
  return choice;
}

function weakestEnemy(state: GameState, from: CountyId, player: PlayerId): CountyId | null {
  let choice: CountyId | null = null;
  let armies = Number.POSITIVE_INFINITY;
  for (const neighbor of neighborsOf(state, from)) {
    const item = holding(state, neighbor);
    if (item.owner === player) continue;
    if (item.armies < armies || (item.armies === armies && (choice === null || neighbor < choice))) {
      choice = neighbor;
      armies = item.armies;
    }
  }
  return choice;
}

export function borderCounty(state: GameState, player: PlayerId): CountyId | null {
  let best: CountyId | null = null;
  let enemies = 0;
  for (const countyId of ownedBy(state, player)) {
    const count = neighborsOf(state, countyId).filter((neighbor) => holding(state, neighbor).owner !== player).length;
    if (count > enemies) {
      best = countyId;
      enemies = count;
    }
  }
  return best;
}

export function bestBorder(state: GameState, player: PlayerId): { from: CountyId; enemy: CountyId } | null {
  const from = borderCounty(state, player);
  if (!from) return null;
  const enemy = weakestEnemy(state, from, player);
  if (!enemy) return null;
  return { from, enemy };
}

function enemyComponent(state: GameState, start: CountyId): number {
  const owner = holding(state, start).owner;
  const seen = new Set<CountyId>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    for (const neighbor of neighborsOf(state, current)) {
      if (seen.has(neighbor) || holding(state, neighbor).owner !== owner) continue;
      seen.add(neighbor);
      queue.push(neighbor);
    }
  }
  return seen.size;
}
