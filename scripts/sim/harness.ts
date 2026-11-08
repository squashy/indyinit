// Headless seeded games for balance reports. This is a test driver, not the product computer player.
// It only calls createGame and reduce, and it checks invariants after every accepted action.
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { parseMapPack } from "../../factory/parse-map.ts";
import { chooseAction } from "../../src/ai/ai.ts";
import { checkInvariants, createGame, createRng, reduce } from "../../src/engine/engine.ts";
import type { SeededRng } from "../../src/engine/engine.ts";
import type {
  Action,
  CountyId,
  GameConfig,
  GameEvent,
  GameState,
  Holding,
  MapPack,
  Mode,
  PlayerCount,
  PlayerId,
  QuizPack,
  ReduceResult,
} from "../../src/types.ts";

const COUNTY_COUNT = 92;
const QUIZ_AWARD = 2;

export interface Board {
  readonly map: MapPack;
  readonly quiz: QuizPack;
  readonly neighbors: ReadonlyMap<string, readonly CountyId[]>;
  readonly questionCount: number;
}

export interface SimOptions {
  readonly seeds?: number;
  readonly players?: number;
  readonly mode?: Mode;
  readonly success?: number;
  readonly maxSteps?: number;
  readonly runSeed?: string;
}

export interface ResolvedSimOptions {
  readonly seeds: number;
  readonly players: PlayerCount;
  readonly mode: Mode;
  readonly success: number;
  readonly maxSteps: number;
  readonly runSeed: string;
}

export interface SimFailure {
  readonly seed: string;
  readonly step: number;
  readonly phase: string;
  readonly action: string;
  readonly issues: readonly string[];
}

export interface SeatQuiz {
  readonly answered: number;
  readonly correct: number;
}

export interface PlayedGame {
  readonly seed: string;
  readonly outcome: "winner" | "cap" | "failed";
  readonly winner: PlayerId | null;
  readonly turns: number;
  readonly steps: number;
  readonly quiz: readonly SeatQuiz[];
  readonly failures: readonly SimFailure[];
}

export interface SimulationReport {
  readonly options: ResolvedSimOptions;
  readonly counties: number;
  readonly questions: number;
  readonly games: readonly PlayedGame[];
  readonly decided: number;
  readonly capped: number;
  readonly failures: readonly SimFailure[];
  readonly wins: readonly number[];
  readonly decidedTurns: readonly number[];
  readonly allTurns: readonly number[];
  readonly steps: readonly number[];
  readonly quizAnswered: number;
  readonly quizCorrect: number;
  readonly seatQuizRate: readonly (number | null)[];
  readonly effectGames: number;
  readonly winnerAccuracy: number | null;
  readonly otherAccuracy: number | null;
}

interface FrozenState {
  readonly holdings: readonly Holding[];
  readonly phaseKind: GameState["phase"]["kind"];
  readonly turnSequence: number;
  readonly activePlayer: PlayerId;
  readonly eventCount: number;
  readonly troops: readonly number[];
}

let boardCache: Board | null = null;

export function loadIndianaBoard(): Board {
  if (boardCache) return boardCache;
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const map = parseMapPack(JSON.parse(readFileSync(path.join(root, "data/regions/in/map.json"), "utf8")));
  const quiz = readQuizPack(JSON.parse(readFileSync(path.join(root, "data/quiz.json"), "utf8")), map);
  const neighbors = new Map(map.counties.map((county) => [county.id, county.neighbors]));
  let questionCount = 0;
  for (const questions of Object.values(quiz.counties)) questionCount += questions.length;
  boardCache = { map, quiz, neighbors, questionCount };
  return boardCache;
}

export function resolveOptions(options: SimOptions = {}): ResolvedSimOptions {
  const seeds = options.seeds ?? 50;
  const players = options.players ?? 2;
  const mode = options.mode ?? "quick60";
  const success = options.success ?? 0.6;
  const maxSteps = options.maxSteps ?? 2000;
  const runSeed = options.runSeed ?? "sim";
  if (!Number.isSafeInteger(seeds) || seeds < 1) throw new Error("seeds must be a positive integer");
  if (!Number.isSafeInteger(maxSteps) || maxSteps < 1) throw new Error("max steps must be a positive integer");
  if (mode !== "quick60" && mode !== "total92") throw new Error("mode must be quick60 or total92");
  if (!Number.isFinite(success) || success < 0 || success > 1) throw new Error("success rate must be between 0 and 1");
  if (runSeed.trim() === "") throw new Error("run seed must not be empty");
  return { seeds, players: playerCount(players), mode, success, maxSteps, runSeed };
}

