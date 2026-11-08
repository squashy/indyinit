import { prepareQuestion } from "../quiz/quiz.ts";
import type {
  Action,
  AskedQuestions,
  ChoiceLetter,
  County,
  CountyFact,
  CountyId,
  Engine,
  EngineError,
  GameConfig,
  GameEvent,
  GameState,
  Holding,
  Income,
  MapPack,
  Mode,
  ParseResult,
  PendingQuestion,
  Phase,
  Player,
  PlayerCount,
  PlayerId,
  QuestionId,
  QuizPack,
  QuizQuestion,
  QuizResult,
  ReduceResult,
  Region,
  RegionBonusLine,
  RegionId,
  Rng,
  TurnGrant,
  RngSnapshot,
  SaveEnvelope,
} from "../types.ts";

const RNG_ALGORITHM = "mulberry32";

export interface SeededRng {
  readonly version: 1;
  readonly algorithm: string;
  draw(): number;
  snapshot(): RngSnapshot;
  restore(snapshot: RngSnapshot): void;
}
const QUIZ_AWARD = 2;
const SECOND_SEAT_EXTRA = 15;
const STARTING_POOL: Readonly<Record<PlayerCount, number>> = { 2: 60, 3: 45, 4: 38, 5: 32, 6: 28 };
const LETTERS: readonly ChoiceLetter[] = ["A", "B", "C", "D"];

export function createRng(seed: string): SeededRng {
  let cursor = mixSeed(seed);
  let draws = 0;
  return {
    version: 1,
    algorithm: RNG_ALGORITHM,
    draw() {
      const next = advance(cursor);
      cursor = next.cursor;
      draws += 1;
      return next.unit;
    },
    snapshot() {
      return { version: 1, algorithm: RNG_ALGORITHM, seed, draws };
    },
    restore(snapshot) {
      if (
        snapshot.version !== 1 ||
        snapshot.algorithm !== RNG_ALGORITHM ||
        snapshot.seed !== seed ||
        !Number.isSafeInteger(snapshot.draws) ||
        snapshot.draws < 0
      ) {
        throw new Error("rng snapshot does not match this generator");
      }
      cursor = mixSeed(seed);
      draws = 0;
      for (let index = 0; index < snapshot.draws; index += 1) {
        cursor = advance(cursor).cursor;
        draws += 1;
      }
    },
  };
}

export const engine: Engine = { createGame, reduce, checkInvariants, serialize, deserialize };

export interface RegionStanding {
  readonly id: RegionId;
  readonly name: string;
  readonly held: number;
  readonly total: number;
  readonly bonus: number;
}

export interface ReinforcementBreakdown {
  readonly base: number;
  readonly quiz: 0 | 2 | null;
  readonly regions: readonly RegionBonusLine[];
}

export function openTurn(state: GameState, player: PlayerId, rng: Rng): GameState {
  return beginTurn(state, player, rng);
}

export function regionStanding(state: GameState, player: PlayerId): readonly RegionStanding[] {
  const owned = new Set(state.holdings.filter((holding) => holding.owner === player).map((holding) => holding.countyId));
  return state.config.map.regions.map((region) => ({
    id: region.id,
    name: region.name,
    held: region.counties.reduce((total, countyId) => total + (owned.has(countyId) ? 1 : 0), 0),
    total: region.counties.length,
    bonus: region.bonus,
  }));
}

export function reinforcementBreakdown(state: GameState): ReinforcementBreakdown | null {
  const grant = state.turnGrant;
  if (grant && grant.turnSequence === state.turnSequence && grant.player === state.activePlayer) {
    return { base: grant.base, quiz: awardedQuiz(state), regions: grant.lines };
  }
  if (state.phase.kind === "quiz") return { base: state.phase.baseIncome, quiz: null, regions: state.phase.regionLines ?? [] };
  if (state.phase.kind === "place") return { base: state.phase.income.base, quiz: state.phase.income.quiz, regions: state.phase.income.lines ?? [] };
  return null;
}

export interface Session {
  state: GameState;
  rng: SeededRng;
}

export function createGame(config: GameConfig, rng: Rng): ParseResult<GameState> {
  return withCursor(rng, (draw) => startGame(config, draw), (error) => ({
    ok: false,
    error: { code: "INVALID_INPUT", message: errorText(error) },
  }));
}

export function reduce(state: GameState, action: Action, rng: Rng): ReduceResult {
  return withCursor(rng, (draw) => apply(state, action, draw), (error) => reject(state, "INVALID_INPUT", errorText(error)));
}

export function dispatch(session: Session, action: Action): ReduceResult {
  const result = reduce(session.state, action, bindCursor(session.rng));
  if (result.ok) session.state = result.state;
  return result;
}

export function save(session: Session): string {
  return serialize({ version: 1, state: session.state, rng: session.rng.snapshot() });
}

export function load(session: Session, raw: unknown): ParseResult<Session> {
  const parsed = deserialize(raw);
  if (!parsed.ok) return parsed;
  let temporary: SeededRng;
  try {
    temporary = createRng(parsed.value.rng.seed);
    temporary.restore(parsed.value.rng);
  } catch (error) {
    return { ok: false, error: { code: "INVALID_SAVE", message: errorText(error) } };
  }
  const next = temporary.snapshot();
  const live = session.rng.snapshot();
  try {
    if (live.algorithm === next.algorithm && live.seed === next.seed) session.rng.restore(next);
    else session.rng = temporary;
  } catch (error) {
    return { ok: false, error: { code: "INVALID_SAVE", message: errorText(error) } };
  }
  session.state = parsed.value.state;
  return { ok: true, value: session };
}

function bindCursor(rng: SeededRng): Rng {
  const draw: Rng = () => rng.draw();
  return Object.assign(draw, {
    draw: () => rng.draw(),
    snapshot: () => rng.snapshot(),
    restore: (snapshot: RngSnapshot) => {
      rng.restore(snapshot);
    },
  });
}

function withCursor<T>(rng: Rng, run: (draw: Rng) => T, onThrow: (error: unknown) => T): T {
  const cursor = asCursor(rng);
  if (!cursor) {
    try {
      return run(rng);
    } catch (error) {
      return onThrow(error);
    }
  }
  const saved = cursor.snapshot();
  const temporary = saved.algorithm === RNG_ALGORITHM ? forkCursor(saved) : null;
  try {
    const result = run(temporary ? () => temporary.draw() : () => cursor.draw());
    if (accepted(result)) {
      if (temporary) cursor.restore(temporary.snapshot());
      return result;
    }
    if (!temporary) cursor.restore(saved);
    return result;
  } catch (error) {
    if (!temporary) cursor.restore(saved);
    return onThrow(error);
  }
}

