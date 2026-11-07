import type { GamePacks } from "../ui/setup.ts";
import { createOnlineGame, joinOnlineGame, type OnlineError } from "./games.ts";
import type { OnlineStore } from "./memory-store.ts";
import { beginOnlinePlay, catchUp, rejoinOnlineGame, submitOnlineIntent } from "./sync.ts";

export interface OnlineResponse {
  readonly status: number;
  readonly body: unknown;
}

export async function handleOnline(
  method: string,
  pathname: string,
  body: unknown,
  store: OnlineStore,
  query?: { since?: string },
  packs?: GamePacks,
): Promise<OnlineResponse> {
  if (method === "GET" && pathname === "/api/health/db") {
    const ok = await store.ping();
    return ok ? { status: 200, body: { ok: true } } : { status: 503, body: { error: "unavailable", ok: false } };
  }
  if (!(await store.ping())) return { status: 503, body: { error: "unavailable" } };
  if (method === "POST" && pathname === "/api/games") {
    const record = recordOf(body);
    const seatCount = record?.seatCount;
    const name = record?.name;
    if (typeof seatCount !== "number" || typeof name !== "string") return { status: 400, body: { error: "invalid" } };
    const created = await createOnlineGame(store, { seatCount, name });
    if (!created.ok) return { status: statusFor(created.error), body: { error: created.error } };
    return {
      status: 201,
      body: {
        gameId: created.value.game.id,
        sharePath: created.value.sharePath,
        seatIndex: created.value.seatIndex,
        seatToken: created.value.seatToken,
        invite: created.value.invite,
      },
    };
  }
  const join = /^\/api\/games\/([A-Za-z0-9_-]+)\/join$/.exec(pathname);
  if (method === "POST" && join?.[1]) {
    const record = recordOf(body);
    const name = record?.name;
    if (typeof name !== "string") return { status: 400, body: { error: "invalid" } };
    const joined = await joinOnlineGame(store, join[1], name);
    if (!joined.ok) return { status: statusFor(joined.error), body: { error: joined.error } };
    if (packs && joined.value.game.seats.every((seat) => seat.filled)) await beginOnlinePlay(store, join[1], packs);
    return { status: 200, body: { game: joined.value.game, seatIndex: joined.value.seatIndex, seatToken: joined.value.seatToken } };
  }
  const intent = /^\/api\/games\/([A-Za-z0-9_-]+)\/intents$/.exec(pathname);
  if (method === "POST" && intent?.[1]) {
    const record = recordOf(body);
    const seatToken = record?.seatToken;
    const expectedVersion = record?.expectedVersion;
    const idempotencyKey = record?.idempotencyKey;
    if (typeof seatToken !== "string" || typeof expectedVersion !== "number" || typeof idempotencyKey !== "string") {
      return { status: 400, body: { error: "invalid" } };
    }
    const submitted = await submitOnlineIntent(store, intent[1], { seatToken, expectedVersion, idempotencyKey, action: record?.action });
    if (!submitted.ok) return { status: statusFor(submitted.error), body: { error: submitted.error, explanation: explanationFor(submitted.error) } };
    const receipt = submitted.value;
    const status = receipt.accepted ? 200 : receipt.error === "stale" ? 409 : 403;
    return { status, body: receipt };
  }
  const rejoin = /^\/api\/games\/([A-Za-z0-9_-]+)\/rejoin$/.exec(pathname);
  if (method === "POST" && rejoin?.[1]) {
    const record = recordOf(body);
    const seatToken = record?.seatToken;
    if (typeof seatToken !== "string") return { status: 400, body: { error: "invalid" } };
    const restored = await rejoinOnlineGame(store, rejoin[1], seatToken);
    if (!restored.ok) return { status: statusFor(restored.error), body: { error: restored.error, explanation: explanationFor(restored.error) } };
    return { status: 200, body: restored.value };
  }
  const read = /^\/api\/games\/([A-Za-z0-9_-]+)$/.exec(pathname);
  if (method === "GET" && read?.[1]) {
    const since = Number(query?.since ?? "0");
    const game = await catchUp(store, read[1], Number.isFinite(since) ? since : 0);
    if (!game.ok) return { status: statusFor(game.error), body: { error: game.error, explanation: explanationFor(game.error) } };
    return { status: 200, body: game.value };
  }
  return { status: 404, body: { error: "missing", explanation: explanationFor("missing") } };
}

function statusFor(error: OnlineError): number {
  if (error === "full" || error === "stale") return 409;
  if (error === "missing") return 404;
  if (error === "expired") return 410;
  if (error === "unavailable") return 503;
  if (error === "rejoin" || error === "rejected") return 403;
  return 400;
}

function explanationFor(error: OnlineError): string {
  if (error === "expired") return "This table has expired.";
  if (error === "unavailable") return "The shared table is unavailable.";
  if (error === "rejoin") return "This seat key does not match the table.";
  if (error === "missing") return "That game link is not valid.";
  if (error === "stale") return "The table moved. Reload this revision.";
  if (error === "rejected") return "The table did not accept that action.";
  return "That request is not valid.";
}

function recordOf(body: unknown): {
  seatCount?: unknown;
  name?: unknown;
  seatToken?: unknown;
  expectedVersion?: unknown;
  idempotencyKey?: unknown;
  action?: unknown;
} | null {
  if (typeof body !== "object" || body === null) return null;
  return body as {
    seatCount?: unknown;
    name?: unknown;
    seatToken?: unknown;
    expectedVersion?: unknown;
    idempotencyKey?: unknown;
    action?: unknown;
  };
}
