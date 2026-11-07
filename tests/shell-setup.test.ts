import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { readGamePacks, bindSetup, type GamePacks, type PlaySession } from "../src/ui/setup.ts";
import "./ui-phase.test.ts";
import "./ui-battle.test.ts";
import "./ui-map.test.ts";
import "./ui-motion.test.ts";
import "./ui-quiz-overlay.test.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const CONTRACT_IDS = [
  "app",
  "setup",
  "player-list",
  "mode",
  "start-game",
  "continue-game",
  "map",
  "county-info",
  "regions",
  "player-stats",
  "phase",
  "reinforcement-count",
  "trip-log",
  "quiz-dialog",
  "quiz-county",
  "quiz-question",
  "quiz-choices",
  "quiz-result",
  "skip-quiz",
  "battle-dialog",
  "occupy-dialog",
  "end-attacks",
  "end-turn",
  "handoff-dialog",
  "winner-dialog",
  "error-status",
] as const;

test("the page shell keeps the contract ids, 92 counties, and a local module entry", () => {
  const html = readFileSync(path.join(root, "index.html"), "utf8");
  for (const id of CONTRACT_IDS) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  const countyIds = [...html.matchAll(/data-county-id="(\d{5})"/g)].map((match) => match[1]);
  assert.equal(countyIds.length, 92);
  assert.equal(new Set(countyIds).size, 92);
  assert.equal(html.match(/class="county"/g)?.length, 92);
  assert.equal(html.match(/class="county-label"/g)?.length, 92);
  assert.equal(html.match(/class="army-badge"/g)?.length, 92);
  for (const cue of [0, 1, 2, 3, 4, 5]) {
    assert.match(html, new RegExp(`id="cue-${cue}"`));
  }
  assert.match(html, /id="trip-log"[^>]*role="log"/);
  assert.match(html, /id="trip-log"[^>]*aria-live="polite"/);
  for (const id of ["quiz-dialog", "battle-dialog", "occupy-dialog", "handoff-dialog", "winner-dialog"]) {
    const tag = html.match(new RegExp(`<section id="${id}"[^>]*>`));
    assert.ok(tag);
    assert.match(tag[0], /aria-modal="false"/);
  }
  assert.match(html, /adds exactly 2 armies, one time/);
  assert.match(html, /You do not pick your counties/);
  assert.match(html, /href="\/src\/styles\.css"/);
  assert.doesNotMatch(html, /<script\b[^>]*\bsrc="https?:/i);
  assert.doesNotMatch(html, /fonts\.googleapis|fonts\.gstatic/i);

  const scripts = [...html.matchAll(/<script\b([^>]*)>/gi)];
  assert.equal(scripts.length, 1);
  assert.match(scripts[0]?.[1] ?? "", /type="module"/);
  assert.match(scripts[0]?.[1] ?? "", /src="\/src\/main\.ts"/);
  const entry = readFileSync(path.join(root, "src", "main.ts"), "utf8");
  assert.match(entry, /loadJson\("\.\.\/data\/regions\/in\/map\.json"\)/);
  assert.match(entry, /loadJson\("\.\.\/data\/quiz\.json"\)/);
  assert.match(entry, /readGamePacks/);
  assert.match(entry, /bindSetup/);
  assert.match(entry, /bindMap/);
  assert.match(entry, /attachPanZoom/);
  assert.match(entry, /\bdispatch\b/);
  assert.doesNotMatch(entry, /public\/data\/quiz\.json/);
});

test("the quiz dialog source sets the unverified notice", () => {
  const source = readFileSync(path.join(root, "src", "ui", "quiz-dialog.ts"), "utf8");
  assert.match(source, /textContent = "Questions unverified"/);
});

test("setup reads the shipped map and quiz and rejects a foreign map digest", () => {
  const map = JSON.parse(readFileSync(path.join(root, "data", "regions", "in", "map.json"), "utf8")) as unknown;
  const quiz = JSON.parse(readFileSync(path.join(root, "data", "quiz.json"), "utf8")) as { mapDigest?: unknown };
  const packs = readGamePacks(map, quiz);
  assert.equal(packs.ok, true);
  if (!packs.ok) return;
  const mapIds = packs.value.map.counties.map((county) => county.id);
  assert.equal(mapIds.length, 92);
  assert.deepEqual(Object.keys(packs.value.quiz.counties).sort(), [...mapIds].sort());
  const foreign = readGamePacks(map, { ...quiz, mapDigest: "not-this-map" });
  assert.equal(foreign.ok, false);
  if (!foreign.ok) assert.equal(foreign.error.code, "INVALID_PACK");
});

test("a blocked storage getter does not resume a session or throw while saving", () => {
  const status = { textContent: "unchanged" };
  const resume = clickable();
  let sessions = 0;
  const doc = {
    getElementById(id: string) {
      if (id === "continue-game") return resume;
      if (id === "error-status") return status;
      return null;
    },
    get defaultView() {
      return {
        get localStorage(): Storage {
          throw new Error("storage blocked");
        },
      };
    },
  } as unknown as Document;
  const binding = bindSetup(doc, {
    packs: unusedPacks(),
    onSession() {
      sessions += 1;
    },
  });
  assert.doesNotThrow(() => resume.click());
  assert.equal(sessions, 0);
  assert.equal(status.textContent, "This screen could not read the saved game.");
  assert.doesNotThrow(() => binding.persist(unusedSession()));
  assert.equal(sessions, 0);
});

test("a store that throws on read or write leaves the session unreplaced", () => {
  const status = { textContent: "unchanged" };
  const resume = clickable();
  let sessions = 0;
  const storage = {
    getItem() {
      throw new Error("get");
    },
    setItem() {
      throw new Error("set");
    },
    removeItem() {},
    clear() {},
    key() {
      return null;
    },
    length: 0,
  } as unknown as Storage;
  const doc = {
    getElementById(id: string) {
      if (id === "continue-game") return resume;
      if (id === "error-status") return status;
      return null;
    },
    defaultView: null,
  } as unknown as Document;
  const binding = bindSetup(doc, {
    packs: unusedPacks(),
    storage,
    onSession() {
      sessions += 1;
    },
  });
  resume.click();
  binding.persist(unusedSession());
  assert.equal(sessions, 0);
  assert.equal(status.textContent, "This screen could not read the saved game.");
});

function clickable(): { addEventListener(type: string, listener: () => void): void; click(): void } {
  let listener = (): void => {};
  return {
    addEventListener(_type: string, next: () => void) {
      listener = next;
    },
    click() {
      listener();
    },
  };
}

function unusedPacks(): GamePacks {
  return {} as GamePacks;
}

function unusedSession(): PlaySession {
  return {} as PlaySession;
}
