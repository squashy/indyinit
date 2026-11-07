import type { Point } from "./borders.ts";

// Indiana-centered transverse Mercator on a sphere. Longitude/latitude in degrees go in;
// planar [east, south] comes out (y grows southward, like SVG). Only the shape matters:
// build-map.ts scales the result into the view box, so no radius or false origin is needed.
export const INDIANA_PROJECTION = {
  name: "transverse Mercator (spherical)",
  centralMeridian: -86.3,
  latitudeOfOrigin: 39.8,
} as const;

const RAD = Math.PI / 180;

export function projectIndiana(point: Point): Point {
  const lambda = (point[0] - INDIANA_PROJECTION.centralMeridian) * RAD;
  const phi = point[1] * RAD;
  const b = Math.cos(phi) * Math.sin(lambda);
  const east = 0.5 * Math.log((1 + b) / (1 - b));
  const north = Math.atan2(Math.tan(phi), Math.cos(lambda)) - INDIANA_PROJECTION.latitudeOfOrigin * RAD;
  return [east, -north];
}
