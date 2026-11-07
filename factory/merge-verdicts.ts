// BTT-32 deterministic verdict merge. Reads a frozen ledger manifest, verifies every input digest,
// applies the ship rule and returns a machine-readable report for the BTT-14 assembler.
// It never writes claims, quiz packs or resolutions. Format notes: gates/LEDGER.md.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

export const MANIFEST_SCHEMA = "battlefor92.ledger-manifest/1";
export const REPORT_SCHEMA = "battlefor92.ledger-report/1";
export const MAPPING_SCHEMA = "battlefor92.provisional-map/1";
export const CONTRACT_VERSION = "ledger/1";
export const DIGEST_ALGORITHM = "sha256-canonical-jsonl/1";
export const ORDER = "claimId-asc";
export const RECORD_FORMATS = ["template/0", "types/1"] as const;
export const MAPPING_FORMAT = "provisional-map/1";
export const SLOTS = ["a", "b"] as const;

export type RecordFormat = (typeof RECORD_FORMATS)[number];
export type Slot = (typeof SLOTS)[number];
export type VerdictKind = "confirmed" | "corrected" | "false" | "unconfirmed";

export type ErrorCode =
  | "manifest-schema"
  | "format"
  | "mixed-revision"
  | "read"
  | "parse"
  | "digest-mismatch"
  | "record-schema"
  | "malformed-id"
  | "duplicate-id"
  | "unknown-reference"
  | "unmapped-reference"
  | "ambiguous-reference"
  | "stale-mapping"
  | "checker-identity"
  | "checker-mismatch"
  | "invalid-verdict"
  | "missing-source-url"
  | "invalid-ruling"
  | "conflicting-ruling";

export interface LedgerError {
  readonly code: ErrorCode;
  readonly detail: string;
}

export interface VerdictTrace {
  readonly slot: Slot;
  readonly checkerId: string;
  /** The reference exactly as the checker wrote it (canonical claim id or provisional id). */
  readonly ref: string;
  readonly mapping: null | { readonly provisionalId: string; readonly claimContentDigest: string; readonly provenance: unknown };
  readonly kind: VerdictKind;
  readonly sourceUrls: readonly string[];
  readonly correction: string | null;
  readonly note: string;
  readonly format: RecordFormat;
}

export interface RulingTrace {
  readonly decision: "ship" | "reject";
  readonly by: string;
  readonly reason: string;
  readonly sourceUrl: string | null;
  readonly format: RecordFormat;
}

export interface ClaimDecision {
  readonly claimId: string;
  readonly questionId: string;
  readonly countyId: string;
  readonly claimContentDigest: string;
  readonly decision: "ship" | "reject";
  readonly basis: "two-confirmed" | "person-ruling" | null;
  readonly reasons: readonly string[];
  /** Rule failures a person ship ruling overrode, kept for traceability. */
  readonly overridden: readonly string[];
  readonly verdicts: readonly VerdictTrace[];
  readonly ruling: RulingTrace | null;
}

export interface QuestionDecision {
  readonly questionId: string;
  readonly countyId: string;
  readonly decision: "ship" | "reject";
  readonly claimIds: readonly string[];
  readonly rejectedClaimIds: readonly string[];
}

export interface LedgerSummary {
  readonly claims: number;
  readonly shipped: number;
  readonly rejected: number;
  readonly shippedTwoConfirmed: number;
  readonly shippedPersonRuling: number;
  readonly rejectedPersonRuling: number;
  readonly questions: number;
  readonly questionsShipped: number;
  readonly questionsRejected: number;
  readonly reasons: Readonly<Record<string, number>>;
}

export interface LedgerReport {
  readonly schema: typeof REPORT_SCHEMA;
  readonly status: "valid" | "invalid";
  readonly notice: string;
  readonly manifestDigest: string | null;
  /** The parsed manifest exactly as supplied (key order preserved). */
  readonly manifest: unknown;
  readonly authorId: string | null;
  readonly inputs: Readonly<Record<string, { readonly records: number; readonly digest: string }>>;
  readonly errors: readonly LedgerError[];
  readonly summary: LedgerSummary;
  readonly claims: readonly ClaimDecision[];
  readonly questions: readonly QuestionDecision[];
}

export const NOTICE =
  "Decisions apply the ship rule to the pinned inputs only. This report is not a fact check and does not mark any question verified; the UI keeps the Questions unverified label.";

const CLAIM_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PROVISIONAL_ID = /^([0-9a-f]{64})\+Q([1-9][0-9]*)$/;
const QUESTION_ID = /^[A-Za-z0-9]+(?:[-_.][A-Za-z0-9]+)*$/;
const COUNTY_ID = /^[0-9]{5}$/;
const IDENTITY = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const DIGEST = /^[0-9a-f]{64}$/;
const REL_PATH = /^[A-Za-z0-9_-][A-Za-z0-9._-]*(?:\/[A-Za-z0-9_-][A-Za-z0-9._-]*)*$/;

// ---------------------------------------------------------------- canonical form and digests

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** sha256-canonical-jsonl/1: canonical JSON per record, sorted, each followed by "\n". Line order does not matter. */
export function recordsDigest(records: readonly unknown[]): string {
  return sha256(records.map(canonicalJson).sort().map((line) => `${line}\n`).join(""));
}

