# Ledger truth gate and verdict merge (BTT-32)

Status: post-demo tooling. CONTRACT.md §7.4 keeps the ledger, verdicts, resolutions and the ship rule
**deferred**. Nothing here is an import prerequisite for BTT-14. Nothing here marks a question verified,
and the UI keeps the "Questions unverified" label. The box gate runs only the synthetic fixture suite.
No real checker coverage is gated or claimed.

| File | Role |
|---|---|
| `factory/merge-verdicts.ts` | Pure merge plus a CLI. It reads a frozen manifest and writes one report. |
| `gates/ledger.ts` | Strict gate. It re-checks a report on its own logic. With no arguments it runs the fixture suite (the `ledger` box gate). |
| `gates/fixtures/ledger/cases.ts` | Seeded synthetic fixtures: 4 valid cases and 33 planted ones. All of the data is invented. |
| `factory/merge-verdicts.test.ts`, `gates/ledger.test.ts` | node:test suites, registered in `npm test`. |

## Commands

```
node --experimental-strip-types factory/merge-verdicts.ts --manifest <dir>/manifest.json [--out <report.json>]
node --experimental-strip-types gates/ledger.ts --manifest <dir>/manifest.json
npm run gates -- ledger          # fixture suite only
```

Merge exit codes:
- 0: the report is valid. Claims can still be rejected in a valid report.
- 1: invalid inputs. The report is still written, with `errors` filled in and no decisions.
- 2: a usage error, or an output path the merge refuses to write.

With no `--out`, the report goes to stdout. The merge refuses to write these paths:
- any `quiz.json`
- any `*.jsonl`
- the manifest
- any pinned input

The assembler (BTT-14) owns claims and quiz files. The merge never writes them.

Gate exit codes:
- 0: the inputs are valid and **every** claim in the frozen shard ships.
- 1: anything else. Each failure is printed as a line.

A rejected claim is a correct merge outcome. Even so, the shard is not a verified set until it is dropped or resolved.

## Manifest: `battlefor92.ledger-manifest/1`

```json
{
  "schema": "battlefor92.ledger-manifest/1",
  "contractVersion": "ledger/1",
  "digestAlgorithm": "sha256-canonical-jsonl/1",
  "revision": "<freeze revision, e.g. a commit sha>",
  "order": "claimId-asc",
  "claims":      { "path": "claims.jsonl",      "revision": "<same>", "format": "template/0", "digest": "<64 hex>", "authorId": "<author identity>" },
  "verdicts": {
    "a":         { "path": "verdicts.a.jsonl",  "revision": "<same>", "format": "types/1",    "digest": "<64 hex>", "checkerId": "<checker A identity>" },
    "b":         { "path": "verdicts.b.jsonl",  "revision": "<same>", "format": "types/1",    "digest": "<64 hex>", "checkerId": "<checker B identity>" }
  },
  "resolutions": { "path": "resolutions.jsonl", "revision": "<same>", "format": "types/1",    "digest": "<64 hex>" },
  "mapping": null
}
```

These rules are checked before any decision is made. Every failure is fatal (fail closed):

- **Manifest shape.** The schema, contract version, digest algorithm and order must be exactly the values shown. Unknown fields are rejected.
- **Paths.** Paths are relative to the manifest directory. A `..` segment, an absolute path, or two inputs naming the same file are rejected.
- **Revision.** Every input `revision` must equal the top-level `revision` (`mixed-revision`).
- **Formats.** `format` must be a known adapter (`format`).
- **Digests.** Every input is read and its digest checked first (`digest-mismatch`).
- **Identities.** Identity names are lowercase. `checkerId` a must differ from b, and neither may equal `authorId` (`checker-identity`). Every verdict record's checker must match its file's `checkerId` (`checker-mismatch`).

The report echoes the parsed manifest exactly as supplied (key order preserved). It adds `manifestDigest`, which is the sha256 of the manifest's canonical JSON.

### Digest `sha256-canonical-jsonl/1`

Each JSONL record is serialized as canonical JSON: object keys sorted by UTF-16 code unit, with no whitespace. The canonical lines are sorted, and each one is followed by `\n`. The digest is the sha256 of the result.

The digest pins the content, not the line order. That is why shuffled input order gives the same manifest and a byte-identical report. Duplicate records still count, because the sort keeps them.

JSONL files must follow these rules:
- UTF-8 with no BOM
- LF line endings only
- no blank lines
- at most one trailing newline

An empty file means zero records.

## Versioned compatibility adapters

The repository has two shapes for the same records. Neither is redefined here. `format` selects an adapter, and every adapter rejects unknown fields.

| Input | `template/0` (CONTRACT.template.md "Fact ledger") | `types/1` (`src/types.ts`) |
|---|---|---|
| claim | `{id, questionId, fips, claim}`, plus optional `county`, `source{url,title}`, `retrieved`, `choices`. This is the shape of `regions/in/claims-c1.jsonl`. | `Claim {id, countyId, questionId, text, sourceRow{fileDigest,rowNumber}}`, plus optional `choices` |
| verdict | `{claimId, checker, verdict, correction, source{url,title}\|null, note}` | `Verdict {claimId, checkerId, kind, evidenceUrls[], correction?, note}`. This is the shape of `regions/in/verdicts.a.jsonl`. |
| ruling | `{claimId, ruling: ship\|reject, correction, source, by}` | `Resolution {claimId, decision: ship\|reject, personRef, reason}` |

