import { MemoryStore, type OnlineDocument, type OnlineStore, type SeatSlot } from "./memory-store.ts";
import { hashToken, randomToken } from "./tokens.ts";
import { sharePath } from "./share.ts";

export type OnlineError = "invalid" | "full" | "missing";

export type OnlineResult<T> = { ok: true; value: T } | { ok: false; error: OnlineError };

export interface PublicSeat {
  readonly name: string;
  readonly filled: boolean;
}

export interface PublicGame {
  readonly id: string;
  readonly version: number;
  readonly status: OnlineDocument["status"];
  readonly seatCount: number;
  readonly seats: readonly PublicSeat[];
}

export interface CreatedGame {
  readonly game: PublicGame;
  readonly sharePath: string;
  readonly seatIndex: number;
  readonly seatToken: string;
  readonly invite: string;
}

export interface JoinedGame {
  readonly game: PublicGame;
  readonly seatIndex: number;
  readonly seatToken: string;
}

const SEAT_COUNTS = [2, 3, 4, 5, 6] as const;

export function publicGame(doc: OnlineDocument): PublicGame {
  return {
    id: doc.id,
    version: doc.version,
    status: doc.status,
    seatCount: doc.seatCount,
    seats: doc.seats.map((seat) => ({ name: seat?.name ?? "", filled: seat !== null })),
  };
}

export async function createOnlineGame(store: OnlineStore, input: { seatCount: number; name: string }): Promise<OnlineResult<CreatedGame>> {
  const seatCount = seatCountOf(input.seatCount);
  const name = cleanName(input.name);
  if (seatCount === null || name === null) return { ok: false, error: "invalid" };
  const seatToken = randomToken();
  const invite = randomToken();
  const seats: (SeatSlot | null)[] = Array.from({ length: seatCount }, () => null);
  seats[0] = { name, tokenHash: hashToken(seatToken) };
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const id = randomToken(18);
    const doc: OnlineDocument = {
      id,
      version: 1,
      status: "lobby",
      seatCount,
      seats,
      inviteHash: hashToken(invite),
      seed: randomToken(),
    };
    const written = await store.create(doc);
    if (written === "exists") continue;
    return { ok: true, value: { game: publicGame(doc), sharePath: sharePath(id), seatIndex: 0, seatToken, invite } };
  }
  return { ok: false, error: "invalid" };
}

export async function joinOnlineGame(store: OnlineStore, id: string, name: string): Promise<OnlineResult<JoinedGame>> {
  const cleaned = cleanName(name);
  if (cleaned === null || !isGameId(id)) return { ok: false, error: "invalid" };
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const current = await store.read(id);
    if (!current) return { ok: false, error: "missing" };
    if (current.status !== "lobby") return { ok: false, error: "invalid" };
    const seatIndex = current.seats.findIndex((seat) => seat === null);
    if (seatIndex < 0) return { ok: false, error: "full" };
    const seatToken = randomToken();
    const seats = current.seats.map((seat, index) => (index === seatIndex ? { name: cleaned, tokenHash: hashToken(seatToken) } : seat));
    const next: OnlineDocument = { ...current, version: current.version + 1, seats };
    const written = await store.commit(id, current.version, next);
    if (written === "mismatch") continue;
    if (written === "missing") return { ok: false, error: "missing" };
    return { ok: true, value: { game: publicGame(next), seatIndex, seatToken } };
  }
  return { ok: false, error: "invalid" };
}

export async function readPublicGame(store: OnlineStore, id: string): Promise<OnlineResult<PublicGame>> {
  if (!isGameId(id)) return { ok: false, error: "invalid" };
  const doc = await store.read(id);
  if (!doc) return { ok: false, error: "missing" };
  return { ok: true, value: publicGame(doc) };
}

export function memoryStore(): MemoryStore {
  return new MemoryStore();
}

function seatCountOf(value: number): (typeof SEAT_COUNTS)[number] | null {
  for (const count of SEAT_COUNTS) if (count === value) return count;
  return null;
}

function cleanName(value: string): string | null {
  const name = value.trim();
  if (name.length < 1 || name.length > 24) return null;
  return name;
}

function isGameId(id: string): boolean {
  return /^[A-Za-z0-9_-]{8,}$/.test(id);
}
