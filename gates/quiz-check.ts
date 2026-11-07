import { readFileSync, readdirSync } from "node:fs";
import * as path from "node:path";

export interface QuizIssue {
  readonly code: "shape" | "digest" | "duplicate-id" | "choices" | "correct-letter" | "county-name" | "html" | "county-id";
  readonly detail: string;
}

export interface CoverageReport {
  readonly counties: number;
  readonly questions: number;
  readonly minQuestions: number;
  readonly maxQuestions: number;
  readonly countiesUnderFour: number;
  readonly countiesUnderThreeCategories: number;
  readonly countiesWithoutSeatAnswer: number;
  readonly mapCountiesMissingFromPack: number;
  readonly minimaEnforced: false;
  readonly ledger: "not-implemented";
  readonly historicalFactCheck: "not-run";
}

export interface QuizCheckResult {
  readonly errors: readonly QuizIssue[];
  readonly coverage: CoverageReport;
}

const LETTERS = ["A", "B", "C", "D"] as const;
type Letter = (typeof LETTERS)[number];

const TEXT_FIELDS = ["prompt", "explanation", "countyName", "countySeat", "namedFor", "category", "correctAnswer"] as const;

export function checkQuestion(value: unknown): readonly QuizIssue[] {
  const question = asRecord(value);
  if (!question) return [{ code: "shape", detail: "question is missing" }];
  const id = typeof question.id === "string" && question.id.length > 0 ? question.id : "(missing id)";
  const issues: QuizIssue[] = [];
  const choices = asRecord(question.choices);
  const texts: string[] = [];
  if (!choices) {
    issues.push(issue(id, "choices", "four choices are missing"));
  } else {
    for (const letter of LETTERS) {
      const text = choices[letter];
      if (typeof text !== "string" || text.length === 0) issues.push(issue(id, "choices", `choice ${letter} is missing`));
      else texts.push(text);
    }
    if (texts.length === 4 && new Set(texts).size !== 4) issues.push(issue(id, "choices", "choices are not unique"));
  }
  const letter = question.correctLetter;
  if (typeof letter !== "string" || !isLetter(letter)) {
    issues.push(issue(id, "correct-letter", "correct letter is not A, B, C, or D"));
  } else if (choices && choices[letter] !== question.correctAnswer) {
    issues.push(issue(id, "correct-letter", `correct answer does not match choice ${letter}`));
  }
  const countyName = question.countyName;
  const prompt = question.prompt;
  if (typeof countyName !== "string" || countyName.length === 0) issues.push(issue(id, "county-name", "county name is missing"));
  else if (typeof prompt !== "string" || !prompt.includes(countyName)) issues.push(issue(id, "county-name", "prompt does not name the county"));
  for (const field of TEXT_FIELDS) {
    const text = question[field];
    if (typeof text === "string" && text.includes("<")) issues.push(issue(id, "html", `${field} contains HTML`));
  }
  for (const text of texts) {
    if (text.includes("<")) issues.push(issue(id, "html", "choice contains HTML"));
  }
  return issues;
}