The verdict values are the contract's four values: `confirmed`, `corrected`, `false` and `unconfirmed`.
- A `confirmed` or `corrected` verdict must have at least one http(s) source URL (`missing-source-url`).
- A `corrected` verdict needs correction text. No other verdict may carry one.

`choices` on a claim is an optional adapter extension. Today's claims carry no options. It lets a mapping bind to the question's options when they are supplied.

## IDs

| Kind | Rule |
|---|---|
| Canonical claim id | `^[a-z0-9]+(?:-[a-z0-9]+)*$`, at most 80 characters, for example `c1-18001-01-a` or `in-18001-003` |
| Question id | `^[A-Za-z0-9]+(?:[-_.][A-Za-z0-9]+)*$` |
| County | five digits |
| Provisional checker reference | `<64-hex source digest>+Q<n>`, which points at a CSV row. It is **not** a claim id. |

These ID cases fail closed:
- Malformed ids: `malformed-id`.
- A duplicate claim id, or two verdicts from one checker for one claim: `duplicate-id`.
- A reference to a claim that is not in the shard: `unknown-reference`.

A mapping is never guessed.

## Provisional mapping: `battlefor92.provisional-map/1`

This is optional. Set the manifest's `mapping` to `{path, revision, format: "provisional-map/1", digest}`. Use `null` when no provisional ids are used.

```json
{
  "schema": "battlefor92.provisional-map/1",
  "sourceDigest": "<64 hex: the CSV digest in the provisional ids>",
  "claimsRevision": "<must equal claims.revision>",
  "entries": [
    { "provisionalId": "<sourceDigest>+Q101", "claimId": "c1-18001-01-a",
      "claimContentDigest": "<sha256 of canonical {id, questionId, countyId, text, choices|null}>",
      "provenance": { "by": "<who mapped it>", "note": "..." } }
  ]
}
```

The mapping digest is the sha256 of two parts, in order:
1. the header's canonical JSON (without `entries`), followed by `\n`;
2. the sorted canonical entries, each followed by `\n`.

These mapping cases fail closed:
- **Stale mapping.** Any of these is `stale-mapping`:
  - `claimsRevision` does not match.
  - A provisional id carries a different source digest.
  - The `claimContentDigest` no longer matches, because the claim's text, choices, question or county changed.
- **Unmapped reference.** A provisional id with no entry: `unmapped-reference`.
- **Ambiguous mapping.** One provisional id mapped twice, or one claim targeted by two provisional ids: `ambiguous-reference`.

A mapped verdict keeps its original `ref` (the provisional id) and the entry's `provenance` in the report.

## Ship rule (CONTRACT.template.md, applied exactly)

Each claim gets one decision. The table is checked top to bottom.

| Condition | Decision | `basis` | `reasons` |
|---|---|---|---|
| A valid person ruling `ship` | ship | `person-ruling` | `[]`. `overridden` lists the rule failures the ruling overrode. |
| A valid person ruling `reject` | reject | `person-ruling` | `person-ruling-reject`, then any rule failures |
| Checker a and checker b both `confirmed` | ship | `two-confirmed` | `[]` |
| Anything else | reject | `null` | for example `missing-verdict:b`, `verdict-corrected:a`, `verdict-false:b`, `verdict-unconfirmed:a` |

Corrected, false, unconfirmed and missing verdicts are all rejected unless a person rules otherwise.

A question ships only if all of its claims ship. `questions[]` lists the rejected claim ids for each question.

Rulings fail closed in these cases:
- **Invalid ruling.** Any of these is `invalid-ruling`:
  - The ruling value is unknown.
  - No person is named.
  - A `types/1` ruling gives no reason.
  - The ruling is by the author or a checker identity.
  - A `ship` ruling carries a correction. That would ship text that is not in the frozen shard. Re-freeze the corrected claim first.
- **Duplicate or conflicting rulings** for one claim: `conflicting-ruling`.
- **Unknown claim.** A ruling for a claim that is not in the shard: `unknown-reference`.

`resolutions.jsonl` stays human-only. These tools read it and never write it.

## Report: `battlefor92.ledger-report/1`

The report has these top-level fields:
- `schema`
- `status` (`valid` or `invalid`)
- `notice`
- `manifestDigest`
- `manifest` (the exact echo)
- `authorId`
- `inputs` (for each input: record count and verified digest)
- `errors` (sorted)
- `summary` (counts, plus a count for each reason)
- `claims[]`, sorted by claim id. Each entry carries the decision, `basis`, `reasons`, `overridden`, verdict traces and the ruling trace.
- `questions[]`

The report has no timestamps and no absolute paths. The same pinned inputs give a byte-identical report.

## Production runs

A production truth-gate run needs these frozen real inputs:
- the claim shard
- both checkers' verdict files
- resolutions
- the mapping, if one is used
- a manifest at one revision

Real checker B coverage does not exist yet. Until it does, the gate would reject claims, and verified-content publication stays blocked. That is expected. It is not a failure of this runner. The box `ledger` gate therefore runs only the synthetic suite:
- planted cases must fail;
- valid cases must pass;
- reruns and shuffled inputs must be byte-identical.
