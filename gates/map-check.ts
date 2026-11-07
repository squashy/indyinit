import type { CountyId, MapPack, RegionId } from "../src/types.ts";
import type { RegionFile } from "../factory/parse-map.ts";

export const MINIMUM_TERRITORIES = 14;
export const MAP_BYTE_LIMIT = 200 * 1024;

export type MapIssue = {
  severity: "error" | "warning";
  code:
    | "shape"
    | "territory-count"
    | "too-few-territories"
    | "fips-prefix"
    | "fips-set"
    | "duplicate-fips"
    | "self-loop"
    | "asymmetric"
    | "unknown-neighbor"
    | "disconnected"
    | "region-membership"
    | "region-contiguous"
    | "region-sizes"
    | "region-count"
    | "placeholder-name"
    | "file-size";
  detail: string;
};

export function checkMap(
  map: MapPack,
  manifest: RegionFile,
  limits: { byteLength: number; minimumTerritories: number } = {
    byteLength: 0,
    minimumTerritories: MINIMUM_TERRITORIES,
  },
): MapIssue[] {
  const issues: MapIssue[] = [];
  if (!isViewBox(map.viewBox)) issues.push({ severity: "error", code: "shape", detail: "viewBox must be four numbers" });
  if (!isPath(map.outline, false)) issues.push({ severity: "error", code: "shape", detail: "outline is missing" });

  const byId = new Map<CountyId, (typeof map.counties)[number]>();
  for (const county of map.counties) {
    if (byId.has(county.id)) issues.push({ severity: "error", code: "duplicate-fips", detail: `${county.id} is repeated` });
    byId.set(county.id, county);
    if (!county.id.startsWith(manifest.fipsPrefix)) {
      issues.push({ severity: "error", code: "fips-prefix", detail: `${county.id} is outside prefix ${manifest.fipsPrefix}` });
    }
    if (!isPath(county.path, true)) issues.push({ severity: "error", code: "shape", detail: `${county.id} path is missing` });
    if (new Set(county.neighbors).size !== county.neighbors.length) {
      issues.push({ severity: "error", code: "shape", detail: `${county.id} lists a neighbor twice` });
    }
  }

  if (map.counties.length !== manifest.expectedTerritories) {
    issues.push({
      severity: "error",
      code: "territory-count",
      detail: `map has ${map.counties.length}, manifest expects ${manifest.expectedTerritories}`,
    });
  }
  if (map.counties.length < limits.minimumTerritories) {
    issues.push({
      severity: "error",
      code: "too-few-territories",
      detail: `${map.counties.length} is below ${limits.minimumTerritories}`,
    });
  }
  if (manifest.fipsPrefix === "18" && manifest.expectedTerritories === 92 && !isIndianaSet(map.counties.map((county) => county.id))) {
    issues.push({ severity: "error", code: "fips-set", detail: "counties must be the odd FIPS codes from 18001 through 18183" });
  }
  if (map.regions.length !== manifest.expectedRegions) {
    issues.push({
      severity: "error",
      code: "region-count",
      detail: `map has ${map.regions.length} regions, manifest expects ${manifest.expectedRegions}`,
    });
  }

  const regionIds = new Set<RegionId>();
  for (const region of map.regions) {
    if (regionIds.has(region.id)) issues.push({ severity: "error", code: "region-membership", detail: `region ${region.id} is repeated` });
    regionIds.add(region.id);
    if (isPlaceholderName(region.name)) issues.push({ severity: "error", code: "placeholder-name", detail: region.name || "(blank)" });
    if (!isPath(region.borderPath, false)) issues.push({ severity: "error", code: "shape", detail: `${region.id} border is missing` });
  }

  const listed = new Map<CountyId, RegionId>();
  for (const region of map.regions) {
    for (const id of region.counties) {
      const previous = listed.get(id);
      if (previous) issues.push({ severity: "error", code: "region-membership", detail: `${id} is in ${previous} and ${region.id}` });
      listed.set(id, region.id);
      const county = byId.get(id);
      if (!county) issues.push({ severity: "error", code: "region-membership", detail: `${region.id} lists unknown ${id}` });
      else if (county.regionId !== region.id) {
        issues.push({ severity: "error", code: "region-membership", detail: `${id} says ${county.regionId} but is listed in ${region.id}` });
      }
    }
  }
  for (const county of map.counties) {
    if (!listed.has(county.id)) issues.push({ severity: "error", code: "region-membership", detail: `${county.id} is in no region` });
    if (!regionIds.has(county.regionId)) {
      issues.push({ severity: "error", code: "region-membership", detail: `${county.id} points at unknown region ${county.regionId}` });
    }
  }
  if (map.regions.filter((region) => region.counties.length >= 2).length < 2) {
    issues.push({ severity: "error", code: "region-sizes", detail: "need at least two regions with two or more counties" });
  }

  for (const region of map.regions) {
    const members = new Set(region.counties);
    const start = region.counties[0];
    if (!start) continue;
    const reached = reach(start, (id) => (byId.get(id)?.neighbors ?? []).filter((neighbor) => members.has(neighbor)));
    if (reached !== members.size) issues.push({ severity: "error", code: "region-contiguous", detail: `${region.name} is split` });
  }

  const start = map.counties[0];
  if (start) {
    const reached = reach(start.id, (id) => (byId.get(id)?.neighbors ?? []).filter((neighbor) => neighbor !== id));
    if (reached !== byId.size) issues.push({ severity: "error", code: "disconnected", detail: `${reached} of ${byId.size} counties are connected` });
  }

  for (const county of map.counties) {
    if (county.neighbors.includes(county.id)) issues.push({ severity: "error", code: "self-loop", detail: `${county.id} lists itself` });
    for (const neighbor of county.neighbors) {
      if (neighbor === county.id) continue;
      const other = byId.get(neighbor);
      if (!other) {
        issues.push({ severity: "error", code: "unknown-neighbor", detail: `${county.id} lists unknown ${neighbor}` });
        continue;
      }
      if (!other.neighbors.includes(county.id)) {
        issues.push({
          severity: "error",
          code: "asymmetric",
          detail: `${county.id} lists ${neighbor} and ${neighbor} does not list ${county.id}`,
        });
      }
    }
  }

  if (limits.byteLength > MAP_BYTE_LIMIT) {
    issues.push({
      severity: "warning",
      code: "file-size",
      detail: `map.json is ${limits.byteLength} bytes, above ${MAP_BYTE_LIMIT}`,
    });
  }
  return issues;
}