export function checkShippedPack(packValue: unknown, mapValue: unknown): QuizCheckResult {
  const errors: QuizIssue[] = [];
  const pack = asRecord(packValue);
  const map = asRecord(mapValue);
  const mapCounties = readMapCounties(map);
  if (!pack) errors.push({ code: "shape", detail: "quiz pack is missing" });
  if (!map || !mapCounties) errors.push({ code: "shape", detail: "map pack is missing" });
  if (pack && pack.version !== 1) errors.push({ code: "shape", detail: "quiz pack version is not 1" });
  if (pack && (typeof pack.mapDigest !== "string" || !/^[0-9a-f]{64}$/.test(pack.mapDigest))) {
    errors.push({ code: "digest", detail: "mapDigest is missing" });
  } else if (pack && map && pack.mapDigest !== map.digest) {
    errors.push({ code: "digest", detail: "mapDigest does not match the map" });
  }
  if (pack && (typeof pack.sourceDigest !== "string" || !/^[0-9a-f]{64}$/.test(pack.sourceDigest))) {
    errors.push({ code: "digest", detail: "sourceDigest is missing" });
  }
  const counties = pack ? asRecord(pack.counties) : null;
  if (pack && !counties) errors.push({ code: "shape", detail: "counties is missing" });
  const seen = new Set<string>();
  const present = new Set<string>();
  const perCounty: { questions: number; categories: number; seatAnswer: boolean }[] = [];
  if (counties) {
    for (const [countyId, list] of Object.entries(counties)) {
      present.add(countyId);
      if (mapCounties && !mapCounties.has(countyId)) errors.push({ code: "county-id", detail: `${countyId} is not on the map` });
      if (!Array.isArray(list)) {
        errors.push({ code: "shape", detail: `${countyId}: questions are missing` });
        perCounty.push({ questions: 0, categories: 0, seatAnswer: false });
        continue;
      }
      const categories = new Set<string>();
      let seatAnswer = false;
      for (const value of list) {
        const question = asRecord(value);
        if (question && typeof question.id === "string") {
          if (seen.has(question.id)) errors.push({ code: "duplicate-id", detail: `${question.id}: question id repeats` });
          seen.add(question.id);
        }
        if (question && question.countyId !== countyId) errors.push({ code: "county-id", detail: `${countyId}: county id does not match the pack key` });
        const mapName = mapCounties?.get(countyId);
        if (question && mapName && question.countyName !== mapName) {
          errors.push({ code: "county-name", detail: `${countyId}: county name does not match the map` });
        }
        errors.push(...checkQuestion(value));
        if (question && typeof question.category === "string") categories.add(question.category);
        if (question && typeof question.countySeat === "string" && question.correctAnswer === question.countySeat) seatAnswer = true;
      }
      perCounty.push({ questions: list.length, categories: categories.size, seatAnswer });
    }
  }
  const lengths = perCounty.map((county) => county.questions);
  const missing = mapCounties ? [...mapCounties.keys()].filter((id) => !present.has(id)).length : 0;
  return {
    errors,
    coverage: {
      counties: perCounty.length,
      questions: lengths.reduce((total, count) => total + count, 0),
      minQuestions: lengths.length > 0 ? Math.min(...lengths) : 0,
      maxQuestions: lengths.length > 0 ? Math.max(...lengths) : 0,
      countiesUnderFour: perCounty.filter((county) => county.questions < 4).length,
      countiesUnderThreeCategories: perCounty.filter((county) => county.categories < 3).length,
      countiesWithoutSeatAnswer: perCounty.filter((county) => !county.seatAnswer).length,
      mapCountiesMissingFromPack: missing,
      minimaEnforced: false,
      ledger: "not-implemented",
      historicalFactCheck: "not-run",
    },
  };
}

export function checkShippedQuiz(root: string): QuizCheckResult {
  const map = readMap(root);
  const pack = readJson(path.join(root, "data", "quiz.json"));
  if (!map) return checkShippedPack(pack ?? {}, {});
  return checkShippedPack(pack ?? {}, map);
}

export function formatQuizResult(result: QuizCheckResult): string {
  const lines = [result.errors.length === 0 ? "quiz structure: PASS" : "quiz structure: FAIL"];
  for (const error of result.errors) lines.push(`${error.code} ${error.detail}`);
  const coverage = result.coverage;
  lines.push(
    `coverage: ${coverage.questions} questions, ${coverage.counties} counties, ${coverage.minQuestions} to ${coverage.maxQuestions} each, under four ${coverage.countiesUnderFour}, under three categories ${coverage.countiesUnderThreeCategories}, without a seat-matching answer ${coverage.countiesWithoutSeatAnswer}, map counties missing ${coverage.mapCountiesMissingFromPack}`,
  );
  lines.push(
    "minima: not applied. BARS per-county question, category, and seat counts are reported only. CONTRACT says they are not import prerequisites.",
  );
  lines.push("historical fact check: not-run");
  lines.push("ledger: not-implemented");
  return lines.join("\n");
}

function readMap(root: string): Record<string, unknown> | null {
  const regions = path.join(root, "data", "regions");
  let chosen: Record<string, unknown> | null = null;
  const folders = readdirSync(regions, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((item) => item.name)
    .sort();
  for (const folder of folders) {
    const map = readJson(path.join(regions, folder, "map.json"));
    if (!map) continue;
    if (!chosen) chosen = map;
  }
  return chosen;
}

function readMapCounties(map: Record<string, unknown> | null): Map<string, string> | null {
  if (!map || !Array.isArray(map.counties)) return null;
  const names = new Map<string, string>();
  for (const value of map.counties) {
    const county = asRecord(value);
    if (county && typeof county.id === "string" && typeof county.name === "string") names.set(county.id, county.name);
  }
  return names;
}

function readJson(file: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(readFileSync(file, "utf8")) as unknown;
    return asRecord(value);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function isLetter(value: string): value is Letter {
  return (LETTERS as readonly string[]).includes(value);
}

function issue(id: string, code: QuizIssue["code"], detail: string): QuizIssue {
  return { code, detail: `${id}: ${detail}` };
}