export function runSimulation(board: Board, options: SimOptions = {}): SimulationReport {
  const resolved = resolveOptions(options);
  if (board.map.counties.length !== COUNTY_COUNT) {
    throw new Error(`county count is ${board.map.counties.length}, expected ${COUNTY_COUNT}`);
  }
  const games: PlayedGame[] = [];
  for (let index = 0; index < resolved.seeds; index += 1) {
    const played = playGame(board, resolved, index);
    games.push(played);
    if (played.failures.length > 0) break;
  }
  return summarize(board, resolved, games);
}

export function playGame(board: Board, options: ResolvedSimOptions, index: number): PlayedGame {
  const seed = `${options.runSeed}:game:${index}`;
  const engineRng = createRng(seed);
  const harnessRng = createRng(`${options.runSeed}:pick:${index}`);
  const quiz = emptyQuiz(options.players);
  const created = createGame(gameConfig(board, options), asRng(engineRng));
  if (!created.ok) {
    return done(seed, "failed", null, 0, 0, quiz, [
      failure(seed, 0, "create", "createGame", [created.error.message]),
    ]);
  }
  let state = created.value;
  let winnerEvents = countWinners(state.events);
  const opening = stateIssues(state, winnerEvents, state.events);
  if (opening.length > 0) return done(seed, "failed", null, state.turnSequence, 0, quiz, [failure(seed, 0, state.phase.kind, "createGame", opening)]);
  let steps = 0;
  while (steps < options.maxSteps && state.phase.kind !== "over") {
    const phase = state.phase.kind;
    let action: Action;
    try {
      action = pickAction(board, state, harnessRng, options.success);
    } catch (error) {
      return done(seed, "failed", null, state.turnSequence, steps, quiz, [
        failure(seed, steps, phase, "pick", [errorText(error)]),
      ]);
    }
    const frozen = freeze(state);
    let result: ReduceResult;
    try {
      result = reduce(state, action, asRng(engineRng));
    } catch (error) {
      return done(seed, "failed", null, state.turnSequence, steps, quiz, [
        failure(seed, steps, phase, action.kind, [errorText(error)]),
      ]);
    }
    const problems = acceptedProblems(state, frozen, result);
    if (problems.length > 0 || !result.ok) {
      const issues = result.ok ? problems : [...problems, result.error.message];
      return done(seed, "failed", null, state.turnSequence, steps, quiz, [failure(seed, steps, phase, action.kind, issues)]);
    }
    noteQuiz(quiz, result.events);
    winnerEvents += countWinners(result.events);
    state = result.state;
    steps += 1;
    const issues = stateIssues(state, winnerEvents, result.events);
    if (issues.length > 0) {
      return done(seed, "failed", null, state.turnSequence, steps, quiz, [failure(seed, steps, state.phase.kind, action.kind, issues)]);
    }
  }
  if (state.phase.kind === "over") {
    if (winnerEvents !== 1) {
      return done(seed, "failed", state.phase.winner, state.turnSequence, steps, quiz, [
        failure(seed, steps, "over", "end", [`expected one winner, found ${winnerEvents}`]),
      ]);
    }
    return done(seed, "winner", state.phase.winner, state.turnSequence, steps, quiz, []);
  }
  if (winnerEvents !== 0) {
    return done(seed, "failed", null, state.turnSequence, steps, quiz, [
      failure(seed, steps, state.phase.kind, "cap", ["a winner was recorded before the game ended"]),
    ]);
  }
  return done(seed, "cap", null, state.turnSequence, steps, quiz, []);
}

export function formatReport(report: SimulationReport): string {
  const options = report.options;
  const lines = [
    `BattleFor92 simulation`,
    `config   seeds=${options.seeds} players=${options.players} mode=${options.mode} success=${options.success.toFixed(3)} maxSteps=${options.maxSteps} runSeed=${options.runSeed} counties=${report.counties} questions=${report.questions}`,
    `results  played=${report.games.length} decided=${report.decided} capped=${report.capped} failures=${report.failures.length}`,
    `winners  ${winnerLine(report)}`,
    `length   ${lengthLine(report)}`,
    `actions  ${numberLine(report.steps)}`,
    `quiz     answered=${report.quizAnswered} correct=${report.quizCorrect} rate=${rate(report.quizCorrect, report.quizAnswered)} seats=${report.seatQuizRate.map((value) => (value === null ? "n/a" : value.toFixed(3))).join(",")}`,
    `effect   ${effectLine(report)}`,
  ];
  for (const failure of report.failures) {
    lines.push(`FAILED   seed=${failure.seed} step=${failure.step} phase=${failure.phase} action=${failure.action}`);
    for (const issue of failure.issues) lines.push(`         ${issue}`);
  }
  return lines.join("\n");
}

