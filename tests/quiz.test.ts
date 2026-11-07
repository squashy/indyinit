import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import * as path from "node:path";
import { engine } from "../src/engine/engine.ts";
import { bindBattle } from "../src/ui/battle.ts";
import type { ChoiceLetter, CountyId, GameState, MapPack, QuestionId, QuizPack, QuizQuestion, RngSnapshot } from "../src/types.ts";
import { displayedChoices, prepareQuestion } from "../src/quiz/quiz.ts";
import { createDocument, DomButton, installDom, useDocument, type DomDocument } from "./ui-dom.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const adams = "18001" as CountyId;
const allen = "18003" as CountyId;

test("prepareQuestion stays on the selected county and keeps the correct letter after the shuffle", () => {
  const pack = packOf(adams, allen);
  const pending = prepareQuestion(adams, pack, [], 1, () => 0);
  assert.ok(pending);
  assert.equal(pending.countyId, adams);
  assert.equal(pending.turnSequence, 1);
  const question = pack.counties[adams]?.find((item) => item.id === pending.questionId);
  assert.ok(question);
  assert.equal(question.countyName, "Adams");
  assert.equal(question.prompt.includes(question.countyName), true);
  assert.deepEqual([...pending.choiceOrder].sort(), ["A", "B", "C", "D"]);
  const shown = displayedChoices(question, pending.choiceOrder);
  shown.forEach((text) => {
    assert.equal(typeof text, "string");
    assert.equal(text.includes("<"), false);
  });
  const correctIndex = pending.choiceOrder.indexOf(question.correctLetter);
  assert.equal(shown[correctIndex], question.correctAnswer);
  assert.equal("bonus" in question, false);
});

test("questions are not repeated until that county's pool is exhausted", () => {
  const pack = packOf(adams, allen);
  const first = prepareQuestion(adams, pack, [], 1, () => 0);
  assert.ok(first);
  const second = prepareQuestion(adams, pack, [first.questionId], 2, () => 0);
  assert.ok(second);
  assert.notEqual(second.questionId, first.questionId);
  const third = prepareQuestion(adams, pack, [first.questionId, second.questionId], 3, () => 0);
  assert.ok(third);
  assert.equal(third.countyId, adams);
});

test("corrected keys stay pinned for questions 45, 289, and 356", () => {
  const pack = JSON.parse(readFileSync(path.join(root, "data", "quiz.json"), "utf8")) as QuizPack;
  const byId = new Map<string, QuizQuestion>();
  for (const questions of Object.values(pack.counties)) {
    for (const question of questions) byId.set(question.id, question);
  }
  const expected: readonly { id: string; letter: ChoiceLetter; answer: string }[] = [
    { id: "45", letter: "D", answer: "Commissioner of Patents" },
    { id: "289", letter: "A", answer: "A member of the U.S. House" },
    { id: "356", letter: "A", answer: "Andrew Wylie" },
  ];
  for (const item of expected) {
    const question = byId.get(item.id);
    assert.ok(question, item.id);
    assert.equal(question.choices[item.letter], item.answer);
    assert.equal(question.correctLetter, item.letter);
    assert.equal(question.correctAnswer, item.answer);
  }
});

test("a county with no questions returns null and does not draw", () => {
  const pack = packOf(adams, allen);
  const rng = sequence(0.25);
  const before = rng.snapshot().draws;
  assert.equal(prepareQuestion(allen, { ...pack, counties: { ...pack.counties, [allen]: [] } }, [], 1, () => rng.draw()), null);
  assert.equal(rng.snapshot().draws, before);
});

function packOf(first: CountyId, second: CountyId): QuizPack {
  return {
    version: 1,
    mapDigest: "test",
    sourceDigest: "test",
    counties: {
      [first]: [question(first, "Adams", "a"), question(first, "Adams", "b")],
      [second]: [question(second, "Allen", "a")],
    },
  };
}

function question(countyId: CountyId, countyName: string, suffix: string): QuizQuestion {
  return {
    kind: "multipleChoice",
    id: `${countyId}-${suffix}` as QuestionId,
    countyId,
    countyName,
    countySeat: "Seat",
    established: 1816,
    namedFor: "Name",
    category: "history",
    prompt: `Which seat belongs to ${countyName}?`,
    choices: { A: "Seat", B: "Other", C: "Third", D: "Fourth" },
    correctLetter: "A",
    correctAnswer: "Seat",
    explanation: `${countyName} keeps the supplied explanation.`,
  };
}

