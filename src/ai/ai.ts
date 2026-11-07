/** BTT-6 computer player. Pure: no DOM, no network, no timers, no runtime AI.
 * It reads state, picks one legal engine Action at a time, and plays a turn
 * only through `reduce` from the engine. It never writes to the state it is given.
 * Quiz answers go through the same answerQuiz path as a human (an answer token,
 * never a correct:boolean); the engine still grades them and awards its fixed +2.
 */
import { reduce } from "../engine/engine.ts";
import type { Action, CountyId, GameEvent, GameState, Holding, PlayerId, Rng } from "../types.ts";

export interface ComputerConfig {
  /** Chance in [0, 1] that a quiz answer is the correct choice. Default 0.6. */
  readonly quizSuccess: number;
  /** Hard cap on engine actions in one playTurn call. Default 200. */
  readonly maxSteps: number;
  /** Attacks per turn before the computer ends attacks. Default 40. */
  readonly maxAttacks: number;
}

export const DEFAULT_COMPUTER_CONFIG: ComputerConfig = { quizSuccess: 0.6, maxSteps: 200, maxAttacks: 40 };

export type TurnStop = "handoff" | "over" | "stepLimit" | "rejected";

export interface TurnResult {
  /** Last state the engine accepted. Equal to the input when nothing was accepted. */
  readonly state: GameState;
  /** Engine-accepted actions, in order. */
  readonly actions: readonly Action[];
  readonly events: readonly GameEvent[];
  readonly steps: number;
  readonly stopped: TurnStop;
}

/** True when the active seat is a computer and the turn still needs a decision. */
export function isComputerTurn(state: GameState): boolean {
  if (state.phase.kind === "handoff" || state.phase.kind === "over") return false;
  return state.config.players.find((player) => player.id === state.activePlayer)?.kind === "computer";
}

/** Next legal action for the active player, or null at handoff / game over.
 * `random` is used only for the quiz roll and wrong-answer pick. */
export function chooseAction(state: GameState, random: Rng, config: Partial<ComputerConfig> = {}): Action | null {
  const settings = resolve(config);
  const phase = state.phase;
  const me = state.activePlayer;
  switch (phase.kind) {
    case "quiz": {
      const pending = phase.pending;
      const question = state.config.quiz.counties[pending.countyId]?.find((item) => item.id === pending.questionId);
      const correct = question ? pending.choiceOrder.indexOf(question.correctLetter) : -1;
      let index: number;
      if (correct >= 0 && random() < settings.quizSuccess) index = correct;
      else {
        const wrong = [0, 1, 2, 3].filter((choice) => choice !== correct);
        index = wrong[pick(random, wrong.length)] ?? 0;
      }
      return { kind: "answerQuiz", turnSequence: state.turnSequence, questionId: pending.questionId, answer: { kind: "choice", index } };
    }
    case "place": {
      const target = bestStaging(state, me) ?? state.holdings.find((holding) => holding.owner === me);
      if (!target) return null;
      return { kind: "place", countyId: target.countyId, count: phase.remaining };
    }
    case "attack": {
      if (attacksThisTurn(state) >= settings.maxAttacks) return { kind: "endAttacks" };
      const move = bestAttack(state, me);
      if (!move) return { kind: "endAttacks" };
      return { kind: "attack", from: move.from.countyId, to: move.to.countyId, dice: Math.min(3, move.from.armies - 1) as 1 | 2 | 3 };
    }
    case "occupy": {
      const from = holding(state, phase.from);
      if (!from) return { kind: "occupy", count: phase.minimum };
      const maximum = from.armies - 1;
      // Keep half behind when the source still faces an enemy; otherwise move everything it can.
      const wanted = enemyNeighbors(state, phase.from, me, phase.to).length > 0 ? Math.floor(maximum / 2) : maximum;
      return { kind: "occupy", count: Math.max(phase.minimum, Math.min(maximum, wanted)) };
    }
    case "fortify": {
      const move = bestFortify(state, me);
      if (!move) return { kind: "skipFortify" };
      return { kind: "fortify", from: move.from, to: move.to, count: move.count };
    }
    default:
      return null;
  }
}

/** Plays the active player's turn through the engine until handoff, game over,
 * a rejection, or the step cap. `engineRng` is passed to every reduce call;
 * `random` drives the computer's own choices (defaults to `engineRng`). */
