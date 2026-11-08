import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createOnlineGame, joinOnlineGame } from "../src/online/games.ts";
import { handleOnline } from "../src/online/http.ts";
import { MemoryStore, type OnlineStore } from "../src/online/memory-store.ts";
import { catchUp, submitOnlineIntent } from "../src/online/sync.ts";
import { readGamePacks } from "../src/ui/setup.ts";

const packs = readGamePacks(
  JSON.parse(readFileSync(new URL("../data/regions/in/map.json", import.meta.url), "utf8")),
  JSON.parse(readFileSync(new URL("../data/quiz.json", import.meta.url), "utf8")),
);
if (!packs.ok) throw new Error(packs.error.message);
const gamePacks = packs.value;

test("the authority grades a quiz once and rejects a forged or repeated action", async () => {
  const table = await openTable();
  const first = await submitOnlineIntent(table.store, table.id, {
    seatToken: table.seat0,
    expectedVersion: table.version,
    idempotencyKey: "quiz-ada-1",
    action: { kind: "skipQuiz", turnSequence: table.turnSequence, questionId: table.questionId },
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.value.accepted, true);
  assert.equal(first.value.game.play?.phase, "place");
  assert.equal(first.value.game.play?.quizScore === 0 || first.value.game.play?.quizScore === 2, true);
  const published = JSON.stringify(first.value.game);
  assert.equal(published.includes("correctLetter"), false);
  assert.equal(published.includes("tokenHash"), false);
  assert.equal(published.includes("inviteHash"), false);
  const armies = armyTotal(first.value.game.play);
  const replay = await submitOnlineIntent(table.store, table.id, {
    seatToken: table.seat0,
    expectedVersion: first.value.version,
    idempotencyKey: "quiz-ada-1",
    action: { kind: "skipQuiz", turnSequence: table.turnSequence, questionId: table.questionId },
  });
  assert.equal(replay.ok && replay.value.accepted && replay.value.replayed, true);
  assert.equal(armyTotal(replay.ok ? replay.value.game.play : null), armies);
  const forged = await submitOnlineIntent(table.store, table.id, {
    seatToken: table.seat0,
    expectedVersion: first.value.version,
    idempotencyKey: "forged-award",
    action: { kind: "award", bonus: 2 },
  });
  assert.equal(forged.ok && forged.value.accepted, false);
  const other = await submitOnlineIntent(table.store, table.id, {
    seatToken: table.seat1,
    expectedVersion: first.value.version,
    idempotencyKey: "bo-too-soon",
    action: { kind: "skipFortify" },
  });
  assert.equal(other.ok && other.value.accepted, false);
  assert.equal(other.ok ? other.value.game.version : 0, first.value.version);
});

test("a stale intent does not move armies and a second game stays separate", async () => {
  const table = await openTable();
  const placed = await playToAttack(table);
  const stale = await handleOnline("POST", `/api/games/${table.id}/intents`, {
    seatToken: table.seat0,
    expectedVersion: table.version,
    idempotencyKey: "stale-place",
    action: { kind: "place", countyId: placed.countyId, count: 1 },
  }, table.store);
  assert.equal(stale.status, 409);
  const body = stale.body as { game: { version: number; play: { armies: { countyId: string; armies: number }[] } } };
  assert.equal(body.game.version, placed.version);
  const seen = body.game.play.armies.find((item) => item.countyId === placed.countyId);
  assert.equal(seen?.armies, placed.armies);
  const other = await createOnlineGame(table.store, { seatCount: 2, name: "Other" });
  assert.equal(other.ok, true);
  if (!other.ok) return;
  const isolated = await catchUp(table.store, other.value.game.id, 0);
  assert.equal(isolated.ok && isolated.value.game.play, null);
});

test("refresh rejoin keeps the seat and reports expiry, a bad key, and an unavailable table", async () => {
  const table = await openTable();
  const restored = await handleOnline("POST", `/api/games/${table.id}/rejoin`, { seatToken: table.seat0 }, table.store);
  assert.equal(restored.status, 200);
  const body = restored.body as { seatIndex: number; game: { version: number; play: { phase: string } } };
  assert.equal(body.seatIndex, 0);
  assert.equal(body.game.play.phase, "quiz");
  const wrong = await handleOnline("POST", `/api/games/${table.id}/rejoin`, { seatToken: "not-the-seat" }, table.store);
  assert.equal(wrong.status, 403);
  assert.equal((wrong.body as { error: string }).error, "rejoin");
  const saved = await table.store.read(table.id);
  assert.ok(saved);
  if (!saved) return;
  await table.store.commit(table.id, saved.version, { ...saved, version: saved.version + 1, expiresAt: 1 });
  const expired = await handleOnline("GET", `/api/games/${table.id}`, undefined, table.store);
  assert.equal(expired.status, 410);
  const down = new MemoryStore();
  down.fail();
  const unavailable = await handleOnline("POST", `/api/games/${table.id}/intents`, {
    seatToken: table.seat0,
    expectedVersion: 1,
    idempotencyKey: "while-down",
    action: { kind: "endAttacks" },
  }, down);
  assert.equal(unavailable.status, 503);
});

function armyTotal(play: { armies: readonly { armies: number }[] } | null | undefined): number {
  return play?.armies.reduce((sum, item) => sum + item.armies, 0) ?? 0;
}

async function openTable(): Promise<{ store: MemoryStore; id: string; seat0: string; seat1: string; version: number; questionId: string; turnSequence: number }> {
  const store = new MemoryStore();
  const created = await handleOnline("POST", "/api/games", { seatCount: 2, name: "Ada" }, store, undefined, gamePacks);
  const ada = created.body as { gameId: string; seatToken: string };
  const joined = await handleOnline("POST", `/api/games/${ada.gameId}/join`, { name: "Bo" }, store, undefined, gamePacks);
  const bo = joined.body as { seatToken: string };
  const view = await catchUp(store, ada.gameId, 0);
  if (!view.ok || !view.value.game.play?.questionId) throw new Error("the table did not start");
  return { store, id: ada.gameId, seat0: ada.seatToken, seat1: bo.seatToken, version: view.value.game.version, questionId: view.value.game.play.questionId, turnSequence: view.value.game.play.turnSequence };
}

async function playToAttack(table: { store: MemoryStore; id: string; seat0: string; version: number; questionId: string; turnSequence: number }): Promise<{ version: number; countyId: string; armies: number }> {
  const skipped = await submitOnlineIntent(table.store, table.id, {
    seatToken: table.seat0,
    expectedVersion: table.version,
    idempotencyKey: "skip-to-place",
    action: { kind: "skipQuiz", turnSequence: table.turnSequence, questionId: table.questionId },
  });
  if (!skipped.ok || !skipped.value.game.play?.remaining) throw new Error("placement did not open");
  const county = skipped.value.game.play.armies.find((item) => item.owner === 0);
  if (!county) throw new Error("no county");
  const placed = await submitOnlineIntent(table.store, table.id, {
    seatToken: table.seat0,
    expectedVersion: skipped.value.version,
    idempotencyKey: "place-all",
    action: { kind: "place", countyId: county.countyId, count: skipped.value.game.play.remaining },
  });
  if (!placed.ok || placed.value.game.play?.phase !== "attack") throw new Error("attack did not open");
  const updated = placed.value.game.play.armies.find((item) => item.countyId === county.countyId);
  return { version: placed.value.version, countyId: county.countyId, armies: updated?.armies ?? 0 };
}
