import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parseMapPack, parseRegionFile, type RegionFile } from "../factory/parse-map.ts";
import type { MapPack } from "../src/types.ts";
import { checkMap, withAsymmetricEdge, withSelfLoop } from "./map-check.ts";
import { runMapGate } from "./map-gate.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("parser rejects a county that is not a FIPS code", () => {
  const pack = sample();
  const first = pack.counties[0];
  if (!first) throw new Error("missing county");
  first.id = "nope";
  assert.throws(() => parseMapPack(pack), /FIPS/);
});

test("a connected symmetric map passes, and the planted breaks fail", () => {
  const manifest = sampleManifest();
  const map = parseMapPack(sample());
  const limits = { byteLength: 100, minimumTerritories: 4 };
  assert.deepEqual(checkMap(map, manifest, limits).filter((issue) => issue.severity === "error"), []);
  assert.equal(checkMap(map, manifest, { byteLength: 100, minimumTerritories: 14 }).some((issue) => issue.code === "too-few-territories"), true);
  assert.equal(checkMap(withSelfLoop(map), manifest, limits).some((issue) => issue.code === "self-loop"), true);
  assert.equal(checkMap(withAsymmetricEdge(map), manifest, limits).some((issue) => issue.code === "asymmetric"), true);
  const renamed: MapPack = {
    ...map,
    regions: map.regions.map((region, index) => (index === 0 ? { ...region, name: "Region 1" } : region)),
  };
  assert.equal(checkMap(renamed, manifest, limits).some((issue) => issue.code === "placeholder-name"), true);
});

test("the map gate shows the planted failures and then accepts the built map", () => {
  const result = runMapGate(root);
  assert.equal(result.exitCode, 0);
  const failAt = result.output.indexOf("FAIL");
  const passAt = result.output.indexOf(": PASS");
  assert.ok(failAt !== -1 && passAt > failAt);
  assert.match(result.output, /injected self-loop: FAIL/);
  assert.match(result.output, /self-loop/);
  assert.match(result.output, /injected asymmetric edge: FAIL/);
  assert.match(result.output, /asymmetric/);
  assert.match(result.output, /^[a-z]{2}: PASS/m);
});

test("the gate command is the same check", () => {
  const result = spawnSync(process.execPath, ["scripts/box-gate.mjs", "map"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /injected self-loop: FAIL/);
  assert.match(result.stdout, /: PASS/);
  const unknown = spawnSync(process.execPath, ["scripts/box-gate.mjs", "missing"], { cwd: root, encoding: "utf8" });
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /Unknown gate/);
});

function sampleManifest(): RegionFile {
  return parseRegionFile({
    abbr: "in",
    name: "Sample",
    fipsPrefix: "99",
    expectedTerritories: 4,
    expectedRegions: 2,
    geometrySource: "https://example.test/counties",
    review: "draft",
    regions: [
      { id: "west-sample", name: "West Sample", counties: ["99001", "99002"], review: "draft" },
      { id: "east-sample", name: "East Sample", counties: ["99003", "99004"], review: "draft" },
    ],
  });
}

function sample() {
  const outline = "M0,0L1,0L1,1L0,1Z";
  const county = (id: string, name: string, regionId: string, neighbors: string[]) => ({
    id,
    name,
    regionId,
    path: outline,
    centroid: [0, 0],
    neighbors,
    facts: [],
  });
  return {
    version: 1,
    id: "indiana",
    digest: "sample",
    viewBox: [0, 0, 10, 10],
    outline: "M0,0L1,0",
    regions: [
      { id: "west-sample", name: "West Sample", bonus: 0, counties: ["99001", "99002"], borderPath: "M1,0L1,1", review: "draft" },
      { id: "east-sample", name: "East Sample", bonus: 0, counties: ["99003", "99004"], borderPath: "M2,0L2,1", review: "draft" },
    ],
    counties: [
      county("99001", "A", "west-sample", ["99002"]),
      county("99002", "B", "west-sample", ["99001", "99003"]),
      county("99003", "C", "east-sample", ["99002", "99004"]),
      county("99004", "D", "east-sample", ["99003"]),
    ],
  };
}
