import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import type { County, MapPack, Region } from "../src/types.ts";
import { adjacency, decodeArc, loadAtlas, ringPoints, type Atlas, type Point } from "./borders.ts";
import { makeFips, makeRegionId, type Fips } from "./ids.ts";
import { parseRegionFile, type RegionFile } from "./parse-map.ts";
import { drawRegions, type DrawnRegion } from "./regions.ts";

const require = createRequire(import.meta.url);
const VIEW_WIDTH = 600;
const VIEW_PAD = 8;

export type BuiltState = {
  map: MapPack;
  manifest: RegionFile;
  cornerOnly: readonly [Fips, Fips][];
  byteLength: number;
};

export function atlasJson(): unknown {
  const atlasPath = require.resolve("us-atlas/counties-albers-10m.json");
  return JSON.parse(readFileSync(atlasPath, "utf8"));
}

export function buildState(manifest: RegionFile, atlasInput: unknown): BuiltState {
  const atlas = loadAtlas(atlasInput, manifest.fipsPrefix);
  if (atlas.shapes.length !== manifest.expectedTerritories) {
    throw new Error(
      `${manifest.abbr} geometry has ${atlas.shapes.length} counties, manifest expects ${manifest.expectedTerritories}`,
    );
  }
  assertUniqueNames(atlas);
  assertPilotFips(manifest, atlas.shapes.map((shape) => shape.fips));
  const borders = adjacency(atlas);
  for (const [left, right] of borders.cornerOnly) {
    if (borders.neighbors.get(left)?.includes(right)) {
      throw new Error(`corner-only touch ${left}-${right} was recorded as a border`);
    }
  }
  const centroids = new Map<Fips, Point>();
  for (const shape of atlas.shapes) {
    centroids.set(shape.fips, largestRingCentroid(atlas, shape.rings));
  }
  const placed = atlas.shapes.map((shape) => ({
    fips: shape.fips,
    centroid: centroids.get(shape.fips) ?? [0, 0],
    neighbors: borders.neighbors.get(shape.fips) ?? [],
  }));
  const drawn = manifest.review === "draft" ? drawRegions(manifest.name, placed, manifest.expectedRegions) : regionsFromManifest(manifest, atlas);
  const regionOf = new Map<Fips, DrawnRegion>();
  for (const region of drawn) {
    for (const fips of region.fips) regionOf.set(fips, region);
  }
  const projected = projectArcs(atlas);
  const counties: County[] = atlas.shapes.map((shape) => {
    const region = regionOf.get(shape.fips);
    if (!region) throw new Error(`${shape.name} was left out of every region`);
    const centroid = projected.project(centroids.get(shape.fips) ?? [0, 0]);
    return {
      id: shape.fips,
      name: shape.name,
      regionId: makeRegionId(region.id),
      path: shape.rings.map((ring) => ringPath(ring, projected.arcs)).join(""),
      centroid,
      neighbors: borders.neighbors.get(shape.fips) ?? [],
      facts: [],
    };
  });
  const listed = new Map(manifest.regions.map((region) => [region.id, region]));
  const regions: Region[] = drawn.map((region) => {
    const source = listed.get(region.id);
    return {
      id: makeRegionId(region.id),
      name: region.name,
      counties: region.fips,
      borderPath: regionBorder(region, borders.arcUsers, projected.arcs),
      bonus: source?.bonus ?? 0,
      review: source?.review ?? "draft",
    };
  });
  const outline = arcsPath(borders.arcUsers, projected.arcs, (users) => users.length === 1);
  const body = {
    version: 1 as const,
    id: "indiana" as const,
    viewBox: projected.viewBox,
    outline,
    regions,
    counties,
  };
  const map: MapPack = { ...body, digest: createHash("sha256").update(JSON.stringify(body)).digest("hex") };
  const nextManifest: RegionFile = {
    ...manifest,
    regions: regions.map((region) => {
      const source = listed.get(region.id);
      const entry = {
        id: region.id,
        name: region.name,
        counties: [...region.counties],
        review: source?.review ?? "draft",
      };
      return source?.bonus === undefined ? entry : { ...entry, bonus: source.bonus };
    }),
  };
  const encoded = `${JSON.stringify(map, null, 2)}\n`;
  return { map, manifest: nextManifest, cornerOnly: borders.cornerOnly, byteLength: Buffer.byteLength(encoded) };
}