/** Mapping digest: canonical header (without entries), "\n", then sorted canonical entries each followed by "\n". */
export function mappingDigest(mapping: Record<string, unknown>): string {
  const entries = Array.isArray(mapping.entries) ? mapping.entries.map(canonicalJson).sort() : [];
  const rest: Record<string, unknown> = { ...mapping };
  delete rest.entries;
  return sha256(`${canonicalJson(rest)}\n${entries.map((line) => `${line}\n`).join("")}`);
}

export interface ClaimContent {
  readonly id: string;
  readonly questionId: string;
  readonly countyId: string;
  readonly text: string;
  readonly choices?: unknown;
}

/** Binds a mapping entry to claim content: any change to id, question, county, text or choices changes it. */
export function claimContentDigest(claim: ClaimContent): string {
  return sha256(canonicalJson({ id: claim.id, questionId: claim.questionId, countyId: claim.countyId, text: claim.text, choices: claim.choices ?? null }));
}

// ---------------------------------------------------------------- small helpers

type Rec = Record<string, unknown>;

function asRecord(value: unknown): Rec | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Rec) : null;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value === value.trim();
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || value !== value.trim() || value.length === 0) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.length > 0;
  } catch {
    return false;
  }
}

function unknownKeys(record: Rec, allowed: readonly string[]): string[] {
  return Object.keys(record)
    .filter((key) => !allowed.includes(key))
    .sort();
}

function show(value: unknown): string {
  const text = typeof value === "string" ? JSON.stringify(value) : canonicalJson(value);
  return text.length > 90 ? `${text.slice(0, 87)}...` : text;
}

class Errors {
  readonly list: LedgerError[] = [];
  add(code: ErrorCode, detail: string): void {
    this.list.push({ code, detail });
  }
  get count(): number {
    return this.list.length;
  }
  sorted(): LedgerError[] {
    return [...this.list].sort((a, b) => (a.code === b.code ? (a.detail < b.detail ? -1 : a.detail > b.detail ? 1 : 0) : a.code < b.code ? -1 : 1));
  }
}

function parseJsonl(text: string, label: string, errors: Errors): unknown[] | null {
  if (text.charCodeAt(0) === 0xfeff) {
    errors.add("parse", `${label}: byte-order mark is not allowed`);
    return null;
  }
  if (text.includes("\r")) {
    errors.add("parse", `${label}: carriage returns are not allowed (LF only)`);
    return null;
  }
  if (text.length === 0) return [];
  const body = text.endsWith("\n") ? text.slice(0, -1) : text;
  const records: unknown[] = [];
  let failed = false;
  body.split("\n").forEach((line, index) => {
    if (line.trim().length === 0) {
      errors.add("parse", `${label}: line ${index + 1} is blank`);
      failed = true;
      return;
    }
    try {
      records.push(JSON.parse(line));
    } catch {
      errors.add("parse", `${label}: line ${index + 1} is not valid JSON`);
      failed = true;
    }
  });
  return failed ? null : records;
}

// ---------------------------------------------------------------- manifest

interface InputRef {
  readonly key: string;
  readonly path: string;
  readonly revision: string;
  readonly format: string;
  readonly digest: string;
}

interface Manifest {
  readonly revision: string;
  readonly claims: InputRef & { readonly authorId: string };
  readonly verdicts: Readonly<Record<Slot, InputRef & { readonly checkerId: string }>>;
  readonly resolutions: InputRef;
  readonly mapping: InputRef | null;
}

const TOP_KEYS = ["schema", "contractVersion", "digestAlgorithm", "revision", "order", "claims", "verdicts", "resolutions", "mapping"];

function parseInputRef(value: unknown, key: string, extra: readonly string[], errors: Errors): (InputRef & Rec) | null {
  const record = asRecord(value);
  if (!record) {
    errors.add("manifest-schema", `${key} must be an object`);
    return null;
  }
  const allowed = ["path", "revision", "format", "digest", ...extra];
  const extraKeys = unknownKeys(record, allowed);
  if (extraKeys.length > 0) errors.add("manifest-schema", `${key} has unexpected fields ${extraKeys.join(", ")}`);
  let ok = extraKeys.length === 0;
  const p = record.path;
  if (typeof p !== "string" || !REL_PATH.test(p) || p.split("/").some((segment) => segment === "." || segment === "..")) {
    errors.add("manifest-schema", `${key}.path must be a relative path inside the manifest directory`);
    ok = false;
  }
  if (!nonEmpty(record.revision)) {
    errors.add("manifest-schema", `${key}.revision is missing`);
    ok = false;
  }
  if (typeof record.format !== "string") {
    errors.add("manifest-schema", `${key}.format is missing`);
    ok = false;
  }
  if (typeof record.digest !== "string" || !DIGEST.test(record.digest)) {
    errors.add("manifest-schema", `${key}.digest must be 64 lowercase hex characters`);
    ok = false;
  }
  for (const field of extra) {
    if (typeof record[field] !== "string" || !IDENTITY.test(record[field] as string)) {
      errors.add("manifest-schema", `${key}.${field} must be a lowercase identity`);
      ok = false;
    }
  }
  return ok ? ({ ...record, key } as InputRef & Rec) : null;
}