function pickAction(board: Board, state: GameState, rng: SeededRng, success: number): Action {
  const phase = state.phase;
  switch (phase.kind) {
    case "quiz":
      return pickQuiz(state, phase, rng, success);
    case "place":
      return pickPlace(state, phase.remaining, rng);
    case "attack":
      return pickAttack(board, state, rng);
    case "occupy":
      return pickOccupy(state, phase, rng);
    case "fortify":
      return pickFortify(board, state, rng);
    case "handoff":
      return { kind: "acknowledgeHandoff", turnSequence: state.turnSequence };
    case "over":
      throw new Error("the game is already over");
  }
}

function pickQuiz(state: GameState, phase: Extract<GameState["phase"], { kind: "quiz" }>, rng: SeededRng, success: number): Action {
  const pool = state.config.quiz.counties[phase.pending.countyId] ?? [];
  const question = pool.find((item) => item.id === phase.pending.questionId);
  if (!question) throw new Error("pending question is not in the pack");
  const correct = phase.pending.choiceOrder.indexOf(question.correctLetter);
  if (correct < 0) throw new Error("choice order dropped the correct letter");
  const index = rng.draw() < success ? correct : wrongIndex(rng, correct);
  return {
    kind: "answerQuiz",
    turnSequence: phase.pending.turnSequence,
    questionId: phase.pending.questionId,
    answer: { kind: "choice", index },
  };
}

function pickPlace(state: GameState, remaining: number, rng: SeededRng): Action {
  const owned = state.holdings.filter((holding) => holding.owner === state.activePlayer);
  if (owned.length < 1 || remaining < 1) throw new Error("no legal placement");
  const slot = drawIndex(rng, owned.length * remaining);
  const holding = owned[Math.floor(slot / remaining)];
  if (!holding) throw new Error("no legal placement");
  return { kind: "place", countyId: holding.countyId, count: (slot % remaining) + 1 };
}

function pickAttack(board: Board, state: GameState, rng: SeededRng): Action {
  const attacks: Action[] = [];
  for (const holding of state.holdings) {
    if (holding.owner !== state.activePlayer || holding.armies < 2) continue;
    const maxDice = Math.min(3, holding.armies - 1);
    for (const neighbor of board.neighbors.get(holding.countyId) ?? []) {
      const target = state.holdings.find((item) => item.countyId === neighbor);
      const reverse = board.neighbors.get(neighbor) ?? [];
      if (!target || target.owner === state.activePlayer || target.armies < 1 || !reverse.includes(holding.countyId)) continue;
      for (let dice = 1; dice <= maxDice; dice += 1) {
        if (dice === 1 || dice === 2 || dice === 3) attacks.push({ kind: "attack", from: holding.countyId, to: neighbor, dice });
      }
    }
  }
  const slot = drawIndex(rng, attacks.length + 1);
  return attacks[slot] ?? { kind: "endAttacks" };
}

function pickOccupy(state: GameState, phase: Extract<GameState["phase"], { kind: "occupy" }>, rng: SeededRng): Action {
  const from = state.holdings.find((holding) => holding.countyId === phase.from);
  if (!from) throw new Error("occupation source is missing");
  const maximum = from.armies - 1;
  if (maximum < phase.minimum) throw new Error("no legal occupation");
  return { kind: "occupy", count: phase.minimum + drawIndex(rng, maximum - phase.minimum + 1) };
}

function pickFortify(board: Board, state: GameState, rng: SeededRng): Action {
  const owned = new Set(state.holdings.filter((holding) => holding.owner === state.activePlayer).map((holding) => holding.countyId));
  const options: { from: CountyId; to: CountyId; max: number }[] = [];
  let weight = 1;
  for (const holding of state.holdings) {
    if (holding.owner !== state.activePlayer || holding.armies < 2) continue;
    for (const destination of reachable(board, holding.countyId, owned)) {
      const max = holding.armies - 1;
      options.push({ from: holding.countyId, to: destination, max });
      weight += max;
    }
  }
  let slot = drawIndex(rng, weight);
  if (slot === 0) return { kind: "skipFortify" };
  slot -= 1;
  for (const option of options) {
    if (slot < option.max) return { kind: "fortify", from: option.from, to: option.to, count: slot + 1 };
    slot -= option.max;
  }
  throw new Error("fortify draw missed every legal move");
}

