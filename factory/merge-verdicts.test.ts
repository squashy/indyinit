import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildModel, contentDigest, ledgerCases, materialize, recordsDigest, type LedgerCase } from "../gates/fixtures/ledger/cases.ts";
import { claimContentDigest, mergeLedger, recordsDigest as implRecordsDigest, serializeReport } from "./merge-verdicts.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(root, "factory/merge-verdicts.ts");

function caseNamed(name: string, order: "as-is" | "shuffled" = "as-is", seed?: number): LedgerCase {
  const found = ledgerCases(order, seed).find((candidate) => candidate.name === name);
  assert.ok(found, `fixture ${name} exists`);
  return found;
}

function mergeCase(entry: LedgerCase) {
  return mergeLedger(entry.files["manifest.json"] as string, (file) => entry.files[file] ?? null);
}

function writeCase(entry: LedgerCase): string {
  const dir = mkdtempSync(path.join(tmpdir(), `ledger-${entry.name}-`));
  for (const [file, text] of Object.entries(entry.files)) writeFileSync(path.join(dir, file), text, "utf8");
  return dir;
}

const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

test("digests match the independent fixture implementation", () => {
  const model = buildModel("valid-two-confirmed");
  assert.equal(implRecordsDigest(model.claims), recordsDigest(model.claims));
  const claim = { id: "fx-18001-01-a", questionId: "fx-18001-01", countyId: "18001", text: "Synthetic.", choices: null };
  assert.equal(claimContentDigest(claim), contentDigest(claim));
});

test("every fixture case matches its expected status, codes and decisions", () => {
  for (const entry of ledgerCases()) {
    const report = mergeCase(entry);
    assert.equal(report.status, entry.expect.status, `${entry.name}: status (${JSON.stringify(report.errors)})`);
    for (const code of entry.expect.codes ?? []) {
      assert.ok(report.errors.some((error) => error.code === code), `${entry.name}: expected error ${code}, got ${JSON.stringify(report.errors)}`);
    }
    if (report.status === "invalid") {
      assert.deepEqual(report.claims, [], `${entry.name}: invalid inputs make no decisions`);
      assert.equal(report.summary.shipped, 0);
    }
    for (const [claimId, want] of Object.entries(entry.expect.decisions ?? {})) {
      const got = report.claims.find((claim) => claim.claimId === claimId);
      assert.ok(got, `${entry.name}: decision for ${claimId}`);
      assert.equal(got.decision, want.decision, `${entry.name}: ${claimId} decision`);
      assert.equal(got.basis, want.basis, `${entry.name}: ${claimId} basis`);
      assert.deepEqual(got.reasons, want.reasons, `${entry.name}: ${claimId} reasons`);
    }
  }
});

test("only two confirmed verdicts or an explicit person ship ruling ship", () => {
  for (const entry of ledgerCases()) {
    const report = mergeCase(entry);
    for (const claim of report.claims.filter((candidate) => candidate.decision === "ship")) {
      if (claim.basis === "two-confirmed") {
        assert.equal(claim.verdicts.length, 2, `${entry.name}/${claim.claimId}`);
        assert.ok(claim.verdicts.every((verdict) => verdict.kind === "confirmed" && verdict.sourceUrls.length > 0));
        assert.notEqual(claim.verdicts[0]?.checkerId, claim.verdicts[1]?.checkerId);
        assert.equal(claim.ruling, null);
      } else {
        assert.equal(claim.basis, "person-ruling");
        assert.equal(claim.ruling?.decision, "ship");
      }
    }
  }
});

test("a person ship ruling keeps traceability of what it overrode", () => {
  const report = mergeCase(caseNamed("valid-person-ship-ruling"));
  const claim = report.claims.find((candidate) => candidate.claimId === "fx-18001-01-a");
  assert.ok(claim);
  assert.deepEqual(claim.overridden, ["verdict-corrected:a", "verdict-unconfirmed:b"]);
  assert.deepEqual(claim.ruling, { decision: "ship", by: "Fixture Person", reason: "synthetic fixture ruling", sourceUrl: null, format: "types/1" });
  assert.equal(report.summary.shippedPersonRuling, 1);
  assert.equal(report.summary.shippedTwoConfirmed, 5);
});

test("provisional checker references keep their original ids and mapping provenance", () => {
  const report = mergeCase(caseNamed("valid-provisional-mapping"));
  assert.equal(report.status, "valid");
  const claim = report.claims.find((candidate) => candidate.claimId === "fx-18001-01-a");
  const b = claim?.verdicts.find((verdict) => verdict.slot === "b");
  assert.ok(b);
  assert.equal(b.ref, `${"5e".repeat(32)}+Q101`);
  assert.equal(b.mapping?.provisionalId, b.ref);
  assert.deepEqual(b.mapping?.provenance, { by: "Fixture Person", note: "synthetic fixture mapping" });
  const a = claim?.verdicts.find((verdict) => verdict.slot === "a");
  assert.equal(a?.mapping, null);
});

test("questions ship only when every claim ships", () => {
  const report = mergeCase(caseNamed("planted-only-one-verdict"));
  const question = report.questions.find((candidate) => candidate.questionId === "fx-18003-01");
  assert.deepEqual(question, {
    questionId: "fx-18003-01",
    countyId: "18003",
    decision: "reject",
    claimIds: ["fx-18003-01-a", "fx-18003-01-b"],
    rejectedClaimIds: ["fx-18003-01-a"],
  });
  assert.equal(report.summary.questionsShipped, 2);
  assert.equal(report.summary.questionsRejected, 1);
});