function forkCursor(saved: RngSnapshot): SeededRng {
  const copy = createRng(saved.seed);
  copy.restore(saved);
  return copy;
}

function asCursor(rng: Rng): Pick<SeededRng, "draw" | "snapshot" | "restore"> | null {
  const candidate = rng as Rng & Partial<Pick<SeededRng, "draw" | "snapshot" | "restore">>;
  const snapshot = candidate.snapshot;
  const restore = candidate.restore;
  if (typeof snapshot !== "function" || typeof restore !== "function") return null;
  const draw = candidate.draw;
  return {
    draw: typeof draw === "function" ? () => draw() : () => rng(),
    snapshot: () => snapshot(),
    restore: (next) => {
      restore(next);
    },
  };
}

function accepted(result: unknown): boolean {
  return typeof result === "object" && result !== null && "ok" in result && result.ok === true;
}

function startGame(config: GameConfig, rng: Rng): ParseResult<GameState> {
  const players = validatePlayers(config.players);
  if (!players.ok) return players;
  const packError = validatePacks(config);
  if (packError) return { ok: false, error: packError };
  const dealt = deal(config, players.value, rng);
  if (!dealt.ok) return dealt;
  const opened: GameState = {
    version: 1,
    config: { players: players.value, mode: config.mode, map: config.map, quiz: config.quiz },
    activePlayer: 0,
    turnSequence: 0,
    holdings: dealt.value,
    phase: { kind: "attack" },
    asked: [],
    events: [],
  };
  const started = beginTurn(opened, 0, rng);
  const issues = checkInvariants(started);
  if (issues.length > 0) return { ok: false, error: { code: "INVALID_PACK", message: issues.join("; ") } };
  return { ok: true, value: started };
}

function apply(state: GameState, action: Action, rng: Rng): ReduceResult {
  if (state.phase.kind === "over") return reject(state, "WRONG_PHASE", "the game is over");
  switch (action.kind) {
    case "answerQuiz":
      return answerQuiz(state, action);
    case "skipQuiz":
      return skipQuiz(state, action);
    case "place":
      return place(state, action);
    case "attack":
      return attack(state, action, rng);
    case "occupy":
      return occupy(state, action);
    case "endAttacks":
      return endAttacks(state);
    case "fortify":
      return fortify(state, action);
    case "skipFortify":
      return state.phase.kind === "fortify" ? accept(state, finishTurn(state)) : reject(state, "WRONG_PHASE", "fortify is not open");
    case "acknowledgeHandoff":
      return acknowledge(state, action, rng);
    default:
      return reject(state, "INVALID_INPUT", "action is not recognized");
  }
}

function beginTurn(state: GameState, player: PlayerId, rng: Rng): GameState {
  if (state.phase.kind === "over") return state;
  if (state.turnGrant && state.turnGrant.turnSequence === state.turnSequence && state.turnGrant.player === player && state.activePlayer === player) {
    return state;
  }
  const opening = state.turnSequence === 0 && !state.turnGrant;
  if (!opening && state.phase.kind !== "handoff") return state;
  const turnSequence = state.turnSequence + 1;
  const lines = regionLines({ ...state, activePlayer: player }, player);
  const base = reinforcementBase(state.holdings.filter((holding) => holding.owner === player).length);
  const regions = sumLines(lines);
  const grant: TurnGrant = { turnSequence, player, base, lines };
  const seated: GameState = { ...state, activePlayer: player, turnSequence, turnGrant: grant };
  const owned = seated.holdings.filter((holding) => holding.owner === player);
  const first = owned[drawIndex(rng, owned.length)];
  if (!first) throw new Error("the active player has no counties");
  let countyId: CountyId | null = hasQuestions(seated, first.countyId) ? first.countyId : null;
  if (!countyId) {
    const eligible = owned.filter((holding) => holding.countyId !== first.countyId && hasQuestions(seated, holding.countyId));
    if (eligible.length > 0) {
      const redraw = eligible[drawIndex(rng, eligible.length)];
      countyId = redraw?.countyId ?? null;
    }
  }
  if (!countyId) return openReinforcement(seated, base, lines, 0, "noQuestion", null);
  const asked = seated.asked.find((entry) => entry.countyId === countyId)?.questionIds ?? [];
  const pending = prepareQuestion(countyId, seated.config.quiz, asked, turnSequence, rng);
  if (!pending) return openReinforcement(seated, base, lines, 0, "noQuestion", null);
  const phase: Phase = { kind: "quiz", pending, baseIncome: base, regionIncome: regions, regionLines: lines };
  return { ...seated, phase, events: [...seated.events, phaseEvent(seated, "quiz")] };
}

function answerQuiz(state: GameState, action: Extract<Action, { kind: "answerQuiz" }>): ReduceResult {
  if (state.phase.kind !== "quiz") return reject(state, "WRONG_PHASE", "no quiz is open");
  if (action.turnSequence !== state.turnSequence || action.questionId !== state.phase.pending.questionId) {
    return reject(state, "STALE_QUIZ", "that quiz is not the one on this turn");
  }
  const letter = choiceAt(state.phase.pending, action.answer.index);
  if (!letter) return reject(state, "ILLEGAL_ACTION", "that choice is not on the question");
  const question = findQuestion(state, state.phase.pending);
  if (!question) return reject(state, "STALE_QUIZ", "the pending question is not in the pack");
  const correct = letter === question.correctLetter;
  return accept(state, resolveQuiz(state, state.phase.pending, correct ? "correct" : "wrong", correct ? QUIZ_AWARD : 0));
}

function skipQuiz(state: GameState, action: Extract<Action, { kind: "skipQuiz" }>): ReduceResult {
  if (state.phase.kind !== "quiz") return reject(state, "WRONG_PHASE", "no quiz is open");
  if (action.turnSequence !== state.turnSequence || action.questionId !== state.phase.pending.questionId) {
    return reject(state, "STALE_QUIZ", "that quiz is not the one on this turn");
  }
  return accept(state, resolveQuiz(state, state.phase.pending, "skipped", 0));
}

function resolveQuiz(state: GameState, pending: PendingQuestion, result: QuizResult, bonus: 0 | 2): GameState {
  const phase = state.phase;
  if (phase.kind !== "quiz") return state;
  const remembered: GameState = { ...state, asked: remember(state.asked, pending.countyId, pending.questionId) };
  const resolved = quizEvent(remembered, result, pending.countyId, bonus);
  const lines = phase.regionLines ?? remembered.turnGrant?.lines ?? [];
  const next = openReinforcement(remembered, phase.baseIncome, lines, bonus, result, pending.countyId);
  return { ...next, events: [...remembered.events, resolved, ...next.events.slice(remembered.events.length)] };
}

