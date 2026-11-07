export const GEOMETRY_SOURCE = {
  censusUrl: "https://www2.census.gov/geo/tiger/GENZ2017/shp/cb_2017_us_county_5m.zip",
  redistributionUrl: "https://github.com/topojson/us-atlas/blob/v3.0.1/counties-10m.json",
  package: "us-atlas@3.0.1",
  file: "counties-10m.json",
  projection: "factory/projection.ts INDIANA_PROJECTION: spherical transverse Mercator, central meridian 86.3 W, latitude of origin 39.8 N",
  rule: "Neighbors share a TopoJSON arc. A shared vertex without a shared arc is a corner and is not a neighbor.",
} as const;