test("the report echoes the exact manifest and its digest", () => {
  const entry = caseNamed("valid-two-confirmed");
  const report = mergeCase(entry);
  assert.deepEqual(report.manifest, JSON.parse(entry.files["manifest.json"] as string));
  assert.equal(JSON.stringify(report.manifest), JSON.stringify(JSON.parse(entry.files["manifest.json"] as string)));
  assert.match(String(report.manifestDigest), /^[0-9a-f]{64}$/);
});

test("same pinned inputs give byte-identical reports regardless of line order", () => {
  for (const name of ["valid-two-confirmed", "valid-person-ship-ruling", "valid-provisional-mapping", "planted-only-one-verdict"]) {
    const first = serializeReport(mergeCase(caseNamed(name)));
    const again = serializeReport(mergeCase(caseNamed(name)));
    assert.equal(again, first, `${name}: rerun`);
    for (const seed of [1, 2, 3]) {
      const shuffledCase = caseNamed(name, "shuffled", seed);
      assert.notEqual(shuffledCase.files["claims.jsonl"], caseNamed(name).files["claims.jsonl"], `${name}: shuffle changed line order`);
      assert.equal(serializeReport(mergeCase(shuffledCase)), first, `${name}: shuffled seed ${seed}`);
    }
  }
});

test("digests are verified before any decision", () => {
  const entry = caseNamed("planted-digest-mismatch");
  const report = mergeCase(entry);
  assert.equal(report.status, "invalid");
  assert.deepEqual(report.errors.map((error) => error.code), ["digest-mismatch"]);
});

test("a missing input file or an escaping path fails closed", () => {
  const entry = caseNamed("valid-two-confirmed");
  const missing = mergeLedger(entry.files["manifest.json"] as string, (file) => (file === "verdicts.b.jsonl" ? null : entry.files[file] ?? null));
  assert.equal(missing.status, "invalid");
  assert.ok(missing.errors.some((error) => error.code === "read"));
  const manifest = JSON.parse(entry.files["manifest.json"] as string);
  manifest.claims.path = "../claims.jsonl";
  const escaped = mergeLedger(JSON.stringify(manifest), (file) => entry.files[file] ?? null);
  assert.ok(escaped.errors.some((error) => error.code === "manifest-schema"));
  const garbage = mergeLedger("{not json", () => null);
  assert.equal(garbage.status, "invalid");
  assert.equal(garbage.manifest, null);
});

test("JSONL with a byte-order mark, CR or blank lines fails closed", () => {
  const entry = caseNamed("valid-two-confirmed");
  for (const bad of [`﻿${entry.files["claims.jsonl"]}`, (entry.files["claims.jsonl"] as string).replace(/\n/g, "\r\n"), `\n${entry.files["claims.jsonl"]}`]) {
    const report = mergeLedger(entry.files["manifest.json"] as string, (file) => (file === "claims.jsonl" ? bad : entry.files[file] ?? null));
    assert.equal(report.status, "invalid");
    assert.ok(report.errors.some((error) => error.code === "parse"), JSON.stringify(report.errors));
  }
});

test("CLI writes the report only to the given path and never over assembler or input files", () => {
  const dir = writeCase(caseNamed("valid-two-confirmed"));
  try {
    const out = path.join(dir, "out", "report.json");
    const run = spawnSync(process.execPath, ["--experimental-strip-types", CLI, "--manifest", path.join(dir, "manifest.json"), "--out", out], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    const text = readFileSync(out, "utf8");
    assert.equal(JSON.parse(text).status, "valid");
    const stdout = spawnSync(process.execPath, ["--experimental-strip-types", CLI, "--manifest", path.join(dir, "manifest.json")], { encoding: "utf8" });
    assert.equal(stdout.status, 0, stdout.stderr);
    assert.equal(sha(stdout.stdout), sha(text));

    const claimsBefore = readFileSync(path.join(dir, "claims.jsonl"), "utf8");
    for (const target of [path.join(dir, "claims.jsonl"), path.join(dir, "manifest.json"), path.join(dir, "quiz.json"), path.join(dir, "claims-c9.jsonl")]) {
      const refused = spawnSync(process.execPath, ["--experimental-strip-types", CLI, "--manifest", path.join(dir, "manifest.json"), "--out", target], { encoding: "utf8" });
      assert.equal(refused.status, 2, `${target}: ${refused.stderr}`);
    }
    assert.equal(readFileSync(path.join(dir, "claims.jsonl"), "utf8"), claimsBefore);
    assert.equal(existsSync(path.join(dir, "quiz.json")), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI exits 1 with reasons on invalid inputs", () => {
  const dir = writeCase(caseNamed("planted-missing-source-url"));
  try {
    const run = spawnSync(process.execPath, ["--experimental-strip-types", CLI, "--manifest", path.join(dir, "manifest.json")], { encoding: "utf8" });
    assert.equal(run.status, 1);
    const report = JSON.parse(run.stdout);
    assert.equal(report.status, "invalid");
    assert.ok(report.errors.some((error: { code: string }) => error.code === "missing-source-url"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("materialized fixtures are stable for a seed", () => {
  const model = buildModel("valid-two-confirmed");
  assert.deepEqual(materialize(model), materialize(buildModel("valid-two-confirmed")));
});