function openReinforcement(
  state: GameState,
  base: number,
  lines: readonly RegionBonusLine[],
  quiz: 0 | 2,
  result: QuizResult,
  countyId: CountyId | null,
): GameState {
  const regions = sumLines(lines);
  const income: Income = { base, regions, quiz, lines };
  const remaining = base + regions + quiz;
  const quizEventIfSkip =
    result === "noQuestion" ? [quizEvent(state, "noQuestion", countyId, 0)] : [];
  if (remaining < 1) {
    return { ...state, phase: { kind: "attack" }, events: [...state.events, ...quizEventIfSkip, phaseEvent(state, "attack")] };
  }
  const phase: Phase = { kind: "place", remaining, income, quizResult: result };
  return { ...state, phase, events: [...state.events, ...quizEventIfSkip, phaseEvent(state, "place")] };
}

function place(state: GameState, action: Extract<Action, { kind: "place" }>): ReduceResult {
  if (state.phase.kind !== "place") return reject(state, "WRONG_PHASE", "reinforcements are not being placed");
  if (!Number.isSafeInteger(action.count) || action.count < 1 || action.count > state.phase.remaining) {
    return reject(state, "ILLEGAL_ACTION", "place a positive number of armies still in the pool");
  }
  const current = byCounty(state, action.countyId);
  if (!current || current.owner !== state.activePlayer) return reject(state, "ILLEGAL_ACTION", "place armies on a county you hold");
  const remaining = state.phase.remaining - action.count;
  const holdings = replaceHolding(state.holdings, action.countyId, { armies: current.armies + action.count });
  const placed: GameState = { ...state, holdings };
  if (remaining > 0) {
    const phase: Phase = { ...state.phase, remaining };
    return accept(state, { ...placed, phase });
  }
  return accept(state, { ...placed, phase: { kind: "attack" }, events: [...placed.events, phaseEvent(placed, "attack")] });
}

function attack(state: GameState, action: Extract<Action, { kind: "attack" }>, rng: Rng): ReduceResult {
  if (state.phase.kind !== "attack") return reject(state, "WRONG_PHASE", "attacks are not open");
  const dice = action.dice;
  if (dice !== 1 && dice !== 2 && dice !== 3) return reject(state, "ILLEGAL_ACTION", "roll 1, 2, or 3 dice");
  const from = byCounty(state, action.from);
  const to = byCounty(state, action.to);
  if (!from || !to || from.countyId === to.countyId) return reject(state, "ILLEGAL_ACTION", "choose two different counties");
  if (from.owner !== state.activePlayer || from.armies < 2) return reject(state, "ILLEGAL_ACTION", "attack from a county with at least two armies");
  if (to.owner === state.activePlayer || to.armies < 1) return reject(state, "ILLEGAL_ACTION", "attack an enemy county");
  if (!adjacent(state, from.countyId, to.countyId)) return reject(state, "ILLEGAL_ACTION", "those counties do not share a border");
  const limit = Math.min(3, from.armies - 1);
  if (dice > limit) return reject(state, "ILLEGAL_ACTION", "not enough armies for that many dice");
  const attackRolls = Array.from({ length: dice }, () => rollDie(rng));
  const defenseRolls = Array.from({ length: Math.min(2, to.armies) }, () => rollDie(rng));
  let attackLosses = 0;
  let defenseLosses = 0;
  const attackOrder = [...attackRolls].sort((left, right) => right - left);
  const defenseOrder = [...defenseRolls].sort((left, right) => right - left);
  const pairs = Math.min(attackOrder.length, defenseOrder.length);
  for (let index = 0; index < pairs; index += 1) {
    const attackFace = attackOrder[index];
    const defenseFace = defenseOrder[index];
    if (attackFace === undefined || defenseFace === undefined) continue;
    if (attackFace > defenseFace) defenseLosses += 1;
    else attackLosses += 1;
  }
  const fromArmies = from.armies - attackLosses;
  const toArmies = to.armies - defenseLosses;
  let holdings = replaceHolding(state.holdings, from.countyId, { armies: fromArmies });
  holdings = replaceHolding(holdings, to.countyId, { armies: Math.max(0, toArmies) });
  const battle: GameEvent = {
    kind: "battle",
    turnSequence: state.turnSequence,
    player: state.activePlayer,
    from: from.countyId,
    to: to.countyId,
    attackRolls,
    defenseRolls,
    attackLosses,
    defenseLosses,
  };
  if (toArmies > 0) return accept(state, { ...state, holdings, events: [...state.events, battle] });
  const phase: Phase = { kind: "occupy", from: from.countyId, to: to.countyId, minimum: dice, previousOwner: to.owner };
  return accept(state, {
    ...state,
    holdings,
    phase,
    events: [...state.events, battle, phaseEvent(state, "occupy")],
  });
}

function occupy(state: GameState, action: Extract<Action, { kind: "occupy" }>): ReduceResult {
  if (state.phase.kind !== "occupy") return reject(state, "WRONG_PHASE", "no county is waiting to be occupied");
  const from = byCounty(state, state.phase.from);
  const to = byCounty(state, state.phase.to);
  if (!from || !to) return reject(state, "ILLEGAL_ACTION", "the occupation counties are missing");
  const maximum = from.armies - 1;
  if (!Number.isSafeInteger(action.count) || action.count < state.phase.minimum || action.count > maximum) {
    return reject(state, "ILLEGAL_ACTION", "move at least the attacking dice and leave one army behind");
  }
  const holdings = replaceHolding(
    replaceHolding(state.holdings, from.countyId, { armies: from.armies - action.count }),
    to.countyId,
    { owner: state.activePlayer, armies: action.count },
  );
  const moved: GameState = {
    ...state,
    holdings,
    events: [
      ...state.events,
      { kind: "capture", turnSequence: state.turnSequence, player: state.activePlayer, countyId: to.countyId, moved: action.count },
    ],
  };
  const total = state.config.map.counties.length;
  if (state.config.mode === "total92" && ownedCount(moved, state.activePlayer) === total) return accept(state, conclude(moved));
  return accept(state, { ...moved, phase: { kind: "attack" }, events: [...moved.events, phaseEvent(moved, "attack")] });
}

