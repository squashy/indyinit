// Seeded synthetic ledger fixtures for BTT-32. Every claim, checker, person and URL here is invented
// fixture data: nothing below is an Indiana fact, a real checker verdict or a real person ruling.
// Digests are computed by this file's own small implementation so the tests do not trust the merge code
// they are testing.
import { createHash } from "node:crypto";

export const FIXTURE_SEED = 92032;
export const FIXTURE_REVISION = "fixture-r1";
export const AUTHOR_ID = "fixture-author";
export const CHECKER_A = "fixture-checker-a";
export const CHECKER_B = "fixture-checker-b";
export const PERSON = "Fixture Person";
export const SOURCE_DIGEST = "5e".repeat(32);

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

export interface LedgerModel {
  manifest: JsonObject;
  claims: JsonObject[];
  verdictsA: JsonObject[];
  verdictsB: JsonObject[];
  resolutions: JsonObject[];
  mapping: JsonObject | null;
}

export interface CaseExpectation {
  /** Merge report status. "invalid" means fail-closed before any decision. */
  readonly status: "valid" | "invalid";
  /** Ledger gate outcome on this case. */
  readonly gate: "pass" | "fail";
  /** Error codes that must all appear (invalid cases). */
  readonly codes?: readonly string[];
  /** Per-claim decisions that must hold (valid cases). */
  readonly decisions?: Readonly<Record<string, { decision: "ship" | "reject"; basis: string | null; reasons: readonly string[] }>>;
}

export interface LedgerCase {
  readonly name: string;
  readonly kind: "valid" | "planted";
  readonly expect: CaseExpectation;
  /** File name (relative to the case directory) to exact file text. manifest.json is the entry. */
  readonly files: Readonly<Record<string, string>>;
}

// ---------- independent canonical digest (sha256-canonical-jsonl/1) ----------

export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(",")}}`;
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function recordsDigest(records: readonly unknown[]): string {
  return sha256(records.map(canonical).sort().map((line) => `${line}\n`).join(""));
}

export function mappingDigest(mapping: JsonObject): string {
  const entries = Array.isArray(mapping.entries) ? [...mapping.entries].map(canonical).sort() : [];
  const rest: Record<string, unknown> = { ...mapping };
  delete rest.entries;
  return sha256(`${canonical(rest)}\n${entries.map((line) => `${line}\n`).join("")}`);
}

export function contentDigest(claim: { id: string; questionId: string; countyId: string; text: string; choices?: Json }): string {
  return sha256(canonical({ id: claim.id, questionId: claim.questionId, countyId: claim.countyId, text: claim.text, choices: claim.choices ?? null }));
}

// ---------- seeded helpers ----------

export function seededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    const held = out[index] as T;
    out[index] = out[swap] as T;
    out[swap] = held;
  }
  return out;
}

// ---------- base model ----------

const COUNTIES = ["18001", "18003", "18005"] as const;

function baseModel(): LedgerModel {
  const rng = seededRng(FIXTURE_SEED);
  const claims: JsonObject[] = [];
  let n = 0;
  for (const fips of COUNTIES) {
    for (const suffix of ["a", "b"]) {
      n += 1;
      const token = Math.floor(rng() * 1e6).toString(36);
      claims.push({
        id: `fx-${fips}-01-${suffix}`,
        questionId: `fx-${fips}-01`,
        fips,
        claim: `Synthetic fixture statement ${n} (${token}); not a fact.`,
      });
    }
  }
  const verdict = (claimId: string, checkerId: string, index: number): JsonObject => ({
    claimId,
    checkerId,
    kind: "confirmed",
    evidenceUrls: [`https://example.org/fixture/${checkerId}/${index}`],
    note: "synthetic fixture verdict",
  });
  return {
    manifest: {
      schema: "battlefor92.ledger-manifest/1",
      contractVersion: "ledger/1",
      digestAlgorithm: "sha256-canonical-jsonl/1",
      revision: FIXTURE_REVISION,
      order: "claimId-asc",
      claims: { path: "claims.jsonl", revision: FIXTURE_REVISION, format: "template/0", digest: "", authorId: AUTHOR_ID },
      verdicts: {
        a: { path: "verdicts.a.jsonl", revision: FIXTURE_REVISION, format: "types/1", digest: "", checkerId: CHECKER_A },
        b: { path: "verdicts.b.jsonl", revision: FIXTURE_REVISION, format: "types/1", digest: "", checkerId: CHECKER_B },
      },
      resolutions: { path: "resolutions.jsonl", revision: FIXTURE_REVISION, format: "types/1", digest: "" },
      mapping: null,
    },
    claims,
    verdictsA: claims.map((claim, index) => verdict(String(claim.id), CHECKER_A, index)),
    verdictsB: claims.map((claim, index) => verdict(String(claim.id), CHECKER_B, index)),
    resolutions: [],
    mapping: null,
  };
}

