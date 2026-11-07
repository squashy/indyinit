import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { adjacency, loadAtlas } from "./borders.ts";
import { atlasJson, buildState } from "./build-map.ts";
import { GEOMETRY_SOURCE } from "./geometry-source.ts";
import { parseRegionFile } from "./parse-map.ts";
import { checkMap } from "../gates/map-check.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("a shared arc is a border and a shared corner is not", () => {
  const atlas = loadAtlas(
    {
      type: "Topology",
      arcs: [
        [[0, 0], [1, 0]],
        [[1, 0], [0, 1]],
        [[1, 1], [-1, 0]],
        [[0, 1], [0, -1]],
        [[1, 0], [1, 0]],
        [[2, 0], [0, 1]],
        [[2, 1], [-1, 0]],
        [[0, 0], [0, -1]],
        [[0, -1], [-1, 0]],
        [[-1, -1], [0, 1]],
        [[-1, 0], [1, 0]],
      ],
      objects: {
        counties: {
          geometries: [
            { type: "Polygon", id: "99001", properties: { name: "Alpha" }, arcs: [[0, 1, 2, 3]] },
            { type: "Polygon", id: "99002", properties: { name: "Beta" }, arcs: [[4, 5, 6, -2]] },
            { type: "Polygon", id: "99003", properties: { name: "Gamma" }, arcs: [[7, 8, 9, 10]] },
          ],
        },
      },
    },
    "99",
  );
  const borders = adjacency(atlas);
  assert.deepEqual(borders.neighbors.get(atlas.shapes[0]?.fips ?? fail()), [atlas.shapes[1]?.fips]);
  assert.deepEqual(borders.neighbors.get(atlas.shapes[1]?.fips ?? fail()), [atlas.shapes[0]?.fips]);
  assert.deepEqual(borders.neighbors.get(atlas.shapes[2]?.fips ?? fail()), []);
  assert.deepEqual(
    borders.cornerOnly.map(([left, right]) => [nameOf(atlas, left), nameOf(atlas, right)]),
    [["Alpha", "Gamma"]],
  );
});

test("the Indiana pack matches the Census counties and excludes corner touches", () => {
  const manifest = parseRegionFile(JSON.parse(readFileSync(path.join(root, "regions", "in", "region.json"), "utf8")));
  const built = buildState(manifest, atlasJson());
  const again = buildState(built.manifest, atlasJson());
  assert.equal(JSON.stringify(built.map), JSON.stringify(again.map));
  assert.equal(readFileSync(path.join(root, "data", "regions", "in", "map.json"), "utf8"), `${JSON.stringify(built.map, null, 2)}\n`);
  assert.equal(built.byteLength < 200 * 1024, true);
  assert.equal(built.map.counties.length, 92);
  assert.equal(built.cornerOnly.length > 0, true);
  const names = new Map(built.map.counties.map((county) => [county.id, county.name]));
  const cornerNames = built.cornerOnly.map(([left, right]) => [names.get(left), names.get(right)]);
  assert.equal(cornerNames.some(([left, right]) => left === "Jasper" && right === "LaPorte"), true);
  const jasper = built.map.counties.find((county) => county.name === "Jasper");
  const laporte = built.map.counties.find((county) => county.name === "LaPorte");
  assert.ok(jasper && laporte);
  assert.equal(jasper.neighbors.includes(laporte.id), false);
  const marion = built.map.counties.find((county) => county.name === "Marion");
  const lake = built.map.counties.find((county) => county.name === "Lake");
  const vanderburgh = built.map.counties.find((county) => county.name === "Vanderburgh");
  assert.ok(marion && lake && vanderburgh);
  assert.equal(marion.regionId, "central-indiana");
  assert.equal(lake.regionId, "northwest-indiana");
  assert.equal(vanderburgh.regionId, "southwest-indiana");
  assert.equal(built.map.regions.length, 8);
  assert.equal(built.map.regions.every((region) => region.review === "draft" && region.bonus === 0), true);
  assert.deepEqual(
    marion.neighbors.map((fips) => names.get(fips)).sort(),
    ["Boone", "Hamilton", "Hancock", "Hendricks", "Johnson", "Morgan", "Shelby"],
  );
  const expected: string[] = [];
  for (let code = 18001; code <= 18183; code += 2) expected.push(String(code));
  assert.deepEqual(built.map.counties.map((county) => county.id), expected);
  const issues = checkMap(built.map, built.manifest, { byteLength: built.byteLength, minimumTerritories: 14 });
  assert.deepEqual(issues.filter((issue) => issue.severity === "error"), []);
  assert.equal(built.manifest.geometrySource, GEOMETRY_SOURCE.censusUrl);
});

function nameOf(atlas: ReturnType<typeof loadAtlas>, fips: string): string {
  return atlas.shapes.find((shape) => shape.fips === fips)?.name ?? fips;
}

function fail(): never {
  throw new Error("missing shape");
}