function parseManifest(value: unknown, errors: Errors): Manifest | null {
  const record = asRecord(value);
  if (!record) {
    errors.add("manifest-schema", "manifest must be a JSON object");
    return null;
  }
  const start = errors.count;
  const extra = unknownKeys(record, TOP_KEYS);
  if (extra.length > 0) errors.add("manifest-schema", `manifest has unexpected fields ${extra.join(", ")}`);
  if (record.schema !== MANIFEST_SCHEMA) errors.add("manifest-schema", `schema must be ${MANIFEST_SCHEMA}, got ${show(record.schema)}`);
  if (record.contractVersion !== CONTRACT_VERSION) errors.add("manifest-schema", `contractVersion must be ${CONTRACT_VERSION}, got ${show(record.contractVersion)}`);
  if (record.digestAlgorithm !== DIGEST_ALGORITHM) errors.add("manifest-schema", `digestAlgorithm must be ${DIGEST_ALGORITHM}, got ${show(record.digestAlgorithm)}`);
  if (record.order !== ORDER) errors.add("manifest-schema", `order must be ${ORDER}, got ${show(record.order)}`);
  if (!nonEmpty(record.revision)) errors.add("manifest-schema", "revision is missing");
  const claims = parseInputRef(record.claims, "claims", ["authorId"], errors);
  const verdictsRecord = asRecord(record.verdicts);
  let a: (InputRef & Rec) | null = null;
  let b: (InputRef & Rec) | null = null;
  if (!verdictsRecord) errors.add("manifest-schema", "verdicts must be an object with checker slots a and b");
  else {
    const slotKeys = unknownKeys(verdictsRecord, SLOTS);
    if (slotKeys.length > 0) errors.add("manifest-schema", `verdicts has unexpected slots ${slotKeys.join(", ")}`);
    a = parseInputRef(verdictsRecord.a, "verdicts.a", ["checkerId"], errors);
    b = parseInputRef(verdictsRecord.b, "verdicts.b", ["checkerId"], errors);
  }
  const resolutions = parseInputRef(record.resolutions, "resolutions", [], errors);
  const mapping = record.mapping === null ? null : parseInputRef(record.mapping, "mapping", [], errors);
  if (record.mapping === undefined) errors.add("manifest-schema", "mapping must be present (null when no provisional ids are used)");
  if (errors.count > start || !claims || !a || !b || !resolutions || (record.mapping !== null && !mapping)) return null;

  const refs: InputRef[] = [claims, a, b, resolutions, ...(mapping ? [mapping] : [])];
  const paths = new Map<string, string>();
  for (const ref of refs) {
    const seen = paths.get(ref.path);
    if (seen) errors.add("manifest-schema", `${ref.key} and ${seen} name the same file ${ref.path}`);
    paths.set(ref.path, ref.key);
    if (ref.path === "manifest.json") errors.add("manifest-schema", `${ref.key} must not point at the manifest`);
    if (ref.revision !== record.revision) errors.add("mixed-revision", `${ref.key} revision ${show(ref.revision)} differs from manifest revision ${show(record.revision)}`);
    const formats: readonly string[] = ref.key === "mapping" ? [MAPPING_FORMAT] : RECORD_FORMATS;
    if (!formats.includes(ref.format)) errors.add("format", `${ref.key}.format ${show(ref.format)} is not one of ${formats.join(", ")}`);
  }
  if (errors.count > start) return null;
  return {
    revision: record.revision as string,
    claims: { ...claims, authorId: claims.authorId as string },
    verdicts: { a: { ...a, checkerId: a.checkerId as string }, b: { ...b, checkerId: b.checkerId as string } },
    resolutions,
    mapping,
  };
}

// ---------------------------------------------------------------- adapters (versioned compatibility)

interface NormalClaim extends ClaimContent {
  readonly contentDigest: string;
}

interface NormalVerdict {
  readonly ref: string;
  readonly checkerId: string;
  readonly kind: VerdictKind;
  readonly sourceUrls: readonly string[];
  readonly correction: string | null;
  readonly note: string;
}

interface NormalRuling {
  readonly claimId: string;
  readonly decision: "ship" | "reject";
  readonly by: string;
  readonly reason: string;
  readonly correction: string | null;
  readonly sourceUrl: string | null;
}

const CLAIM_KEYS: Record<RecordFormat, { required: readonly string[]; optional: readonly string[] }> = {
  // CONTRACT.template.md claims.jsonl, as used by regions/in/claims-c1.jsonl.
  "template/0": { required: ["id", "questionId", "fips", "claim"], optional: ["county", "source", "retrieved", "choices"] },
  // src/types.ts Claim.
  "types/1": { required: ["id", "questionId", "countyId", "text", "sourceRow"], optional: ["choices"] },
};

