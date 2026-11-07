import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { importQuizText, quizPackJson } from "./import-quiz.ts";
import { parseMapPack } from "./parse-map.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = path.join(root, "factory", "fixtures", "quiz-sample.csv");

test("the fixture CSV becomes a pack bound to the final map digest", () => {
  const csvText = readFileSync(fixture, "utf8");
  assert.equal(csvText.charCodeAt(0), 0xfeff);
  assert.equal(csvText.includes("\r\n"), true);
  const map = parseMapPack(JSON.parse(readFileSync(path.join(root, "data", "regions", "in", "map.json"), "utf8")));
  const pack = importQuizText(csvText, map);
  assert.equal(pack.mapDigest, map.digest);
  assert.equal(pack.sourceDigest, createHash("sha256").update(csvText, "utf8").digest("hex"));
  assert.notEqual(pack.mapDigest, pack.sourceDigest);
  const adams = pack.counties["18001" as keyof typeof pack.counties];
  const allen = pack.counties["18003" as keyof typeof pack.counties];
  assert.equal(adams?.length, 2);
  assert.equal(allen?.length, 1);
  assert.equal(adams?.[1]?.correctLetter, "B");
  assert.equal(adams?.[1]?.correctAnswer, adams?.[1]?.choices.B);
  assert.equal(allen?.[0]?.correctLetter, "D");
  assert.equal(allen?.[0]?.choices.D, "Fort Wayne");
  assert.equal(adams?.[1]?.explanation?.includes("John Quincy Adams"), true);
  assert.equal(quizPackJson(pack), quizPackJson(importQuizText(csvText, map)));
});

test("the shipped quiz pack is the supplied file imported against the current map", () => {
  const csvText = readFileSync(path.join(root, "inputs", "battle-for-the-92-benchmark-1000_nokey.csv"), "utf8");
  const map = parseMapPack(JSON.parse(readFileSync(path.join(root, "data", "regions", "in", "map.json"), "utf8")));
  const imported = importQuizText(csvText, map);
  const shipped = readFileSync(path.join(root, "data", "quiz.json"), "utf8");
  assert.equal(shipped, quizPackJson(imported));
  const lists = Object.values(imported.counties);
  const questions = lists.reduce((total, items) => total + items.length, 0);
  const covered = lists.filter((items) => items.length > 0).length;
  assert.equal(questions, 1000);
  assert.equal(covered, map.counties.length);
  assert.equal(imported.mapDigest, map.digest);
  assert.equal(imported.sourceDigest, createHash("sha256").update(csvText, "utf8").digest("hex"));
});

test("the importer fails on a bad FIPS, a mismatched answer, a duplicate id, and a blank cell", () => {
  const map = parseMapPack(JSON.parse(readFileSync(path.join(root, "data", "regions", "in", "map.json"), "utf8")));
  assert.throws(() => importQuizText(sheet([{ FIPS: "99999" }]), map), /FIPS/);
  assert.throws(() => importQuizText(sheet([{ "Correct Letter": "Q" }]), map), /Correct Letter/);
  assert.throws(() => importQuizText(sheet([{ "Correct Answer": "Not the choice" }]), map), /Correct Answer/);
  assert.throws(() => importQuizText(sheet([{}, {}]), map), /question id repeats/);
  assert.throws(() => importQuizText(sheet([{ Question: "" }]), map), /blank/);
});

test("the command writes the pack bound to the map file", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "quiz-import-"));
  const out = path.join(directory, "quiz.json");
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "factory/import-quiz.ts", "--csv", fixture, "--map", "data/regions/in/map.json", "--out", out],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const written = JSON.parse(readFileSync(out, "utf8")) as { mapDigest: string; sourceDigest: string };
  const map = JSON.parse(readFileSync(path.join(root, "data", "regions", "in", "map.json"), "utf8")) as { digest: string };
  assert.equal(written.mapDigest, map.digest);
  assert.notEqual(written.sourceDigest, written.mapDigest);
});

const COLUMNS = [
  "Q#",
  "FIPS",
  "County",
  "County Seat",
  "Established",
  "Named For",
  "Category",
  "Question",
  "Choice A",
  "Choice B",
  "Choice C",
  "Choice D",
  "Correct Letter",
  "Correct Answer",
  "Explanation",
] as const;

function sheet(overrides: readonly Record<string, string>[]): string {
  const lines = overrides.map((patch) => {
    const cells: Record<string, string> = {
      "Q#": "q-1",
      FIPS: "18001",
      County: "Adams",
      "County Seat": "Decatur",
      Established: "1836",
      "Named For": "John Quincy Adams",
      Category: "history",
      Question: "Which city is the seat of Adams?",
      "Choice A": "Decatur",
      "Choice B": "Berne",
      "Choice C": "Geneva",
      "Choice D": "Monroe",
      "Correct Letter": "A",
      "Correct Answer": "Decatur",
      Explanation: "Decatur is the seat.",
      ...patch,
    };
    return COLUMNS.map((column) => quote(cells[column] ?? "")).join(",");
  });
  return `\uFEFF${COLUMNS.join(",")}\r\n${lines.join("\r\n")}\r\n`;
}

function quote(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}
