/** BTT-6 computer player. Pure: no DOM, no network, no timers, no runtime AI.
 * It reads state, picks one legal engine Action at a time, and plays a turn
 * only through `reduce` from the engine. It never writes to the state it is given.
 * Quiz answers go through the same answerQuiz path as a human (an answer token,
 * never a correct:boolean); the engine still grades them and awards its fixed +2.
 *
 * `baselinePolicy` is the frozen earlier policy. `chooseAction` is the challenger
 * unless `config.policy` is `"baseline"`. Regions come from the map and
 * `regionStanding`; they are not copied into a second table.
 */
import { reduce, regionStanding } from "../engine/engine.ts";
import type { RegionStanding } from "../engine/engine.ts";
import type { Action, CountyId, GameEvent, GameState, Holding, PlayerId, Region, Rng } from "../types.ts";

export interface ComputerConfig {
  /** Chance in [0, 1] that a quiz answer is the correct choice. Default 0.6. */
  readonly quizSuccess: number;
  /** Hard cap on engine actions in one playTurn call. Default 200. */
  readonly maxSteps: number;
  /** Attacks per turn before the computer ends attacks. Default 40. */
  readonly maxAttacks: number;
  /** `"baseline"` replays the frozen policy. Default is the challenger. */
  readonly policy?: "baseline" | "challenger";
  /** Tie-break stream. Omit for a stable county-id order. Never used for the quiz. */
  readonly policyRandom?: Rng;
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

interface ResolvedConfig {
  readonly quizSuccess: number;
  readonly maxSteps: number;
  readonly maxAttacks: number;
  readonly policy: "baseline" | "challenger";
  readonly policyRandom?: Rng;
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
  if (settings.policy === "baseline") return baselineBody(state, random, settings);
  return challenger(state, random, settings);
}

/** Frozen earlier policy: one staging county, attacks only at a two-army edge, adjacent fortify. */
export function baselinePolicy(state: GameState, random: Rng, config: Partial<ComputerConfig> = {}): Action | null {
  return baselineBody(state, random, resolve({ ...config, policy: "baseline" }));
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

function baselineBody(state: GameState, random: Rng, settings: ResolvedConfig): Action | null {
  const phase = state.phase;
  const me = state.activePlayer;
  switch (phase.kind) {
    case "quiz":
      return quizAction(state, random, settings);
    case "place": {
      const target = baselineStaging(state, me) ?? state.holdings.find((item) => item.owner === me);
      if (!target) return null;
      return { kind: "place", countyId: target.countyId, count: phase.remaining };
    }
    case "attack": {
      if (attacksThisTurn(state) >= settings.maxAttacks) return { kind: "endAttacks" };
      const move = baselineAttack(state, me);
      if (!move) return { kind: "endAttacks" };
      return { kind: "attack", from: move.from.countyId, to: move.to.countyId, dice: Math.min(3, move.from.armies - 1) as 1 | 2 | 3 };
    }
    case "occupy": {
      const from = holding(state, phase.from);
      if (!from) return { kind: "occupy", count: phase.minimum };
      const maximum = from.armies - 1;
      const wanted = enemyNeighbors(state, phase.from, me, phase.to).length > 0 ? Math.floor(maximum / 2) : maximum;
      return { kind: "occupy", count: Math.max(phase.minimum, Math.min(maximum, wanted)) };
    }
    case "fortify": {
      const move = baselineFortify(state, me);
      if (!move) return { kind: "skipFortify" };
      return { kind: "fortify", from: move.from, to: move.to, count: move.count };
    }
    default:
      return null;
  }
}

/** Owned border county with the best edge over its weakest enemy neighbor. */
function baselineStaging(state: GameState, me: PlayerId): Holding | undefined {
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
function baselineAttack(state: GameState, me: PlayerId): { from: Holding; to: Holding } | null {
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
function baselineFortify(state: GameState, me: PlayerId): { from: CountyId; to: CountyId; count: number } | null {
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

function challenger(state: GameState, random: Rng, settings: ResolvedConfig): Action | null {
  const phase = state.phase;
  const me = state.activePlayer;
  switch (phase.kind) {
    case "quiz":
      return quizAction(state, random, settings);
    case "place":
      return placeAction(state, me, phase.remaining, settings.policyRandom);
    case "attack": {
      if (attacksThisTurn(state) >= settings.maxAttacks) return { kind: "endAttacks" };
      const move = bestStrike(state, me, settings.policyRandom);
      if (!move) return { kind: "endAttacks" };
      return { kind: "attack", from: move.from.countyId, to: move.to.countyId, dice: Math.min(3, move.from.armies - 1) as 1 | 2 | 3 };
    }
    case "occupy":
      return { kind: "occupy", count: occupyCount(state, phase, me) };
    case "fortify": {
      const move = pathFortify(state, me, settings.policyRandom);
      if (!move) return { kind: "skipFortify" };
      return { kind: "fortify", from: move.from, to: move.to, count: move.count };
    }
    default:
      return null;
  }
}

interface View {
  readonly state: GameState;
  readonly me: PlayerId;
  readonly byId: ReadonlyMap<string, Holding>;
  readonly regionOf: ReadonlyMap<string, Region>;
  readonly neighborIds: ReadonlyMap<string, readonly CountyId[]>;
  readonly counts: ReadonlyMap<PlayerId, number>;
  readonly goal: number;
  readonly closeLine: number;
  readonly pressure: number;
  readonly leader: PlayerId | null;
  readonly mine: number;
  standing(player: PlayerId): readonly RegionStanding[];
}

function viewOf(state: GameState, me: PlayerId): View {
  const byId = new Map<string, Holding>();
  const counts = new Map<PlayerId, number>();
  for (const item of state.holdings) {
    byId.set(item.countyId, item);
    counts.set(item.owner, (counts.get(item.owner) ?? 0) + 1);
  }
  const regionOf = new Map<string, Region>();
  for (const region of state.config.map.regions) {
    for (const countyId of region.counties) regionOf.set(countyId, region);
  }
  const neighborIds = new Map<string, readonly CountyId[]>();
  for (const county of state.config.map.counties) neighborIds.set(county.id, county.neighbors);
  const total = state.config.map.counties.length;
  const goal = state.config.mode === "quick60" ? Math.ceil(total * 0.65) : total;
  const closeLine = goal - Math.ceil(goal * 0.15);
  let leader: PlayerId | null = null;
  let leaderCount = -1;
  let tie = false;
  for (const [id, count] of counts) {
    if (count <= 0) continue;
    if (count > leaderCount) {
      leader = id;
      leaderCount = count;
      tie = false;
    } else if (count === leaderCount) tie = true;
  }
  if (tie || leader === me) leader = null;
  const cache = new Map<PlayerId, readonly RegionStanding[]>();
  return {
    state,
    me,
    byId,
    regionOf,
    neighborIds,
    counts,
    goal,
    closeLine,
    pressure: leaderCount >= closeLine || state.turnSequence >= 28 ? 1 : 0,
    leader,
    mine: counts.get(me) ?? 0,
    standing(player: PlayerId): readonly RegionStanding[] {
      const hit = cache.get(player);
      if (hit) return hit;
      const rows = regionStanding(state, player);
      cache.set(player, rows);
      return rows;
    },
  };
}

function regionValue(view: View, countyId: CountyId): { readonly complete: boolean; readonly points: number } {
  const region = view.regionOf.get(countyId);
  if (!region) return { complete: false, points: 0 };
  const row = view.standing(view.me).find((item) => item.id === region.id);
  if (!row || row.total === 0 || row.held >= row.total) return { complete: false, points: 0 };
  const missing = row.total - row.held;
  if (missing === 1) return { complete: true, points: 100 + row.bonus };
  return { complete: false, points: Math.round((row.bonus * row.held * 4) / row.total) };
}

function breakValue(view: View, target: Holding): { readonly breaks: boolean; readonly points: number } {
  const region = view.regionOf.get(target.countyId);
  if (!region) return { breaks: false, points: 0 };
  const row = view.standing(target.owner).find((item) => item.id === region.id);
  if (!row || row.total === 0 || row.held !== row.total) return { breaks: false, points: 0 };
  return { breaks: true, points: 80 + row.bonus };
}

function isNearlyBeaten(view: View, player: PlayerId): boolean {
  const owned = view.counts.get(player) ?? 0;
  return owned > 0 && owned <= 2;
}

function strikeScore(view: View, from: Holding, to: Holding): number {
  const region = regionValue(view, to.countyId);
  const broken = breakValue(view, to);
  const beaten = isNearlyBeaten(view, to.owner);
  const chasing = to.owner === view.leader;
  let score = from.armies * 4 - to.armies * 6 + region.points + broken.points;
  if (beaten) score += 140;
  if (chasing) score += 50;
  if (to.armies === 1) score += 15;
  else if (to.armies === 2) score += 8;
  if (view.pressure >= 1) score += 12;
  if (view.pressure >= 1 && chasing) score += 20;
  if (view.mine >= view.closeLine) score += 24;
  return score;
}

function neededEdge(view: View, to: Holding): number {
  const region = regionValue(view, to.countyId);
  const broken = breakValue(view, to);
  let need = view.pressure >= 1 ? 1 : 2;
  if (region.complete || broken.breaks || isNearlyBeaten(view, to.owner)) need -= 1;
  return Math.max(0, need);
}

interface Named {
  readonly id: string;
}

function pickBest<T extends Named>(items: readonly T[], score: (item: T) => number, random?: Rng): T | null {
  let best = -Infinity;
  const tied: T[] = [];
  for (const item of items) {
    const value = score(item);
    if (value > best) {
      best = value;
      tied.length = 0;
      tied.push(item);
    } else if (value === best) tied.push(item);
  }
  if (tied.length === 0) return null;
  tied.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  const first = tied[0];
  if (!first) return null;
  if (!random || tied.length === 1) return first;
  const index = Math.min(tied.length - 1, Math.max(0, Math.floor(random() * tied.length)));
  return tied[index] ?? first;
}

function bestStrike(state: GameState, me: PlayerId, random?: Rng): { from: Holding; to: Holding } | null {
  const view = viewOf(state, me);
  const strikes: { from: Holding; to: Holding; id: string }[] = [];
  for (const from of state.holdings) {
    if (from.owner !== me || from.armies < 2) continue;
    for (const to of enemyNeighbors(state, from.countyId, me)) {
      if (from.armies - to.armies < neededEdge(view, to)) continue;
      strikes.push({ from, to, id: `${from.countyId}>${to.countyId}` });
    }
  }
  const best = pickBest(strikes, (strike) => strikeScore(view, strike.from, strike.to), random);
  return best ? { from: best.from, to: best.to } : null;
}

function enemyComponent(view: View): ReadonlyMap<string, number> {
  const ids = new Map<string, number>();
  let next = 0;
  for (const item of view.state.holdings) {
    if (item.owner === view.me || ids.has(item.countyId)) continue;
    const queue = [item.countyId];
    ids.set(item.countyId, next);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      if (!current) continue;
      for (const neighbor of view.neighborIds.get(current) ?? []) {
        const other = view.byId.get(neighbor);
        if (!other || other.owner === view.me || ids.has(neighbor)) continue;
        ids.set(neighbor, next);
        queue.push(neighbor);
      }
    }
    next += 1;
  }
  return ids;
}

function frontsOf(view: View): Holding[][] {
  const component = enemyComponent(view);
  const groups = new Map<number, Holding[]>();
  for (const item of view.state.holdings) {
    if (item.owner !== view.me) continue;
    let key: number | null = null;
    for (const neighbor of view.neighborIds.get(item.countyId) ?? []) {
      const other = view.byId.get(neighbor);
      if (!other || other.owner === view.me) continue;
      const id = component.get(neighbor);
      if (id === undefined) continue;
      key = key === null ? id : Math.min(key, id);
    }
    if (key === null) continue;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  return [...groups.values()];
}

function frontDeficit(view: View, front: readonly Holding[]): number {
  let deficit = 0;
  for (const item of front) {
    let threat = 0;
    for (const enemy of enemyNeighbors(view.state, item.countyId, view.me)) threat = Math.max(threat, enemy.armies);
    deficit += Math.max(0, threat - item.armies + 1);
  }
  return deficit;
}

function spearhead(view: View, front: readonly Holding[], random?: Rng): Holding | null {
  const ranked = front.map((item) => ({ item, id: item.countyId }));
  const best = pickBest(ranked, (entry) => {
    let strategic = 0;
    let threat = 0;
    for (const enemy of enemyNeighbors(view.state, entry.item.countyId, view.me)) {
      threat = Math.max(threat, enemy.armies);
      strategic = Math.max(strategic, strikeScore(view, entry.item, enemy));
    }
    return entry.item.armies * 10 + strategic - threat;
  }, random);
  return best?.item ?? null;
}

function placeAction(state: GameState, me: PlayerId, remaining: number, random?: Rng): Action | null {
  const owned = state.holdings.filter((item) => item.owner === me);
  const fallback = owned[0];
  if (!fallback || remaining < 1) return null;
  const view = viewOf(state, me);
  const needy = frontsOf(view)
    .map((front) => ({ front, deficit: frontDeficit(view, front) }))
    .filter((item) => item.deficit > 0)
    .sort((left, right) => right.deficit - left.deficit);
  if (needy.length === 0) {
    const borders = owned.filter((item) => enemyNeighbors(state, item.countyId, me).length > 0);
    const target = spearhead(view, borders.length > 0 ? borders : owned, random) ?? fallback;
    return { kind: "place", countyId: target.countyId, count: remaining };
  }
  const top = needy[0];
  const second = needy[1];
  if (!top || !second || second.deficit * 4 < top.deficit) {
    const target = spearhead(view, (top ?? needy[0])?.front ?? owned, random) ?? fallback;
    return { kind: "place", countyId: target.countyId, count: remaining };
  }
  let chosen = top;
  let worst = Infinity;
  let total = 0;
  for (const item of needy) total += item.deficit;
  for (const item of needy) {
    const head = spearhead(view, item.front, random);
    if (!head || total === 0) continue;
    const ratio = head.armies / item.deficit;
    const id = head.countyId;
    const chosenHead = spearhead(view, chosen.front, random);
    if (ratio < worst || (ratio === worst && chosenHead && id < chosenHead.countyId)) {
      worst = ratio;
      chosen = item;
    }
  }
  const target = spearhead(view, chosen.front, random) ?? fallback;
  const count = needy.length > 1 && remaining > 1 ? 1 : remaining;
  return { kind: "place", countyId: target.countyId, count };
}

function occupyCount(state: GameState, phase: Extract<GameState["phase"], { kind: "occupy" }>, me: PlayerId): number {
  const from = holding(state, phase.from);
  if (!from) return phase.minimum;
  const maximum = from.armies - 1;
  if (maximum < phase.minimum) return phase.minimum;
  const sourceEnemies = enemyNeighbors(state, phase.from, me, phase.to);
  const destEnemies = enemyNeighbors(state, phase.to, me);
  if (destEnemies.length === 0 && sourceEnemies.length > 0) return phase.minimum;
  let threat = 0;
  for (const enemy of sourceEnemies) threat = Math.max(threat, enemy.armies);
  const keep = Math.min(from.armies - phase.minimum, threat >= 3 ? 2 : 1);
  return Math.max(phase.minimum, Math.min(maximum, from.armies - keep));
}

function ownedPath(state: GameState, from: CountyId, to: CountyId, me: PlayerId): boolean {
  if (from === to) return false;
  const owned = new Set<string>();
  for (const item of state.holdings) if (item.owner === me) owned.add(item.countyId);
  if (!owned.has(from) || !owned.has(to)) return false;
  const seen = new Set<string>([from]);
  const queue = [from];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    if (!current) continue;
    for (const next of neighbors(state, current)) {
      if (!owned.has(next) || seen.has(next)) continue;
      if (next === to) return true;
      seen.add(next);
      queue.push(next);
    }
  }
  return false;
}

function pathFortify(state: GameState, me: PlayerId, random?: Rng): { from: CountyId; to: CountyId; count: number } | null {
  const view = viewOf(state, me);
  const borders: Holding[] = [];
  for (const item of state.holdings) {
    if (item.owner !== me) continue;
    if (enemyNeighbors(state, item.countyId, me).length > 0) borders.push(item);
  }
  if (borders.length === 0) return null;
  const ranked = borders.map((item) => ({ item, id: item.countyId }));
  const dest = pickBest(ranked, (entry) => {
    let best = entry.item.armies * 5;
    for (const enemy of enemyNeighbors(state, entry.item.countyId, me)) best = Math.max(best, strikeScore(view, entry.item, enemy));
    return best;
  }, random);
  if (!dest) return null;
  let source: Holding | null = null;
  let surplus = 0;
  for (const item of state.holdings) {
    if (item.owner !== me || item.countyId === dest.item.countyId || item.armies < 2) continue;
    const enemies = enemyNeighbors(state, item.countyId, me);
    let threat = 0;
    for (const enemy of enemies) threat = Math.max(threat, enemy.armies);
    const reserve = enemies.length === 0 ? 1 : Math.max(1, Math.min(item.armies - 1, threat));
    const extra = item.armies - reserve;
    if (extra < 1 || !ownedPath(state, item.countyId, dest.item.countyId, me)) continue;
    if (!source || extra > surplus || (extra === surplus && item.countyId < source.countyId)) {
      source = item;
      surplus = extra;
    }
  }
  if (!source || surplus < 1) return null;
  return { from: source.countyId, to: dest.item.countyId, count: surplus };
}

function quizAction(state: GameState, random: Rng, settings: ResolvedConfig): Action | null {
  const phase = state.phase;
  if (phase.kind !== "quiz") return null;
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

function resolve(config: Partial<ComputerConfig>): ResolvedConfig {
  const quizSuccess = clamp(config.quizSuccess ?? DEFAULT_COMPUTER_CONFIG.quizSuccess, 0, 1);
  const maxSteps = whole(config.maxSteps, DEFAULT_COMPUTER_CONFIG.maxSteps);
  const maxAttacks = whole(config.maxAttacks, DEFAULT_COMPUTER_CONFIG.maxAttacks);
  return {
    quizSuccess,
    maxSteps,
    maxAttacks,
    policy: config.policy === "baseline" ? "baseline" : "challenger",
    ...(config.policyRandom ? { policyRandom: config.policyRandom } : {}),
  };
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