function normalizeClaim(value: unknown, format: RecordFormat, errors: Errors): NormalClaim | null {
  const record = asRecord(value);
  if (!record) {
    errors.add("record-schema", `claims: record ${show(value)} is not an object`);
    return null;
  }
  const keys = CLAIM_KEYS[format];
  const label = `claims: ${typeof record.id === "string" ? show(record.id) : "record without id"}`;
  const start = errors.count;
  const extra = unknownKeys(record, [...keys.required, ...keys.optional]);
  if (extra.length > 0) errors.add("record-schema", `${label} has unexpected fields ${extra.join(", ")}`);
  for (const key of keys.required) if (record[key] === undefined) errors.add("record-schema", `${label} is missing ${key}`);
  const id = record.id;
  const countyId = format === "template/0" ? record.fips : record.countyId;
  const text = format === "template/0" ? record.claim : record.text;
  if (typeof id !== "string" || !CLAIM_ID.test(id) || id.length > 80) errors.add("malformed-id", `${label}: claim id is malformed`);
  if (typeof record.questionId !== "string" || !QUESTION_ID.test(record.questionId)) errors.add("malformed-id", `${label}: questionId is malformed`);
  if (typeof countyId !== "string" || !COUNTY_ID.test(countyId)) errors.add("malformed-id", `${label}: county id is malformed`);
  if (!nonEmpty(text)) errors.add("record-schema", `${label}: claim text is empty`);
  if (record.choices !== undefined) {
    const choices = asRecord(record.choices);
    if (!choices || Object.values(choices).some((choice) => typeof choice !== "string")) errors.add("record-schema", `${label}: choices must map letters to text`);
  }
  if (format === "types/1") {
    const row = asRecord(record.sourceRow);
    if (!row || !nonEmpty(row.fileDigest) || !Number.isSafeInteger(row.rowNumber) || (row.rowNumber as number) < 1 || unknownKeys(row, ["fileDigest", "rowNumber"]).length > 0) {
      errors.add("record-schema", `${label}: sourceRow must be { fileDigest, rowNumber >= 1 }`);
    }
  } else if (record.source !== undefined && record.source !== null) {
    const source = asRecord(record.source);
    if (!source || !isHttpUrl(source.url)) errors.add("record-schema", `${label}: source.url must be an http(s) URL`);
  }
  if (errors.count > start) return null;
  const content: ClaimContent = {
    id: id as string,
    questionId: record.questionId as string,
    countyId: countyId as string,
    text: text as string,
    ...(record.choices === undefined ? {} : { choices: record.choices }),
  };
  return { ...content, contentDigest: claimContentDigest(content) };
}

const VERDICT_KEYS: Record<RecordFormat, readonly string[]> = {
  // CONTRACT.template.md verdicts.*.jsonl.
  "template/0": ["claimId", "checker", "verdict", "correction", "source", "note"],
  // src/types.ts Verdict, as used by regions/in/verdicts.a.jsonl.
  "types/1": ["claimId", "checkerId", "kind", "evidenceUrls", "correction", "note"],
};
const KINDS: readonly VerdictKind[] = ["confirmed", "corrected", "false", "unconfirmed"];

function normalizeVerdict(value: unknown, format: RecordFormat, slot: Slot, errors: Errors): NormalVerdict | null {
  const record = asRecord(value);
  const where = `verdicts.${slot}`;
  if (!record) {
    errors.add("record-schema", `${where}: record ${show(value)} is not an object`);
    return null;
  }
  const label = `${where}: ${typeof record.claimId === "string" ? show(record.claimId) : "record without claimId"}`;
  const start = errors.count;
  const extra = unknownKeys(record, VERDICT_KEYS[format]);
  if (extra.length > 0) errors.add("record-schema", `${label} has unexpected fields ${extra.join(", ")}`);
  const checkerId = format === "template/0" ? record.checker : record.checkerId;
  const kind = format === "template/0" ? record.verdict : record.kind;
  let urls: unknown[] = [];
  if (format === "template/0") {
    if (record.source !== null && record.source !== undefined) {
      const source = asRecord(record.source);
      if (!source || unknownKeys(source, ["url", "title"]).length > 0) errors.add("record-schema", `${label}: source must be { url, title } or null`);
      else urls = source.url === undefined || source.url === "" ? [] : [source.url];
    }
  } else if (!Array.isArray(record.evidenceUrls)) errors.add("record-schema", `${label}: evidenceUrls must be an array`);
  else urls = record.evidenceUrls;
  if (typeof record.claimId !== "string") errors.add("record-schema", `${label}: claimId is missing`);
  if (typeof checkerId !== "string") errors.add("record-schema", `${label}: checker identity is missing`);
  if (typeof record.note !== "string") errors.add("record-schema", `${label}: note must be a string`);
  if (typeof kind !== "string" || !KINDS.includes(kind as VerdictKind)) errors.add("invalid-verdict", `${label}: verdict ${show(kind)} is not one of ${KINDS.join(", ")}`);
  for (const url of urls) if (!isHttpUrl(url)) errors.add("invalid-verdict", `${label}: source URL ${show(url)} is not an http(s) URL`);
  if ((kind === "confirmed" || kind === "corrected") && urls.length === 0) errors.add("missing-source-url", `${label}: ${kind} verdict has no source URL`);
  const correction = record.correction ?? null;
  if (kind === "corrected" && !nonEmpty(correction)) errors.add("invalid-verdict", `${label}: corrected verdict has no correction text`);
  if (kind !== "corrected" && correction !== null) errors.add("invalid-verdict", `${label}: only a corrected verdict may carry a correction`);
  if (errors.count > start) return null;
  return {
    ref: record.claimId as string,
    checkerId: checkerId as string,
    kind: kind as VerdictKind,
    sourceUrls: [...(urls as string[])].sort(),
    correction: correction as string | null,
    note: record.note as string,
  };
}

const RULING_KEYS: Record<RecordFormat, readonly string[]> = {
  // CONTRACT.template.md resolutions.jsonl.
  "template/0": ["claimId", "ruling", "correction", "source", "by"],
  // src/types.ts Resolution.
  "types/1": ["claimId", "decision", "personRef", "reason"],
};

