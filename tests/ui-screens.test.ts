import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createRng, engine } from "../src/engine/engine.ts";
import { bindLanding } from "../src/ui/landing.ts";
import { bindScreens, initialScreen } from "../src/ui/screens.ts";
import { bindSetup, hasSavedGame, readGamePacks, type GamePacks } from "../src/ui/setup.ts";
import { createDocument, DomElement, DomInput, DomKeyboardEvent, type DomDocument } from "./ui-dom.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SAVE_KEY = "battle-for-the-92.save";

test("the page opens on a landing screen separate from setup and play", () => {
  const html = readFileSync(path.join(root, "index.html"), "utf8");
  const landingAt = html.indexOf('id="landing"');
  const setupAt = html.indexOf('id="setup-screen"');
  const gameAt = html.indexOf('id="game-screen"');
  assert.ok(landingAt >= 0 && setupAt > landingAt && gameAt > setupAt);
  const landing = html.slice(landingAt, setupAt);
  const setup = html.slice(setupAt, gameAt);
  const game = html.slice(gameAt);
  assert.match(landing, /id="landing-title"[^>]*>Battle for 92</);
  assert.match(landing, /id="new-game"/);
  assert.match(landing, /id="continue-game"/);
  assert.match(landing, /Questions unverified/);
  assert.match(setup, /id="setup-heading"/);
  assert.match(setup, /id="setup-back"/);
  assert.match(setup, /id="start-game"/);
  assert.match(setup, /id="replace-dialog"/);
  assert.match(setup, /How you win/);
  assert.doesNotMatch(setup, /id="continue-game"/);
  assert.match(game, /id="open-menu"/);
  assert.match(game, /id="game-title"/);
  assert.doesNotMatch(game, /id="setup"/);
  assert.doesNotMatch(game, /id="start-game"/);
});