function reachable(board: Board, from: CountyId, owned: ReadonlySet<string>): CountyId[] {
  const seen = new Set<string>([from]);
  const queue = [from];
  const found: CountyId[] = [];
  let cursor = 0;
  while (cursor < queue.length) {
    const current = queue[cursor];
    cursor += 1;
    if (!current) continue;
    for (const next of board.neighbors.get(current) ?? []) {
      if (!owned.has(next) || seen.has(next)) continue;
      seen.add(next);
      found.push(next);
      queue.push(next);
    }
  }
  return found;
}

function stateIssues(state: GameState, winnerEvents: number, freshEvents: readonly GameEvent[]): readonly string[] {
  const issues: string[] = [];
  const counties = state.config.map.counties;
  if (counties.length !== COUNTY_COUNT) issues.push(`county count is ${counties.length}, expected ${COUNTY_COUNT}`);
  if (state.holdings.length !== COUNTY_COUNT) issues.push(`holdings count is ${state.holdings.length}, expected ${COUNTY_COUNT}`);
  const seen = new Set<string>();
  for (const holding of state.holdings) {
    if (seen.has(holding.countyId)) issues.push(`county ${holding.countyId} has more than one owner`);
    seen.add(holding.countyId);
    if (!Number.isSafeInteger(holding.armies) || holding.armies < 0) issues.push(`county ${holding.countyId} troop count is ${holding.armies}`);
    if (holding.owner < 0 || holding.owner >= state.config.players.length) issues.push(`county ${holding.countyId} owner is ${holding.owner}`);
  }
  for (const county of counties) {
    if (!seen.has(county.id)) issues.push(`county ${county.id} has no owner`);
  }
  const phase = state.phase;
  if (phase.kind === "over") {
    if (winnerEvents !== 1) issues.push(`expected one winner, found ${winnerEvents}`);
    const owned = state.holdings.filter((holding) => holding.owner === phase.winner).length;
    if (phase.mode === "total92" && owned !== counties.length) issues.push(`total winner owns ${owned} counties`);
    if (phase.mode === "quick60" && owned < Math.ceil(counties.length * 0.65)) issues.push(`quick winner owns ${owned} counties`);
  } else if (winnerEvents !== 0) {
    issues.push("a winner was recorded before the game ended");
  }
  for (const event of freshEvents) {
    if (event.kind !== "quizResolved") continue;
    const expected = event.result === "correct" ? QUIZ_AWARD : 0;
    if (event.bonus !== expected) issues.push(`quiz ${event.result} awarded ${event.bonus}, expected ${expected}`);
  }
  for (const issue of checkInvariants(state)) issues.push(issue);
  return issues;
}

function acceptedProblems(previous: GameState, frozen: FrozenState, result: ReduceResult): readonly string[] {
  const issues: string[] = [];
  if (mutated(previous, frozen)) issues.push("an action mutated the previous state");
  if (!result.ok && result.state !== previous) issues.push("a rejected action replaced the state");
  if (result.ok && result.state === previous) issues.push("an accepted action returned the previous state");
  return issues;
}

function freeze(state: GameState): FrozenState {
  const troops: number[] = [];
  for (const holding of state.holdings) troops.push(holding.owner, holding.armies);
  return {
    holdings: state.holdings,
    phaseKind: state.phase.kind,
    turnSequence: state.turnSequence,
    activePlayer: state.activePlayer,
    eventCount: state.events.length,
    troops,
  };
}

function mutated(state: GameState, frozen: FrozenState): boolean {
  if (state.holdings !== frozen.holdings) return true;
  if (state.phase.kind !== frozen.phaseKind || state.turnSequence !== frozen.turnSequence || state.activePlayer !== frozen.activePlayer) return true;
  if (state.events.length !== frozen.eventCount || state.holdings.length * 2 !== frozen.troops.length) return true;
  for (let index = 0; index < state.holdings.length; index += 1) {
    const holding = state.holdings[index];
    if (!holding || holding.owner !== frozen.troops[index * 2] || holding.armies !== frozen.troops[index * 2 + 1]) return true;
  }
  return false;
}