function endAttacks(state: GameState): ReduceResult {
  if (state.phase.kind !== "attack") return reject(state, "WRONG_PHASE", "attacks are not open");
  return accept(state, { ...state, phase: { kind: "fortify" }, events: [...state.events, phaseEvent(state, "fortify")] });
}

function fortify(state: GameState, action: Extract<Action, { kind: "fortify" }>): ReduceResult {
  if (state.phase.kind !== "fortify") return reject(state, "WRONG_PHASE", "fortify is not open");
  const from = byCounty(state, action.from);
  const to = byCounty(state, action.to);
  if (!from || !to || from.countyId === to.countyId) return reject(state, "ILLEGAL_ACTION", "fortify between two different counties");
  if (from.owner !== state.activePlayer || to.owner !== state.activePlayer) {
    return reject(state, "ILLEGAL_ACTION", "fortify only through counties you hold");
  }
  if (!Number.isSafeInteger(action.count) || action.count < 1 || action.count > from.armies - 1) {
    return reject(state, "ILLEGAL_ACTION", "leave at least one army on the county you fortify from");
  }
  if (!ownedPath(state, from.countyId, to.countyId)) return reject(state, "ILLEGAL_ACTION", "those counties are not connected through your territory");
  const holdings = replaceHolding(
    replaceHolding(state.holdings, from.countyId, { armies: from.armies - action.count }),
    to.countyId,
    { armies: to.armies + action.count },
  );
  return accept(state, finishTurn({ ...state, holdings }));
}

function acknowledge(state: GameState, action: Extract<Action, { kind: "acknowledgeHandoff" }>, rng: Rng): ReduceResult {
  if (state.phase.kind !== "handoff") return reject(state, "WRONG_PHASE", "no handoff is waiting");
  if (action.turnSequence !== state.turnSequence) return reject(state, "ILLEGAL_ACTION", "that handoff is from another turn");
  if (ownedCount(state, state.phase.nextPlayer) < 1) return reject(state, "ILLEGAL_ACTION", "the next player has been eliminated");
  return accept(state, beginTurn(state, state.phase.nextPlayer, rng));
}

function finishTurn(state: GameState): GameState {
  const owned = ownedCount(state, state.activePlayer);
  const total = state.config.map.counties.length;
  const quickWin = state.config.mode === "quick60" && owned >= quickTarget(total);
  if (quickWin || owned === total) return conclude(state);
  const next = nextSeat(state, state.activePlayer);
  if (next === null || next === state.activePlayer) return conclude(state);
  return { ...state, phase: { kind: "handoff", nextPlayer: next }, events: [...state.events, phaseEvent(state, "handoff")] };
}

function conclude(state: GameState): GameState {
  const phase: Phase = { kind: "over", winner: state.activePlayer, mode: state.config.mode };
  return {
    ...state,
    phase,
    events: [
      ...state.events,
      phaseEvent(state, "over"),
      { kind: "winner", turnSequence: state.turnSequence, player: state.activePlayer, mode: state.config.mode },
    ],
  };
}

function deal(config: GameConfig, players: readonly Player[], rng: Rng): ParseResult<readonly Holding[]> {
  const count = players.length as PlayerCount;
  const order = config.map.counties.map((county) => county.id);
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swap = drawIndex(rng, index + 1);
    const current = order[index];
    const other = order[swap];
    if (current === undefined || other === undefined) return { ok: false, error: { code: "INVALID_INPUT", message: "the county deal failed" } };
    order[index] = other;
    order[swap] = current;
  }
  const owners = new Map<CountyId, PlayerId>();
  order.forEach((countyId, index) => owners.set(countyId, (index % count) as PlayerId));
  const armies = new Map<CountyId, number>(config.map.counties.map((county) => [county.id, 1]));
  for (let seat = 0; seat < count; seat += 1) {
    const player = seat as PlayerId;
    const held = [...owners.entries()].filter((entry) => entry[1] === player).map((entry) => entry[0]);
    const pool = (STARTING_POOL[count] ?? 0) + (count === 2 && player === 1 ? SECOND_SEAT_EXTRA : 0);
    if (held.length > pool) {
      return { ok: false, error: { code: "INVALID_PACK", message: "the starting armies do not cover the dealt counties" } };
    }
    let extra = pool - held.length;
    while (extra > 0) {
      const countyId = held[drawIndex(rng, held.length)];
      if (!countyId) return { ok: false, error: { code: "INVALID_INPUT", message: "the army deal failed" } };
      armies.set(countyId, (armies.get(countyId) ?? 1) + 1);
      extra -= 1;
    }
  }
  return {
    ok: true,
    value: config.map.counties.map((county) => ({
      countyId: county.id,
      owner: owners.get(county.id) ?? 0,
      armies: armies.get(county.id) ?? 1,
    })),
  };
}

function validatePlayers(players: readonly Player[]): ParseResult<readonly Player[]> {
  const count = players.length;
  if (count < 2 || count > 6) return { ok: false, error: { code: "INVALID_INPUT", message: "seat 2 to 6 players" } };
  const seats = players.map((player, index) => {
    if (player.id !== index || (player.kind !== "human" && player.kind !== "computer") || player.label.trim() === "") return null;
    return { id: player.id, label: player.label, kind: player.kind };
  });
  if (seats.some((seat) => seat === null)) return { ok: false, error: { code: "INVALID_INPUT", message: "player ids must be contiguous from zero" } };
  return { ok: true, value: seats.filter((seat): seat is Player => seat !== null) };
}

function validatePacks(config: GameConfig): EngineError | null {
  if (config.mode !== "total92" && config.mode !== "quick60") return { code: "INVALID_PACK", message: "mode must be total92 or quick60" };
  if (config.map.version !== 1 || config.quiz.version !== 1) return { code: "INVALID_PACK", message: "pack version must be 1" };
  if (config.quiz.mapDigest !== config.map.digest) return { code: "INVALID_PACK", message: "quiz pack is not bound to this map" };
  if (config.map.counties.length < config.players.length) return { code: "INVALID_PACK", message: "the map has fewer counties than players" };
  const counties = new Set(config.map.counties.map((county) => county.id));
  if (counties.size !== config.map.counties.length) return { code: "INVALID_PACK", message: "county ids repeat" };
  for (const region of config.map.regions) {
    if (!Number.isSafeInteger(region.bonus)) return { code: "INVALID_PACK", message: "region bonus must be an integer" };
    if (region.counties.some((countyId) => !counties.has(countyId))) return { code: "INVALID_PACK", message: "a region lists an unknown county" };
  }
  const seen = new Set<string>();
  for (const [countyId, questions] of Object.entries(config.quiz.counties)) {
    if (!counties.has(countyId as CountyId)) return { code: "INVALID_PACK", message: "quiz pack names a county that is not on the map" };
    for (const question of questions) {
      if (question.countyId !== countyId || seen.has(question.id) || !plainQuestion(question)) {
        return { code: "INVALID_PACK", message: "a quiz question is blank, duplicated, or mismatched" };
      }
      if (question.correctAnswer !== question.choices[question.correctLetter]) {
        return { code: "INVALID_PACK", message: "a quiz answer does not match its letter" };
      }
      seen.add(question.id);
    }
  }
  return null;
}

