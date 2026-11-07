import { createOnlineGame, joinOnlineGame, readPublicGame, type OnlineError } from "./games.ts";
import type { OnlineStore } from "./memory-store.ts";

export interface OnlineResponse {
  readonly status: number;
  readonly body: unknown;
}

export async function handleOnline(method: string, pathname: string, body: unknown, store: OnlineStore): Promise<OnlineResponse> {
  if (method === "GET" && pathname === "/api/health/db") {
    const ok = await store.ping();
    return ok ? { status: 200, body: { ok: true } } : { status: 503, body: { ok: false } };
  }
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
    return { status: 200, body: { game: joined.value.game, seatIndex: joined.value.seatIndex, seatToken: joined.value.seatToken } };
  }
  const read = /^\/api\/games\/([A-Za-z0-9_-]+)$/.exec(pathname);
  if (method === "GET" && read?.[1]) {
    const game = await readPublicGame(store, read[1]);
    if (!game.ok) return { status: statusFor(game.error), body: { error: game.error } };
    return { status: 200, body: game.value };
  }
  return { status: 404, body: { error: "missing" } };
}

function statusFor(error: OnlineError): number {
  if (error === "full") return 409;
  if (error === "missing") return 404;
  return 400;
}

function recordOf(body: unknown): { seatCount?: unknown; name?: unknown } | null {
  if (typeof body !== "object" || body === null) return null;
  return body as { seatCount?: unknown; name?: unknown };
}