test("boot stays on the landing and does not resume by itself", () => {
  const main = readFileSync(path.join(root, "src", "main.ts"), "utf8");
  const screens = readFileSync(path.join(root, "src", "ui", "screens.ts"), "utf8");
  assert.match(main, /initialScreen\(/);
  assert.match(main, /bindScreens/);
  assert.match(main, /bindLanding/);
  assert.doesNotMatch(main, /continue-game/);
  assert.doesNotMatch(main, /deserialize/);
  assert.doesNotMatch(screens, /engine\/engine/);
  assert.doesNotMatch(screens, /setItem/);
  assert.equal(initialScreen(), "landing");
});

test("reduced motion keeps the landing map on its final frame", () => {
  const css = readFileSync(path.join(root, "src", "styles.css"), "utf8");
  assert.match(css, /#landing-map/);
  assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*#landing-map[\s\S]*animation:\s*none/);
  assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*#landing-map[\s\S]*opacity:\s*1/);
});

test("the landing map lights counties without copying live county ids", () => {
  const doc = createDocument();
  const app = doc.getElementById("app");
  assert.ok(app);
  const hero = doc.createElement("div");
  hero.id = "landing-hero";
  const svg = doc.createElement("svg");
  svg.id = "map";
  svg.setAttribute("tabindex", "0");
  for (const id of ["18001", "18003", "18005"]) {
    const county = doc.createElement("g");
    county.className = "county";
    county.setAttribute("data-county-id", id);
    county.setAttribute("tabindex", "-1");
    county.setAttribute("role", "button");
    const shape = doc.createElement("path");
    shape.id = `county-shape-${id}`;
    const use = doc.createElement("use");
    use.setAttribute("href", `#county-shape-${id}`);
    use.setAttribute("fill", "url(#cue-0)");
    county.append(shape, use);
    svg.appendChild(county);
  }
  app.append(hero, svg);
  bindLanding(doc as unknown as Document);
  bindLanding(doc as unknown as Document);
  const clones = doc.querySelectorAll("#landing-map");
  assert.equal(clones.length, 1);
  const clone = clones[0];
  assert.ok(clone);
  assert.equal(clone.getAttribute("tabindex"), null);
  assert.equal(doc.querySelectorAll("#map [data-county-id]").length, 3);
  assert.equal(doc.querySelectorAll("#landing-map [data-county-id]").length, 0);
  assert.equal(doc.querySelectorAll("#county-shape-18001").length, 1);
  assert.equal(clone.querySelector("path")?.id, "landing-county-shape-18001");
  assert.equal(clone.querySelector("use")?.getAttribute("href"), "#landing-county-shape-18001");
  assert.equal(clone.querySelector("use")?.getAttribute("fill"), "url(#landing-cue-0)");
  const counties = clone.querySelectorAll(".county");
  assert.equal(counties.length, 3);
  const first = counties[0];
  const third = counties[2];
  assert.ok(first && third);
  assert.equal(first.getAttribute("data-owner"), "0");
  assert.equal(third.getAttribute("data-owner"), "2");
  assert.equal(first.getAttribute("data-county-id"), null);
  assert.equal(first.getAttribute("tabindex"), null);
  assert.equal(first.getAttribute("role"), null);
  assert.equal(first.style.animationDelay, "0ms");
  assert.notEqual(first.style.animationDelay, third.style.animationDelay);
});

test("continue is offered only when the saved game already opens", () => {
  const doc = createDocument();
  const storage = memory();
  assert.equal(hasSavedGame(doc as unknown as Document, storage), false);
  storage.setItem(SAVE_KEY, "");
  assert.equal(hasSavedGame(doc as unknown as Document, storage), false);
  storage.setItem(SAVE_KEY, "{");
  assert.equal(hasSavedGame(doc as unknown as Document, storage), false);
  storage.setItem(SAVE_KEY, "{}");
  assert.equal(hasSavedGame(doc as unknown as Document, storage), false);
  storage.setItem(SAVE_KEY, openedSave());
  assert.equal(hasSavedGame(doc as unknown as Document, storage), true);
  const blocked = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
    removeItem() {},
    clear() {},
    key() {
      return null;
    },
    get length() {
      return 0;
    },
  } as unknown as Storage;
  assert.equal(hasSavedGame(doc as unknown as Document, blocked), false);
});

test("a saved game still opens on the landing until Continue", () => {
  const storage = memory();
  storage.setItem(SAVE_KEY, openedSave());
  const page = build(storage);
  page.screens.show(initialScreen());
  assert.equal(page.landing.hidden, false);
  assert.equal(page.game.hidden, true);
  assert.equal(page.setup.isConnected, false);
  assert.equal(page.resume.hidden, false);
  assert.equal(page.sessions.count, 0);
  assert.equal(docTitle(page.doc), "Battle for 92");
  assert.equal(page.doc.activeElement === page.landingTitle, true);
});

test("New game, Back, and Menu move focus and keep a resumable game", () => {
  const storage = memory();
  const raw = openedSave();
  storage.setItem(SAVE_KEY, raw);
  const page = build(storage);
  page.screens.show("landing");
  page.fresh.click();
  assert.equal(page.setup.hidden, false);
  assert.equal(page.setup.isConnected, true);
  assert.equal(page.landing.hidden, true);
  assert.equal(page.game.hidden, true);
  assert.equal(page.doc.activeElement === page.setupHeading, true);
  assert.equal(storage.getItem(SAVE_KEY), raw);
  page.back.click();
  assert.equal(page.landing.hidden, false);
  assert.equal(page.setup.isConnected, false);
  assert.equal(page.resume.hidden, false);
  assert.equal(storage.getItem(SAVE_KEY), raw);
  assert.equal(page.doc.activeElement === page.landingTitle, true);
  page.screens.show("game");
  assert.equal(page.game.hidden, false);
  assert.equal(page.doc.getElementById("setup") === null, true);
  assert.equal(page.doc.getElementById("setup-screen") === null, true);
  assert.equal(page.doc.querySelector("#setup input, #start-game, #setup-back") === null, true);
  assert.equal(page.doc.activeElement === page.gameTitle, true);
  page.menu.click();
  assert.equal(page.landing.hidden, false);
  assert.equal(page.game.hidden, true);
  assert.equal(page.setup.isConnected, false);
  assert.equal(page.resume.hidden, false);
  assert.equal(storage.getItem(SAVE_KEY), raw);
  assert.equal(page.sessions.count, 0);
});

test("Tab is not trapped on the landing or the replace question", () => {
  const storage = memory();
  storage.setItem(SAVE_KEY, openedSave());
  const page = build(storage);
  page.screens.show("landing");
  const tab = new DomKeyboardEvent("keydown", { key: "Tab" });
  page.fresh.dispatchEvent(tab);
  assert.equal(tab.defaultPrevented, false);
  assert.equal(page.doc.activeElement === page.landingTitle, true);
  page.fresh.click();
  page.start.click();
  assert.equal(page.dialog.hidden, false);
  assert.equal(page.sessions.count, 0);
  page.confirm.focus();
  const forward = new DomKeyboardEvent("keydown", { key: "Tab" });
  const backward = new DomKeyboardEvent("keydown", { key: "Tab", shiftKey: true });
  page.confirm.dispatchEvent(forward);
  page.dialog.dispatchEvent(backward);
  assert.equal(forward.defaultPrevented, false);
  assert.equal(backward.defaultPrevented, false);
  assert.equal(page.doc.activeElement === page.confirm, true);
  assert.equal(page.sessions.count, 0);
});

test("Start asks before replacing a saved game and cancel leaves it", () => {
  const storage = memory();
  const raw = openedSave();
  storage.setItem(SAVE_KEY, raw);
  const page = build(storage);
  page.screens.show("setup");
  page.start.click();
  assert.equal(page.dialog.hidden, false);
  assert.equal(page.sessions.count, 0);
  assert.equal(storage.getItem(SAVE_KEY), raw);
  assert.equal(page.doc.activeElement === page.doc.getElementById("replace-title"), true);
  page.stay.click();
  assert.equal(page.dialog.hidden, true);
  assert.equal(page.sessions.count, 0);
  assert.equal(storage.getItem(SAVE_KEY), raw);
  assert.equal(page.setup.isConnected, true);
  assert.equal(page.doc.activeElement === page.start, true);
  page.start.click();
  const escape = new DomKeyboardEvent("keydown", { key: "Escape" });
  page.dialog.dispatchEvent(escape);
  assert.equal(escape.defaultPrevented, true);
  assert.equal(page.dialog.hidden, true);
  assert.equal(page.sessions.count, 0);
  assert.equal(storage.getItem(SAVE_KEY), raw);
  assert.equal(page.doc.activeElement === page.start, true);
});

test("confirming Start replaces the save and leaves setup out of the page", () => {
  const storage = memory();
  const raw = openedSave();
  storage.setItem(SAVE_KEY, raw);
  const page = build(storage);
  page.screens.show("setup");
  page.start.click();
  page.confirm.click();
  assert.equal(page.sessions.count, 1);
  assert.notEqual(storage.getItem(SAVE_KEY), raw);
  assert.equal(page.game.hidden, false);
  assert.equal(page.setup.isConnected, false);
  assert.equal(page.doc.getElementById("setup") === null, true);
  assert.equal(hasSavedGame(page.doc as unknown as Document, storage), true);
});

test("an unusable save does not offer Continue or ask to replace it", () => {
  const storage = memory();
  storage.setItem(SAVE_KEY, "{");
  const page = build(storage);
  page.screens.show("landing");
  assert.equal(page.resume.hidden, true);
  assert.equal(page.sessions.count, 0);
  page.fresh.click();
  page.start.click();
  assert.equal(page.dialog.hidden, true);
  assert.equal(page.sessions.count, 1);
  assert.equal(page.game.hidden, false);
  assert.equal(page.setup.isConnected, false);
});

test("Continue restores the saved game without adding counties", () => {
  const storage = memory();
  const raw = openedSave();
  storage.setItem(SAVE_KEY, raw);
  const parsed = engine.deserialize(raw);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const expected = JSON.stringify(parsed.value.state.holdings);
  const page = build(storage);
  page.screens.show("landing");
  page.resume.click();
  assert.equal(page.sessions.count, 1);
  assert.equal(page.game.hidden, false);
  assert.equal(page.setup.isConnected, false);
  assert.equal(JSON.stringify(page.sessions.holdings), expected);
  assert.equal(page.sessions.holdings.length, 92);
  assert.equal(page.sessions.sequence, parsed.value.state.turnSequence);
  page.resume.click();
  assert.equal(page.sessions.count, 2);
  assert.equal(page.sessions.holdings.length, 92);
  assert.equal(JSON.stringify(page.sessions.holdings), expected);
  assert.equal(storage.getItem(SAVE_KEY), raw);
});

interface Memory extends Storage {
  snapshot(): string | null;
}

interface Played {
  count: number;
  sequence: number;
  holdings: readonly { readonly countyId: string; readonly owner: number; readonly armies: number }[];
}

interface Page {
  doc: DomDocument;
  screens: ReturnType<typeof bindScreens>;
  landing: DomElement;
  setup: DomElement;
  game: DomElement;
  landingTitle: DomElement;
  setupHeading: DomElement;
  gameTitle: DomElement;
  fresh: DomElement;
  resume: DomElement;
  back: DomElement;
  start: DomElement;
  menu: DomElement;
  dialog: DomElement;
  confirm: DomElement;
  stay: DomElement;
  sessions: Played;
}

function build(storage: Storage): Page {
  const doc = createDocument();
  const app = doc.getElementById("app");
  assert.ok(app);
  const landing = el(doc, "section", "landing");
  const landingTitle = el(doc, "h1", "landing-title");
  landingTitle.textContent = "Battle for 92";
  const fresh = el(doc, "button", "new-game");
  const resume = el(doc, "button", "continue-game");
  resume.hidden = true;
  landing.append(landingTitle, fresh, resume);
  const setup = el(doc, "section", "setup-screen");
  setup.hidden = true;
  const back = el(doc, "button", "setup-back");
  const form = el(doc, "section", "setup");
  const setupHeading = el(doc, "h1", "setup-heading");
  const list = el(doc, "ol", "player-list");
  list.append(seat(doc, "Ada"), seat(doc, "Bo"));
  const start = el(doc, "button", "start-game");
  form.append(setupHeading, list, start);
  const dialog = el(doc, "section", "replace-dialog");
  dialog.hidden = true;
  const replaceTitle = el(doc, "h2", "replace-title");
  const stay = el(doc, "button", "replace-stay");
  const confirm = el(doc, "button", "replace-confirm");
  dialog.append(replaceTitle, stay, confirm);
  setup.append(back, form, dialog);
  const game = el(doc, "div", "game-screen");
  game.hidden = true;
  const gameTitle = el(doc, "h1", "game-title");
  const menu = el(doc, "button", "open-menu");
  game.append(gameTitle, menu);
  const status = el(doc, "p", "error-status");
  app.append(status, landing, setup, game);
  const sessions: Played = { count: 0, sequence: -1, holdings: [] };
  const screens = bindScreens(doc as unknown as Document, {
    canContinue: () => hasSavedGame(doc as unknown as Document, storage),
  });
  bindSetup(doc as unknown as Document, {
    packs: gamePacks(),
    storage,
    createSeed: () => "entry-flow-replacement",
    onSession(session) {
      sessions.count += 1;
      sessions.sequence = session.state.turnSequence;
      sessions.holdings = session.state.holdings.map((item) => ({
        countyId: item.countyId,
        owner: item.owner,
        armies: item.armies,
      }));
      screens.show("game");
    },
  });
  return {
    doc,
    screens,
    landing,
    setup,
    game,
    landingTitle,
    setupHeading,
    gameTitle,
    fresh,
    resume,
    back,
    start,
    menu,
    dialog,
    confirm,
    stay,
    sessions,
  };
}

function seat(doc: DomDocument, name: string): DomElement {
  const item = doc.createElement("li");
  const field = doc.createElement("input");
  field.setAttribute("type", "text");
  (field as DomInput).value = name;
  const human = doc.createElement("input");
  human.setAttribute("type", "radio");
  human.setAttribute("checked", "");
  (human as DomInput).value = "human";
  item.append(field, human);
  return item;
}

function el(doc: DomDocument, tag: string, id: string): DomElement {
  const node = doc.createElement(tag);
  node.id = id;
  return node;
}

function memory(): Memory {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key: string) {
      return data.has(key) ? (data.get(key) ?? null) : null;
    },
    key(index: number) {
      return [...data.keys()][index] ?? null;
    },
    removeItem(key: string) {
      data.delete(key);
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
    snapshot() {
      return data.get(SAVE_KEY) ?? null;
    },
  };
}

function docTitle(doc: DomDocument): string {
  return doc.title;
}

let packCache: GamePacks | null = null;
let saveCache: string | null = null;

function gamePacks(): GamePacks {
  if (packCache) return packCache;
  const map = JSON.parse(readFileSync(path.join(root, "data", "regions", "in", "map.json"), "utf8")) as unknown;
  const quiz = JSON.parse(readFileSync(path.join(root, "data", "quiz.json"), "utf8")) as unknown;
  const packs = readGamePacks(map, quiz);
  if (!packs.ok) throw new Error(packs.error.message);
  packCache = packs.value;
  return packCache;
}

function openedSave(): string {
  if (saveCache) return saveCache;
  const rng = createRng("entry-flow");
  const created = engine.createGame(
    {
      players: [
        { id: 0, label: "Ada", kind: "human" },
        { id: 1, label: "Bo", kind: "human" },
      ],
      mode: "quick60",
      map: gamePacks().map,
      quiz: gamePacks().quiz,
    },
    () => rng.draw(),
  );
  if (!created.ok) throw new Error(created.error.message);
  saveCache = engine.serialize({ version: 1, state: created.value, rng: rng.snapshot() });
  return saveCache;
}