export function checkInvariants(state: GameState): readonly string[] {
  const issues: string[] = [];
  if (state.version !== 1) issues.push("state version must be 1");
  if (!Number.isSafeInteger(state.turnSequence) || state.turnSequence < 1) issues.push("turn sequence must be a positive integer");
  const ids = state.config.map.counties.map((county) => county.id);
  if (state.holdings.length !== ids.length || new Set(state.holdings.map((holding) => holding.countyId)).size !== ids.length) {
    issues.push("holdings must list each map county once");
  }
  const occupyTarget = state.phase.kind === "occupy" ? state.phase.to : null;
  for (const countyId of ids) {
    const holding = state.holdings.find((item) => item.countyId === countyId);
    if (!holding) {
      issues.push("a map county is missing from the holdings");
      continue;
    }
    if (!Number.isSafeInteger(holding.armies)) issues.push("armies must be integers");
    else if (countyId === occupyTarget ? holding.armies !== 0 : holding.armies < 1) issues.push("army counts do not match the phase");
    if (holding.owner < 0 || holding.owner >= state.config.players.length) issues.push("a holding has an unknown owner");
  }
  if (state.phase.kind !== "over" && ownedCount(state, state.activePlayer) < 1) issues.push("the active player has no counties");
  if (state.phase.kind === "quiz") {
    const pending = state.phase.pending;
    const holding = state.holdings.find((item) => item.countyId === pending.countyId);
    if (!holding || holding.owner !== state.activePlayer) issues.push("the quiz county is not held by the active player");
    if (pending.turnSequence !== state.turnSequence) issues.push("the pending question is from another turn");
    if (!isPermutation(pending.choiceOrder)) issues.push("quiz choices are not a permutation of A through D");
    if (!findQuestion(state, pending)) issues.push("the pending question is missing from the pack");
    if (state.phase.baseIncome !== reinforcementBase(ownedCount(state, state.activePlayer))) issues.push("base income does not match the formula");
    if (state.phase.regionIncome !== regionBonus(state, state.activePlayer)) issues.push("region income does not match the map");
  }
  if (state.phase.kind === "place") {
    const income = state.phase.income;
    const sum = income.base + income.regions + income.quiz;
    if (state.phase.remaining < 1 || state.phase.remaining > sum) issues.push("the reinforcement pool is outside the income");
    if (income.base !== reinforcementBase(ownedCount(state, state.activePlayer))) issues.push("base income does not match the formula");
    if (income.regions !== regionBonus(state, state.activePlayer)) issues.push("region income does not match the map");
    if ((state.phase.quizResult === "correct") !== (income.quiz === QUIZ_AWARD)) issues.push("quiz income does not match the quiz result");
  }
  const phase = state.phase;
  if (phase.kind === "occupy") {
    const from = state.holdings.find((item) => item.countyId === phase.from);
    const to = state.holdings.find((item) => item.countyId === phase.to);
    if (!from || from.owner !== state.activePlayer || from.armies < phase.minimum + 1) issues.push("occupation cannot leave the source");
    if (!to || to.armies !== 0 || to.owner !== phase.previousOwner || to.owner === state.activePlayer) issues.push("occupation target is not pending");
    if (!adjacent(state, phase.from, phase.to)) issues.push("occupation is not along a border");
  }
  if (phase.kind === "handoff" && ownedCount(state, phase.nextPlayer) < 1) issues.push("handoff names an eliminated player");
  if (phase.kind === "over" && ownedCount(state, phase.winner) < 1) issues.push("the winner has no counties");
  issues.push(...awardIssues(state));
  return issues;
}

export function serialize(save: SaveEnvelope): string {
  return JSON.stringify(save);
}

export function deserialize(raw: unknown): ParseResult<SaveEnvelope> {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) as unknown : raw;
    const envelope = readEnvelope(parsed);
    const issues = checkInvariants(envelope.state);
    if (issues.length > 0) return { ok: false, error: { code: "INVALID_SAVE", message: issues.join("; ") } };
    const temporary = createRng(envelope.rng.seed);
    temporary.restore(envelope.rng);
    return { ok: true, value: { version: 1, state: envelope.state, rng: temporary.snapshot() } };
  } catch (error) {
    return { ok: false, error: { code: "INVALID_SAVE", message: errorText(error) } };
  }
}

function readEnvelope(raw: unknown): SaveEnvelope {
  const record = objectOf(raw, "save");
  if (record.version !== 1) throw new Error("save version must be 1");
  return { version: 1, state: readState(record.state), rng: readSnapshot(record.rng) };
}

function readSnapshot(raw: unknown): RngSnapshot {
  const record = objectOf(raw, "rng");
  if (record.version !== 1) throw new Error("rng version is invalid");
  if (typeof record.algorithm !== "string" || record.algorithm !== RNG_ALGORITHM) throw new Error("rng algorithm is not supported");
  if (typeof record.seed !== "string" || !Number.isSafeInteger(record.draws) || Number(record.draws) < 0) throw new Error("rng cursor is invalid");
  return { version: 1, algorithm: RNG_ALGORITHM, seed: record.seed, draws: Number(record.draws) };
}

function readState(raw: unknown): GameState {
  const record = objectOf(raw, "state");
  if (record.version !== 1) throw new Error("state version must be 1");
  const config = readConfig(record.config);
  const activePlayer = readPlayerId(record.activePlayer, config.players.length);
  if (!Number.isSafeInteger(record.turnSequence)) throw new Error("turn sequence is invalid");
  return {
    version: 1,
    config,
    activePlayer,
    turnSequence: Number(record.turnSequence),
    holdings: readHoldings(record.holdings),
    phase: readPhase(record.phase, config.players.length),
    asked: readAsked(record.asked),
    events: readEvents(record.events),
    ...(record.turnGrant == null ? {} : { turnGrant: readTurnGrant(record.turnGrant, config.players.length) }),
  };
}