function noteQuiz(quiz: SeatQuiz[], events: readonly GameEvent[]): void {
  for (const event of events) {
    if (event.kind !== "quizResolved") continue;
    if (event.result !== "correct" && event.result !== "wrong") continue;
    const seat = quiz[event.player];
    if (!seat) continue;
    quiz[event.player] = {
      answered: seat.answered + 1,
      correct: seat.correct + (event.result === "correct" ? 1 : 0),
    };
  }
}

function summarize(board: Board, options: ResolvedSimOptions, games: readonly PlayedGame[]): SimulationReport {
  const wins = Array.from({ length: options.players }, () => 0);
  const decidedTurns: number[] = [];
  const allTurns: number[] = [];
  const steps: number[] = [];
  const failures: SimFailure[] = [];
  const answered = Array.from({ length: options.players }, () => 0);
  const correct = Array.from({ length: options.players }, () => 0);
  let decided = 0;
  let capped = 0;
  let effectGames = 0;
  let winnerAccuracySum = 0;
  let otherAccuracySum = 0;
  for (const game of games) {
    allTurns.push(game.turns);
    steps.push(game.steps);
    failures.push(...game.failures);
    game.quiz.forEach((seat, index) => {
      answered[index] = (answered[index] ?? 0) + seat.answered;
      correct[index] = (correct[index] ?? 0) + seat.correct;
    });
    if (game.outcome === "cap") capped += 1;
    if (game.outcome !== "winner" || game.winner === null) continue;
    decided += 1;
    decidedTurns.push(game.turns);
    wins[game.winner] = (wins[game.winner] ?? 0) + 1;
    const winnerRate = accuracy(game.quiz[game.winner]);
    const others = game.quiz.filter((_, index) => index !== game.winner).map((seat) => accuracy(seat)).filter((value): value is number => value !== null);
    if (winnerRate === null || others.length === 0) continue;
    winnerAccuracySum += winnerRate;
    otherAccuracySum += others.reduce((total, value) => total + value, 0) / others.length;
    effectGames += 1;
  }
  const quizAnswered = answered.reduce((total, value) => total + value, 0);
  const quizCorrect = correct.reduce((total, value) => total + value, 0);
  return {
    options,
    counties: board.map.counties.length,
    questions: board.questionCount,
    games,
    decided,
    capped,
    failures,
    wins,
    decidedTurns,
    allTurns,
    steps,
    quizAnswered,
    quizCorrect,
    seatQuizRate: correct.map((value, index) => rateNumber(value, answered[index] ?? 0)),
    effectGames,
    winnerAccuracy: effectGames === 0 ? null : winnerAccuracySum / effectGames,
    otherAccuracy: effectGames === 0 ? null : otherAccuracySum / effectGames,
  };
}

function winnerLine(report: SimulationReport): string {
  if (report.decided === 0) return "no decided games";
  return report.wins.map((wins, seat) => `seat${seat}=${wins}/${report.decided} (${percent(wins, report.decided)})`).join(" ");
}

function lengthLine(report: SimulationReport): string {
  return `decided turns ${numberLine(report.decidedTurns)}; all turns ${numberLine(report.allTurns)}`;
}

function effectLine(report: SimulationReport): string {
  if (report.winnerAccuracy === null || report.otherAccuracy === null) return `no decided games with quiz answers (n=${report.effectGames})`;
  const delta = report.winnerAccuracy - report.otherAccuracy;
  return `winner ${report.winnerAccuracy.toFixed(3)} vs others ${report.otherAccuracy.toFixed(3)} (delta ${signed(delta)}, n=${report.effectGames})`;
}

function numberLine(values: readonly number[]): string {
  if (values.length === 0) return "n/a";
  const total = values.reduce((sum, value) => sum + value, 0);
  return `min=${Math.min(...values)} median=${median(values).toFixed(1)} mean=${(total / values.length).toFixed(1)} max=${Math.max(...values)}`;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted[mid];
  if (upper === undefined) return 0;
  if (sorted.length % 2 === 1) return upper;
  const lower = sorted[mid - 1];
  return lower === undefined ? upper : (lower + upper) / 2;
}

function emptyQuiz(players: PlayerCount): SeatQuiz[] {
  return Array.from({ length: players }, () => ({ answered: 0, correct: 0 }));
}

function gameConfig(board: Board, options: ResolvedSimOptions): GameConfig {
  return {
    players: Array.from({ length: options.players }, (_, index) => ({
      id: index as PlayerId,
      label: `Seat ${index + 1}`,
      kind: "human" as const,
    })),
    mode: options.mode,
    map: board.map,
    quiz: board.quiz,
  };
}