export function isPlaceholderName(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < 3) return true;
  if (/\b(placeholder|todo|tbd|fixme|unnamed|untitled|dummy)\b/i.test(trimmed)) return true;
  if (/^(region|area|group|cluster|zone)([\s_-]*\d+)?$/i.test(trimmed)) return true;
  if (/^region\b/i.test(trimmed)) return true;
  return false;
}

export function withSelfLoop(map: MapPack): MapPack {
  const county = map.counties[0];
  if (!county) throw new Error("map has no counties");
  const neighbors = county.neighbors.includes(county.id) ? county.neighbors : [...county.neighbors, county.id];
  return { ...map, counties: map.counties.map((entry, index) => (index === 0 ? { ...entry, neighbors } : entry)) };
}

export function withAsymmetricEdge(map: MapPack): MapPack {
  for (const county of map.counties) {
    const other = map.counties.find((candidate) => candidate.id !== county.id && !county.neighbors.includes(candidate.id));
    if (!other) continue;
    const neighbors = [...county.neighbors, other.id];
    return { ...map, counties: map.counties.map((entry) => (entry.id === county.id ? { ...entry, neighbors } : entry)) };
  }
  throw new Error("every county already borders every other county");
}

function reach(start: CountyId, neighborsOf: (id: CountyId) => readonly CountyId[]): number {
  const seen = new Set<CountyId>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    for (const neighbor of neighborsOf(current)) {
      if (seen.has(neighbor)) continue;
      seen.add(neighbor);
      queue.push(neighbor);
    }
  }
  return seen.size;
}

function isPath(path: string, closed: boolean): boolean {
  if (path.length === 0) return false;
  return (closed ? /^[MLZ0-9.,-]+$/ : /^[ML0-9.,-]+$/).test(path);
}

function isViewBox(value: readonly [number, number, number, number]): boolean {
  return value.length === 4 && value.every((item) => Number.isFinite(item));
}

function isIndianaSet(ids: readonly string[]): boolean {
  const expected: string[] = [];
  for (let code = 18001; code <= 18183; code += 2) expected.push(String(code));
  const actual = [...ids].sort();
  return actual.length === expected.length && actual.every((id, index) => id === expected[index]);
}
