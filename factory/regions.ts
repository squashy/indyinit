import type { Fips } from "./ids.ts";

export type PlacedCounty = {
  fips: Fips;
  centroid: readonly [number, number];
  neighbors: readonly Fips[];
};

export type DrawnRegion = {
  id: string;
  name: string;
  fips: Fips[];
};

const COMPASS = [
  ["Northwest", "North Central", "Northeast"],
  ["West Central", "Central", "East Central"],
  ["Southwest", "South Central", "Southeast"],
] as const;

export function drawRegions(stateName: string, counties: readonly PlacedCounty[], target = 8): DrawnRegion[] {
  if (counties.length === 0) throw new Error("no counties to draw regions from");
  const bounds = boundsOf(counties);
  const buckets = new Map<string, Fips[]>();
  const cellOf = new Map<Fips, string>();
  for (const county of counties) {
    const cell = cellKey(county.centroid, bounds);
    cellOf.set(county.fips, cell);
    const bucket = buckets.get(cell);
    if (bucket) bucket.push(county.fips);
    else buckets.set(cell, [county.fips]);
  }
  repairSplits(buckets, counties);
  mergeTiny(buckets, counties);
  fitCount(buckets, counties, target);
  const drawn = [...buckets.entries()]
    .filter((entry) => entry[1].length > 0)
    .map(([cell, fips]) => {
      const label = labelFor(cell);
      const name = `${label} ${stateName}`;
      return { id: slug(name), name, fips: [...fips].sort((a, b) => a.localeCompare(b)) };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  if (drawn.filter((region) => region.fips.length >= 2).length < 2) {
    throw new Error("region draw produced fewer than two regions of two or more counties");
  }
  return drawn;
}

function fitCount(buckets: Map<string, Fips[]>, counties: readonly PlacedCounty[], target: number): void {
  const neighbors = neighborMap(counties);
  while ([...buckets.values()].filter((members) => members.length > 0).length > target) {
    const live = [...buckets.entries()].filter((entry) => entry[1].length > 0);
    live.sort((a, b) => a[1].length - b[1].length || a[0].localeCompare(b[0]));
    const smallest = live[0];
    if (!smallest) break;
    moveTowardNeighbor(smallest[1], smallest[0], buckets, neighbors);
    if ((buckets.get(smallest[0])?.length ?? 0) > 0) {
      throw new Error("could not merge regions down to the expected count");
    }
  }
}

function repairSplits(buckets: Map<string, Fips[]>, counties: readonly PlacedCounty[]): void {
  const neighbors = neighborMap(counties);
  for (const [cell, members] of [...buckets.entries()]) {
    const parts = components(members, neighbors);
    const keep = parts[0];
    if (!keep) continue;
    buckets.set(cell, keep);
    for (const part of parts.slice(1)) moveTowardNeighbor(part, cell, buckets, neighbors);
  }
}

function mergeTiny(buckets: Map<string, Fips[]>, counties: readonly PlacedCounty[]): void {
  const neighbors = neighborMap(counties);
  let moved = true;
  while (moved) {
    moved = false;
    for (const [cell, members] of [...buckets.entries()]) {
      if (members.length !== 1) continue;
      const only = members[0];
      if (!only) continue;
      moveTowardNeighbor([only], cell, buckets, neighbors);
      if ((buckets.get(cell)?.length ?? 0) === 0) moved = true;
    }
  }
}

function moveTowardNeighbor(
  part: readonly Fips[],
  from: string,
  buckets: Map<string, Fips[]>,
  neighbors: ReadonlyMap<Fips, readonly Fips[]>,
): void {
  const moving = new Set(part);
  const weight = new Map<string, number>();
  for (const fips of part) {
    for (const neighbor of neighbors.get(fips) ?? []) {
      if (moving.has(neighbor)) continue;
      const destination = cellContaining(buckets, neighbor);
      if (!destination || destination === from) continue;
      weight.set(destination, (weight.get(destination) ?? 0) + 1);
    }
  }
  const ranked = [...weight.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const destination = ranked[0]?.[0];
  if (!destination) return;
  const source = buckets.get(from);
  const target = buckets.get(destination);
  if (!source || !target) return;
  buckets.set(from, source.filter((fips) => !moving.has(fips)));
  target.push(...part);
}

function components(members: readonly Fips[], neighbors: ReadonlyMap<Fips, readonly Fips[]>): Fips[][] {
  const remaining = new Set(members);
  const parts: Fips[][] = [];
  for (const start of members) {
    if (!remaining.has(start)) continue;
    const part: Fips[] = [];
    const queue = [start];
    remaining.delete(start);
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      part.push(current);
      for (const neighbor of neighbors.get(current) ?? []) {
        if (!remaining.has(neighbor)) continue;
        remaining.delete(neighbor);
        queue.push(neighbor);
      }
    }
    parts.push(part);
  }
  return parts.sort((a, b) => b.length - a.length || (a[0] ?? "").localeCompare(b[0] ?? ""));
}

function cellContaining(buckets: ReadonlyMap<string, readonly Fips[]>, fips: Fips): string | null {
  for (const [cell, members] of buckets) {
    if (members.includes(fips)) return cell;
  }
  return null;
}

function neighborMap(counties: readonly PlacedCounty[]): Map<Fips, readonly Fips[]> {
  return new Map(counties.map((county) => [county.fips, county.neighbors]));
}

function boundsOf(counties: readonly PlacedCounty[]): { minX: number; minY: number; spanX: number; spanY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const county of counties) {
    minX = Math.min(minX, county.centroid[0]);
    minY = Math.min(minY, county.centroid[1]);
    maxX = Math.max(maxX, county.centroid[0]);
    maxY = Math.max(maxY, county.centroid[1]);
  }
  return { minX, minY, spanX: maxX - minX || 1, spanY: maxY - minY || 1 };
}

function cellKey(centroid: readonly [number, number], bounds: { minX: number; minY: number; spanX: number; spanY: number }): string {
  // The Albers file measures y downward, the same way SVG does, so a small y is north.
  const col = Math.min(2, Math.floor(((centroid[0] - bounds.minX) / bounds.spanX) * 3));
  const row = Math.min(2, Math.floor(((centroid[1] - bounds.minY) / bounds.spanY) * 3));
  return `${row},${col}`;
}

function labelFor(cell: string): string {
  const [rowText, colText] = cell.split(",");
  const row = Number(rowText);
  const col = Number(colText);
  const label = COMPASS[row]?.[col];
  if (!label) throw new Error(`no compass name for cell ${cell}`);
  return label;
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
