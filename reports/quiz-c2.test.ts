import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkQuestion, checkShippedPack } from "../gates/quiz-check.ts";
import {
  FACTUAL_QA_DISCLOSURE,
  buildQuizC2Report,
  countiesInNameRange,
  mapCounties,
  quizC2Json,
  repoRootFromModule,
  trackedPackRevision,
  type QuizC2Report,
} from "./quiz-c2.ts";

const root = repoRootFromModule(import.meta.url);
const PACK_PATH = "data/quiz.json";
const MAP_PATH = "data/regions/in/map.json";
const CSV_PATH = "inputs/battle-for-the-92-benchmark-1000_nokey.csv";
const REPORT_PATH = "reports/quiz-c2.json";
const PR9_SOURCE_DIGEST = "12ecc69109decb249faeafbf558a45b48d82e4e4efb4e9d8cda0dc613ddfee5a";
const PACK_REVISION = "86d2f98635b75f47576d7f6500f3cb7c92105535";

const RANGE: readonly (readonly [string, string])[] = [
  ["Johnson", "18081"],
  ["Knox", "18083"],
  ["Kosciusko", "18085"],
  ["LaGrange", "18087"],
  ["LaPorte", "18091"],
  ["Lake", "18089"],
  ["Lawrence", "18093"],
  ["Madison", "18095"],
  ["Marion", "18097"],
  ["Marshall", "18099"],
  ["Martin", "18101"],
  ["Miami", "18103"],
  ["Monroe", "18105"],
  ["Montgomery", "18107"],
  ["Morgan", "18109"],
  ["Newton", "18111"],
  ["Noble", "18113"],
  ["Ohio", "18115"],
  ["Orange", "18117"],
  ["Owen", "18119"],
  ["Parke", "18121"],
  ["Perry", "18123"],
  ["Pike", "18125"],
  ["Porter", "18127"],
  ["Posey", "18129"],
  ["Pulaski", "18131"],
  ["Putnam", "18133"],
  ["Randolph", "18135"],
  ["Ripley", "18137"],
  ["Rush", "18139"],
  ["Scott", "18143"],
  ["Shelby", "18145"],
  ["Spencer", "18147"],
  ["St. Joseph", "18141"],
  ["Starke", "18149"],
  ["Steuben", "18151"],
  ["Sullivan", "18153"],
  ["Switzerland", "18155"],
  ["Tippecanoe", "18157"],
  ["Tipton", "18159"],
  ["Union", "18161"],
  ["Vanderburgh", "18163"],
  ["Vermillion", "18165"],
  ["Vigo", "18167"],
  ["Wabash", "18169"],
  ["Warren", "18171"],
  ["Warrick", "18173"],
  ["Washington", "18175"],
  ["Wayne", "18177"],
  ["Wells", "18179"],
  ["White", "18181"],
  ["Whitley", "18183"],
];

test("the map span is Johnson through Whitley and stops at the neighboring names", () => {
  const map = readJson(MAP_PATH);
  const counties = mapCounties(map).counties;
  const ordered = [...counties].sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : left.fips < right.fips ? -1 : 1));
  const start = ordered.findIndex((county) => county.name === "Johnson");
  const end = ordered.findIndex((county) => county.name === "Whitley");
  assert.equal(ordered[start - 1]?.name, "Jennings");
  assert.equal(ordered[end]?.name, "Whitley");
  assert.equal(ordered[end + 1], undefined);
  assert.deepEqual(
    countiesInNameRange(counties).map((county) => [county.name, county.fips]),
    RANGE,
  );
  assert.equal(RANGE.length, 52);
  assert.equal(RANGE.some(([name]) => name === "Jennings" || name === "Adams"), false);
});

