import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { mergeLedger, type LedgerReport } from "../factory/merge-verdicts.ts";
import { ledgerCases, type LedgerCase } from "./fixtures/ledger/cases.ts";
import { checkLedgerReport, formatLedgerResult, runFixtureSuite } from "./ledger.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GATE = path.join(root, "gates/ledger.ts");

function reportOf(entry: LedgerCase): LedgerReport {
  return mergeLedger(entry.files["manifest.json"] as string, (file) => entry.files[file] ?? null);
}

function named(name: string): LedgerCase {
  const found = ledgerCases().find((candidate) => candidate.name === name);
  assert.ok(found);
  return found;
}

test("valid fixtures pass the ledger gate and every planted fixture fails it", () => {
  const cases = ledgerCases();
  assert.ok(cases.filter((entry) => entry.kind === "valid").length >= 4);
  assert.ok(cases.filter((entry) => entry.kind === "planted").length >= 25);
  for (const entry of cases) {
    const result = checkLedgerReport(reportOf(entry));
    assert.equal(result.ok, entry.expect.gate === "pass", `${entry.name}: ${result.issues.join("; ")}`);
    if (!result.ok) assert.ok(result.issues.length > 0, `${entry.name}: failure names a reason`);
  }
});

test("the gate re-checks shipped claims instead of trusting the merge", () => {
  const report = reportOf(named("valid-two-confirmed"));
  assert.equal(checkLedgerReport(report).ok, true);

  // Forge reports the merge would never produce and check the gate catches each one.
  type Forged = { claims: { verdicts: { kind: string; sourceUrls: string[]; checkerId: string }[] }[]; summary: { shipped: number } };
  const forge = (edit: (copy: Forged) => void): LedgerReport => {
    const copy = JSON.parse(JSON.stringify(report)) as Forged;
    edit(copy);
    return copy as unknown as LedgerReport;
  };
  const issuesOf = (edit: (copy: Forged) => void) => checkLedgerReport(forge(edit)).issues;

  assert.ok(issuesOf((copy) => void (copy.claims[0]!.verdicts[1]!.kind = "corrected")).some((issue) => issue.includes("not two confirmed")));
  assert.ok(issuesOf((copy) => void (copy.claims[0]!.verdicts[0]!.sourceUrls = [])).some((issue) => issue.includes("source URL")));
  assert.ok(
    issuesOf((copy) => void (copy.claims[0]!.verdicts[1]!.checkerId = copy.claims[0]!.verdicts[0]!.checkerId)).some((issue) => issue.includes("distinct")),
  );
  assert.ok(issuesOf((copy) => void (copy.claims[0]!.verdicts[0]!.checkerId = "fixture-author")).some((issue) => issue.includes("author")));
  assert.ok(issuesOf((copy) => void (copy.summary.shipped += 1)).some((issue) => issue.includes("summary")));
});

test("gate output names each failing claim and its reasons", () => {
  const result = checkLedgerReport(reportOf(named("planted-corrected-without-ruling")));
  const text = formatLedgerResult(result);
  assert.equal(text.split("\n")[0], "ledger: FAIL");
  assert.ok(text.includes("fx-18001-01-b rejected: verdict-corrected:a"), text);
  const invalid = formatLedgerResult(checkLedgerReport(reportOf(named("planted-digest-mismatch"))));
  assert.ok(invalid.includes("digest-mismatch"), invalid);
});

test("gate CLI exits 1 on a planted failure and 0 on a valid manifest", () => {
  for (const [name, status] of [["planted-only-one-verdict", 1], ["planted-checker-is-author", 1], ["valid-two-confirmed", 0], ["valid-person-ship-ruling", 0]] as const) {
    const entry = named(name);
    const dir = mkdtempSync(path.join(tmpdir(), `ledger-gate-${name}-`));
    try {
      for (const [file, text] of Object.entries(entry.files)) writeFileSync(path.join(dir, file), text, "utf8");
      const run = spawnSync(process.execPath, ["--experimental-strip-types", GATE, "--manifest", path.join(dir, "manifest.json")], { encoding: "utf8" });
      assert.equal(run.status, status, `${name}: ${run.stdout}${run.stderr}`);
      assert.ok(run.stdout.startsWith(status === 0 ? "ledger: PASS" : "ledger: FAIL"), run.stdout);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("the fixture suite runner passes only when planted cases fail and valid cases pass", () => {
  const result = runFixtureSuite();
  assert.equal(result.exitCode, 0, result.output);
  assert.match(result.output, /planted planted-missing-source-url: FAIL \(expected\)/);
  assert.match(result.output, /valid valid-two-confirmed: PASS/);
  assert.match(result.output, /determinism: PASS/);
});