export function writeBuiltState(root: string, built: BuiltState): void {
  const abbr = built.manifest.abbr;
  const regionDir = path.join(root, "regions", abbr);
  const mapDir = path.join(root, "data", "regions", abbr);
  mkdirSync(regionDir, { recursive: true });
  mkdirSync(mapDir, { recursive: true });
  writeFileSync(path.join(mapDir, "map.json"), `${JSON.stringify(built.map, null, 2)}\n`);
  writeFileSync(path.join(regionDir, "region.json"), `${JSON.stringify(built.manifest, null, 2)}\n`);
}

function regionsFromManifest(manifest: RegionFile, atlas: Atlas): DrawnRegion[] {
  const known = new Set(atlas.shapes.map((shape) => shape.fips));
  return manifest.regions.map((region) => ({
    id: region.id,
    name: region.name,
    fips: region.counties.map((id) => {
      const fips = makeFips(id);
      if (!known.has(fips)) throw new Error(`region ${region.id} lists unknown county ${id}`);
      return fips;
    }),
  }));
}

function regionBorder(
  region: DrawnRegion,
  arcUsers: ReadonlyMap<number, readonly Fips[]>,
  arcs: ReadonlyMap<number, Point[]>,
): string {
  const members = new Set(region.fips);
  return arcsPath(arcUsers, arcs, (users) => {
    const inside = users.filter((id) => members.has(id)).length;
    return inside === 1;
  });
}

function largestRingCentroid(atlas: Atlas, rings: readonly (readonly number[])[]): Point {
  let best: Point[] = [];
  let bestArea = -1;
  for (const ring of rings) {
    const points = ringPoints(atlas, ring);
    const area = Math.abs(signedArea(points));
    if (area > bestArea) {
      best = points;
      bestArea = area;
    }
  }
  return polygonCentroid(best);
}

function signedArea(points: readonly Point[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    if (!current || !next) continue;
    area += current[0] * next[1] - next[0] * current[1];
  }
  return area / 2;
}

function polygonCentroid(points: readonly Point[]): Point {
  let area = 0;
  let x = 0;
  let y = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    if (!current || !next) continue;
    const cross = current[0] * next[1] - next[0] * current[1];
    area += cross;
    x += (current[0] + next[0]) * cross;
    y += (current[1] + next[1]) * cross;
  }
  if (area === 0) {
    const first = points[0] ?? [0, 0];
    return first;
  }
  return [x / (3 * area), y / (3 * area)];
}

function projectArcs(atlas: Atlas): {
  arcs: Map<number, Point[]>;
  project: (point: Point) => Point;
  viewBox: readonly [number, number, number, number];
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const decoded = new Map<number, Point[]>();
  const used = new Set<number>();
  for (const shape of atlas.shapes) {
    for (const ring of shape.rings) {
      for (const index of ring) used.add(index < 0 ? ~index : index);
    }
  }
  for (const key of used) {
    const arc = atlas.arcs[key];
    if (!arc) throw new Error(`missing arc ${key}`);
    const points = decodeArc(arc, atlas.transform);
    decoded.set(key, points);
    for (const point of points) {
      minX = Math.min(minX, point[0]);
      minY = Math.min(minY, point[1]);
      maxX = Math.max(maxX, point[0]);
      maxY = Math.max(maxY, point[1]);
    }
  }
  const dataWidth = maxX - minX || 1;
  const dataHeight = maxY - minY || 1;
  const height = Math.max(1, Math.round((VIEW_WIDTH * dataHeight) / dataWidth));
  const project = (point: Point): Point => {
    const x = VIEW_PAD + ((point[0] - minX) / dataWidth) * (VIEW_WIDTH - VIEW_PAD * 2);
    const y = VIEW_PAD + ((point[1] - minY) / dataHeight) * (height - VIEW_PAD * 2);
    return [roundTenth(x), roundTenth(y)];
  };
  const arcs = new Map<number, Point[]>();
  for (const [key, points] of decoded) arcs.set(key, points.map((point) => project(point)));
  const viewBox: readonly [number, number, number, number] = [0, 0, VIEW_WIDTH, height];
  return { arcs, project, viewBox };
}

