import { makeFips, type Fips } from "./ids.ts";

export type Point = readonly [number, number];

export type CountyShape = {
  fips: Fips;
  name: string;
  rings: readonly (readonly number[])[];
};

export type Atlas = {
  transform: { scale: readonly [number, number]; translate: readonly [number, number] } | null;
  arcs: readonly (readonly (readonly number[])[])[];
  shapes: readonly CountyShape[];
};

export type Adjacency = {
  neighbors: Map<Fips, Fips[]>;
  arcUsers: Map<number, Fips[]>;
  cornerOnly: readonly [Fips, Fips][];
};

export function loadAtlas(input: unknown, fipsPrefix: string): Atlas {
  const topology = expectRecord(input, "atlas");
  if (topology.type !== "Topology") {
    throw new Error("atlas type must be Topology");
  }
  const transform = readTransform(topology.transform);
  const arcs = readArcs(topology.arcs);
  const objects = expectRecord(topology.objects, "objects");
  const counties = expectRecord(objects.counties, "counties");
  const geometries = counties.geometries;
  if (!Array.isArray(geometries)) {
    throw new Error("counties.geometries must be an array");
  }
  const shapes: CountyShape[] = [];
  for (const geometry of geometries) {
    const record = expectRecord(geometry, "county");
    if (typeof record.id !== "string" || !record.id.startsWith(fipsPrefix)) continue;
    const properties = expectRecord(record.properties, "properties");
    if (typeof properties.name !== "string" || properties.name.trim() === "") {
      throw new Error(`county ${record.id} has no name`);
    }
    shapes.push({
      fips: makeFips(record.id),
      name: properties.name,
      rings: readRings(record.arcs),
    });
  }
  shapes.sort((a, b) => a.fips.localeCompare(b.fips));
  return { transform, arcs, shapes };
}

export function adjacency(atlas: Atlas): Adjacency {
  const arcUsers = new Map<number, Fips[]>();
  const vertexUsers = new Map<string, Fips[]>();
  for (const shape of atlas.shapes) {
    const seenVertices = new Set<string>();
    for (const ring of shape.rings) {
      for (const index of ring) {
        const key = absoluteArc(index);
        const users = arcUsers.get(key);
        if (!users) arcUsers.set(key, [shape.fips]);
        else if (!users.includes(shape.fips)) users.push(shape.fips);
        const arc = atlas.arcs[key];
        if (!arc) throw new Error(`missing arc ${key}`);
        for (const vertex of quantizedVertices(arc)) {
          if (seenVertices.has(vertex)) continue;
          seenVertices.add(vertex);
          const sharing = vertexUsers.get(vertex);
          if (!sharing) vertexUsers.set(vertex, [shape.fips]);
          else if (!sharing.includes(shape.fips)) sharing.push(shape.fips);
        }
      }
    }
  }

  const neighbors = new Map<Fips, Fips[]>(atlas.shapes.map((shape) => [shape.fips, []]));
  for (const users of arcUsers.values()) {
    if (users.length > 2) {
      throw new Error("an arc is shared by more than two counties");
    }
    const left = users[0];
    const right = users[1];
    if (!left || !right || left === right) continue;
    neighbors.get(left)?.push(right);
    neighbors.get(right)?.push(left);
  }
  for (const list of neighbors.values()) {
    list.sort((a, b) => a.localeCompare(b));
  }

  const neighborPairs = new Set<string>();
  for (const [fips, list] of neighbors) {
    for (const other of list) {
      if (fips < other) neighborPairs.add(`${fips}|${other}`);
    }
  }
  const cornerOnly: [Fips, Fips][] = [];
  const seenCorners = new Set<string>();
  for (const users of vertexUsers.values()) {
    for (let i = 0; i < users.length; i += 1) {
      for (let j = i + 1; j < users.length; j += 1) {
        const left = users[i];
        const right = users[j];
        if (!left || !right) continue;
        const [a, b] = left < right ? [left, right] : [right, left];
        const key = `${a}|${b}`;
        if (seenCorners.has(key) || neighborPairs.has(key)) continue;
        seenCorners.add(key);
        cornerOnly.push([a, b]);
      }
    }
  }
  cornerOnly.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  return { neighbors, arcUsers, cornerOnly };
}

