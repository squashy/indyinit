import { createRng, engine, type SeededRng } from "../engine/engine.ts";
import type {
  ChoiceLetter,
  CountyId,
  GameConfig,
  GameState,
  MapPack,
  Mode,
  ParseResult,
  Player,
  PlayerId,
  QuestionId,
  QuizPack,
  QuizQuestion,
} from "../types.ts";
import { parseMapPack } from "../../factory/parse-map.ts";

const SAVE_KEY = "battle-for-the-92.save";
const LETTERS: readonly ChoiceLetter[] = ["A", "B", "C", "D"];

export interface PlaySession {
  readonly state: GameState;
  readonly rng: SeededRng;
}

export interface GamePacks {
  readonly map: MapPack;
  readonly quiz: QuizPack;
}

export interface SetupOptions {
  readonly packs: GamePacks;
  readonly storage?: Storage;
  readonly createSeed?: () => string;
  readonly onSession: (session: PlaySession) => void;
}

export interface SetupBinding {
  persist(session: PlaySession): void;
  dispose(): void;
}

export function readGamePacks(mapRaw: unknown, quizRaw: unknown): ParseResult<GamePacks> {
  let map: MapPack;
  try {
    map = parseMapPack(mapRaw);
  } catch (error) {
    return { ok: false, error: { code: "INVALID_PACK", message: error instanceof Error ? error.message : "map pack is invalid" } };
  }
  const quiz = readQuizPack(quizRaw, map);
  if (!quiz.ok) return quiz;
  return { ok: true, value: { map, quiz: quiz.value } };
}

export function bindSetup(doc: Document, options: SetupOptions): SetupBinding {
  const start = doc.getElementById("start-game");
  const resumeButton = doc.getElementById("continue-game");
  const onStart = () => {
    startGame(doc, options);
  };
  const onResume = () => {
    resumeGame(doc, options);
  };
  start?.addEventListener("click", onStart);
  resumeButton?.addEventListener("click", onResume);
  return {
    persist(session) {
      const storage = openStorage(doc, options.storage);
      if (storage) writeSave(storage, session);
    },
    dispose() {
      start?.removeEventListener("click", onStart);
      resumeButton?.removeEventListener("click", onResume);
    },
  };
}

function openStorage(doc: Document, explicit: Storage | undefined): Storage | undefined {
  if (explicit !== undefined) return explicit;
  try {
    return doc.defaultView?.localStorage;
  } catch {
    return undefined;
  }
}

export function readSeatForm(doc: Document): ParseResult<{ readonly players: readonly Player[]; readonly mode: Mode }> {
  const list = doc.querySelector("#player-list");
  if (!list) return fail("INVALID_INPUT", "the player list is missing");
  const seats = Array.from(list.children);
  const players: Player[] = [];
  let skipped = false;
  for (const seat of seats) {
    if (!(seat instanceof HTMLElement)) continue;
    const nameInput = seat.querySelector("input[type='text']");
    const label = nameInput instanceof HTMLInputElement ? nameInput.value.trim() : "";
    if (label === "") {
      skipped = true;
      continue;
    }
    if (skipped) return fail("INVALID_INPUT", "Fill seats from the top. Leave extra seats blank.");
    const id = playerId(players.length);
    if (id === null) return fail("INVALID_INPUT", "Choose 2 to 6 players.");
    const picked = seat.querySelector("input[type='radio']:checked");
    const kind = picked instanceof HTMLInputElement && picked.value === "computer" ? "computer" : "human";
    players.push({ id, label, kind });
  }
  if (players.length < 2) return fail("INVALID_INPUT", "Type a name for at least 2 players.");
  return { ok: true, value: { players, mode: readMode(doc) } };
}

function startGame(doc: Document, options: SetupOptions): void {
  const form = readSeatForm(doc);
  if (!form.ok) {
    setStatus(doc, form.error.message);
    return;
  }
  let rng: SeededRng;
  try {
    rng = createRng(options.createSeed?.() ?? randomSeed());
  } catch {
    setStatus(doc, "The game could not deal counties.");
    return;
  }
  const config: GameConfig = {
    players: form.value.players,
    mode: form.value.mode,
    map: options.packs.map,
    quiz: options.packs.quiz,
  };
  const created = engine.createGame(config, () => rng.draw());
  if (!created.ok) {
    setStatus(doc, created.error.message);
    return;
  }
  const session: PlaySession = { state: created.value, rng };
  const storage = openStorage(doc, options.storage);
  if (storage) writeSave(storage, session);
  setStatus(doc, "");
  options.onSession(session);
}

function resumeGame(doc: Document, options: SetupOptions): void {
  const storage = openStorage(doc, options.storage);
  if (!storage) {
    setStatus(doc, "This screen could not read the saved game.");
    return;
  }
  const raw = readSave(storage);
  if (!raw.ok) {
    setStatus(doc, "This screen could not read the saved game.");
    return;
  }
  if (raw.value === null) {
    setStatus(doc, "No saved game is on this screen.");
    return;
  }
  const parsed = engine.deserialize(raw.value);
  if (!parsed.ok) {
    setStatus(doc, parsed.error.message);
    return;
  }
  let rng: SeededRng;
  try {
    rng = createRng(parsed.value.rng.seed);
    rng.restore(parsed.value.rng);
  } catch {
    setStatus(doc, "This saved game could not be opened.");
    return;
  }
  setStatus(doc, "");
  options.onSession({ state: parsed.value.state, rng });
}

function writeSave(storage: Storage, session: PlaySession): void {
  try {
    storage.setItem(SAVE_KEY, engine.serialize({ version: 1, state: session.state, rng: session.rng.snapshot() }));
  } catch {
    return;
  }
}

