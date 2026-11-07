import type {
  Action,
  CountyId,
  Engine,
  GameConfig,
  GameState,
  PendingQuestion,
  QuestionId,
  QuizPack,
  ReduceResult,
  Rng,
  RngSnapshot,
  SaveEnvelope,
} from "../src/types.ts";

/**
 * The engine module is not on this branch. These are the call shapes the
 * suite uses. `Engine` itself comes from src/types.ts.
 *
 * src/engine/engine.ts — named functions, or an `engine` / default object:
 *   createGame(config: GameConfig, rng: Rng): ParseResult<GameState>
 *   reduce(state: GameState, action: Action, rng: Rng): ReduceResult
 *   checkInvariants(state: GameState): readonly string[]
 *   serialize(save: SaveEnvelope): string
 *   deserialize(raw: unknown): ParseResult<SaveEnvelope>
 *   createRng(seed: string): SeededRng
 *   A SeededRng constructor is accepted in place of createRng.
 *
 * src/quiz/quiz.ts or the engine module:
 *   prepareQuestion(selectedCounty, quizPack, askedIds, turnSequence, rng)
 *     => PendingQuestion | null
 *   Null means the turn-start transition skips the quiz and awards 0.
 *
 * Other assumptions, used only inside the combat and handoff cases:
 *   a die is 1 + Math.floor(draw * 6), draws in [0, 1)
 *   attacker dice are drawn, then defender dice
 *   acknowledgeHandoff.turnSequence is the handoff state's turnSequence
 *   createGame opens seat 0 in quiz when that county has a question
 */
export const ENGINE_MODULE = "../src/engine/engine.ts";
export const QUIZ_MODULE = "../src/quiz/quiz.ts";
export const ENGINE_MISSING = "engine missing";

export type SeededRng = {
  draw(): number;
  snapshot(): RngSnapshot;
  restore(snapshot: RngSnapshot): void;
};

export type CreateRng = (seed: string) => SeededRng;

export type PrepareQuestion = (
  selectedCounty: CountyId,
  quizPack: QuizPack,
  askedIds: readonly QuestionId[],
  turnSequence: number,
  rng: Rng,
) => PendingQuestion | null;

export type Tools = {
  readonly engine: Engine;
  readonly createRng: CreateRng;
  readonly prepareQuestion: PrepareQuestion | null;
};

export type LoadResult = { ok: true; tools: Tools } | { ok: false; reason: string };

const ENGINE_METHODS = ["createGame", "reduce", "checkInvariants", "serialize", "deserialize"] as const;

export async function loadContract(): Promise<LoadResult> {
  const imported = await importOptional(ENGINE_MODULE);
  if (imported === "missing") return { ok: false, reason: ENGINE_MISSING };
  const engine = asEngine(imported);
  const createRng = asCreateRng(imported, engine);
  if (!engine || !createRng) {
    return { ok: false, reason: "engine module does not match the contract" };
  }
  const quiz = await importOptional(QUIZ_MODULE);
  const prepareQuestion = asPrepareQuestion(imported) ?? (quiz === "missing" ? null : asPrepareQuestion(quiz));
  return { ok: true, tools: { engine, createRng, prepareQuestion } };
}

export function drawRng(seeded: SeededRng): Rng {
  return () => seeded.draw();
}

export function mustGame(tools: Tools, config: GameConfig, seeded: SeededRng): GameState {
  const result = tools.engine.createGame(config, drawRng(seeded));
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

export function play(tools: Tools, state: GameState, action: Action, rng: Rng = () => 0): ReduceResult {
  return tools.engine.reduce(state, action, rng);
}

async function importOptional(relativePath: string): Promise<Record<string, unknown> | "missing"> {
  const href = new URL(relativePath, import.meta.url).href;
  try {
    return (await import(href)) as Record<string, unknown>;
  } catch (error) {
    if (isMissingModule(error)) return "missing";
    throw error;
  }
}

function isMissingModule(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && error.code === "ERR_MODULE_NOT_FOUND") return true;
  const message = error instanceof Error ? error.message : "";
  return message.includes("Cannot find module") || message.includes("ERR_MODULE_NOT_FOUND");
}

function asEngine(mod: Record<string, unknown>): Engine | null {
  if (isEngine(mod.engine)) return mod.engine;
  if (isEngine(mod.default)) return mod.default;
  if (isEngine(mod)) return mod;
  return null;
}

function isEngine(value: unknown): value is Engine {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return ENGINE_METHODS.every((name) => typeof record[name] === "function");
}

function asCreateRng(mod: Record<string, unknown>, engine: Engine | null): CreateRng | null {
  if (typeof mod.createRng === "function") return mod.createRng as CreateRng;
  const ctor = mod.SeededRng ?? mod.Rng;
  if (typeof ctor === "function") {
    return (seed: string) => new (ctor as new (seed: string) => SeededRng)(seed);
  }
  const attached = engine as unknown as { createRng?: unknown };
  if (engine && typeof attached.createRng === "function") return attached.createRng as CreateRng;
  return null;
}

function asPrepareQuestion(mod: Record<string, unknown>): PrepareQuestion | null {
  if (typeof mod.prepareQuestion === "function") return mod.prepareQuestion as PrepareQuestion;
  const fallback = mod.default;
  if (typeof fallback === "object" && fallback !== null && typeof (fallback as { prepareQuestion?: unknown }).prepareQuestion === "function") {
    return (fallback as { prepareQuestion: PrepareQuestion }).prepareQuestion;
  }
  return null;
}
