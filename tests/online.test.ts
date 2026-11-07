import assert from "node:assert/strict";
import { test } from "node:test";
import { createOnlineGame, joinOnlineGame, readPublicGame } from "../src/online/games.ts";
import { handleOnline } from "../src/online/http.ts";
import { MemoryStore } from "../src/online/memory-store.ts";
import { openConfiguredStore } from "../src/online/redis-store.ts";
import { gameIdFromPath, publicShareUrl, seatStorageKey, sharePath } from "../src/online/share.ts";

test("a created game has a public path and a private seat token", async () => {
  const store = new MemoryStore();
  const created = await createOnlineGame(store, { seatCount: 2, name: "Ada" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.equal(created.value.sharePath, sharePath(created.value.game.id));
  assert.equal(created.value.sharePath.includes("?"), false);
  assert.equal(created.value.sharePath.includes(created.value.seatToken), false);
  assert.equal(created.value.sharePath.includes(created.value.invite), false);
  assert.equal(publicShareUrl("https://play.example", created.value.game.id), `https://play.example${created.value.sharePath}`);
  assert.equal(seatStorageKey(created.value.game.id).includes(created.value.seatToken), false);
  const saved = await store.read(created.value.game.id);
  assert.ok(saved);
  assert.equal(JSON.stringify(saved).includes(created.value.seatToken), false);
  assert.equal(JSON.stringify(saved).includes(created.value.invite), false);
});

test("an independent join takes the next seat and a second game stays empty", async () => {
  const store = new MemoryStore();
  const first = await createOnlineGame(store, { seatCount: 3, name: "Ada" });
  const second = await createOnlineGame(store, { seatCount: 2, name: "Other" });
  assert.equal(first.ok && second.ok, true);
  if (!first.ok || !second.ok) return;
  const joined = await joinOnlineGame(store, first.value.game.id, "Bo");
  assert.equal(joined.ok, true);
  if (!joined.ok) return;
  assert.equal(joined.value.seatIndex, 1);
  assert.notEqual(joined.value.seatToken, first.value.seatToken);
  const seen = await readPublicGame(store, first.value.game.id);
  assert.equal(seen.ok, true);
  if (!seen.ok) return;
  assert.deepEqual(seen.value.seats.map((seat) => seat.name), ["Ada", "Bo", ""]);
  const other = await readPublicGame(store, second.value.game.id);
  assert.equal(other.ok, true);
  if (!other.ok) return;
  assert.deepEqual(other.value.seats.map((seat) => seat.name), ["Other", ""]);
});

test("join reports a full table, a missing game, and a bad seat count", async () => {
  const store = new MemoryStore();
  const created = await createOnlineGame(store, { seatCount: 2, name: "Ada" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const joined = await joinOnlineGame(store, created.value.game.id, "Bo");
  assert.equal(joined.ok, true);
  const full = await joinOnlineGame(store, created.value.game.id, "Cy");
  assert.deepEqual(full, { ok: false, error: "full" });
  const missing = await joinOnlineGame(store, "missing-game", "Bo");
  assert.deepEqual(missing, { ok: false, error: "missing" });
  const low = await createOnlineGame(store, { seatCount: 1, name: "Ada" });
  const high = await createOnlineGame(store, { seatCount: 7, name: "Ada" });
  assert.deepEqual(low, { ok: false, error: "invalid" });
  assert.deepEqual(high, { ok: false, error: "invalid" });
  const blank = await joinOnlineGame(store, created.value.game.id, " ");
  assert.deepEqual(blank, { ok: false, error: "invalid" });
});

test("the public game hides the answer key, seed, invite, and seat token", async () => {
  const store = new MemoryStore();
  const created = await createOnlineGame(store, { seatCount: 6, name: "Ada" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const response = await handleOnline("GET", `/api/games/${created.value.game.id}`, undefined, store);
  assert.equal(response.status, 200);
  const body = response.body as Record<string, unknown>;
  for (const secret of ["correctLetter", "correctAnswer", "seatToken", "invite", "tokenHash", "inviteHash", "seed"]) {
    assert.equal(Object.hasOwn(body, secret), false, secret);
  }
  const text = JSON.stringify(body);
  assert.equal(text.includes(created.value.seatToken), false);
  assert.equal(text.includes(created.value.invite), false);
  assert.equal(gameIdFromPath(created.value.sharePath), created.value.game.id);
  assert.equal(gameIdFromPath("/g/nope?i=secret"), null);
});

test("http create and join keep games isolated and report lobby errors", async () => {
  const store = new MemoryStore();
  const created = await handleOnline("POST", "/api/games", { seatCount: 2, name: "Ada" }, store);
  assert.equal(created.status, 201);
  const body = created.body as { gameId: string; sharePath: string; seatToken: string; invite: string };
  assert.equal(body.sharePath, `/g/${body.gameId}`);
  assert.equal(body.sharePath.includes(body.seatToken), false);
  assert.equal(body.sharePath.includes(body.invite), false);
  const joined = await handleOnline("POST", `/api/games/${body.gameId}/join`, { name: "Bo" }, store);
  assert.equal(joined.status, 200);
  const again = await handleOnline("POST", `/api/games/${body.gameId}/join`, { name: "Cy" }, store);
  assert.equal(again.status, 409);
  const missing = await handleOnline("POST", "/api/games/not-a-game/join", { name: "Bo" }, store);
  assert.equal(missing.status, 404);
  const health = await handleOnline("GET", "/api/health/db", undefined, store);
  assert.deepEqual(health, { status: 200, body: { ok: true } });
});

test("a missing app store is not opened and does not invent credentials", () => {
  assert.equal(openConfiguredStore({}), null);
  assert.equal(openConfiguredStore({ UPSTASH_REDIS_REST_URL: "https://example.upstash.io" }), null);
  assert.equal(openConfiguredStore({ UPSTASH_REDIS_REST_TOKEN: "secret" }), null);
  assert.equal(openConfiguredStore({ KV_REST_API_URL: "https://risk.example", KV_REST_API_TOKEN: "risk-secret" }), null);
});
