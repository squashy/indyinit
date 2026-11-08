// BTT-32 ledger truth gate. Re-checks a merge report independently of the merge and fails closed:
// every shipped claim needs two confirmed, sourced verdicts from two distinct checkers who are not
// the author, or an explicit person ship ruling. With --manifest it gates one frozen ledger; with no
// arguments (the box gate) it runs the seeded synthetic fixture suite. Format notes: gates/LEDGER.md.
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { mergeLedgerFile, REPORT_SCHEMA, serializeReport, type LedgerReport } from "../factory/merge-verdicts.ts";
import { ledgerCases, type LedgerCase } from "./fixtures/ledger/cases.ts";

export interface LedgerGateResult {
  readonly ok: boolean;
  readonly issues: readonly string[];
  readonly shipped: number;
  readonly claims: number;
}

const CLAIM_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isHttpUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.length > 0;
  } catch {
    return false;
  }
}

/**
 * Strict truth gate: passes only when the inputs are valid and every claim in the frozen shard ships.
 * A rejected claim is a correct merge outcome, but it means this shard is not a verified set.
 */
export function checkLedgerReport(report: LedgerReport): LedgerGateResult {
  const issues: string[] = [];
  if (report.schema !== REPORT_SCHEMA) issues.push(`report schema ${String(report.schema)} is not ${REPORT_SCHEMA}`);
  if (report.status !== "valid") {
    issues.push("inputs are invalid; no claim may ship");
    for (const error of report.errors) issues.push(`${error.code} ${error.detail}`);
    if (report.claims.length > 0) issues.push("an invalid report must not carry decisions");
    return { ok: false, issues, shipped: 0, claims: 0 };
  }
  const author = report.authorId;
  if (typeof author !== "string" || author.length === 0) issues.push("report names no claim author");
  const seen = new Set<string>();
  let shipped = 0;
  for (const claim of report.claims) {
    const id = claim.claimId;
    if (typeof id !== "string" || !CLAIM_ID.test(id)) issues.push(`claim id ${JSON.stringify(id)} is malformed`);
    if (seen.has(id)) issues.push(`${id} appears more than once`);
    seen.add(id);
    for (const verdict of claim.verdicts) {
      if ((verdict.kind === "confirmed" || verdict.kind === "corrected") && (verdict.sourceUrls.length === 0 || !verdict.sourceUrls.every(isHttpUrl))) {
        issues.push(`${id} ${verdict.kind} verdict from ${verdict.checkerId} has no valid source URL`);
      }
      if (verdict.mapping !== null && verdict.mapping.provisionalId !== verdict.ref) issues.push(`${id} mapped verdict lost its provisional id`);
    }
    if (claim.decision === "ship") {
      shipped += 1;
      if (claim.basis === "two-confirmed") {
        const slots = claim.verdicts.map((verdict) => verdict.slot).sort().join(",");
        const confirmed = claim.verdicts.filter((verdict) => verdict.kind === "confirmed" && verdict.sourceUrls.length > 0 && verdict.sourceUrls.every(isHttpUrl));
        if (claim.verdicts.length !== 2 || slots !== "a,b" || confirmed.length !== 2) issues.push(`${id} shipped on not two confirmed, sourced verdicts`);
        const checkers = new Set(claim.verdicts.map((verdict) => verdict.checkerId));
        if (checkers.size !== claim.verdicts.length) issues.push(`${id} shipped without two distinct checkers`);
        if (claim.verdicts.some((verdict) => verdict.checkerId === author)) issues.push(`${id} shipped on a verdict by its author`);
        if (claim.ruling !== null) issues.push(`${id} two-confirmed decision carries a ruling`);
      } else if (claim.basis === "person-ruling") {
        if (claim.ruling?.decision !== "ship" || typeof claim.ruling.by !== "string" || claim.ruling.by.trim().length === 0) issues.push(`${id} shipped without an explicit person ship ruling`);
      } else issues.push(`${id} shipped with no basis`);
    } else if (claim.decision === "reject") {
      issues.push(`${id} rejected: ${claim.reasons.join(", ") || "no reason given"}`);
    } else issues.push(`${id} has no decision`);
  }
  const summary = report.summary;
  if (summary.claims !== report.claims.length || summary.shipped !== shipped || summary.rejected !== report.claims.length - shipped) {
    issues.push("summary counts do not match the decisions");
  }
  if (report.claims.length === 0) issues.push("the ledger has no claims");
  return { ok: issues.length === 0, issues, shipped, claims: report.claims.length };
}

