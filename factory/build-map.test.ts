import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { adjacency, loadAtlas } from "./borders.ts";
import { atlasJson, buildState } from "./build-map.ts";
import { embedMap, pageViewBox } from "./embed-map.ts";
import { GEOMETRY_SOURCE } from "./geometry-source.ts";
import { northTilt } from "./north-tilt.ts";
import type { MapPack } from "../src/types.ts";
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
  assert.equal(marion.regionId, "crossroads");
  assert.equal(lake.regionId, "dunes-michiana");
  assert.equal(vanderburgh.regionId, "pocket-coal-country");
  assert.equal(built.map.regions.length, 8);
  assert.equal(built.map.regions.every((region) => region.review === "reviewed" && Number.isSafeInteger(region.bonus) && region.bonus > 0), true);
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

test("the page map, the pack and the quiz digest agree, and the map is north-up", () => {
  const map = JSON.parse(readFileSync(path.join(root, "data", "regions", "in", "map.json"), "utf8")) as MapPack;
  const html = readFileSync(path.join(root, "index.html"), "utf8");
  assert.equal(embedMap(html, map), html, "index.html map markup is stale: run npm run build:map");
  assert.equal(html.includes(`viewBox="${pageViewBox(map).join(" ")}"`), true);
  const quiz = JSON.parse(readFileSync(path.join(root, "data", "quiz.json"), "utf8")) as { mapDigest: string };
  assert.equal(quiz.mapDigest, map.digest);
  assert.equal(GEOMETRY_SOURCE.file, "counties-10m.json");
  assert.equal(Math.abs(northTilt(map)) < 1, true, `north line tilt ${northTilt(map)} degrees`);
});

test("an explicit integer bonus is copied and a missing bonus stays zero without being marked reviewed", () => {
  const raw = JSON.parse(readFileSync(path.join(root, "regions", "in", "region.json"), "utf8")) as {
    review: string;
    regions: { bonus?: number; review: string; id: string; counties: string[] }[];
  };
  assert.equal(raw.regions.every((region) => Number.isSafeInteger(region.bonus) && region.review === "reviewed"), true);
  assert.equal(raw.regions.every((region) => region.counties.every((county) => !/^\d{5}$/.test(county))), true);
  const adopted = structuredClone(raw);
  const first = adopted.regions[0];
  const second = adopted.regions[1];
  if (!first || !second) throw new Error("missing region");
  first.bonus = 5;
  delete second.bonus;
  second.review = "draft";
  const parsed = parseRegionFile(adopted);
  assert.equal(parsed.regions[0]?.bonus, 5);
  assert.equal(parsed.regions[1]?.bonus, undefined);
  const built = buildState(parsed, atlasJson());
  const copied = built.map.regions.find((region) => region.id === first.id);
  const untouched = built.map.regions.find((region) => region.id === second.id);
  assert.equal(copied?.bonus, 5);
  assert.equal(copied?.review, "reviewed");
  assert.equal(untouched?.bonus, 0);
  assert.equal(untouched?.review, "draft");
  assert.equal(built.manifest.regions.find((region) => region.id === first.id)?.bonus, 5);
  assert.equal(built.manifest.regions.find((region) => region.id === second.id)?.bonus, undefined);
  const fractional = structuredClone(raw);
  const target = fractional.regions[0];
  if (!target) throw new Error("missing region");
  target.bonus = 1.5;
  assert.throws(() => parseRegionFile(fractional), /bonus/);
});

function nameOf(atlas: ReturnType<typeof loadAtlas>, fips: string): string {
  return atlas.shapes.find((shape) => shape.fips === fips)?.name ?? fips;
}

function fail(): never {
  throw new Error("missing shape");
}
