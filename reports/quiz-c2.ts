/**
 * BTT-10 optional coverage report for Johnson through Whitley.
 * Reads the tracked quiz pack and the map county list. Structural issues come
 * from gates/quiz-check.ts. Does not parse CSV, write a quiz pack, or judge facts.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkQuestion, checkShippedPack, type CoverageReport, type QuizIssue } from "../gates/quiz-check.ts";

export const RANGE_FROM = "Johnson";
export const RANGE_THROUGH = "Whitley";
export const APPROVED_DESTINATION_NAME = "public/data/quiz.json";
export const PACKAGING_NOTE =
  "Consumed the tracked pack at data/quiz.json. The approved destination name public/data/quiz.json is unresolved. This report does not create that path, move the pack, or write a second pack.";
export const SOURCE_DIGEST_NOTE =
  "sourceDigest is copied from the tracked pack and is not recomputed. This report does not read or rewrite the CSV.";
export const FACTUAL_QA_DISCLOSURE =
  "Factual QA is deferred. This report counts imported QuizQuestion coverage for Johnson through Whitley. It does not check historical truth, author questions, convert or import CSV, or apply question, category, or choice quotas.";
export const COUNT_DEFINITIONS = {
  questions: "pack entries stored under each range county",
  categories: "distinct non-empty category strings on those entries",
  choices: "non-empty choice A, B, C, and D strings on those entries",
} as const;

const LETTERS = ["A", "B", "C", "D"] as const;
const PACK_DETAILS = new Set([
  "quiz pack is missing",
  "map pack is missing",
  "quiz pack version is not 1",
  "mapDigest is missing",
  "mapDigest does not match the map",
  "sourceDigest is missing",
  "counties is missing",
]);

export interface CountyRef {
  readonly fips: string;
  readonly name: string;
}

export interface QuizC2Input {
  readonly packPath: string;
  readonly mapPath: string;
  readonly revision: string | null;
}

interface Issue {
  readonly code: string;
  readonly detail: string;
}

interface MalformedEntry {
  readonly fips: string;
  readonly questionId: string;
  readonly issues: readonly Issue[];
}

interface MisfiledEntry {
  readonly packFips: string;
  readonly canonicalFips: string;
  readonly questionId: string;
  readonly countyName: string;
}

interface MissingEntry {
  readonly name: string;
  readonly fips: string;
  readonly reason: "absent from pack" | "questions are not an array" | "no questions";
}

interface CountyRow {
  readonly name: string;
  readonly fips: string;
  readonly questions: number;
  readonly categories: readonly string[];
  readonly categoryCount: number;
  readonly choices: number;
  readonly missing: boolean;
  readonly missingReason: MissingEntry["reason"] | null;
  readonly malformedQuestionIds: readonly string[];
}

export interface QuizC2Report {
  readonly ticket: "BTT-10";
  readonly kind: "structural-coverage";
  readonly range: {
    readonly from: typeof RANGE_FROM;
    readonly through: typeof RANGE_THROUGH;
    readonly order: "map county name, UTF-16 code unit ascending, then FIPS";
    readonly endpointsFound: { readonly Johnson: boolean; readonly Whitley: boolean };
    readonly counties: number;
    readonly note: string | null;
  };
  readonly input: {
    readonly packPath: string;
    readonly mapPath: string;
    readonly approvedDestinationName: typeof APPROVED_DESTINATION_NAME;
    readonly packaging: typeof PACKAGING_NOTE;
    readonly revision: string | null;
    readonly revisionPath: "data/quiz.json";
    readonly revisionMeaning: "git commit that last changed data/quiz.json; null when git cannot resolve it";
    readonly sourceDigest: string | null;
    readonly mapDigest: string | null;
    readonly sourceDigestNote: typeof SOURCE_DIGEST_NOTE;
    readonly mapIssues: readonly string[];
  };
  readonly factualQa: {
    readonly status: "deferred";
    readonly disclosure: typeof FACTUAL_QA_DISCLOSURE;
  };
  readonly minima: "not applied";
  readonly countDefinitions: typeof COUNT_DEFINITIONS;
  readonly summary: {
    readonly countiesInRange: number;
    readonly countiesWithQuestions: number;
    readonly countiesMissing: number;
    readonly questions: number;
    readonly categories: readonly string[];
    readonly categoryCount: number;
    readonly choices: number;
    readonly malformedQuestions: number;
    readonly misfiled: number;
    readonly diagnosticErrors: number;
  };
  readonly structuralStatus: "no structural errors in range" | "structural errors in range";
  readonly diagnostics: {
    readonly checker: "gates/quiz-check.ts checkShippedPack";
    readonly scope: "pack-level failures, Johnson through Whitley entries, and range question ids repeated outside the range";
    readonly minimaNote: "The shipped pack gate rejects a county under 4 questions, under 3 categories, or with a seat and no matching answer. This report does not check facts.";
    readonly minimaEnforced: boolean;
    readonly historicalFactCheck: "not-run";
    readonly ledger: "not-implemented";
    readonly errors: readonly Issue[];
    readonly coverage: CoverageReport;
  };
  readonly missing: readonly MissingEntry[];
  readonly malformed: readonly MalformedEntry[];
  readonly misfiled: readonly MisfiledEntry[];
  readonly counties: readonly CountyRow[];
}

export function compareCounties(left: CountyRef, right: CountyRef): number {
  if (left.name < right.name) return -1;
  if (left.name > right.name) return 1;
  if (left.fips < right.fips) return -1;
  if (left.fips > right.fips) return 1;
  return 0;
}

export function mapCounties(mapValue: unknown): { counties: CountyRef[]; issues: string[] } {
  const map = asRecord(mapValue);
  if (!map) return { counties: [], issues: ["map pack is missing"] };
  if (!Array.isArray(map.counties)) return { counties: [], issues: ["map counties are missing"] };
  const counties: CountyRef[] = [];
  const issues: string[] = [];
  map.counties.forEach((value, index) => {
    const county = asRecord(value);
    const fips = county && typeof county.id === "string" ? county.id : "";
    const name = county && typeof county.name === "string" ? county.name : "";
    if (!fips || !name) {
      issues.push(`map counties[${index}] is missing an id or name`);
      return;
    }
    counties.push({ fips, name });
  });
  return { counties, issues };
}

export function countiesInNameRange(counties: readonly CountyRef[]): CountyRef[] {
  const ordered = [...counties].sort(compareCounties);
  const start = ordered.findIndex((county) => county.name === RANGE_FROM);
  const end = lastNameIndex(ordered, RANGE_THROUGH);
  if (start < 0 || end < start) return [];
  return ordered.slice(start, end + 1);
}

export function buildQuizC2Report(packValue: unknown, mapValue: unknown, input: QuizC2Input): QuizC2Report {
  const pack = asRecord(packValue);
  const map = asRecord(mapValue);
  const read = mapCounties(mapValue);
  const range = countiesInNameRange(read.counties);
  const endpointsFound = {
    Johnson: read.counties.some((county) => county.name === RANGE_FROM),
    Whitley: read.counties.some((county) => county.name === RANGE_THROUGH),
  };
  const rangeFips = new Set(range.map((county) => county.fips));
  const canonicalByName = uniqueNames(range);
  const packCounties = pack ? asRecord(pack.counties) : null;
  const questionIds = questionIdsInRange(packCounties, rangeFips);
  const slicedCounties: Record<string, unknown> = {};
  if (packCounties) {
    for (const county of range) {
      if (Object.prototype.hasOwnProperty.call(packCounties, county.fips)) slicedCounties[county.fips] = packCounties[county.fips];
    }
  }
  const full = checkShippedPack(packValue, mapValue);
  const slice = checkShippedPack(
    pack
      ? { version: pack.version, mapDigest: pack.mapDigest, sourceDigest: pack.sourceDigest, counties: slicedCounties }
      : packValue,
    { digest: map?.digest, counties: range.map((county) => ({ id: county.fips, name: county.name })) },
  );
  const errors = dedupe([
    ...full.errors.filter((error) => relevant(error.detail, rangeFips, questionIds)),
    ...slice.errors,
  ]).map(plainIssue);

  const rows: CountyRow[] = [];
  const missing: MissingEntry[] = [];
  const malformed: MalformedEntry[] = [];
  const categories = new Set<string>();
  let questions = 0;
  let choices = 0;
  for (const county of range) {
    const list = countyList(packCounties, county.fips);
    if (list.kind !== "present" || list.questions.length === 0) {
      const reason = list.kind === "present" ? "no questions" : list.kind;
      missing.push({ name: county.name, fips: county.fips, reason });
      rows.push(emptyRow(county, reason));
      continue;
    }
    const countyCategories = new Set<string>();
    const malformedIds: string[] = [];
    let countyChoices = 0;
    for (const value of list.questions) {
      questions += 1;
      const record = asRecord(value);
      const id = entryId(record);
      if (record && typeof record.category === "string" && record.category.length > 0) {
        categories.add(record.category);
        countyCategories.add(record.category);
      }
      countyChoices += countChoices(record);
      const issues = checkQuestion(value).map(plainIssue);
      if (issues.length > 0) {
        malformedIds.push(id);
        malformed.push({ fips: county.fips, questionId: id, issues });
      }
    }
    choices += countyChoices;
    const sortedCategories = [...countyCategories].sort(compareText);
    rows.push({
      name: county.name,
      fips: county.fips,
      questions: list.questions.length,
      categories: sortedCategories,
      categoryCount: sortedCategories.length,
      choices: countyChoices,
      missing: false,
      missingReason: null,
      malformedQuestionIds: malformedIds,
    });
  }
  const misfiled = misfiledEntries(packCounties, canonicalByName);
  const sortedCategories = [...categories].sort(compareText);
  const withQuestions = rows.filter((county) => county.questions > 0).length;
  return {
    ticket: "BTT-10",
    kind: "structural-coverage",
    range: {
      from: RANGE_FROM,
      through: RANGE_THROUGH,
      order: "map county name, UTF-16 code unit ascending, then FIPS",
      endpointsFound,
      counties: range.length,
      note:
        endpointsFound.Johnson && endpointsFound.Whitley
          ? null
          : "Johnson or Whitley is not on the map, so this report has no county span and does not substitute another range.",
    },
    input: {
      packPath: input.packPath,
      mapPath: input.mapPath,
      approvedDestinationName: APPROVED_DESTINATION_NAME,
      packaging: PACKAGING_NOTE,
      revision: input.revision,
      revisionPath: "data/quiz.json",
      revisionMeaning: "git commit that last changed data/quiz.json; null when git cannot resolve it",
      sourceDigest: pack && typeof pack.sourceDigest === "string" ? pack.sourceDigest : null,
      mapDigest: pack && typeof pack.mapDigest === "string" ? pack.mapDigest : null,
      sourceDigestNote: SOURCE_DIGEST_NOTE,
      mapIssues: read.issues,
    },
    factualQa: { status: "deferred", disclosure: FACTUAL_QA_DISCLOSURE },
    minima: "not applied",
    countDefinitions: COUNT_DEFINITIONS,
    summary: {
      countiesInRange: range.length,
      countiesWithQuestions: withQuestions,
      countiesMissing: missing.length,
      questions,
      categories: sortedCategories,
      categoryCount: sortedCategories.length,
      choices,
      malformedQuestions: malformed.length,
      misfiled: misfiled.length,
      diagnosticErrors: errors.length,
    },
    structuralStatus:
      errors.length === 0 && malformed.length === 0 && misfiled.length === 0 && missing.length === 0
        ? "no structural errors in range"
        : "structural errors in range",
    diagnostics: {
      checker: "gates/quiz-check.ts checkShippedPack",
      scope: "pack-level failures, Johnson through Whitley entries, and range question ids repeated outside the range",
      minimaNote: "The shipped pack gate rejects a county under 4 questions, under 3 categories, or with a seat and no matching answer. This report does not check facts.",
      minimaEnforced: slice.coverage.minimaEnforced,
      historicalFactCheck: "not-run",
      ledger: "not-implemented",
      errors,
      coverage: slice.coverage,
    },
    missing,
    malformed,
    misfiled,
    counties: rows,
  };
}

export function quizC2Json(report: QuizC2Report): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function trackedPackRevision(root: string): string | null {
  try {
    const sha = execFileSync("git", ["log", "-1", "--format=%H", "--", "data/quiz.json"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return /^[0-9a-f]{40}$/.test(sha) ? sha : null;
  } catch {
    return null;
  }
}

export function repoRootFromModule(moduleUrl: string): string {
  return path.resolve(path.dirname(fileURLToPath(moduleUrl)), "..");
}

function misfiledEntries(counties: Record<string, unknown> | null, canonicalByName: ReadonlyMap<string, string>): MisfiledEntry[] {
  if (!counties) return [];
  const misfiled: MisfiledEntry[] = [];
  for (const [packFips, list] of Object.entries(counties)) {
    if (!Array.isArray(list)) continue;
    for (const value of list) {
      const record = asRecord(value);
      const countyName = record && typeof record.countyName === "string" ? record.countyName : "";
      const canonicalFips = canonicalByName.get(countyName);
      if (!canonicalFips || canonicalFips === packFips) continue;
      misfiled.push({ packFips, canonicalFips, questionId: entryId(record), countyName });
    }
  }
  return misfiled;
}

function questionIdsInRange(counties: Record<string, unknown> | null, rangeFips: ReadonlySet<string>): Set<string> {
  const ids = new Set<string>();
  if (!counties) return ids;
  for (const fips of rangeFips) {
    const list = counties[fips];
    if (!Array.isArray(list)) continue;
    for (const value of list) {
      const record = asRecord(value);
      if (record && typeof record.id === "string" && record.id.length > 0) ids.add(record.id);
    }
  }
  return ids;
}

function countyList(
  counties: Record<string, unknown> | null,
  fips: string,
): { kind: "absent from pack" } | { kind: "questions are not an array" } | { kind: "present"; questions: readonly unknown[] } {
  if (!counties || !Object.prototype.hasOwnProperty.call(counties, fips)) return { kind: "absent from pack" };
  const list = counties[fips];
  if (!Array.isArray(list)) return { kind: "questions are not an array" };
  return { kind: "present", questions: list };
}

function emptyRow(county: CountyRef, reason: MissingEntry["reason"]): CountyRow {
  return {
    name: county.name,
    fips: county.fips,
    questions: 0,
    categories: [],
    categoryCount: 0,
    choices: 0,
    missing: true,
    missingReason: reason,
    malformedQuestionIds: [],
  };
}

function uniqueNames(counties: readonly CountyRef[]): Map<string, string> {
  const seen = new Map<string, string>();
  const duplicate = new Set<string>();
  for (const county of counties) {
    const prior = seen.get(county.name);
    if (prior && prior !== county.fips) duplicate.add(county.name);
    else seen.set(county.name, county.fips);
  }
  for (const name of duplicate) seen.delete(name);
  return seen;
}

function countChoices(question: Record<string, unknown> | null): number {
  const choices = question ? asRecord(question.choices) : null;
  if (!choices) return 0;
  let count = 0;
  for (const letter of LETTERS) {
    const text = choices[letter];
    if (typeof text === "string" && text.length > 0) count += 1;
  }
  return count;
}

function relevant(detail: string, rangeFips: ReadonlySet<string>, questionIds: ReadonlySet<string>): boolean {
  if (PACK_DETAILS.has(detail)) return true;
  const head = detail.split(":")[0] ?? "";
  if (questionIds.has(head) || rangeFips.has(head)) return true;
  for (const fips of rangeFips) {
    if (detail.startsWith(`${fips} `)) return true;
  }
  return false;
}

function dedupe(errors: readonly QuizIssue[]): QuizIssue[] {
  const seen = new Set<string>();
  const unique: QuizIssue[] = [];
  for (const error of errors) {
    const key = `${error.code}\n${error.detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(error);
  }
  return unique;
}

function plainIssue(error: QuizIssue): Issue {
  return { code: error.code, detail: error.detail };
}

function entryId(question: Record<string, unknown> | null): string {
  return question && typeof question.id === "string" && question.id.length > 0 ? question.id : "(missing id)";
}

function lastNameIndex(counties: readonly CountyRef[], name: string): number {
  for (let index = counties.length - 1; index >= 0; index -= 1) {
    if (counties[index]?.name === name) return index;
  }
  return -1;
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function main(): void {
  const args = readArgs(process.argv.slice(2));
  const root = repoRootFromModule(import.meta.url);
  const packPath = path.resolve(args.pack ?? path.join(root, "data", "quiz.json"));
  const mapPath = path.resolve(args.map ?? path.join(root, "data", "regions", "in", "map.json"));
  const outPath = path.resolve(args.out ?? path.join(root, "reports", "quiz-c2.json"));
  const report = buildQuizC2Report(JSON.parse(readFileSync(packPath, "utf8")) as unknown, JSON.parse(readFileSync(mapPath, "utf8")) as unknown, {
    packPath: repoPath(root, packPath),
    mapPath: repoPath(root, mapPath),
    revision: args.revision ?? trackedPackRevision(root),
  });
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, quizC2Json(report));
  const summary = report.summary;
  console.log(
    `${repoPath(root, outPath)}: ${summary.countiesInRange} counties, ${summary.questions} questions, ${summary.categoryCount} categories, ${summary.choices} choices, missing ${summary.countiesMissing}, malformed ${summary.malformedQuestions}`,
  );
}

function repoPath(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join("/");
}

function readArgs(argv: readonly string[]): { pack?: string; map?: string; out?: string; revision?: string } {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag || !value || !flag.startsWith("--")) throw new Error(usage());
    if (flag !== "--pack" && flag !== "--map" && flag !== "--out" && flag !== "--revision") throw new Error(usage());
    values.set(flag, value);
  }
  return {
    ...(values.has("--pack") ? { pack: values.get("--pack") } : {}),
    ...(values.has("--map") ? { map: values.get("--map") } : {}),
    ...(values.has("--out") ? { out: values.get("--out") } : {}),
    ...(values.has("--revision") ? { revision: values.get("--revision") } : {}),
  };
}

function usage(): string {
  return "usage: quiz-c2 [--pack data/quiz.json] [--map data/regions/in/map.json] [--out reports/quiz-c2.json] [--revision <sha>]";
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(path.resolve(entry)).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "quiz c2 report failed");
    process.exit(1);
  }
}
