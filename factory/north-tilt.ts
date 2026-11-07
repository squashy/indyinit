import type { MapPack } from "../src/types.ts";

// Tilt of the Indiana-Michigan line as drawn, in degrees (0 = horizontal, positive = the east
// end sits lower on screen). West end: the top of the LaPorte / St. Joseph border, the vertex
// both county paths share with the smallest y. East end: Steuben's northeast corner, the
// Steuben vertex that maximizes x - y. Both lie on the straight surveyed state line.
export function northTilt(map: MapPack): number {
  const points = (id: string): [number, number][] => {
    const county = map.counties.find((entry) => entry.id === id);
    if (!county) throw new Error(`county ${id} missing`);
    return [...county.path.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  };
  const stJoseph = new Set(points("18141").map(([x, y]) => `${x},${y}`));
  const shared = points("18091").filter(([x, y]) => stJoseph.has(`${x},${y}`));
  const west = shared.reduce((best, p) => (p[1] < best[1] ? p : best));
  const east = points("18151").reduce((best, p) => (p[0] - p[1] > best[0] - best[1] ? p : best));
  return (Math.atan2(east[1] - west[1], east[0] - west[0]) * 180) / Math.PI;
}