function ringPath(ring: readonly number[], arcs: ReadonlyMap<number, Point[]>): string {
  const points: Point[] = [];
  for (const index of ring) {
    const key = index < 0 ? ~index : index;
    const decoded = arcs.get(key);
    if (!decoded) throw new Error(`missing projected arc ${key}`);
    const sequence = index < 0 ? [...decoded].reverse() : decoded;
    for (let i = 0; i < sequence.length; i += 1) {
      const point = sequence[i];
      if (!point) continue;
      if (points.length > 0 && i === 0) continue;
      points.push(point);
    }
  }
  const open = polyline(points);
  return open ? `${open}Z` : "";
}

function arcsPath(
  arcUsers: ReadonlyMap<number, readonly Fips[]>,
  arcs: ReadonlyMap<number, Point[]>,
  include: (users: readonly Fips[]) => boolean,
): string {
  const keys = [...arcUsers.keys()].filter((key) => {
    const users = arcUsers.get(key);
    return users ? include(users) : false;
  });
  keys.sort((a, b) => a - b);
  return keys
    .map((key) => polyline(arcs.get(key) ?? []))
    .filter((path) => path.length > 0)
    .join("");
}

function polyline(points: readonly Point[]): string {
  const first = points[0];
  if (!first) return "";
  let path = `M${num(first[0])},${num(first[1])}`;
  for (let i = 1; i < points.length; i += 1) {
    const point = points[i];
    if (!point) continue;
    path += `L${num(point[0])},${num(point[1])}`;
  }
  return path;
}

function num(value: number): string {
  return String(roundTenth(value));
}

function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function assertUniqueNames(atlas: Atlas): void {
  const seen = new Set<string>();
  for (const shape of atlas.shapes) {
    if (seen.has(shape.name)) throw new Error(`duplicate county name ${shape.name}`);
    seen.add(shape.name);
  }
}

function assertPilotFips(manifest: RegionFile, fips: readonly string[]): void {
  if (manifest.fipsPrefix !== "18" || manifest.expectedTerritories !== 92) return;
  const expected: string[] = [];
  for (let code = 18001; code <= 18183; code += 2) expected.push(String(code));
  const actual = [...fips].sort();
  if (actual.length !== expected.length || actual.some((code, index) => code !== expected[index])) {
    throw new Error("FIPS prefix 18 with 92 counties must be the odd codes from 18001 through 18183");
  }
}

function listAbbrs(root: string): string[] {
  const regionsRoot = path.join(root, "regions");
  return readdirSync(regionsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => existsSync(path.join(regionsRoot, name, "region.json")))
    .sort();
}

function main(): void {
  const root = process.cwd();
  const requested = process.argv[2];
  const abbrs = requested ? [requested] : listAbbrs(root);
  if (abbrs.length === 0) throw new Error("no regions/<abbr>/region.json to build");
  const atlas = atlasJson();
  for (const abbr of abbrs) {
    const manifestPath = path.join(root, "regions", abbr, "region.json");
    const manifest = parseRegionFile(JSON.parse(readFileSync(manifestPath, "utf8")));
    const built = buildState(manifest, atlas);
    writeBuiltState(root, built);
    console.log(
      `${abbr}: ${built.map.counties.length} counties, ${built.map.regions.length} regions, ${built.byteLength} bytes, ${built.cornerOnly.length} corner-only touches excluded`,
    );
  }
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(path.resolve(entry)).href) {
  main();
}