function readConfig(raw: unknown): GameConfig {
  const record = objectOf(raw, "config");
  const mode = record.mode === "total92" || record.mode === "quick60" ? record.mode : null;
  if (!mode) throw new Error("mode is invalid");
  const players = Array.isArray(record.players) ? record.players.map((entry, index) => readPlayer(entry, index)) : null;
  if (!players || players.length < 2 || players.length > 6) throw new Error("players are invalid");
  return { players, mode, map: readMap(record.map), quiz: readQuiz(record.quiz) };
}

function readPlayer(raw: unknown, index: number): Player {
  const record = objectOf(raw, "player");
  if (record.id !== index || (record.kind !== "human" && record.kind !== "computer") || typeof record.label !== "string") {
    throw new Error("player is invalid");
  }
  return { id: index as PlayerId, label: record.label, kind: record.kind };
}

function readMap(raw: unknown): MapPack {
  const record = objectOf(raw, "map");
  if (record.version !== 1 || record.id !== "indiana" || typeof record.digest !== "string" || typeof record.outline !== "string") {
    throw new Error("map pack is invalid");
  }
  const [x, y, width, height] = numberTuple(record.viewBox, 4);
  if (x === undefined || y === undefined || width === undefined || height === undefined) throw new Error("viewBox is invalid");
  return {
    version: 1,
    id: "indiana",
    digest: record.digest,
    viewBox: [x, y, width, height],
    outline: record.outline,
    counties: arrayOf(record.counties, "counties").map((entry) => readCounty(entry)),
    regions: arrayOf(record.regions, "regions").map((entry) => readRegion(entry)),
  };
}

function readCounty(raw: unknown): County {
  const record = objectOf(raw, "county");
  const [cx, cy] = numberTuple(record.centroid, 2);
  if (cx === undefined || cy === undefined) throw new Error("centroid is invalid");
  const facts = arrayOf(record.facts, "facts").map((entry) => readFact(entry));
  return {
    id: countyId(record.id),
    name: text(record.name, "name"),
    path: text(record.path, "path"),
    centroid: [cx, cy],
    neighbors: arrayOf(record.neighbors, "neighbors").map((entry) => countyId(entry)),
    regionId: regionId(record.regionId),
    facts,
  };
}

function readFact(raw: unknown): CountyFact {
  const record = objectOf(raw, "fact");
  return { label: text(record.label, "label"), text: text(record.text, "text") };
}

function readRegion(raw: unknown): Region {
  const record = objectOf(raw, "region");
  if (typeof record.bonus !== "number" || !Number.isFinite(record.bonus)) throw new Error("region bonus is invalid");
  if (record.review !== "draft" && record.review !== "reviewed") throw new Error("region review is invalid");
  return {
    id: regionId(record.id),
    name: text(record.name, "name"),
    counties: arrayOf(record.counties, "counties").map((entry) => countyId(entry)),
    borderPath: text(record.borderPath, "borderPath"),
    bonus: record.bonus,
    review: record.review,
  };
}

function readQuiz(raw: unknown): QuizPack {
  const record = objectOf(raw, "quiz");
  if (record.version !== 1 || typeof record.mapDigest !== "string" || typeof record.sourceDigest !== "string") throw new Error("quiz pack is invalid");
  const counties: Record<string, QuizQuestion[]> = {};
  const source = objectOf(record.counties, "quiz counties");
  for (const [key, value] of Object.entries(source)) {
    counties[countyId(key)] = arrayOf(value, key).map((entry) => readQuestion(entry));
  }
  return { version: 1, mapDigest: record.mapDigest, sourceDigest: record.sourceDigest, counties: counties as QuizPack["counties"] };
}

function readQuestion(raw: unknown): QuizQuestion {
  const record = objectOf(raw, "question");
  const choices = objectOf(record.choices, "choices");
  const letter = record.correctLetter;
  if (letter !== "A" && letter !== "B" && letter !== "C" && letter !== "D") throw new Error("correct letter is invalid");
  const question: QuizQuestion = {
    kind: "multipleChoice",
    id: questionId(record.id),
    countyId: countyId(record.countyId),
    countyName: text(record.countyName, "countyName"),
    countySeat: text(record.countySeat, "countySeat"),
    established: integer(record.established, "established"),
    namedFor: text(record.namedFor, "namedFor"),
    category: text(record.category, "category"),
    prompt: text(record.prompt, "prompt"),
    choices: {
      A: text(choices.A, "A"),
      B: text(choices.B, "B"),
      C: text(choices.C, "C"),
      D: text(choices.D, "D"),
    },
    correctLetter: letter,
    correctAnswer: text(record.correctAnswer, "correctAnswer"),
  };
  if (record.kind !== "multipleChoice") throw new Error("question kind is invalid");
  if (typeof record.explanation === "string") return { ...question, explanation: record.explanation };
  return question;
}

function readHoldings(raw: unknown): readonly Holding[] {
  return arrayOf(raw, "holdings").map((entry) => {
    const record = objectOf(entry, "holding");
    return { countyId: countyId(record.countyId), owner: readPlayerId(record.owner, 6), armies: integer(record.armies, "armies") };
  });
}

function readPhase(raw: unknown, seats: number): Phase {
  const record = objectOf(raw, "phase");
  switch (record.kind) {
    case "quiz":
      return {
        kind: "quiz",
        pending: readPending(record.pending),
        baseIncome: integer(record.baseIncome, "baseIncome"),
        regionIncome: integer(record.regionIncome, "regionIncome"),
        regionLines: record.regionLines === undefined ? [] : readLines(record.regionLines),
      };
    case "place":
      return {
        kind: "place",
        remaining: integer(record.remaining, "remaining"),
        income: readIncome(record.income),
        quizResult: readQuizResult(record.quizResult),
      };
    case "attack":
      return { kind: "attack" };
    case "occupy": {
      const minimum = record.minimum;
      if (minimum !== 1 && minimum !== 2 && minimum !== 3) throw new Error("occupation minimum is invalid");
      return {
        kind: "occupy",
        from: countyId(record.from),
        to: countyId(record.to),
        minimum,
        previousOwner: readPlayerId(record.previousOwner, seats),
      };
    }
    case "fortify":
      return { kind: "fortify" };
    case "handoff":
      return { kind: "handoff", nextPlayer: readPlayerId(record.nextPlayer, seats) };
    case "over":
      return {
        kind: "over",
        winner: readPlayerId(record.winner, seats),
        mode: record.mode === "total92" || record.mode === "quick60" ? record.mode : fail("mode"),
      };
    default:
      throw new Error("phase is invalid");
  }
}