function normalizeRuling(value: unknown, format: RecordFormat, errors: Errors): NormalRuling | null {
  const record = asRecord(value);
  if (!record) {
    errors.add("invalid-ruling", `resolutions: record ${show(value)} is not an object`);
    return null;
  }
  const label = `resolutions: ${typeof record.claimId === "string" ? show(record.claimId) : "record without claimId"}`;
  const start = errors.count;
  const extra = unknownKeys(record, RULING_KEYS[format]);
  if (extra.length > 0) errors.add("invalid-ruling", `${label} has unexpected fields ${extra.join(", ")}`);
  const decision = format === "template/0" ? record.ruling : record.decision;
  const by = format === "template/0" ? record.by : record.personRef;
  const reason = format === "template/0" ? "" : record.reason;
  const correction = format === "template/0" ? (record.correction ?? null) : null;
  let sourceUrl: string | null = null;
  if (typeof record.claimId !== "string") errors.add("invalid-ruling", `${label}: claimId is missing`);
  if (decision !== "ship" && decision !== "reject") errors.add("invalid-ruling", `${label}: ruling ${show(decision)} is not ship or reject`);
  if (!nonEmpty(by)) errors.add("invalid-ruling", `${label}: the ruling names no person`);
  if (format === "types/1" && !nonEmpty(reason)) errors.add("invalid-ruling", `${label}: the ruling gives no reason`);
  if (correction !== null && !nonEmpty(correction)) errors.add("invalid-ruling", `${label}: correction must be text or null`);
  if (decision === "ship" && correction !== null) {
    errors.add("invalid-ruling", `${label}: a ship ruling with a correction would ship text that is not in the frozen claim shard; re-freeze the corrected claim first`);
  }
  if (format === "template/0" && record.source !== null && record.source !== undefined) {
    const source = asRecord(record.source);
    if (!source || !isHttpUrl(source.url)) errors.add("invalid-ruling", `${label}: source.url must be an http(s) URL`);
    else sourceUrl = source.url as string;
  }
  if (errors.count > start) return null;
  return { claimId: record.claimId as string, decision: decision as "ship" | "reject", by: by as string, reason: reason as string, correction: correction as string | null, sourceUrl };
}

// ---------------------------------------------------------------- merge

const EMPTY_SUMMARY: LedgerSummary = {
  claims: 0,
  shipped: 0,
  rejected: 0,
  shippedTwoConfirmed: 0,
  shippedPersonRuling: 0,
  rejectedPersonRuling: 0,
  questions: 0,
  questionsShipped: 0,
  questionsRejected: 0,
  reasons: {},
};

/**
 * Merge pinned ledger inputs. `readInput` resolves a manifest-relative path to file text, or null when missing.
 * Pure: the same manifest and file contents always give the same report, whatever the record order.
 */