function playerCount(value: number): PlayerCount {
  if (value === 2 || value === 3 || value === 4 || value === 5 || value === 6) return value;
  throw new Error("players must be from 2 to 6");
}

function readQuizPack(raw: unknown, map: MapPack): QuizPack {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("quiz pack must be an object");
  const record = raw as Record<string, unknown>;
  if (record.version !== 1 || typeof record.mapDigest !== "string" || typeof record.sourceDigest !== "string") throw new Error("quiz pack is invalid");
  if (record.mapDigest !== map.digest) throw new Error("quiz pack is not bound to this map");
  if (typeof record.counties !== "object" || record.counties === null || Array.isArray(record.counties)) throw new Error("quiz counties are missing");
  return {
    version: 1,
    mapDigest: record.mapDigest,
    sourceDigest: record.sourceDigest,
    counties: record.counties as QuizPack["counties"],
  };
}

function asRng(rng: SeededRng): () => number {
  const draw = () => rng.draw();
  return Object.assign(draw, {
    draw: () => rng.draw(),
    snapshot: () => rng.snapshot(),
    restore: (snapshot: ReturnType<SeededRng["snapshot"]>) => {
      rng.restore(snapshot);
    },
  });
}

function countWinners(events: readonly GameEvent[]): number {
  return events.reduce((total, event) => total + (event.kind === "winner" ? 1 : 0), 0);
}

function wrongIndex(rng: SeededRng, correct: number): number {
  const choice = drawIndex(rng, 3);
  return choice >= correct ? choice + 1 : choice;
}

function drawIndex(rng: SeededRng, count: number): number {
  const sample = rng.draw();
  const index = Math.floor(sample * count);
  if (!(sample >= 0 && sample < 1) || index < 0 || index >= count) throw new Error("harness draw was outside [0, 1)");
  return index;
}

function accuracy(seat: SeatQuiz | undefined): number | null {
  if (!seat || seat.answered === 0) return null;
  return seat.correct / seat.answered;
}

function rateNumber(correct: number, answered: number): number | null {
  if (answered === 0) return null;
  return correct / answered;
}

function rate(correct: number, answered: number): string {
  const value = rateNumber(correct, answered);
  return value === null ? "n/a" : value.toFixed(3);
}

function percent(wins: number, decided: number): string {
  if (decided === 0) return "n/a";
  return `${((100 * wins) / decided).toFixed(1)}%`;
}

function signed(value: number): string {
  const text = value.toFixed(3);
  return value > 0 ? `+${text}` : text;
}

function done(
  seed: string,
  outcome: PlayedGame["outcome"],
  winner: PlayerId | null,
  turns: number,
  steps: number,
  quiz: readonly SeatQuiz[],
  failures: readonly SimFailure[],
): PlayedGame {
  return { seed, outcome, winner, turns, steps, quiz, failures };
}

function failure(seed: string, step: number, phase: string, action: string, issues: readonly string[]): SimFailure {
  return { seed, step, phase, action, issues };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "simulation failed";
}

/** Hard stop for one bench game, in individual player turns. */
export const AI_BENCH_TURN_CAP = 400;

/**
 * Seed streams for one listed seed S and seat P. Seat streams stay with the seat
 * when the policies swap, so the board and each seat's luck match across the pair.
 * setup  btt33:S<S>:setup     createGame, then every acknowledgeHandoff (deal and question draw)
 * combat btt33:S<S>:combat    attack reduces only (dice)
 * quiz   btt33:S<S>:quiz:<P>  that seat's 0.6 success roll, plus one more draw only on a wrong answer
 * policy btt33:S<S>:policy:<P> that seat's tie-break when two choices share a score
 * The baseline does not draw the policy stream. The challenger draws it only on a tied score.
 */
export const AI_BENCH_RNG_NOTE =
  "setup=btt33:S<seed>:setup (createGame and acknowledgeHandoff); combat=btt33:S<seed>:combat (attack dice only); quiz=btt33:S<seed>:quiz:<seat> (0.6 roll, second draw only when wrong); policy=btt33:S<seed>:policy:<seat> (tie-break only). Streams stay with the seat when policies swap.";

export function aiBenchStream(seed: number, kind: "setup" | "combat" | "quiz" | "policy", seat?: 0 | 1): string {
  if (kind === "quiz" || kind === "policy") return `btt33:S${seed}:${kind}:${seat ?? 0}`;
  return `btt33:S${seed}:${kind}`;
}