function readPending(raw: unknown): PendingQuestion {
  const record = objectOf(raw, "pending question");
  const order = arrayOf(record.choiceOrder, "choiceOrder").map((entry) => {
    if (entry !== "A" && entry !== "B" && entry !== "C" && entry !== "D") throw new Error("choice order is invalid");
    return entry;
  });
  if (!isPermutation(order)) throw new Error("choice order is invalid");
  return {
    questionId: questionId(record.questionId),
    countyId: countyId(record.countyId),
    turnSequence: integer(record.turnSequence, "turnSequence"),
    choiceOrder: order,
  };
}

function readIncome(raw: unknown): Income {
  const record = objectOf(raw, "income");
  if (record.quiz !== 0 && record.quiz !== 2) throw new Error("quiz income is invalid");
  return {
    base: integer(record.base, "base"),
    regions: integer(record.regions, "regions"),
    quiz: record.quiz,
    lines: record.lines === undefined ? [] : readLines(record.lines),
  };
}

function readAsked(raw: unknown): readonly AskedQuestions[] {
  return arrayOf(raw, "asked").map((entry) => {
    const record = objectOf(entry, "asked");
    return { countyId: countyId(record.countyId), questionIds: arrayOf(record.questionIds, "questionIds").map((id) => questionId(id)) };
  });
}

function readEvents(raw: unknown): readonly GameEvent[] {
  return arrayOf(raw, "events").map((entry) => readEvent(entry));
}

function readEvent(raw: unknown): GameEvent {
  const record = objectOf(raw, "event");
  const turnSequence = integer(record.turnSequence, "turnSequence");
  const player = readPlayerId(record.player, 6);
  switch (record.kind) {
    case "phase":
      if (!phaseKind(record.phase)) throw new Error("phase event is invalid");
      return { kind: "phase", turnSequence, player, phase: record.phase };
    case "quizResolved":
      return {
        kind: "quizResolved",
        turnSequence,
        player,
        result: readQuizResult(record.result),
        countyId: record.countyId === null ? null : countyId(record.countyId),
        bonus: record.bonus === 0 || record.bonus === 2 ? record.bonus : fail("bonus"),
      };
    case "battle":
      return {
        kind: "battle",
        turnSequence,
        player,
        from: countyId(record.from),
        to: countyId(record.to),
        attackRolls: arrayOf(record.attackRolls, "attackRolls").map((value) => integer(value, "die")),
        defenseRolls: arrayOf(record.defenseRolls, "defenseRolls").map((value) => integer(value, "die")),
        attackLosses: integer(record.attackLosses, "attackLosses"),
        defenseLosses: integer(record.defenseLosses, "defenseLosses"),
      };
    case "capture":
      return { kind: "capture", turnSequence, player, countyId: countyId(record.countyId), moved: integer(record.moved, "moved") };
    case "winner":
      return { kind: "winner", turnSequence, player, mode: record.mode === "total92" || record.mode === "quick60" ? record.mode : fail("mode") };
    default:
      throw new Error("event is invalid");
  }
}

function remember(asked: readonly AskedQuestions[], countyId: CountyId, questionId: QuestionId): readonly AskedQuestions[] {
  const prior = asked.find((entry) => entry.countyId === countyId);
  if (prior?.questionIds.includes(questionId)) {
    return [...asked.filter((entry) => entry.countyId !== countyId), { countyId, questionIds: [questionId] }];
  }
  if (!prior) return [...asked, { countyId, questionIds: [questionId] }];
  return asked.map((entry) => (entry.countyId === countyId ? { countyId, questionIds: [...entry.questionIds, questionId] } : entry));
}

function hasQuestions(state: GameState, countyId: CountyId): boolean {
  return (state.config.quiz.counties[countyId]?.length ?? 0) > 0;
}

function findQuestion(state: GameState, pending: PendingQuestion): QuizQuestion | undefined {
  return state.config.quiz.counties[pending.countyId]?.find((question) => question.id === pending.questionId);
}

function choiceAt(pending: PendingQuestion, index: number): ChoiceLetter | null {
  if (!Number.isSafeInteger(index)) return null;
  return pending.choiceOrder[index] ?? null;
}

function adjacent(state: GameState, left: CountyId, right: CountyId): boolean {
  const from = state.config.map.counties.find((county) => county.id === left)?.neighbors ?? [];
  const to = state.config.map.counties.find((county) => county.id === right)?.neighbors ?? [];
  return from.includes(right) && to.includes(left);
}

function ownedPath(state: GameState, from: CountyId, to: CountyId): boolean {
  const owned = new Set(state.holdings.filter((holding) => holding.owner === state.activePlayer).map((holding) => holding.countyId));
  if (!owned.has(from) || !owned.has(to)) return false;
  const seen = new Set<CountyId>([from]);
  const queue = [from];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    for (const next of state.config.map.counties.find((county) => county.id === current)?.neighbors ?? []) {
      if (!owned.has(next) || seen.has(next)) continue;
      if (next === to) return true;
      seen.add(next);
      queue.push(next);
    }
  }
  return false;
}

function regionLines(state: GameState, player: PlayerId): RegionBonusLine[] {
  const owned = new Set(state.holdings.filter((holding) => holding.owner === player).map((holding) => holding.countyId));
  const lines: RegionBonusLine[] = [];
  for (const region of state.config.map.regions) {
    if (region.counties.length > 0 && region.counties.every((countyId) => owned.has(countyId))) {
      lines.push({ id: region.id, name: region.name, bonus: region.bonus });
    }
  }
  return lines;
}

function sumLines(lines: readonly RegionBonusLine[]): number {
  return lines.reduce((total, line) => total + line.bonus, 0);
}

function regionBonus(state: GameState, player: PlayerId): number {
  return sumLines(regionLines(state, player));
}

function awardedQuiz(state: GameState): 0 | 2 | null {
  if (state.phase.kind === "quiz") return null;
  if (state.phase.kind === "place") return state.phase.income.quiz;
  for (let index = state.events.length - 1; index >= 0; index -= 1) {
    const event = state.events[index];
    if (!event || event.kind !== "quizResolved" || event.turnSequence !== state.turnSequence || event.player !== state.activePlayer) continue;
    return event.bonus;
  }
  return null;
}