export function mergeLedger(manifestText: string, readInput: (relativePath: string) => string | null): LedgerReport {
  const errors = new Errors();
  let manifestValue: unknown = null;
  let manifestDigest: string | null = null;
  const inputs: Record<string, { records: number; digest: string }> = {};
  const invalid = (authorId: string | null = null): LedgerReport => ({
    schema: REPORT_SCHEMA,
    status: "invalid",
    notice: NOTICE,
    manifestDigest,
    manifest: manifestValue,
    authorId,
    inputs: {},
    errors: errors.sorted(),
    summary: EMPTY_SUMMARY,
    claims: [],
    questions: [],
  });

  try {
    manifestValue = JSON.parse(manifestText);
    manifestDigest = sha256(canonicalJson(manifestValue));
  } catch {
    errors.add("manifest-schema", "manifest is not valid JSON");
    return invalid();
  }
  const manifest = parseManifest(manifestValue, errors);
  if (!manifest) return invalid();

  // 1. Read and verify every digest before looking at any record.
  const refs: InputRef[] = [manifest.claims, manifest.verdicts.a, manifest.verdicts.b, manifest.resolutions, ...(manifest.mapping ? [manifest.mapping] : [])];
  const parsed = new Map<string, unknown>();
  for (const ref of refs) {
    const text = readInput(ref.path);
    if (text === null) {
      errors.add("read", `${ref.key}: ${ref.path} could not be read`);
      continue;
    }
    if (ref.key === "mapping") {
      let value: unknown;
      try {
        if (text.charCodeAt(0) === 0xfeff) throw new Error("bom");
        value = JSON.parse(text);
      } catch {
        errors.add("parse", `mapping: ${ref.path} is not valid JSON`);
        continue;
      }
      const record = asRecord(value);
      if (!record) {
        errors.add("parse", "mapping: file must hold a JSON object");
        continue;
      }
      const actual = mappingDigest(record);
      if (actual !== ref.digest) errors.add("digest-mismatch", `mapping: digest ${actual} does not match manifest ${ref.digest}`);
      inputs[ref.key] = { records: Array.isArray(record.entries) ? record.entries.length : 0, digest: actual };
      parsed.set(ref.key, record);
      continue;
    }
    const records = parseJsonl(text, ref.key, errors);
    if (!records) continue;
    const actual = recordsDigest(records);
    if (actual !== ref.digest) errors.add("digest-mismatch", `${ref.key}: digest ${actual} does not match manifest ${ref.digest}`);
    inputs[ref.key] = { records: records.length, digest: actual };
    parsed.set(ref.key, records);
  }
  if (errors.count > 0) return invalid(manifest.claims.authorId);

  // 2. Checker independence.
  const authorId = manifest.claims.authorId;
  const checkerA = manifest.verdicts.a.checkerId;
  const checkerB = manifest.verdicts.b.checkerId;
  if (checkerA === checkerB) errors.add("checker-identity", `verdicts.a and verdicts.b both name checker ${show(checkerA)}; two independent checkers are required`);
  for (const slot of SLOTS) {
    if (manifest.verdicts[slot].checkerId === authorId) errors.add("checker-identity", `verdicts.${slot} checker ${show(authorId)} is the claim author`);
  }

  // 3. Claims.
  const claims = new Map<string, NormalClaim>();
  const duplicateClaims = new Set<string>();
  for (const value of parsed.get("claims") as unknown[]) {
    const claim = normalizeClaim(value, manifest.claims.format as RecordFormat, errors);
    if (!claim) continue;
    if (claims.has(claim.id)) duplicateClaims.add(claim.id);
    else claims.set(claim.id, claim);
  }
  for (const id of duplicateClaims) errors.add("duplicate-id", `claims: claim id ${show(id)} appears more than once`);
  const questionCounty = new Map<string, string>();
  for (const claim of claims.values()) {
    const county = questionCounty.get(claim.questionId);
    if (county !== undefined && county !== claim.countyId) errors.add("record-schema", `claims: question ${show(claim.questionId)} is bound to more than one county`);
    questionCounty.set(claim.questionId, claim.countyId);
  }

  // 4. Provisional mapping.
  const mapping = new Map<string, { claimId: string; claimContentDigest: string; provenance: unknown }>();
  if (manifest.mapping) {
    const record = parsed.get("mapping") as Rec;
    const extra = unknownKeys(record, ["schema", "sourceDigest", "claimsRevision", "entries"]);
    if (extra.length > 0) errors.add("record-schema", `mapping has unexpected fields ${extra.join(", ")}`);
    if (record.schema !== MAPPING_SCHEMA) errors.add("format", `mapping.schema must be ${MAPPING_SCHEMA}, got ${show(record.schema)}`);
    const sourceDigest = record.sourceDigest;
    if (typeof sourceDigest !== "string" || !DIGEST.test(sourceDigest)) errors.add("record-schema", "mapping.sourceDigest must be 64 lowercase hex characters");
    if (record.claimsRevision !== manifest.claims.revision) {
      errors.add("stale-mapping", `mapping was built for claims revision ${show(record.claimsRevision)}, not ${show(manifest.claims.revision)}`);
    }
    const entries = Array.isArray(record.entries) ? record.entries : [];
    if (!Array.isArray(record.entries)) errors.add("record-schema", "mapping.entries must be an array");
    const counts = new Map<string, number>();
    const targets = new Map<string, string[]>();
    for (const value of entries) {
      const entry = asRecord(value);
      const label = `mapping: ${entry && typeof entry.provisionalId === "string" ? show(entry.provisionalId) : "entry without provisionalId"}`;
      if (!entry) {
        errors.add("record-schema", `${label} is not an object`);
        continue;
      }
      const start = errors.count;
      const entryExtra = unknownKeys(entry, ["provisionalId", "claimId", "claimContentDigest", "provenance"]);
      if (entryExtra.length > 0) errors.add("record-schema", `${label} has unexpected fields ${entryExtra.join(", ")}`);
      const match = typeof entry.provisionalId === "string" ? PROVISIONAL_ID.exec(entry.provisionalId) : null;
      if (!match) errors.add("malformed-id", `${label}: provisionalId must be <source sha256>+Q<number>`);
      else if (match[1] !== sourceDigest) errors.add("stale-mapping", `${label}: provisional id belongs to a different source digest`);
      if (typeof entry.claimId !== "string" || !CLAIM_ID.test(entry.claimId)) errors.add("malformed-id", `${label}: claimId is malformed`);
      if (typeof entry.claimContentDigest !== "string" || !DIGEST.test(entry.claimContentDigest)) errors.add("record-schema", `${label}: claimContentDigest is missing`);
      const provenance = asRecord(entry.provenance);
      if (!provenance || !nonEmpty(provenance.by)) errors.add("record-schema", `${label}: provenance.by must name who made the mapping`);
      if (errors.count > start) continue;
      const provisionalId = entry.provisionalId as string;
      const claimId = entry.claimId as string;
      counts.set(provisionalId, (counts.get(provisionalId) ?? 0) + 1);
      targets.set(claimId, [...(targets.get(claimId) ?? []), provisionalId]);
      const claim = claims.get(claimId);
      if (!claim) errors.add("unknown-reference", `${label}: maps to claim ${show(claimId)} which is not in the claim shard`);
      else if (claim.contentDigest !== entry.claimContentDigest) {
        errors.add("stale-mapping", `${label}: claim ${show(claimId)} text or choices changed since the mapping was made`);
      }
      mapping.set(provisionalId, { claimId, claimContentDigest: entry.claimContentDigest as string, provenance: entry.provenance });
    }
    for (const [provisionalId, count] of counts) if (count > 1) errors.add("ambiguous-reference", `mapping: ${show(provisionalId)} is mapped ${count} times`);
    for (const [claimId, ids] of targets) {
      if (ids.length > 1 && new Set(ids).size > 1) errors.add("ambiguous-reference", `mapping: claim ${show(claimId)} is the target of ${ids.length} provisional ids`);
    }
  }

  // 5. Verdicts.
  const verdicts: Record<Slot, Map<string, VerdictTrace>> = { a: new Map(), b: new Map() };
  for (const slot of SLOTS) {
    const ref = manifest.verdicts[slot];
    const duplicates = new Set<string>();
    for (const value of parsed.get(`verdicts.${slot}`) as unknown[]) {
      const verdict = normalizeVerdict(value, ref.format as RecordFormat, slot, errors);
      if (!verdict) continue;
      if (verdict.checkerId !== ref.checkerId) {
        errors.add("checker-mismatch", `verdicts.${slot}: ${show(verdict.ref)} is attributed to ${show(verdict.checkerId)}, but this file is checker ${show(ref.checkerId)}'s`);
        continue;
      }
      let claimId: string;
      let mapped: VerdictTrace["mapping"] = null;
      if (CLAIM_ID.test(verdict.ref)) {
        if (!claims.has(verdict.ref)) {
          errors.add("unknown-reference", `verdicts.${slot}: ${show(verdict.ref)} is not a claim in the shard`);
          continue;
        }
        claimId = verdict.ref;
      } else if (PROVISIONAL_ID.test(verdict.ref)) {
        const entry = mapping.get(verdict.ref);
        if (!entry) {
          errors.add("unmapped-reference", `verdicts.${slot}: provisional id ${show(verdict.ref)} has no validated mapping`);
          continue;
        }
        claimId = entry.claimId;
        mapped = { provisionalId: verdict.ref, claimContentDigest: entry.claimContentDigest, provenance: entry.provenance };
      } else {
        errors.add("malformed-id", `verdicts.${slot}: reference ${show(verdict.ref)} is neither a claim id nor a provisional id`);
        continue;
      }
      if (verdicts[slot].has(claimId)) {
        duplicates.add(claimId);
        continue;
      }
      verdicts[slot].set(claimId, {
        slot,
        checkerId: verdict.checkerId,
        ref: verdict.ref,
        mapping: mapped,
        kind: verdict.kind,
        sourceUrls: verdict.sourceUrls,
        correction: verdict.correction,
        note: verdict.note,
        format: ref.format as RecordFormat,
      });
    }
    for (const id of duplicates) errors.add("duplicate-id", `verdicts.${slot}: claim ${show(id)} has more than one verdict from this checker`);
  }

  // 6. Person rulings.
  const rulings = new Map<string, RulingTrace>();
  const rulingGroups = new Map<string, NormalRuling[]>();
  const bots = new Set([authorId, checkerA, checkerB].map((id) => id.toLowerCase()));
  for (const value of parsed.get("resolutions") as unknown[]) {
    const ruling = normalizeRuling(value, manifest.resolutions.format as RecordFormat, errors);
    if (!ruling) continue;
    if (!CLAIM_ID.test(ruling.claimId)) {
      errors.add("malformed-id", `resolutions: ${show(ruling.claimId)} is not a canonical claim id`);
      continue;
    }
    if (!claims.has(ruling.claimId)) {
      errors.add("unknown-reference", `resolutions: ${show(ruling.claimId)} is not a claim in the shard`);
      continue;
    }
    if (bots.has(ruling.by.toLowerCase())) {
      errors.add("invalid-ruling", `resolutions: ${show(ruling.claimId)} is ruled by ${show(ruling.by)}, which is the author or a checker, not a person ruling`);
      continue;
    }
    rulingGroups.set(ruling.claimId, [...(rulingGroups.get(ruling.claimId) ?? []), ruling]);
  }
  for (const [claimId, group] of rulingGroups) {
    if (group.length > 1) {
      const decisions = new Set(group.map((ruling) => ruling.decision));
      errors.add("conflicting-ruling", `resolutions: ${show(claimId)} has ${group.length} rulings (${[...decisions].sort().join(", ")}); exactly one is allowed`);
      continue;
    }
    const ruling = group[0] as NormalRuling;
    rulings.set(claimId, { decision: ruling.decision, by: ruling.by, reason: ruling.reason, sourceUrl: ruling.sourceUrl, format: manifest.resolutions.format as RecordFormat });
  }

  if (errors.count > 0) return invalid(authorId);

  // 7. Decisions, in claim id order.
  const decisions: ClaimDecision[] = [];
  for (const id of [...claims.keys()].sort()) {
    const claim = claims.get(id) as NormalClaim;
    const traces: VerdictTrace[] = [];
    const failures: string[] = [];
    for (const slot of SLOTS) {
      const verdict = verdicts[slot].get(id);
      if (!verdict) failures.push(`missing-verdict:${slot}`);
      else {
        traces.push(verdict);
        if (verdict.kind !== "confirmed") failures.push(`verdict-${verdict.kind}:${slot}`);
      }
    }
    const ruling = rulings.get(id) ?? null;
    let decision: ClaimDecision["decision"];
    let basis: ClaimDecision["basis"];
    let reasons: string[];
    let overridden: string[] = [];
    if (ruling?.decision === "ship") {
      decision = "ship";
      basis = "person-ruling";
      reasons = [];
      overridden = failures;
    } else if (ruling?.decision === "reject") {
      decision = "reject";
      basis = "person-ruling";
      reasons = ["person-ruling-reject", ...failures];
    } else if (failures.length === 0) {
      decision = "ship";
      basis = "two-confirmed";
      reasons = [];
    } else {
      decision = "reject";
      basis = null;
      reasons = failures;
    }
    decisions.push({
      claimId: id,
      questionId: claim.questionId,
      countyId: claim.countyId,
      claimContentDigest: claim.contentDigest,
      decision,
      basis,
      reasons,
      overridden,
      verdicts: traces,
      ruling,
    });
  }

  const byQuestion = new Map<string, ClaimDecision[]>();
  for (const decision of decisions) byQuestion.set(decision.questionId, [...(byQuestion.get(decision.questionId) ?? []), decision]);
  const questions: QuestionDecision[] = [...byQuestion.keys()].sort().map((questionId) => {
    const group = byQuestion.get(questionId) as ClaimDecision[];
    const rejectedClaimIds = group.filter((claim) => claim.decision === "reject").map((claim) => claim.claimId);
    return {
      questionId,
      countyId: (group[0] as ClaimDecision).countyId,
      decision: rejectedClaimIds.length === 0 ? "ship" : "reject",
      claimIds: group.map((claim) => claim.claimId),
      rejectedClaimIds,
    };
  });

  const reasonCounts = new Map<string, number>();
  for (const decision of decisions) for (const reason of decision.reasons) reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  const summary: LedgerSummary = {
    claims: decisions.length,
    shipped: decisions.filter((claim) => claim.decision === "ship").length,
    rejected: decisions.filter((claim) => claim.decision === "reject").length,
    shippedTwoConfirmed: decisions.filter((claim) => claim.basis === "two-confirmed").length,
    shippedPersonRuling: decisions.filter((claim) => claim.decision === "ship" && claim.basis === "person-ruling").length,
    rejectedPersonRuling: decisions.filter((claim) => claim.decision === "reject" && claim.basis === "person-ruling").length,
    questions: questions.length,
    questionsShipped: questions.filter((question) => question.decision === "ship").length,
    questionsRejected: questions.filter((question) => question.decision === "reject").length,
    reasons: Object.fromEntries([...reasonCounts.keys()].sort().map((reason) => [reason, reasonCounts.get(reason) as number])),
  };

  const orderedInputs: Record<string, { records: number; digest: string }> = {};
  for (const ref of refs) orderedInputs[ref.key] = inputs[ref.key] as { records: number; digest: string };

  return {
    schema: REPORT_SCHEMA,
    status: "valid",
    notice: NOTICE,
    manifestDigest,
    manifest: manifestValue,
    authorId,
    inputs: orderedInputs,
    errors: [],
    summary,
    claims: decisions,
    questions,
  };
}