function claimView(record: JsonObject): { id: string; questionId: string; countyId: string; text: string; choices?: Json } {
  return {
    id: String(record.id),
    questionId: String(record.questionId),
    countyId: String(record.fips ?? record.countyId),
    text: String(record.claim ?? record.text),
    ...(record.choices === undefined ? {} : { choices: record.choices }),
  };
}

function jsonl(records: readonly JsonObject[]): string {
  return records.map((record) => `${JSON.stringify(record)}\n`).join("");
}

function section(manifest: JsonObject, key: string): JsonObject {
  return manifest[key] as JsonObject;
}

/** Serialize a model, filling digests from the content exactly as written. */
export function materialize(model: LedgerModel, order: "as-is" | "shuffled" = "as-is", seed = FIXTURE_SEED): Record<string, string> {
  const rng = seededRng(seed + 7);
  const arrange = <T>(items: readonly T[]): T[] => (order === "shuffled" ? shuffled(items, rng) : [...items]);
  const manifest = structuredClone(model.manifest);
  const files: Record<string, string> = {};
  const claimsSection = section(manifest, "claims");
  const verdicts = section(manifest, "verdicts");
  const a = verdicts.a as JsonObject;
  const b = verdicts.b as JsonObject;
  const resolutions = section(manifest, "resolutions");
  const fill = (target: JsonObject, records: readonly JsonObject[]) => {
    if (target.digest === "") target.digest = recordsDigest(records);
    files[String(target.path)] = jsonl(arrange(records));
  };
  fill(claimsSection, model.claims);
  fill(a, model.verdictsA);
  // Two checker slots may point at one file in planted cases; keep the first file text.
  if (String(b.path) === String(a.path)) {
    if (b.digest === "") b.digest = a.digest ?? "";
  } else fill(b, model.verdictsB);
  fill(resolutions, model.resolutions);
  if (model.mapping) {
    const target = manifest.mapping as JsonObject;
    const mapping = structuredClone(model.mapping);
    mapping.entries = arrange(mapping.entries as JsonObject[]);
    if (target.digest === "") target.digest = mappingDigest(model.mapping);
    files[String(target.path)] = `${JSON.stringify(mapping, null, 2)}\n`;
  }
  files["manifest.json"] = `${JSON.stringify(manifest, null, 2)}\n`;
  return files;
}

function withMapping(model: LedgerModel, provisionalFor: readonly number[]): void {
  const entries: JsonObject[] = [];
  for (const index of provisionalFor) {
    const claim = model.claims[index] as JsonObject;
    const provisionalId = `${SOURCE_DIGEST}+Q${index + 101}`;
    entries.push({
      provisionalId,
      claimId: String(claim.id),
      claimContentDigest: contentDigest(claimView(claim)),
      provenance: { by: PERSON, note: "synthetic fixture mapping" },
    });
    (model.verdictsB[index] as JsonObject).claimId = provisionalId;
  }
  model.mapping = {
    schema: "battlefor92.provisional-map/1",
    sourceDigest: SOURCE_DIGEST,
    claimsRevision: FIXTURE_REVISION,
    entries,
  };
  model.manifest.mapping = { path: "mapping.json", revision: FIXTURE_REVISION, format: "provisional-map/1", digest: "" };
}

const ALL_SHIP_TWO = (model: LedgerModel) =>
  Object.fromEntries(model.claims.map((claim) => [String(claim.id), { decision: "ship" as const, basis: "two-confirmed", reasons: [] }]));