export function playTurn(
  state: GameState,
  engineRng: Rng,
  config: Partial<ComputerConfig> = {},
  random: Rng = engineRng,
): TurnResult {
  const settings = resolve(config);
  let current = state;
  const actions: Action[] = [];
  const events: GameEvent[] = [];
  let steps = 0;
  while (steps < settings.maxSteps) {
    if (current.phase.kind === "handoff") return { state: current, actions, events, steps, stopped: "handoff" };
    if (current.phase.kind === "over") return { state: current, actions, events, steps, stopped: "over" };
    let action = chooseAction(current, random, settings);
    if (!action) break;
    steps += 1;
    let result = reduce(current, action, engineRng);
    if (!result.ok) {
      // Fall back to the phase's always-legal exit once, then stop.
      const exit = current.phase.kind === "attack" ? ({ kind: "endAttacks" } as const) : current.phase.kind === "fortify" ? ({ kind: "skipFortify" } as const) : null;
      if (!exit || steps >= settings.maxSteps) return { state: current, actions, events, steps, stopped: "rejected" };
      action = exit;
      steps += 1;
      result = reduce(current, action, engineRng);
      if (!result.ok) return { state: current, actions, events, steps, stopped: "rejected" };
    }
    current = result.state;
    actions.push(action);
    events.push(...result.events);
  }
  if (current.phase.kind === "handoff") return { state: current, actions, events, steps, stopped: "handoff" };
  if (current.phase.kind === "over") return { state: current, actions, events, steps, stopped: "over" };
  return { state: current, actions, events, steps, stopped: "stepLimit" };
}

function resolve(config: Partial<ComputerConfig>): ComputerConfig {
  const quizSuccess = clamp(config.quizSuccess ?? DEFAULT_COMPUTER_CONFIG.quizSuccess, 0, 1);
  const maxSteps = whole(config.maxSteps, DEFAULT_COMPUTER_CONFIG.maxSteps);
  const maxAttacks = whole(config.maxAttacks, DEFAULT_COMPUTER_CONFIG.maxAttacks);
  return { quizSuccess, maxSteps, maxAttacks };
}

function clamp(value: number, low: number, high: number): number {
  return Number.isFinite(value) ? Math.min(high, Math.max(low, value)) : DEFAULT_COMPUTER_CONFIG.quizSuccess;
}

function whole(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function pick(random: Rng, count: number): number {
  return Math.min(count - 1, Math.max(0, Math.floor(random() * count)));
}

function attacksThisTurn(state: GameState): number {
  let count = 0;
  for (const event of state.events) if (event.kind === "battle" && event.turnSequence === state.turnSequence) count += 1;
  return count;
}

function holding(state: GameState, countyId: CountyId): Holding | undefined {
  return state.holdings.find((item) => item.countyId === countyId);
}

function neighbors(state: GameState, countyId: CountyId): readonly CountyId[] {
  return state.config.map.counties.find((county) => county.id === countyId)?.neighbors ?? [];
}

function enemyNeighbors(state: GameState, countyId: CountyId, me: PlayerId, except?: CountyId): Holding[] {
  const out: Holding[] = [];
  for (const id of neighbors(state, countyId)) {
    if (id === except) continue;
    const other = holding(state, id);
    if (other && other.owner !== me && other.armies > 0) out.push(other);
  }
  return out;
}

/** Owned border county with the best edge over its weakest enemy neighbor. */
function bestStaging(state: GameState, me: PlayerId): Holding | undefined {
  let best: Holding | undefined;
  let bestScore = -Infinity;
  for (const own of state.holdings) {
    if (own.owner !== me) continue;
    const enemies = enemyNeighbors(state, own.countyId, me);
    if (enemies.length === 0) continue;
    const weakest = Math.min(...enemies.map((enemy) => enemy.armies));
    const score = own.armies - weakest;
    if (score > bestScore) {
      bestScore = score;
      best = own;
    }
  }
  return best;
}

/** Attack only with a clear edge: at least two more armies than the defender. */
function bestAttack(state: GameState, me: PlayerId): { from: Holding; to: Holding } | null {
  let best: { from: Holding; to: Holding } | null = null;
  let bestScore = -Infinity;
  for (const from of state.holdings) {
    if (from.owner !== me || from.armies < 3) continue;
    for (const to of enemyNeighbors(state, from.countyId, me)) {
      if (from.armies < to.armies + 2) continue;
      const score = from.armies / to.armies;
      if (score > bestScore) {
        bestScore = score;
        best = { from, to };
      }
    }
  }
  return best;
}

/** Move an interior stack to an adjacent owned county that faces an enemy. */
function bestFortify(state: GameState, me: PlayerId): { from: CountyId; to: CountyId; count: number } | null {
  let best: { from: CountyId; to: CountyId; count: number } | null = null;
  for (const from of state.holdings) {
    if (from.owner !== me || from.armies < 2) continue;
    if (enemyNeighbors(state, from.countyId, me).length > 0) continue;
    for (const id of neighbors(state, from.countyId)) {
      const to = holding(state, id);
      if (!to || to.owner !== me || enemyNeighbors(state, id, me).length === 0) continue;
      if (!best || from.armies - 1 > best.count) best = { from: from.countyId, to: id, count: from.armies - 1 };
      break;
    }
  }
  return best;
}
