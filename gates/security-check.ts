import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import * as path from "node:path";

export interface SafetyIssue {
  readonly code: "innerHTML" | "eval" | "external-script" | "answer-key" | "scan";
  readonly detail: string;
}

const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".html", ".css"]);
const SKIP = new Set(["gates/security-check.ts", "gates/security-check.test.ts"]);

export function sourceSafetyIssues(files: readonly { path: string; text: string }[]): readonly SafetyIssue[] {
  const issues: SafetyIssue[] = [];
  for (const file of files) {
    issues.push(...scanText(file.path, file.text));
  }
  return issues;
}

export function answerKeyIssues(paths: readonly string[]): readonly SafetyIssue[] {
  return paths.filter(isAnswerKeyCsv).map((file) => ({ code: "answer-key", detail: `${file} is a tracked answer-key CSV` }));
}

export function scanTrackedTree(root: string): { issues: readonly SafetyIssue[] } {
  const tracked = trackedFiles(root);
  if (!tracked) return { issues: [{ code: "scan", detail: "tracked files could not be listed" }] };
  const issues: SafetyIssue[] = [...answerKeyIssues(tracked)];
  for (const file of tracked) {
    if (SKIP.has(file) || !CODE_EXTENSIONS.has(path.extname(file))) continue;
    let text = "";
    try {
      text = readFileSync(path.join(root, file), "utf8");
    } catch {
      issues.push({ code: "scan", detail: `${file} could not be read` });
      continue;
    }
    issues.push(...scanText(file, text));
  }
  return { issues };
}

export function formatSafetyResult(issues: readonly SafetyIssue[]): string {
  const lines = [issues.length === 0 ? "security: PASS" : "security: FAIL"];
  for (const issue of issues) lines.push(`${issue.code} ${issue.detail}`);
  lines.push("ledger: not-implemented");
  return lines.join("\n");
}

export function isAnswerKeyCsv(file: string): boolean {
  const base = path.basename(file).toLowerCase();
  if (!base.endsWith(".csv")) return false;
  if (base.includes("nokey")) return false;
  return base.includes("key");
}

function scanText(file: string, text: string): SafetyIssue[] {
  const issues: SafetyIssue[] = [];
  collect(issues, file, text, /\.innerHTML\b/g, "innerHTML", "assigns innerHTML");
  collect(issues, file, text, /\beval\s*\(/g, "eval", "calls eval");
  collect(issues, file, text, /<script\b[^>]*\bsrc\s*=\s*["'](?:https?:)?\/\//gi, "external-script", "loads an external script");
  collect(issues, file, text, /\bimport\s*(?:[^'"\n]*\s+from\s*)?\(?\s*["']https?:\/\//gi, "external-script", "imports an external script");
  return issues;
}

function collect(issues: SafetyIssue[], file: string, text: string, pattern: RegExp, code: SafetyIssue["code"], detail: string): void {
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    issues.push({ code, detail: `${file}:${lineNumber(text, index)} ${detail}` });
  }
}

function lineNumber(text: string, index: number): number {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) if (text.charCodeAt(cursor) === 10) line += 1;
  return line;
}

function trackedFiles(root: string): string[] | null {
  const result = spawnSync("git", ["-C", root, "ls-files", "-z"], { encoding: "utf8" });
  if ((result.status ?? 1) !== 0) return null;
  return (result.stdout ?? "").split("\0").filter((file) => file.length > 0);
}
