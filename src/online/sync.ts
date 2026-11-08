import { timingSafeEqual } from "node:crypto";
import { createGame, createRng, reduce } from "../engine/engine.ts";
import { displayedChoices } from "../quiz/quiz.ts";
import type { Action, CountyId, GameState, PlayerId, QuestionId } from "../types.ts";
import type { GamePacks } from "../ui/setup.ts";
import { publicGame, type OnlineError, type OnlineResult, type PublicGame } from "./games.ts";
import type { OnlineDocument, OnlineStore } from "./memory-store.ts";
import { hashToken } from "./tokens.ts";

export interface PublicPlay {
  readonly activePlayer: number;
  readonly turnSequence: number;
  readonly phase: string;
  readonly remaining: number | null;
  readonly quizScore: number | null;
  readonly prompt: string | null;
  readonly choices: readonly string[] | null;
  readonly questionId: string | null;
  readonly countyName: string | null;
  readonly occupy: { readonly from: string; readonly to: string; readonly minimum: number } | null;
  readonly nextPlayer: number | null;
  readonly armies: readonly { readonly countyId: string; readonly owner: number; readonly armies: number }[];
  readonly battle: {
    readonly attackRolls: readonly number[];
    readonly defenseRolls: readonly number[];
    readonly attackLosses: number;
    readonly defenseLosses: number;
  } | null;
}

export interface PublicRevision {
  readonly version: number;
  readonly play: PublicPlay | null;
}

export interface OnlineSnapshot {
  readonly game: PublicGame & { readonly play: PublicPlay | null };
  readonly revisions: readonly PublicRevision[];
}

export interface IntentReceipt {
  readonly accepted: boolean;
  readonly error: OnlineError | null;
  readonly explanation: string;
  readonly version: number;
  readonly game: OnlineSnapshot["game"];
  readonly replayed: boolean;
}

const WEEK = 7 * 24 * 60 * 60 * 1000;

export async function beginOnlinePlay(store: OnlineStore, id: string, packs: GamePacks, now = Date.now()): Promise<OnlineResult<OnlineSnapshot["game"]>> {
  const current = await loadFresh(store, id, now);
  if (!current.ok) return current;
  const doc = current.value;
  if (doc.play) return { ok: true, value: snapshotGame(doc) };
  if (doc.seats.some((seat) => seat === null)) return { ok: false, error: "invalid" };
  const players = doc.seats.flatMap((seat, index) => {
    const id = playerId(index);
    if (!seat || id === null) return [];
    return [{ id, label: seat.name, kind: "human" as const }];
  });
  if (players.length !== doc.seatCount) return { ok: false, error: "invalid" };
  const rng = createRng(doc.seed);
  const created = createGame({ players, mode: "quick60", map: packs.map, quiz: packs.quiz }, () => rng.draw());
  if (!created.ok) return { ok: false, error: "invalid" };
  const next: OnlineDocument = {
    ...doc,
    version: doc.version + 1,
    status: "active",
    play: { state: created.value, rng: rng.snapshot() },
  };
  const written = await store.commit(id, doc.version, withRevision(next));
  if (written !== "ok") return { ok: false, error: written === "missing" ? "missing" : "invalid" };
  return { ok: true, value: snapshotGame(next) };
}

