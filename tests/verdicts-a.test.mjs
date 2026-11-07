import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VERDICTS = new Set(["confirmed", "corrected", "false", "unconfirmed"]);

test("verdicts.a.jsonl has one valid verdict for each c1 claim", () => {
  const claims = readFileSync(path.join(root, "regions/in/claims-c1.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const raw = readFileSync(path.join(root, "regions/in/verdicts.a.jsonl"), "utf8");
  assert.equal(raw.endsWith("\n"), true);
  const lines = raw.trim().split("\n");
  assert.equal(lines.length, claims.length);
  const seen = new Set();
  for (let index = 0; index < lines.length; index += 1) {
    const verdict = JSON.parse(lines[index]);
    assert.equal(verdict.claimId, claims[index].id);
    assert.equal(seen.has(verdict.claimId), false);
    seen.add(verdict.claimId);
    assert.equal(VERDICTS.has(verdict.kind), true);
    if (verdict.kind === "corrected") {
      assert.equal(typeof verdict.correction, "string");
      assert.equal(verdict.correction.length > 0, true);
    }
    if (verdict.kind === "confirmed" || verdict.kind === "corrected") {
      assert.equal(Array.isArray(verdict.evidenceUrls), true);
      assert.equal(verdict.evidenceUrls.length >= 1, true);
      for (const url of verdict.evidenceUrls) {
        assert.equal(typeof url, "string");
        assert.match(url, /^https?:\/\//);
      }
    }
  }
  assert.equal(seen.size, claims.length);
});