export function decodeArc(arc: readonly (readonly number[])[], transform: Atlas["transform"]): Point[] {
  let x = 0;
  let y = 0;
  const scaleX = transform?.scale[0] ?? 1;
  const scaleY = transform?.scale[1] ?? 1;
  const translateX = transform?.translate[0] ?? 0;
  const translateY = transform?.translate[1] ?? 0;
  return arc.map((pair) => {
    const dx = pair[0];
    const dy = pair[1];
    if (dx === undefined || dy === undefined) throw new Error("arc point is incomplete");
    x += dx;
    y += dy;
    const point: Point = [x * scaleX + translateX, y * scaleY + translateY];
    return point;
  });
}

export function ringPoints(atlas: Atlas, ring: readonly number[]): Point[] {
  const points: Point[] = [];
  for (const index of ring) {
    const arc = atlas.arcs[absoluteArc(index)];
    if (!arc) throw new Error(`missing arc ${index}`);
    const decoded = decodeArc(arc, atlas.transform);
    const sequence = index < 0 ? [...decoded].reverse() : decoded;
    for (let i = 0; i < sequence.length; i += 1) {
      const point = sequence[i];
      if (!point) continue;
      if (points.length > 0 && i === 0) continue;
      points.push(point);
    }
  }
  return points;
}

function absoluteArc(index: number): number {
  return index < 0 ? ~index : index;
}

function quantizedVertices(arc: readonly (readonly number[])[]): string[] {
  let x = 0;
  let y = 0;
  const keys: string[] = [];
  for (const pair of arc) {
    const dx = pair[0];
    const dy = pair[1];
    if (dx === undefined || dy === undefined) throw new Error("arc point is incomplete");
    x += dx;
    y += dy;
    keys.push(`${x},${y}`);
  }
  return keys;
}

function readTransform(input: unknown): Atlas["transform"] {
  if (input === undefined || input === null) return null;
  const record = expectRecord(input, "transform");
  const scale = record.scale;
  const translate = record.translate;
  if (!Array.isArray(scale) || !Array.isArray(translate)) {
    throw new Error("transform scale and translate must be arrays");
  }
  const scaleX = scale[0];
  const scaleY = scale[1];
  const translateX = translate[0];
  const translateY = translate[1];
  if (
    typeof scaleX !== "number" ||
    typeof scaleY !== "number" ||
    typeof translateX !== "number" ||
    typeof translateY !== "number"
  ) {
    throw new Error("transform must contain numbers");
  }
  return { scale: [scaleX, scaleY], translate: [translateX, translateY] };
}

function readArcs(input: unknown): number[][][] {
  if (!Array.isArray(input)) throw new Error("arcs must be an array");
  return input.map((arc, arcIndex) => {
    if (!Array.isArray(arc)) throw new Error(`arcs[${arcIndex}] must be an array`);
    return arc.map((point, pointIndex) => {
      if (!Array.isArray(point) || point.length < 2) {
        throw new Error(`arcs[${arcIndex}][${pointIndex}] must be a pair`);
      }
      const x = point[0];
      const y = point[1];
      if (typeof x !== "number" || typeof y !== "number") {
        throw new Error(`arcs[${arcIndex}][${pointIndex}] must be numbers`);
      }
      return [x, y];
    });
  });
}

function readRings(input: unknown): number[][] {
  if (!Array.isArray(input) || input.length === 0) throw new Error("geometry has no rings");
  const first = input[0];
  if (isRing(first)) {
    return input.map((ring) => {
      if (!isRing(ring)) throw new Error("polygon ring must be arc indexes");
      return [...ring];
    });
  }
  const rings: number[][] = [];
  for (const polygon of input) {
    if (!Array.isArray(polygon)) throw new Error("multipolygon part must be an array");
    for (const ring of polygon) {
      if (!isRing(ring)) throw new Error("multipolygon ring must be arc indexes");
      rings.push([...ring]);
    }
  }
  return rings;
}

function isRing(input: unknown): input is number[] {
  return Array.isArray(input) && input.every((index) => typeof index === "number");
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function expectRecord(input: unknown, label: string): Record<string, unknown> {
  if (!isRecord(input)) throw new Error(`${label} must be an object`);
  return input;
}