export async function submitOnlineIntent(
  store: OnlineStore,
  id: string,
  command: { seatToken: string; expectedVersion: number; idempotencyKey: string; action: unknown },
  now = Date.now(),
): Promise<OnlineResult<IntentReceipt>> {
  const action = parseAction(command.action);
  const key = command.idempotencyKey.trim();
  if (!action || key.length < 8 || !Number.isSafeInteger(command.expectedVersion)) return { ok: false, error: "invalid" };
  const loaded = await loadFresh(store, id, now);
  if (!loaded.ok) return loaded;
  const doc = loaded.value;
  if (!doc.play) return { ok: false, error: "invalid" };
  const seat = seatFor(doc, command.seatToken);
  if (seat === null) return { ok: false, error: "rejoin" };
  const prior = doc.applied[key];
  const actionText = JSON.stringify(action);
  if (prior) {
    if (prior.seat !== seat || prior.action !== actionText) {
      return { ok: true, value: receipt(false, "rejected", "That action id was already used.", doc, false) };
    }
    return { ok: true, value: receipt(true, null, "Already accepted.", doc, true) };
  }
  if (command.expectedVersion !== doc.version) {
    return { ok: true, value: receipt(false, "stale", "The table moved. Reload this revision.", doc, false) };
  }
  if (doc.play.state.activePlayer !== seat) {
    return { ok: true, value: receipt(false, "rejected", "It is not your turn.", doc, false) };
  }
  const rng = createRng(doc.play.rng.seed);
  rng.restore(doc.play.rng);
  const result = reduce(doc.play.state, action, () => rng.draw());
  if (!result.ok) {
    return { ok: true, value: receipt(false, "rejected", result.error.message, doc, false) };
  }
  const version = doc.version + 1;
  const next: OnlineDocument = {
    ...doc,
    version,
    status: result.state.phase.kind === "over" ? "over" : "active",
    play: { state: result.state, rng: rng.snapshot() },
    applied: { ...doc.applied, [key]: { version, seat, action: actionText } },
  };
  const written = await store.commit(id, doc.version, withRevision(next));
  if (written === "mismatch") {
    const latest = await loadFresh(store, id, now);
    if (!latest.ok) return latest;
    return { ok: true, value: receipt(false, "stale", "The table moved. Reload this revision.", latest.value, false) };
  }
  if (written === "missing") return { ok: false, error: "missing" };
  return { ok: true, value: receipt(true, null, "Accepted.", next, false) };
}

export async function rejoinOnlineGame(store: OnlineStore, id: string, seatToken: string, now = Date.now()): Promise<OnlineResult<{ seatIndex: number; game: OnlineSnapshot["game"] }>> {
  const loaded = await loadFresh(store, id, now);
  if (!loaded.ok) return loaded;
  const seat = seatFor(loaded.value, seatToken);
  if (seat === null) return { ok: false, error: "rejoin" };
  return { ok: true, value: { seatIndex: seat, game: snapshotGame(loaded.value) } };
}

export async function catchUp(store: OnlineStore, id: string, since: number, now = Date.now()): Promise<OnlineResult<OnlineSnapshot>> {
  const loaded = await loadFresh(store, id, now);
  if (!loaded.ok) return loaded;
  const revisions = loaded.value.revisions.filter((item) => item.version > since).map((item) => ({
    version: item.version,
    play: item.play as PublicPlay | null,
  }));
  return { ok: true, value: { game: snapshotGame(loaded.value), revisions } };
}

export function snapshotGame(doc: OnlineDocument): OnlineSnapshot["game"] {
  return { ...publicGame(doc), play: doc.play ? projectPlay(doc.play.state) : null };
}

async function loadFresh(store: OnlineStore, id: string, now: number): Promise<OnlineResult<OnlineDocument>> {
  const doc = await store.read(id);
  if (!doc) return { ok: false, error: "missing" };
  const ready: OnlineDocument = {
    ...doc,
    applied: doc.applied ?? {},
    revisions: doc.revisions ?? [],
    play: doc.play ?? null,
    expiresAt: typeof doc.expiresAt === "number" ? doc.expiresAt : now + WEEK,
  };
  if (ready.expiresAt <= now) return { ok: false, error: "expired" };
  return { ok: true, value: ready };
}

function withRevision(doc: OnlineDocument): OnlineDocument {
  const prior = doc.revisions ?? [];
  const next = { ...doc, revisions: [...prior, { version: doc.version, play: doc.play ? projectPlay(doc.play.state) : null }] };
  return next;
}

function projectPlay(state: GameState): PublicPlay {
  const phase = state.phase;
  const quiz = phase.kind === "quiz" ? phase : null;
  const question = quiz ? state.config.quiz.counties[quiz.pending.countyId]?.find((item) => item.id === quiz.pending.questionId) : undefined;
  const battle = [...state.events].reverse().find((event) => event.kind === "battle");
  return {
    activePlayer: state.activePlayer,
    turnSequence: state.turnSequence,
    phase: phase.kind,
    remaining: phase.kind === "place" ? phase.remaining : null,
    quizScore: phase.kind === "place" ? phase.income.quiz : null,
    prompt: question?.prompt ?? null,
    choices: question && quiz ? displayedChoices(question, quiz.pending.choiceOrder) : null,
    questionId: quiz?.pending.questionId ?? null,
    countyName: question?.countyName ?? null,
    occupy: phase.kind === "occupy" ? { from: phase.from, to: phase.to, minimum: phase.minimum } : null,
    nextPlayer: phase.kind === "handoff" ? phase.nextPlayer : phase.kind === "over" ? phase.winner : null,
    armies: state.holdings.map((holding) => ({ countyId: holding.countyId, owner: holding.owner, armies: holding.armies })),
    battle: battle && battle.kind === "battle" ? {
      attackRolls: battle.attackRolls,
      defenseRolls: battle.defenseRolls,
      attackLosses: battle.attackLosses,
      defenseLosses: battle.defenseLosses,
    } : null,
  };
}