test("the loss sentence matches the latest roll when a later roll captures", () => {
  installDom();
  const doc = createDocument();
  useDocument(doc);
  doc.documentElement.append(lossShell(doc));
  const draws = [0, 0, 0.99, 0];
  let cursor = 0;
  const live = { state: lossState() };
  const battle = bindBattle(doc as unknown as Document, (action) => {
    const result = engine.reduce(live.state, action, () => draws[cursor++] ?? 0);
    if (!result.ok) return false;
    live.state = result.state;
    battle.show(live.state);
    return true;
  }, {
    show() {},
    selected: () => null,
    source: () => county("99001"),
    target: () => county("99002"),
  });
  battle.show(live.state);
  const roll = (): void => {
    const button = doc.querySelector(".dice-actions button");
    if (!(button instanceof DomButton)) throw new Error("roll button missing");
    button.click();
  };
  roll();
  assert.match(doc.querySelector(".battle-outcome")?.textContent ?? "", /Attacker lost 1/);
  assert.match(doc.querySelector(".battle-outcome")?.textContent ?? "", /Defender lost 0/);
  roll();
  assert.equal(live.state.phase.kind, "occupy");
  assert.match(doc.querySelector(".attack-dice")?.textContent ?? "", /Attack dice 6/);
  assert.match(doc.querySelector(".defend-dice")?.textContent ?? "", /Defend dice 1/);
  const text = doc.querySelector(".battle-outcome")?.textContent ?? "";
  assert.match(text, /Attacker lost 0/);
  assert.match(text, /Defender lost 1/);
  assert.match(doc.querySelector("#occupy-dialog")?.textContent ?? "", /Defender lost 1/);
});

test("the seat 2 pattern stays inside the production image policy", () => {
  const css = readFileSync(path.join(root, "src/styles/theme.css"), "utf8");
  const start = css.indexOf('.player-swatch[data-owner="1"]');
  const end = css.indexOf('.player-swatch[data-owner="2"]');
  const rule = css.slice(start, end);
  assert.equal(rule.includes("data:"), false);
  assert.equal(/url\s*\(/i.test(rule), false);
  assert.match(rule, /background-image/);
  const policy = JSON.parse(readFileSync(path.join(root, "vercel.json"), "utf8")) as {
    headers: { headers: { key: string; value: string }[] }[];
  };
  const csp = policy.headers.flatMap((group) => group.headers).find((header) => header.key === "Content-Security-Policy");
  assert.ok(csp);
  assert.match(csp.value, /img-src 'self'/);
  assert.equal(csp.value.includes("data:"), false);
});

function lossShell(doc: DomDocument): ReturnType<DomDocument["createElement"]> {
  const shell = doc.createElement("div");
  const battle = doc.createElement("section");
  battle.id = "battle-dialog";
  battle.hidden = true;
  for (const name of ["battle-matchup", "attack-dice", "defend-dice", "battle-outcome"]) {
    const line = doc.createElement("p");
    line.className = name;
    battle.append(line);
  }
  const occupy = doc.createElement("section");
  occupy.id = "occupy-dialog";
  occupy.hidden = true;
  const form = doc.createElement("form");
  form.className = "occupy-form";
  const input = doc.createElement("input");
  input.setAttribute("name", "occupy-count");
  const move = doc.createElement("button");
  move.className = "occupy-move";
  form.append(input, move);
  occupy.append(doc.createElement("p"), form);
  const endAttacks = doc.createElement("button");
  endAttacks.id = "end-attacks";
  shell.append(battle, occupy, endAttacks);
  return shell;
}

function lossState(): GameState {
  const map: MapPack = {
    version: 1,
    id: "indiana",
    digest: "loss-pair",
    viewBox: [0, 0, 2, 2],
    outline: "",
    counties: [
      { id: county("99001"), name: "County 99001", path: "", centroid: [0, 0], neighbors: [county("99002")], regionId: "north" as MapPack["regions"][number]["id"], facts: [] },
      { id: county("99002"), name: "County 99002", path: "", centroid: [0, 0], neighbors: [county("99001")], regionId: "north" as MapPack["regions"][number]["id"], facts: [] },
    ],
    regions: [],
  };
  return {
    version: 1,
    config: {
      players: [
        { id: 0, label: "One", kind: "human" },
        { id: 1, label: "Two", kind: "human" },
      ],
      mode: "total92",
      map,
      quiz: { version: 1, mapDigest: map.digest, sourceDigest: "none", counties: {} as QuizPack["counties"] },
    },
    activePlayer: 0,
    turnSequence: 2,
    holdings: [
      { countyId: county("99001"), owner: 0, armies: 4 },
      { countyId: county("99002"), owner: 1, armies: 1 },
    ],
    phase: { kind: "attack" },
    asked: [],
    events: [{ kind: "phase", phase: "attack", turnSequence: 2, player: 0 }],
  };
}

function county(id: string): CountyId {
  return id as CountyId;
}

function sequence(value: number) {
  let draws = 0;
  return {
    version: 1 as const,
    algorithm: "sequence",
    draw() {
      draws += 1;
      return value;
    },
    snapshot(): RngSnapshot {
      return { version: 1, algorithm: "sequence", seed: String(value), draws };
    },
    restore(snapshot: RngSnapshot) {
      draws = snapshot.draws;
    },
  };
}
