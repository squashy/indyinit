import type { CountyId, RegionId } from "../src/types.ts";

export type Fips = CountyId;

export function makeFips(value: string): CountyId {
  if (!isCountyId(value)) throw new Error(`Not a 5-digit FIPS code: ${value}`);
  return value;
}

export function makeRegionId(value: string): RegionId {
  if (!isRegionId(value)) throw new Error(`Not a region id: ${value}`);
  return value;
}

function isCountyId(value: string): value is CountyId {
  return /^[0-9]{5}$/.test(value);
}

function isRegionId(value: string): value is RegionId {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}
