import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import type { CountyId, MapPack, QuestionId, QuizPack, QuizQuestion } from "../src/types.ts";
import { parseMapPack } from "./parse-map.ts";
import { parseQuizCsv } from "./parse-quiz-csv.ts";

export function importQuizText(csvText: string, map: MapPack): QuizPack {
  const parsed = parseQuizCsv(csvText);
  if (parsed.report.errors.length > 0) {
    throw new Error(parsed.report.errors.map((error) => `row ${error.row} ${error.field}: ${error.message}`).join("\n"));
  }
  const known = new Set(map.counties.map((county) => county.id));
  const grouped = new Map<CountyId, QuizQuestion[]>();
  for (const county of map.counties) grouped.set(county.id, []);
  parsed.rows.forEach((row, index) => {
    const countyId = row.FIPS as CountyId;
    if (!known.has(countyId)) throw new Error(`row ${index + 2} FIPS: ${row.FIPS} is not on the map`);
    const established = Number(row.Established);
    if (!Number.isSafeInteger(established)) throw new Error(`row ${index + 2} Established: established must be an integer`);
    const question: QuizQuestion = {
      kind: "multipleChoice",
      id: row["Q#"] as QuestionId,
      countyId,
      countyName: row.County,
      countySeat: row["County Seat"],
      established,
      namedFor: row["Named For"],
      category: row.Category,
      prompt: row.Question,
      choices: { A: row["Choice A"], B: row["Choice B"], C: row["Choice C"], D: row["Choice D"] },
      correctLetter: row["Correct Letter"],
      correctAnswer: row["Correct Answer"],
      explanation: row.Explanation,
    };
    grouped.get(countyId)?.push(question);
  });
  const counties: Record<string, readonly QuizQuestion[]> = {};
  for (const countyId of [...grouped.keys()].sort()) counties[countyId] = grouped.get(countyId) ?? [];
  return {
    version: 1,
    mapDigest: map.digest,
    sourceDigest: createHash("sha256").update(csvText, "utf8").digest("hex"),
    counties: counties as QuizPack["counties"],
  };
}

export function quizPackJson(pack: QuizPack): string {
  return `${JSON.stringify(pack, null, 2)}\n`;
}

function main(): void {
  const args = readArgs(process.argv.slice(2));
  const csvText = readFileSync(args.csv, "utf8");
  const map = parseMapPack(JSON.parse(readFileSync(args.map, "utf8")));
  const pack = importQuizText(csvText, map);
  writeFileSync(args.out, quizPackJson(pack));
  console.log(`${args.out}: ${Object.values(pack.counties).reduce((total, questions) => total + questions.length, 0)} questions, map ${pack.mapDigest.slice(0, 12)}`);
}

function readArgs(argv: readonly string[]): { csv: string; map: string; out: string } {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag || !value || !flag.startsWith("--")) throw new Error("usage: import-quiz --csv <file> --map <map.json> --out <quiz.json>");
    values.set(flag, value);
  }
  const csv = values.get("--csv");
  const map = values.get("--map");
  const out = values.get("--out");
  if (!csv || !map || !out) throw new Error("usage: import-quiz --csv <file> --map <map.json> --out <quiz.json>");
  return { csv: path.resolve(csv), map: path.resolve(map), out: path.resolve(out) };
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(path.resolve(entry)).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "quiz import failed");
    process.exit(1);
  }
}