test("the tracked pack report matches an independent count and keeps the PR 9 digest", () => {
  const pack = readJson(PACK_PATH);
  const map = readJson(MAP_PATH);
  const report = realReport();
  assert.equal(report.input.revision, PACK_REVISION);
  assert.equal(trackedPackRevision(root), PACK_REVISION);
  assert.equal(report.input.sourceDigest, packRecord(pack).sourceDigest);
  assert.equal(report.input.sourceDigest, PR9_SOURCE_DIGEST);
  assert.equal(sha(path.join(root, CSV_PATH)), PR9_SOURCE_DIGEST);
  assert.equal(report.input.mapDigest, packRecord(pack).mapDigest);
  assert.equal(report.input.packPath, PACK_PATH);
  assert.equal(report.factualQa.status, "deferred");
  assert.equal(report.factualQa.disclosure, FACTUAL_QA_DISCLOSURE);
  assert.equal(report.minima, "not applied");
  assert.equal(report.diagnostics.minimaEnforced, true);
  assert.equal(report.diagnostics.coverage.minimaEnforced, true);
  assert.equal(report.diagnostics.historicalFactCheck, "not-run");
  assert.equal(report.diagnostics.coverage.historicalFactCheck, "not-run");
  assert.deepEqual(
    report.counties.map((county) => [county.name, county.fips]),
    RANGE,
  );

  const packCounties = asRecord(packRecord(pack).counties);
  let questions = 0;
  let choices = 0;
  const categories = new Set<string>();
  for (const [name, fips] of RANGE) {
    const list = packCounties[fips];
    assert.ok(Array.isArray(list), `${name} is missing from the pack`);
    const row = report.counties.find((county) => county.fips === fips);
    assert.ok(row);
    assert.equal(row.questions, list.length);
    assert.equal(row.missing, false);
    questions += list.length;
    for (const value of list) {
      const question = asRecord(value);
      assert.equal(question.countyName, name);
      assert.equal(question.countyId, fips);
      if (typeof question.category === "string" && question.category.length > 0) categories.add(question.category);
      const choiceRecord = asRecord(question.choices);
      for (const letter of ["A", "B", "C", "D"]) {
        const text = choiceRecord[letter];
        if (typeof text === "string" && text.length > 0) choices += 1;
      }
      assert.deepEqual(checkQuestion(value), []);
    }
  }
  assert.equal(questions, 573);
  assert.equal(choices, 2292);
  assert.deepEqual([...categories].sort(), ["history", "landmark", "namesake", "people", "seat"]);
  assert.equal(report.summary.countiesInRange, 52);
  assert.equal(report.summary.countiesWithQuestions, 52);
  assert.equal(report.summary.countiesMissing, 0);
  assert.equal(report.summary.questions, questions);
  assert.equal(report.summary.choices, choices);
  assert.equal(report.summary.categoryCount, 5);
  assert.deepEqual(report.summary.categories, ["history", "landmark", "namesake", "people", "seat"]);
  assert.equal(report.summary.malformedQuestions, 0);
  assert.equal(report.summary.misfiled, 0);
  assert.equal(report.summary.diagnosticErrors, 0);
  assert.deepEqual(report.missing, []);
  assert.deepEqual(report.malformed, []);
  assert.deepEqual(report.misfiled, []);
  assert.equal(report.diagnostics.coverage.questions, questions);
  assert.equal(report.diagnostics.coverage.counties, 52);
  assert.equal(report.diagnostics.coverage.mapCountiesMissingFromPack, 0);
  assert.equal(report.structuralStatus, "no structural errors in range");
  assert.equal(existsSync(path.join(root, "public", "data", "quiz.json")), false);
});

test("a rerun is byte-for-byte stable and does not change the pack, map, or corrected CSV", () => {
  const before = [PACK_PATH, MAP_PATH, CSV_PATH].map((file) => sha(path.join(root, file)));
  const first = path.join(mkdtempSync(path.join(tmpdir(), "quiz-c2-")), "quiz-c2.json");
  const second = path.join(mkdtempSync(path.join(tmpdir(), "quiz-c2-")), "quiz-c2.json");
  runCli(first);
  runCli(second);
  const written = readFileSync(first, "utf8");
  assert.equal(written, readFileSync(second, "utf8"));
  assert.equal(written, readFileSync(path.join(root, REPORT_PATH), "utf8"));
  const again = quizC2Json(realReport());
  assert.equal(written, again);
  assert.deepEqual(JSON.parse(written), JSON.parse(again));
  const after = [PACK_PATH, MAP_PATH, CSV_PATH].map((file) => sha(path.join(root, file)));
  assert.deepEqual(after, before);
  const source = readFileSync(fileURLToPath(new URL("./quiz-c2.ts", import.meta.url)), "utf8");
  assert.equal(source.includes("parseQuizCsv"), false);
  assert.equal(source.includes("import-quiz"), false);
  assert.equal(source.includes("benchmark-1000"), false);
});