/** Merge from a manifest on disk; input paths resolve relative to the manifest's directory. */
export function mergeLedgerFile(manifestPath: string): LedgerReport {
  const dir = path.dirname(path.resolve(manifestPath));
  let manifestText: string;
  try {
    manifestText = readFileSync(manifestPath, "utf8");
  } catch {
    return mergeLedger("", () => null);
  }
  return mergeLedger(manifestText, (relative) => {
    try {
      return readFileSync(path.join(dir, relative), "utf8");
    } catch {
      return null;
    }
  });
}

export function serializeReport(report: LedgerReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

/** Paths the merge must never write: inputs, the manifest, quiz packs and any JSONL shard. */
export function refusedOutput(out: string, manifestPath: string, report: LedgerReport): string | null {
  const resolved = path.resolve(out);
  const base = path.basename(resolved).toLowerCase();
  if (base === "quiz.json") return "quiz packs are owned by the BTT-14 assembler";
  if (base.endsWith(".jsonl")) return "JSONL shards (claims, verdicts, resolutions) are never written by the merge";
  const manifestResolved = path.resolve(manifestPath);
  if (resolved === manifestResolved) return "the output would overwrite the manifest";
  const manifest = asRecord(report.manifest);
  if (manifest) {
    const dir = path.dirname(manifestResolved);
    const verdicts = asRecord(manifest.verdicts) ?? {};
    for (const section of [manifest.claims, verdicts.a, verdicts.b, manifest.resolutions, manifest.mapping]) {
      const ref = asRecord(section);
      if (ref && typeof ref.path === "string" && path.resolve(dir, ref.path) === resolved) return "the output would overwrite a pinned input";
    }
  }
  return null;
}

function usage(): string {
  return "Usage: node --experimental-strip-types factory/merge-verdicts.ts --manifest <manifest.json> [--out <report.json>]\nWith no --out the report goes to stdout. Exit 0 valid report, 1 invalid inputs (report still written), 2 usage or refused output.";
}

export function runMergeCli(argv: readonly string[]): number {
  let manifestPath: string | null = null;
  let out: string | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--manifest") manifestPath = argv[++index] ?? null;
    else if (arg === "--out") out = argv[++index] ?? null;
    else if (arg === "--help" || arg === "-h") {
      console.log(usage());
      return 0;
    } else {
      console.error(`unknown argument ${arg}\n${usage()}`);
      return 2;
    }
  }
  if (!manifestPath || (out !== null && out.length === 0)) {
    console.error(usage());
    return 2;
  }
  const report = mergeLedgerFile(manifestPath);
  const text = serializeReport(report);
  if (out === null || out === "-") process.stdout.write(text);
  else {
    const refused = refusedOutput(out, manifestPath, report);
    if (refused) {
      console.error(`refusing to write ${out}: ${refused}`);
      return 2;
    }
    mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    writeFileSync(out, text, "utf8");
  }
  if (report.status !== "valid") for (const error of report.errors) console.error(`${error.code} ${error.detail}`);
  return report.status === "valid" ? 0 : 1;
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(path.resolve(entry)).href) {
  process.exitCode = runMergeCli(process.argv.slice(2));
}