function awardIssues(state: GameState): string[] {
  if (state.phase.kind !== "quiz" && state.phase.kind !== "place") return [];
  const grant = state.turnGrant;
  if (!grant || grant.turnSequence !== state.turnSequence || grant.player !== state.activePlayer) {
    return ["the region award is not recorded for this turn"];
  }
  const issues: string[] = [];
  const base = state.phase.kind === "quiz" ? state.phase.baseIncome : state.phase.income.base;
  const regions = state.phase.kind === "quiz" ? state.phase.regionIncome : state.phase.income.regions;
  const lines = state.phase.kind === "quiz" ? state.phase.regionLines ?? [] : state.phase.income.lines ?? [];
  if (grant.base !== base) issues.push("base income does not match the recorded award");
  if (sumLines(grant.lines) !== regions) issues.push("region income does not match the recorded award");
  if (lines.length !== grant.lines.length || lines.some((line, index) => line.id !== grant.lines[index]?.id || line.bonus !== grant.lines[index]?.bonus)) {
    issues.push("the reinforcement breakdown does not match the recorded award");
  }
  return issues;
}

function readLines(raw: unknown): RegionBonusLine[] {
  return arrayOf(raw, "region lines").map((entry) => {
    const record = objectOf(entry, "region line");
    return { id: regionId(record.id), name: text(record.name, "name"), bonus: integer(record.bonus, "bonus") };
  });
}

function readTurnGrant(raw: unknown, seats: number): TurnGrant {
  const record = objectOf(raw, "turnGrant");
  return {
    turnSequence: integer(record.turnSequence, "turnSequence"),
    player: readPlayerId(record.player, seats),
    base: integer(record.base, "base"),
    lines: readLines(record.lines),
  };
}

function reinforcementBase(owned: number): number {
  return Math.max(3, Math.floor(owned / 3));
}

function quickTarget(counties: number): number {
  return Math.ceil(counties * 0.65);
}

function ownedCount(state: GameState, player: PlayerId): number {
  return state.holdings.reduce((total, holding) => total + (holding.owner === player ? 1 : 0), 0);
}

function nextSeat(state: GameState, from: PlayerId): PlayerId | null {
  const count = state.config.players.length;
  for (let step = 1; step <= count; step += 1) {
    const candidate = ((from + step) % count) as PlayerId;
    if (ownedCount(state, candidate) > 0) return candidate;
  }
  return null;
}

function byCounty(state: GameState, countyId: CountyId): Holding | undefined {
  return state.holdings.find((holding) => holding.countyId === countyId);
}

function replaceHolding(holdings: readonly Holding[], countyId: CountyId, patch: Partial<Holding>): readonly Holding[] {
  return holdings.map((holding) => (holding.countyId === countyId ? { ...holding, ...patch, countyId: holding.countyId } : holding));
}

function phaseEvent(state: GameState, phase: Phase["kind"]): GameEvent {
  return { kind: "phase", phase, turnSequence: state.turnSequence, player: state.activePlayer };
}

function quizEvent(state: GameState, result: QuizResult, countyId: CountyId | null, bonus: 0 | 2): GameEvent {
  return { kind: "quizResolved", result, countyId, bonus, turnSequence: state.turnSequence, player: state.activePlayer };
}

function accept(previous: GameState, next: GameState): ReduceResult {
  return { ok: true, state: next, events: next.events.slice(previous.events.length) };
}

function reject(state: GameState, code: EngineError["code"], message: string): ReduceResult {
  return { ok: false, state, error: { code, message } };
}

function rollDie(rng: Rng): number {
  return 1 + drawIndex(rng, 6);
}

function drawIndex(rng: Rng, count: number): number {
  const sample = rng();
  const index = Math.floor(sample * count);
  if (!(sample >= 0 && sample < 1) || index < 0 || index >= count) throw new Error("RNG draw was outside [0, 1)");
  return index;
}

function plainQuestion(question: QuizQuestion): boolean {
  return [question.prompt, question.countyName, ...Object.values(question.choices)].every((text) => !text.includes("<") && !text.includes(">"));
}

function isPermutation(order: readonly ChoiceLetter[]): order is readonly [ChoiceLetter, ChoiceLetter, ChoiceLetter, ChoiceLetter] {
  return order.length === 4 && LETTERS.every((letter) => order.includes(letter)) && new Set(order).size === 4;
}

function mixSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function advance(cursor: number): { cursor: number; unit: number } {
  let value = (cursor + 0x6d2b79f5) | 0;
  const next = value >>> 0;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return { cursor: next, unit: ((value ^ (value >>> 14)) >>> 0) / 4294967296 };
}

function objectOf(raw: unknown, label: string): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error(`${label} must be an object`);
  return raw as Record<string, unknown>;
}

function arrayOf(raw: unknown, label: string): unknown[] {
  if (!Array.isArray(raw)) throw new Error(`${label} must be an array`);
  return raw;
}

function text(raw: unknown, label: string): string {
  if (typeof raw !== "string" || raw.trim() === "") throw new Error(`${label} must be text`);
  return raw;
}

function integer(raw: unknown, label: string): number {
  if (typeof raw !== "number" || !Number.isSafeInteger(raw)) throw new Error(`${label} must be an integer`);
  return raw;
}

function numberTuple(raw: unknown, length: number): number[] {
  const values = arrayOf(raw, "numbers");
  if (values.length !== length || values.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
    throw new Error(`expected ${length} numbers`);
  }
  return values.filter((value): value is number => typeof value === "number");
}

function countyId(raw: unknown): CountyId {
  if (typeof raw !== "string" || !/^[0-9]{5}$/.test(raw)) throw new Error("county id must be a 5-digit code");
  return raw as CountyId;
}

function regionId(raw: unknown): RegionId {
  if (typeof raw !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(raw)) throw new Error("region id is invalid");
  return raw as RegionId;
}

function questionId(raw: unknown): QuestionId {
  if (typeof raw !== "string" || raw.trim() === "" || raw !== raw.trim()) throw new Error("question id is invalid");
  return raw as QuestionId;
}

function readPlayerId(raw: unknown, seats: number): PlayerId {
  if (raw !== 0 && raw !== 1 && raw !== 2 && raw !== 3 && raw !== 4 && raw !== 5) throw new Error("player id is invalid");
  if (raw >= seats) throw new Error("player id is invalid");
  return raw;
}

function readQuizResult(raw: unknown): QuizResult {
  if (raw === "correct" || raw === "wrong" || raw === "skipped" || raw === "noQuestion") return raw;
  throw new Error("quiz result is invalid");
}

function phaseKind(raw: unknown): raw is Phase["kind"] {
  return raw === "quiz" || raw === "place" || raw === "attack" || raw === "occupy" || raw === "fortify" || raw === "handoff" || raw === "over";
}

function fail(label: string): never {
  throw new Error(`${label} is invalid`);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "the action could not be applied";
}