function receipt(accepted: boolean, error: OnlineError | null, explanation: string, doc: OnlineDocument, replayed: boolean): IntentReceipt {
  return { accepted, error, explanation, version: doc.version, game: snapshotGame(doc), replayed };
}

function seatFor(doc: OnlineDocument, token: string): number | null {
  const hashed = hashToken(token);
  const index = doc.seats.findIndex((seat) => seat !== null && sameHash(seat.tokenHash, hashed));
  return index >= 0 ? index : null;
}

function sameHash(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function playerId(index: number): PlayerId | null {
  if (index === 0 || index === 1 || index === 2 || index === 3 || index === 4 || index === 5) return index;
  return null;
}

function parseAction(value: unknown): Action | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as { kind?: unknown };
  switch (record.kind) {
    case "answerQuiz":
      return parseAnswer(record as { turnSequence?: unknown; questionId?: unknown; answer?: unknown });
    case "skipQuiz":
      return parseSkip(record as { turnSequence?: unknown; questionId?: unknown });
    case "place":
      return parsePlace(record as { countyId?: unknown; count?: unknown });
    case "attack":
      return parseAttack(record as { from?: unknown; to?: unknown; dice?: unknown });
    case "occupy":
      return parseOccupy(record as { count?: unknown });
    case "endAttacks":
      return { kind: "endAttacks" };
    case "fortify":
      return parseFortify(record as { from?: unknown; to?: unknown; count?: unknown });
    case "skipFortify":
      return { kind: "skipFortify" };
    case "acknowledgeHandoff":
      return parseHandoff(record as { turnSequence?: unknown });
    default:
      return null;
  }
}

function parseAnswer(record: { turnSequence?: unknown; questionId?: unknown; answer?: unknown }): Action | null {
  const answer = record.answer as { kind?: unknown; index?: unknown } | undefined;
  if (!isInt(record.turnSequence) || typeof record.questionId !== "string" || answer?.kind !== "choice" || !isInt(answer.index)) return null;
  return { kind: "answerQuiz", turnSequence: record.turnSequence, questionId: record.questionId as QuestionId, answer: { kind: "choice", index: answer.index } };
}

function parseSkip(record: { turnSequence?: unknown; questionId?: unknown }): Action | null {
  if (!isInt(record.turnSequence) || typeof record.questionId !== "string") return null;
  return { kind: "skipQuiz", turnSequence: record.turnSequence, questionId: record.questionId as QuestionId };
}

function parsePlace(record: { countyId?: unknown; count?: unknown }): Action | null {
  if (typeof record.countyId !== "string" || !isInt(record.count)) return null;
  return { kind: "place", countyId: record.countyId as CountyId, count: record.count };
}

function parseAttack(record: { from?: unknown; to?: unknown; dice?: unknown }): Action | null {
  if (typeof record.from !== "string" || typeof record.to !== "string" || (record.dice !== 1 && record.dice !== 2 && record.dice !== 3)) return null;
  return { kind: "attack", from: record.from as CountyId, to: record.to as CountyId, dice: record.dice };
}

function parseOccupy(record: { count?: unknown }): Action | null {
  if (!isInt(record.count)) return null;
  return { kind: "occupy", count: record.count };
}

function parseFortify(record: { from?: unknown; to?: unknown; count?: unknown }): Action | null {
  if (typeof record.from !== "string" || typeof record.to !== "string" || !isInt(record.count)) return null;
  return { kind: "fortify", from: record.from as CountyId, to: record.to as CountyId, count: record.count };
}

function parseHandoff(record: { turnSequence?: unknown }): Action | null {
  if (!isInt(record.turnSequence)) return null;
  return { kind: "acknowledgeHandoff", turnSequence: record.turnSequence };
}

function isInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

export const ONLINE_EXPIRY_MS = WEEK;