export function formatLedgerResult(result: LedgerGateResult): string {
  const lines = [result.ok ? "ledger: PASS" : "ledger: FAIL", `claims ${result.claims}, shipped ${result.shipped}`];
  for (const issue of result.issues) lines.push(`FAIL ${issue}`);
  return lines.join("\n");
}

export function runLedgerManifest(manifestPath: string): { exitCode: number; output: string; report: LedgerReport } {
  const report = mergeLedgerFile(manifestPath);
  const result = checkLedgerReport(report);
  return { exitCode: result.ok ? 0 : 1, output: formatLedgerResult(result), report };
}

function writeCase(dir: string, entry: LedgerCase): string {
  const caseDir = path.join(dir, entry.name);
  mkdirSync(caseDir, { recursive: true });
  for (const [file, text] of Object.entries(entry.files)) writeFileSync(path.join(caseDir, file), text, "utf8");
  return path.join(caseDir, "manifest.json");
}

/** Box gate: planted fixtures must fail, valid fixtures must pass, reruns and shuffles must be byte-identical. */
export function runFixtureSuite(): { exitCode: number; output: string } {
  const lines: string[] = [];
  let failures = 0;
  const dir = mkdtempSync(path.join(tmpdir(), "ledger-suite-"));
  try {
    for (const entry of ledgerCases()) {
      const run = runLedgerManifest(writeCase(dir, entry));
      const passed = run.exitCode === 0;
      const statusOk = run.report.status === entry.expect.status;
      const codesOk = (entry.expect.codes ?? []).every((code) => run.report.errors.some((error) => error.code === code));
      const decisionsOk = Object.entries(entry.expect.decisions ?? {}).every(([claimId, want]) => {
        const got = run.report.claims.find((claim) => claim.claimId === claimId);
        return got !== undefined && got.decision === want.decision && got.basis === want.basis && JSON.stringify(got.reasons) === JSON.stringify(want.reasons);
      });
      const expectedPass = entry.expect.gate === "pass";
      const ok = passed === expectedPass && statusOk && codesOk && decisionsOk;
      const reasons = run.output.split("\n").filter((line) => line.startsWith("FAIL "));
      const firstReason = reasons.find((line) => !line.startsWith("FAIL inputs are invalid")) ?? reasons[0] ?? "";
      if (entry.kind === "planted") lines.push(`planted ${entry.name}: ${passed ? "PASS (UNEXPECTED)" : "FAIL (expected)"}${firstReason ? ` - ${firstReason.slice(5)}` : ""}`);
      else lines.push(`valid ${entry.name}: ${passed ? "PASS" : "FAIL (UNEXPECTED)"}`);
      if (!ok) {
        failures += 1;
        lines.push(`  expectation not met: status ${run.report.status}, codes ${run.report.errors.map((error) => error.code).join(",") || "none"}`);
      }
    }
    // Determinism: same pinned inputs, rerun and shuffled line order, give byte-identical reports.
    const hashes = new Map<string, Set<string>>();
    for (const [label, cases] of [
      ["as-is", ledgerCases()],
      ["rerun", ledgerCases()],
      ["shuffled-1", ledgerCases("shuffled", 1)],
      ["shuffled-2", ledgerCases("shuffled", 2)],
    ] as const) {
      const sub = path.join(dir, label);
      for (const entry of cases.filter((candidate) => candidate.kind === "valid")) {
        const report = runLedgerManifest(writeCase(sub, entry)).report;
        const hash = createHash("sha256").update(serializeReport(report), "utf8").digest("hex");
        hashes.set(entry.name, (hashes.get(entry.name) ?? new Set()).add(hash));
      }
    }
    const unstable = [...hashes].filter(([, set]) => set.size !== 1).map(([name]) => name);
    if (unstable.length > 0) failures += 1;
    lines.push(`determinism: ${unstable.length === 0 ? "PASS" : `FAIL ${unstable.join(", ")}`} (${hashes.size} valid cases x rerun + 2 shuffles)`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  lines.push("production: no frozen ledger manifest is gated here; real A/B coverage is incomplete, so verified-content publication stays blocked");
  lines.unshift(failures === 0 ? "ledger fixtures: PASS" : `ledger fixtures: FAIL (${failures})`);
  return { exitCode: failures === 0 ? 0 : 1, output: lines.join("\n") };
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(path.resolve(entry)).href) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    const result = runFixtureSuite();
    console.log(result.output);
    process.exit(result.exitCode);
  } else if (args[0] === "--manifest" && typeof args[1] === "string" && args.length === 2) {
    const result = runLedgerManifest(args[1]);
    console.log(result.output);
    process.exit(result.exitCode);
  } else {
    console.error("Usage: node --experimental-strip-types gates/ledger.ts [--manifest <manifest.json>]");
    process.exit(2);
  }
}
