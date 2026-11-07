import type { ChoiceLetter, CsvQuestionRow } from "../src/types.ts";

export const QUIZ_CSV_HEADERS = [
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

export interface CsvFieldError {
  readonly row: number;
  readonly field: string;
  readonly message: string;
}

export interface CsvValidationReport {
  readonly errors: readonly CsvFieldError[];
  readonly warnings: readonly string[];
  readonly questionCount: number;
  readonly countiesWithQuestions: number;
}

const LETTERS: readonly ChoiceLetter[] = ["A", "B", "C", "D"];

export function parseQuizCsv(text: string): { rows: readonly CsvQuestionRow[]; report: CsvValidationReport } {
  const table = parseTable(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  const errors: CsvFieldError[] = [];
  const rows: CsvQuestionRow[] = [];
  const header = table[0] ?? [];
  if (header.length !== QUIZ_CSV_HEADERS.length || header.some((cell, index) => cell !== QUIZ_CSV_HEADERS[index])) {
    errors.push({ row: 1, field: "header", message: "header does not match the supplied quiz columns" });
    return { rows, report: report(errors, rows) };
  }
  const seen = new Set<string>();
  for (let index = 1; index < table.length; index += 1) {
    const cells = table[index] ?? [];
    const rowNumber = index + 1;
    if (cells.length === 1 && cells[0] === "") continue;
    if (cells.length !== QUIZ_CSV_HEADERS.length) {
      errors.push({ row: rowNumber, field: "row", message: "row does not have every column" });
      continue;
    }
    const record = Object.fromEntries(QUIZ_CSV_HEADERS.map((name, cell) => [name, cells[cell] ?? ""])) as Record<
      (typeof QUIZ_CSV_HEADERS)[number],
      string
    >;
    for (const name of QUIZ_CSV_HEADERS) {
      if (record[name].trim() === "") errors.push({ row: rowNumber, field: name, message: "cell is blank" });
    }
    if (!/^[0-9]{5}$/.test(record.FIPS)) errors.push({ row: rowNumber, field: "FIPS", message: "FIPS must be five digits" });
    if (!/^-?\d+$/.test(record.Established)) errors.push({ row: rowNumber, field: "Established", message: "established must be an integer" });
    const letter = record["Correct Letter"];
    if (!isLetter(letter)) errors.push({ row: rowNumber, field: "Correct Letter", message: "correct letter must be A, B, C, or D" });
    if (isLetter(letter) && record["Correct Answer"] !== record[`Choice ${letter}`]) {
      errors.push({ row: rowNumber, field: "Correct Answer", message: "correct answer does not match that letter" });
    }
    if (seen.has(record["Q#"])) errors.push({ row: rowNumber, field: "Q#", message: "question id repeats" });
    seen.add(record["Q#"]);
    if (errors.some((error) => error.row === rowNumber)) continue;
    if (!isLetter(letter)) continue;
    rows.push({
      "Q#": record["Q#"],
      FIPS: record.FIPS,
      County: record.County,
      "County Seat": record["County Seat"],
      Established: record.Established,
      "Named For": record["Named For"],
      Category: record.Category,
      Question: record.Question,
      "Choice A": record["Choice A"],
      "Choice B": record["Choice B"],
      "Choice C": record["Choice C"],
      "Choice D": record["Choice D"],
      "Correct Letter": letter,
      "Correct Answer": record["Correct Answer"],
      Explanation: record.Explanation,
    });
  }
  return { rows, report: report(errors, rows) };
}

function report(errors: readonly CsvFieldError[], rows: readonly CsvQuestionRow[]): CsvValidationReport {
  return {
    errors,
    warnings: [],
    questionCount: rows.length,
    countiesWithQuestions: new Set(rows.map((row) => row.FIPS)).size,
  };
}

function isLetter(value: string): value is ChoiceLetter {
  return LETTERS.includes(value as ChoiceLetter);
}

function parseTable(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else quoted = false;
      } else field += char ?? "";
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\r") continue;
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += char ?? "";
  }
  if (quoted) throw new Error("quoted CSV field was not closed");
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