test("missing, malformed, and misfiled rows use the shared checker and do not invent questions", () => {
  const digest = "ab".repeat(32);
  const johnson = question({ id: "j-1", prompt: "A prompt that never says the county" });
  const pack = {
    version: 1,
    mapDigest: digest,
    sourceDigest: "cd".repeat(32),
    counties: {
      "18079": [question({ id: "j-1", countyId: "18079", countyName: "Jennings", prompt: "Where is Jennings?" })],
      "18081": [johnson],
      "18001": [question({ id: "other", countyId: "18001", countyName: "Johnson", prompt: "Where is Johnson?" })],
      "18183": [],
    },
  };
  const map = {
    digest,
    counties: [
      { id: "18001", name: "Adams" },
      { id: "18079", name: "Jennings" },
      { id: "18081", name: "Johnson" },
      { id: "18183", name: "Whitley" },
    ],
  };
  const report = buildQuizC2Report(pack, map, { packPath: PACK_PATH, mapPath: MAP_PATH, revision: PACK_REVISION });
  assert.deepEqual(
    report.counties.map((county) => county.name),
    ["Johnson", "Whitley"],
  );
  assert.equal(report.summary.questions, 1);
  assert.equal(report.counties[0]?.questions, 1);
  assert.equal(report.counties[1]?.questions, 0);
  assert.deepEqual(report.missing, [{ name: "Whitley", fips: "18183", reason: "no questions" }]);
  assert.deepEqual(report.malformed, [{ fips: "18081", questionId: "j-1", issues: checkQuestion(johnson).map(plain) }]);
  assert.deepEqual(report.misfiled, [
    { packFips: "18001", canonicalFips: "18081", questionId: "other", countyName: "Johnson" },
  ]);
  assert.equal(report.structuralStatus, "structural errors in range");
  assert.equal(report.factualQa.status, "deferred");
  const duplicate = checkShippedPack(pack, map).errors.find((error) => error.code === "duplicate-id");
  assert.ok(duplicate);
  assert.ok(report.diagnostics.errors.some((error) => error.code === "duplicate-id" && error.detail === duplicate.detail));
  assert.equal(JSON.stringify(report).includes("invented"), false);
});

test("a map missing an endpoint does not borrow a different county span", () => {
  const report = buildQuizC2Report(
    { version: 1, mapDigest: "ab".repeat(32), sourceDigest: "cd".repeat(32), counties: {} },
    { digest: "ab".repeat(32), counties: [{ id: "18081", name: "Johnson" }] },
    { packPath: PACK_PATH, mapPath: MAP_PATH, revision: null },
  );
  assert.deepEqual(report.counties, []);
  assert.equal(report.range.endpointsFound.Johnson, true);
  assert.equal(report.range.endpointsFound.Whitley, false);
  assert.equal(report.summary.questions, 0);
  assert.match(report.range.note ?? "", /does not substitute another range/);
});

function realReport(): QuizC2Report {
  return buildQuizC2Report(readJson(PACK_PATH), readJson(MAP_PATH), {
    packPath: PACK_PATH,
    mapPath: MAP_PATH,
    revision: trackedPackRevision(root),
  });
}

function runCli(out: string): void {
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", path.join(root, "reports", "quiz-c2.ts"), "--out", out],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function readJson(relative: string): unknown {
  return JSON.parse(readFileSync(path.join(root, relative), "utf8")) as unknown;
}

function packRecord(value: unknown): { sourceDigest: unknown; mapDigest: unknown; counties: unknown } {
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  return value as { sourceDigest: unknown; mapDigest: unknown; counties: unknown };
}

function asRecord(value: unknown): Record<string, unknown> {
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}

function sha(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function plain(error: { code: string; detail: string }): { code: string; detail: string } {
  return { code: error.code, detail: error.detail };
}

function question(patch: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "multipleChoice",
    id: "j-1",
    countyId: "18081",
    countyName: "Johnson",
    countySeat: "Franklin",
    established: 1823,
    namedFor: "John Johnson",
    category: "history",
    prompt: "Which seat serves Johnson?",
    choices: { A: "Franklin", B: "Greenwood", C: "Edinburgh", D: "Whiteland" },
    correctLetter: "A",
    correctAnswer: "Franklin",
    explanation: "Franklin is the seat.",
    ...patch,
  };
}