function readSave(storage: Storage): { ok: true; value: string | null } | { ok: false } {
  try {
    return { ok: true, value: storage.getItem(SAVE_KEY) };
  } catch {
    return { ok: false };
  }
}

function readMode(doc: Document): Mode {
  const picked = doc.querySelector("#mode input[type='radio']:checked");
  return picked instanceof HTMLInputElement && picked.value === "total92" ? "total92" : "quick60";
}

function setStatus(doc: Document, message: string): void {
  const status = doc.getElementById("error-status");
  if (status) status.textContent = message;
}

function playerId(index: number): PlayerId | null {
  if (index === 0 || index === 1 || index === 2 || index === 3 || index === 4 || index === 5) return index;
  return null;
}

function randomSeed(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readQuizPack(raw: unknown, map: MapPack): ParseResult<QuizPack> {
  if (!isRecord(raw)) return fail("INVALID_PACK", "quiz pack must be an object");
  if (raw.version !== 1) return fail("INVALID_PACK", "quiz pack version must be 1");
  if (typeof raw.mapDigest !== "string" || raw.mapDigest !== map.digest) return fail("INVALID_PACK", "quiz pack is not bound to this map");
  if (typeof raw.sourceDigest !== "string" || raw.sourceDigest === "") return fail("INVALID_PACK", "quiz pack has no source digest");
  if (!isRecord(raw.counties)) return fail("INVALID_PACK", "quiz counties must be an object");
  const counties: Record<string, QuizQuestion[]> = {};
  const seen = new Set<string>();
  for (const [key, value] of Object.entries(raw.counties)) {
    const countyId = asCountyId(key);
    if (!countyId) return fail("INVALID_PACK", "quiz pack names a county that is not a 5-digit code");
    if (!map.counties.some((county) => county.id === countyId)) return fail("INVALID_PACK", "quiz pack names a county that is not on the map");
    if (!Array.isArray(value)) return fail("INVALID_PACK", "quiz county entries must be arrays");
    const questions: QuizQuestion[] = [];
    for (const entry of value) {
      const question = readQuestion(entry, countyId);
      if (!question.ok) return question;
      if (seen.has(question.value.id)) return fail("INVALID_PACK", "a quiz question id is duplicated");
      seen.add(question.value.id);
      questions.push(question.value);
    }
    counties[countyId] = questions;
  }
  return {
    ok: true,
    value: { version: 1, mapDigest: raw.mapDigest, sourceDigest: raw.sourceDigest, counties: counties as QuizPack["counties"] },
  };
}

function readQuestion(raw: unknown, countyId: CountyId): ParseResult<QuizQuestion> {
  if (!isRecord(raw)) return fail("INVALID_PACK", "a quiz question must be an object");
  if (raw.kind !== "multipleChoice") return fail("INVALID_PACK", "a quiz question kind is invalid");
  const id = asQuestionId(raw.id);
  const bound = asCountyId(raw.countyId);
  if (!id || bound !== countyId) return fail("INVALID_PACK", "a quiz question is not bound to its county");
  const letter = raw.correctLetter;
  if (!isLetter(letter)) return fail("INVALID_PACK", "a quiz correct letter is invalid");
  if (!isRecord(raw.choices)) return fail("INVALID_PACK", "a quiz question is missing choices");
  const choiceA = plainText(raw.choices.A);
  const choiceB = plainText(raw.choices.B);
  const choiceC = plainText(raw.choices.C);
  const choiceD = plainText(raw.choices.D);
  if (!choiceA || !choiceB || !choiceC || !choiceD) return fail("INVALID_PACK", "a quiz question is missing a choice");
  const choices = { A: choiceA, B: choiceB, C: choiceC, D: choiceD };
  const prompt = plainText(raw.prompt);
  const countyName = plainText(raw.countyName);
  const countySeat = plainText(raw.countySeat);
  const namedFor = plainText(raw.namedFor);
  const category = plainText(raw.category);
  const correctAnswer = plainText(raw.correctAnswer);
  if (!prompt || !countyName || !countySeat || !namedFor || !category || !correctAnswer) {
    return fail("INVALID_PACK", "a quiz question is missing text");
  }
  if (correctAnswer !== choices[letter]) return fail("INVALID_PACK", "a quiz answer does not match its letter");
  if (typeof raw.established !== "number" || !Number.isSafeInteger(raw.established)) {
    return fail("INVALID_PACK", "a quiz established year is invalid");
  }
  const question: QuizQuestion = {
    kind: "multipleChoice",
    id,
    countyId,
    countyName,
    countySeat,
    established: raw.established,
    namedFor,
    category,
    prompt,
    choices,
    correctLetter: letter,
    correctAnswer,
  };
  if (typeof raw.explanation === "string") return { ok: true, value: { ...question, explanation: raw.explanation } };
  return { ok: true, value: question };
}

function plainText(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  if (raw.includes("<") || raw.includes(">")) return null;
  return raw;
}

function asCountyId(raw: unknown): CountyId | null {
  if (typeof raw !== "string" || !/^[0-9]{5}$/.test(raw)) return null;
  return raw as CountyId;
}

function asQuestionId(raw: unknown): QuestionId | null {
  if (typeof raw !== "string" || raw.trim() === "" || raw !== raw.trim()) return null;
  return raw as QuestionId;
}

function isLetter(raw: unknown): raw is ChoiceLetter {
  return LETTERS.some((letter) => letter === raw);
}

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw);
}

function fail(code: "INVALID_INPUT" | "INVALID_PACK", message: string): ParseResult<never> {
  return { ok: false, error: { code, message } };
}