export interface AiBenchGame {
  readonly seed: number;
  readonly challengerSeat: 0 | 1;
  readonly outcome: "win" | "loss" | "draw" | "cap" | "error";
  readonly winner: PlayerId | null;
  readonly turns: number;
  readonly playedTurns: number;
  readonly error?: string;
}

export interface AiBenchSide {
  readonly wins: number;
  readonly losses: number;
  readonly draws: number;
  readonly caps: number;
  readonly errors: number;
}

export interface AiBenchReport {
  readonly seeds: readonly number[];
  readonly turnCap: number;
  readonly rng: string;
  readonly games: readonly AiBenchGame[];
  readonly wins: number;
  readonly losses: number;
  readonly draws: number;
  readonly caps: number;
  readonly errors: number;
  readonly bySide: {
    readonly seat0Wins: number;
    readonly seat1Wins: number;
    readonly challengerAsSeat0: AiBenchSide;
    readonly challengerAsSeat1: AiBenchSide;
  };
  readonly medianTurns: number;
  readonly distribution: readonly { readonly bucket: string; readonly games: number }[];
  readonly targets: { readonly wins: number; readonly medianTurns: number; readonly winsMet: boolean; readonly medianMet: boolean };
}

export function runAiBenchmark(board: Board, seeds: readonly number[], onProgress?: (done: number, total: number) => void): AiBenchReport {
  const games: AiBenchGame[] = [];
  const total = seeds.length * 2;
  for (const seed of seeds) {
    for (const challengerSeat of [0, 1] as const) {
      games.push(playAiMatch(board, seed, challengerSeat));
      onProgress?.(games.length, total);
    }
  }
  return summarizeAiBench(seeds, games);
}

export function summarizeAiBench(seeds: readonly number[], games: readonly AiBenchGame[]): AiBenchReport {
  const bySide = {
    seat0Wins: 0,
    seat1Wins: 0,
    challengerAsSeat0: emptySide(),
    challengerAsSeat1: emptySide(),
  };
  let wins = 0;
  let losses = 0;
  let draws = 0;
  let caps = 0;
  let errors = 0;
  for (const game of games) {
    if (game.winner === 0) bySide.seat0Wins += 1;
    if (game.winner === 1) bySide.seat1Wins += 1;
    const side = game.challengerSeat === 0 ? bySide.challengerAsSeat0 : bySide.challengerAsSeat1;
    if (game.outcome === "win") {
      wins += 1;
      side.wins += 1;
    } else if (game.outcome === "loss") {
      losses += 1;
      side.losses += 1;
    } else if (game.outcome === "draw") {
      draws += 1;
      side.draws += 1;
    } else if (game.outcome === "cap") {
      caps += 1;
      side.caps += 1;
    } else {
      errors += 1;
      side.errors += 1;
    }
  }
  const charged = games.map((game) => game.turns);
  const medianTurns = median(charged);
  return {
    seeds,
    turnCap: AI_BENCH_TURN_CAP,
    rng: AI_BENCH_RNG_NOTE,
    games,
    wins,
    losses,
    draws,
    caps,
    errors,
    bySide,
    medianTurns,
    distribution: turnBuckets(charged),
    targets: { wins: 241, medianTurns: 60, winsMet: wins >= 241, medianMet: medianTurns <= 60 },
  };
}

export function formatAiBench(report: AiBenchReport): string {
  const side = (label: string, value: AiBenchSide) =>
    `${label} wins=${value.wins} losses=${value.losses} draws=${value.draws} caps=${value.caps} errors=${value.errors}`;
  const lines = [
    "BattleFor92 ai bench",
    `config   seeds=${report.seeds.length} games=${report.games.length} players=2 mode=total92 success=0.600 turnCap=${report.turnCap}`,
    `rng      ${report.rng}`,
    `results  wins=${report.wins} losses=${report.losses} draws=${report.draws} caps=${report.caps} errors=${report.errors}`,
    `sides    seat0Wins=${report.bySide.seat0Wins} seat1Wins=${report.bySide.seat1Wins}`,
    `seat     ${side("challengerAsSeat0", report.bySide.challengerAsSeat0)}`,
    `seat     ${side("challengerAsSeat1", report.bySide.challengerAsSeat1)}`,
    `length   median=${report.medianTurns} (draws, caps and errors counted as ${report.turnCap})`,
    `spread   ${report.distribution.map((bucket) => `${bucket.bucket}:${bucket.games}`).join(" ")}`,
    `targets  wins>=${report.targets.wins} (${report.targets.winsMet ? "met" : "missed"}) median<=${report.targets.medianTurns} (${report.targets.medianMet ? "met" : "missed"})`,
  ];
  return lines.join("\n");
}