interface Spec {
  name: string;
  kind: "valid" | "planted";
  build: (model: LedgerModel) => void;
  expect: (model: LedgerModel) => CaseExpectation;
  /** Optional post-serialization tamper (digest mismatch cases). */
  tamper?: (files: Record<string, string>) => void;
}

const C0 = "fx-18001-01-a";
const C1 = "fx-18001-01-b";
const C2 = "fx-18003-01-a";

const invalid = (...codes: string[]) => (): CaseExpectation => ({ status: "invalid", gate: "fail", codes });
const rejected = (claimId: string, reasons: string[], basis: string | null = null) => (): CaseExpectation => ({
  status: "valid",
  gate: "fail",
  decisions: { [claimId]: { decision: "reject", basis, reasons } },
});
const va = (model: LedgerModel, index: number) => model.verdictsA[index] as JsonObject;
const vb = (model: LedgerModel, index: number) => model.verdictsB[index] as JsonObject;

const SPECS: readonly Spec[] = [
  // ---------------- valid ----------------
  { name: "valid-two-confirmed", kind: "valid", build: () => {}, expect: (m) => ({ status: "valid", gate: "pass", decisions: ALL_SHIP_TWO(m) }) },
  {
    name: "valid-person-ship-ruling",
    kind: "valid",
    build: (m) => {
      Object.assign(va(m, 0), { kind: "corrected", correction: "synthetic correction" });
      Object.assign(vb(m, 0), { kind: "unconfirmed", evidenceUrls: [] });
      m.resolutions.push({ claimId: C0, decision: "ship", personRef: PERSON, reason: "synthetic fixture ruling" });
    },
    expect: (m) => ({
      status: "valid",
      gate: "pass",
      decisions: { ...ALL_SHIP_TWO(m), [C0]: { decision: "ship", basis: "person-ruling", reasons: [] } },
    }),
  },
  {
    name: "valid-template-formats",
    kind: "valid",
    build: (m) => {
      const toTemplate = (v: JsonObject): JsonObject => ({
        claimId: v.claimId as string,
        checker: v.checkerId as string,
        verdict: v.kind as string,
        correction: null,
        source: { url: (v.evidenceUrls as string[])[0] as string, title: "Synthetic fixture source" },
        note: "",
      });
      m.verdictsA = m.verdictsA.map(toTemplate);
      m.verdictsB = m.verdictsB.map(toTemplate);
      const verdicts = m.manifest.verdicts as JsonObject;
      (verdicts.a as JsonObject).format = "template/0";
      (verdicts.b as JsonObject).format = "template/0";
      (m.manifest.resolutions as JsonObject).format = "template/0";
    },
    expect: (m) => ({ status: "valid", gate: "pass", decisions: ALL_SHIP_TWO(m) }),
  },
  {
    name: "valid-provisional-mapping",
    kind: "valid",
    build: (m) => withMapping(m, [0, 2]),
    expect: (m) => ({ status: "valid", gate: "pass", decisions: ALL_SHIP_TWO(m) }),
  },
  // ---------------- planted: verdict content ----------------
  { name: "planted-missing-source-url", kind: "planted", build: (m) => void (va(m, 1).evidenceUrls = []), expect: invalid("missing-source-url") },
  {
    name: "planted-corrected-missing-source-url",
    kind: "planted",
    build: (m) => void Object.assign(vb(m, 1), { kind: "corrected", correction: "synthetic", evidenceUrls: [] }),
    expect: invalid("missing-source-url"),
  },
  {
    name: "planted-missing-verdicts",
    kind: "planted",
    build: (m) => {
      m.verdictsA.splice(2, 1);
      m.verdictsB.splice(2, 1);
    },
    expect: rejected(C2, ["missing-verdict:a", "missing-verdict:b"]),
  },
  { name: "planted-only-one-verdict", kind: "planted", build: (m) => void m.verdictsB.splice(2, 1), expect: rejected(C2, ["missing-verdict:b"]) },
  {
    name: "planted-unconfirmed-without-ruling",
    kind: "planted",
    build: (m) => void Object.assign(vb(m, 1), { kind: "unconfirmed", evidenceUrls: [] }),
    expect: rejected(C1, ["verdict-unconfirmed:b"]),
  },
  {
    name: "planted-corrected-without-ruling",
    kind: "planted",
    build: (m) => void Object.assign(va(m, 1), { kind: "corrected", correction: "synthetic correction" }),
    expect: rejected(C1, ["verdict-corrected:a"]),
  },
  {
    name: "planted-false-without-ruling",
    kind: "planted",
    build: (m) => void Object.assign(vb(m, 0), { kind: "false" }),
    expect: rejected(C0, ["verdict-false:b"]),
  },
  {
    name: "planted-person-reject-ruling",
    kind: "planted",
    build: (m) => void m.resolutions.push({ claimId: C0, decision: "reject", personRef: PERSON, reason: "synthetic reject" }),
    expect: rejected(C0, ["person-ruling-reject"], "person-ruling"),
  },
  {
    name: "planted-unknown-verdict-kind",
    kind: "planted",
    build: (m) => void (va(m, 0).kind = "probably"),
    expect: invalid("invalid-verdict"),
  },
  {
    name: "planted-unexpected-record-field",
    kind: "planted",
    build: (m) => void (va(m, 0).extra = "unexpected"),
    expect: invalid("record-schema"),
  },
  // ---------------- planted: ids ----------------
  { name: "planted-malformed-claim-id", kind: "planted", build: (m) => void ((m.claims[0] as JsonObject).id = "Bad ID!"), expect: invalid("malformed-id") },
  { name: "planted-malformed-verdict-ref", kind: "planted", build: (m) => void (va(m, 0).claimId = "fx 18001?"), expect: invalid("malformed-id") },
  {
    name: "planted-duplicate-claim-id",
    kind: "planted",
    build: (m) => void m.claims.push({ ...(m.claims[0] as JsonObject), claim: "Synthetic duplicate statement." }),
    expect: invalid("duplicate-id"),
  },
  {
    name: "planted-duplicate-verdict",
    kind: "planted",
    build: (m) => void m.verdictsA.push({ ...va(m, 0), note: "second synthetic verdict" }),
    expect: invalid("duplicate-id"),
  },
  {
    name: "planted-unknown-reference",
    kind: "planted",
    build: (m) => void m.verdictsA.push({ ...va(m, 0), claimId: "fx-18099-01-a" }),
    expect: invalid("unknown-reference"),
  },
  // ---------------- planted: rulings ----------------
  {
    name: "planted-invalid-ruling",
    kind: "planted",
    build: (m) => void m.resolutions.push({ claimId: C0, decision: "maybe", personRef: PERSON, reason: "synthetic" }),
    expect: invalid("invalid-ruling"),
  },
  {
    name: "planted-ruling-by-checker",
    kind: "planted",
    build: (m) => void m.resolutions.push({ claimId: C0, decision: "ship", personRef: CHECKER_A, reason: "synthetic" }),
    expect: invalid("invalid-ruling"),
  },
  {
    name: "planted-conflicting-ruling",
    kind: "planted",
    build: (m) => {
      m.resolutions.push({ claimId: C0, decision: "ship", personRef: PERSON, reason: "synthetic ship" });
      m.resolutions.push({ claimId: C0, decision: "reject", personRef: PERSON, reason: "synthetic reject" });
    },
    expect: invalid("conflicting-ruling"),
  },
  {
    name: "planted-ruling-unknown-claim",
    kind: "planted",
    build: (m) => void m.resolutions.push({ claimId: "fx-18099-01-a", decision: "ship", personRef: PERSON, reason: "synthetic" }),
    expect: invalid("unknown-reference"),
  },
  {
    name: "planted-ship-ruling-with-correction",
    kind: "planted",
    build: (m) => {
      (m.manifest.resolutions as JsonObject).format = "template/0";
      m.resolutions.push({ claimId: C0, ruling: "ship", correction: "synthetic new text", source: null, by: PERSON });
    },
    expect: invalid("invalid-ruling"),
  },
  // ---------------- planted: checker identity ----------------
  {
    name: "planted-same-checker-twice",
    kind: "planted",
    build: (m) => {
      ((m.manifest.verdicts as JsonObject).b as JsonObject).checkerId = CHECKER_A;
      for (const v of m.verdictsB) v.checkerId = CHECKER_A;
    },
    expect: invalid("checker-identity"),
  },
  {
    name: "planted-checker-record-mismatch",
    kind: "planted",
    build: (m) => void (vb(m, 3).checkerId = CHECKER_A),
    expect: invalid("checker-mismatch"),
  },
  {
    name: "planted-checker-is-author",
    kind: "planted",
    build: (m) => {
      ((m.manifest.verdicts as JsonObject).a as JsonObject).checkerId = AUTHOR_ID;
      for (const v of m.verdictsA) v.checkerId = AUTHOR_ID;
    },
    expect: invalid("checker-identity"),
  },
  // ---------------- planted: manifest / digests ----------------
  {
    name: "planted-digest-mismatch",
    kind: "planted",
    build: () => {},
    expect: invalid("digest-mismatch"),
    tamper: (files) => {
      files["claims.jsonl"] = (files["claims.jsonl"] as string).replace("Synthetic fixture statement 1", "Synthetic fixture statement 1 edited");
    },
  },
  {
    name: "planted-mixed-revision",
    kind: "planted",
    build: (m) => void (((m.manifest.verdicts as JsonObject).b as JsonObject).revision = "fixture-r0"),
    expect: invalid("mixed-revision"),
  },
  { name: "planted-unexpected-manifest-schema", kind: "planted", build: (m) => void (m.manifest.schema = "battlefor92.ledger-manifest/2"), expect: invalid("manifest-schema") },
  {
    name: "planted-unknown-input-format",
    kind: "planted",
    build: (m) => void (((m.manifest.verdicts as JsonObject).a as JsonObject).format = "types/9"),
    expect: invalid("format"),
  },
  {
    name: "planted-shared-checker-file",
    kind: "planted",
    build: (m) => void (((m.manifest.verdicts as JsonObject).b as JsonObject).path = "verdicts.a.jsonl"),
    expect: invalid("manifest-schema"),
  },
  // ---------------- planted: provisional mapping ----------------
  {
    name: "planted-stale-mapping-entry",
    kind: "planted",
    build: (m) => {
      withMapping(m, [0, 2]);
      (m.claims[0] as JsonObject).claim = "Synthetic fixture statement 1 rewritten after mapping.";
    },
    expect: invalid("stale-mapping"),
  },
  {
    name: "planted-stale-mapping-choices",
    kind: "planted",
    build: (m) => {
      (m.claims[2] as JsonObject).choices = { A: "Synthetic one", B: "Synthetic two", C: "Synthetic three", D: "Synthetic four" };
      withMapping(m, [2]);
      (m.claims[2] as JsonObject).choices = { A: "Synthetic one", B: "Synthetic two", C: "Synthetic three", D: "Synthetic five" };
    },
    expect: invalid("stale-mapping"),
  },
  {
    name: "planted-mapping-wrong-revision",
    kind: "planted",
    build: (m) => {
      withMapping(m, [0]);
      (m.mapping as JsonObject).claimsRevision = "fixture-r0";
    },
    expect: invalid("stale-mapping"),
  },
  {
    name: "planted-unmapped-provisional",
    kind: "planted",
    build: (m) => void (vb(m, 4).claimId = `${SOURCE_DIGEST}+Q999`),
    expect: invalid("unmapped-reference"),
  },
  {
    name: "planted-ambiguous-mapping",
    kind: "planted",
    build: (m) => {
      withMapping(m, [0]);
      const entries = (m.mapping as JsonObject).entries as JsonObject[];
      entries.push({ ...(entries[0] as JsonObject), claimId: C1, claimContentDigest: contentDigest(claimView(m.claims[1] as JsonObject)) });
    },
    expect: invalid("ambiguous-reference"),
  },
];

export function buildModel(name: string): LedgerModel {
  const spec = SPECS.find((candidate) => candidate.name === name);
  if (!spec) throw new Error(`unknown ledger fixture case ${name}`);
  const model = baseModel();
  spec.build(model);
  return model;
}

export function ledgerCases(order: "as-is" | "shuffled" = "as-is", seed = FIXTURE_SEED): LedgerCase[] {
  return SPECS.map((spec) => {
    const model = baseModel();
    spec.build(model);
    const files = materialize(model, order, seed);
    spec.tamper?.(files);
    return { name: spec.name, kind: spec.kind, expect: spec.expect(model), files };
  });
}