function playAiMatch(board: Board, seed: number, challengerSeat: 0 | 1): AiBenchGame {
  try {
    const setup = createRng(aiBenchStream(seed, "setup"));
    const combat = createRng(aiBenchStream(seed, "combat"));
    const quiz = [createRng(aiBenchStream(seed, "quiz", 0)), createRng(aiBenchStream(seed, "quiz", 1))] as const;
    const policyRng = [createRng(aiBenchStream(seed, "policy", 0)), createRng(aiBenchStream(seed, "policy", 1))] as const;
    const created = createGame(
      {
        players: [
          { id: 0, label: "Seat 1", kind: "computer" },
          { id: 1, label: "Seat 2", kind: "computer" },
        ],
        mode: "total92",
        map: board.map,
        quiz: board.quiz,
      },
      () => setup.draw(),
    );
    if (!created.ok) return benchGame(seed, challengerSeat, "error", null, 0, created.error.message);
    let state = created.value;
    let steps = 0;
    while (state.phase.kind !== "over") {
      steps += 1;
      if (steps > 250000) return benchGame(seed, challengerSeat, "error", null, state.turnSequence, "step guard");
      if (state.phase.kind === "handoff") {
        if (state.turnSequence >= AI_BENCH_TURN_CAP) return benchGame(seed, challengerSeat, "cap", null, state.turnSequence);
        const handed = reduce(state, { kind: "acknowledgeHandoff", turnSequence: state.turnSequence }, () => setup.draw());
        if (!handed.ok) return benchGame(seed, challengerSeat, "error", null, state.turnSequence, handed.error.message);
        state = handed.state;
        continue;
      }
      const seat = state.activePlayer;
      if (seat !== 0 && seat !== 1) return benchGame(seed, challengerSeat, "error", null, state.turnSequence, "unexpected seat");
      const action = chooseAction(state, () => quiz[seat].draw(), {
        quizSuccess: 0.6,
        policy: seat === challengerSeat ? "challenger" : "baseline",
        policyRandom: () => policyRng[seat].draw(),
      });
      if (!action) return benchGame(seed, challengerSeat, "error", null, state.turnSequence, "no legal action");
      const engineRng = action.kind === "attack" ? () => combat.draw() : () => 0;
      const result = reduce(state, action, engineRng);
      if (!result.ok) return benchGame(seed, challengerSeat, "error", null, state.turnSequence, `${action.kind}: ${result.error.message}`);
      state = result.state;
    }
    const winner = state.phase.kind === "over" ? state.phase.winner : null;
    if (winner === null) return benchGame(seed, challengerSeat, "draw", null, state.turnSequence);
    return benchGame(seed, challengerSeat, winner === challengerSeat ? "win" : "loss", winner, state.turnSequence);
  } catch (error) {
    return benchGame(seed, challengerSeat, "error", null, 0, errorText(error));
  }
}

function benchGame(
  seed: number,
  challengerSeat: 0 | 1,
  outcome: AiBenchGame["outcome"],
  winner: PlayerId | null,
  playedTurns: number,
  error?: string,
): AiBenchGame {
  const turns = outcome === "win" || outcome === "loss" ? playedTurns : AI_BENCH_TURN_CAP;
  return error === undefined ? { seed, challengerSeat, outcome, winner, turns, playedTurns } : { seed, challengerSeat, outcome, winner, turns, playedTurns, error };
}

function emptySide(): { wins: number; losses: number; draws: number; caps: number; errors: number } {
  return { wins: 0, losses: 0, draws: 0, caps: 0, errors: 0 };
}

function turnBuckets(values: readonly number[]): { bucket: string; games: number }[] {
  const counts = new Map<string, number>();
  for (let start = 1; start <= 391; start += 10) counts.set(`${start}-${start + 9}`, 0);
  counts.set("400", 0);
  for (const value of values) {
    if (value >= 400) {
      counts.set("400", (counts.get("400") ?? 0) + 1);
      continue;
    }
    const start = Math.floor((Math.max(1, value) - 1) / 10) * 10 + 1;
    const key = `${start}-${start + 9}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const buckets: { bucket: string; games: number }[] = [];
  for (const [bucket, games] of counts) if (games > 0) buckets.push({ bucket, games });
  return buckets;
}
