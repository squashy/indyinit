import type { County, CountyFact, MapPack, Region } from "../src/types.ts";
import { makeFips, makeRegionId } from "./ids.ts";

export type RegionFile = {
  abbr: string;
  name: string;
  fipsPrefix: string;
  expectedTerritories: number;
  expectedRegions: number;
  geometrySource: string;
  review: "draft" | "reviewed";
  regions: readonly {
    id: string;
    name: string;
    counties: readonly string[];
    review: "draft" | "reviewed";
    /** Present only when the manifest adopted an integer. Missing means not adopted. */
    bonus?: number;
  }[];
};

export function parseRegionFile(input: unknown): RegionFile {
  const record = expectRecord(input, "region.json");
  return {
    abbr: expectString(record, "abbr"),
    name: expectString(record, "name"),
    fipsPrefix: expectString(record, "fipsPrefix"),
    expectedTerritories: expectCount(record, "expectedTerritories"),
    expectedRegions: expectCount(record, "expectedRegions"),
    geometrySource: expectString(record, "geometrySource"),
    review: expectReview(record, "review"),
    regions: expectArray(record, "regions").map((entry, index) => {
      const region = expectRecord(entry, `regions[${index}]`);
      return {
        id: expectString(region, "id"),
        name: expectString(region, "name"),
        counties: expectStrings(region, "counties"),
        review: expectReview(region, "review"),
        ...optionalBonus(region),
      };
    }),
  };
}

export function parseMapPack(input: unknown): MapPack {
  const record = expectRecord(input, "map.json");
  if (record.version !== 1) throw new Error("map version must be 1");
  if (record.id !== "indiana") throw new Error("map id must be indiana");
  const viewBox = expectNumbers(record, "viewBox", 4);
  const counties = expectArray(record, "counties").map((entry, index) => parseCounty(entry, index));
  const regions = expectArray(record, "regions").map((entry, index) => parseRegion(entry, index));
  return {
    version: 1,
    id: "indiana",
    digest: expectString(record, "digest"),
    viewBox: [viewBox[0] ?? 0, viewBox[1] ?? 0, viewBox[2] ?? 0, viewBox[3] ?? 0],
    outline: expectString(record, "outline"),
    counties,
    regions,
  };
}

function parseCounty(input: unknown, index: number): County {
  const record = expectRecord(input, `counties[${index}]`);
  const centroid = expectNumbers(record, "centroid", 2);
  return {
    id: makeFips(expectString(record, "id")),
    name: expectString(record, "name"),
    path: expectString(record, "path"),
    centroid: [centroid[0] ?? 0, centroid[1] ?? 0],
    neighbors: expectStrings(record, "neighbors").map((value) => makeFips(value)),
    regionId: makeRegionId(expectString(record, "regionId")),
    facts: expectArray(record, "facts").map((entry, factIndex) => parseFact(entry, factIndex)),
  };
}

function parseRegion(input: unknown, index: number): Region {
  const record = expectRecord(input, `regions[${index}]`);
  return {
    id: makeRegionId(expectString(record, "id")),
    name: expectString(record, "name"),
    counties: expectStrings(record, "counties").map((value) => makeFips(value)),
    borderPath: expectString(record, "borderPath"),
    bonus: expectNumber(record, "bonus"),
    review: expectReview(record, "review"),
  };
}

function parseFact(input: unknown, index: number): CountyFact {
  const record = expectRecord(input, `facts[${index}]`);
  return { label: expectString(record, "label"), text: expectString(record, "text") };
}

function optionalBonus(record: Record<string, unknown>): { bonus: number } | Record<string, never> {
  if (!Object.hasOwn(record, "bonus")) return {};
  const value = record.bonus;
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error("bonus must be an integer");
  return { bonus: value };
}

function expectReview(record: Record<string, unknown>, key: string): "draft" | "reviewed" {
  const value = record[key];
  if (value !== "draft" && value !== "reviewed") throw new Error(`${key} must be draft or reviewed`);
  return value;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function expectRecord(input: unknown, label: string): Record<string, unknown> {
  if (!isRecord(input)) throw new Error(`${label} must be an object`);
  return input;
}

function expectArray(record: Record<string, unknown>, key: string): unknown[] {
  const value = record[key];
  if (!Array.isArray(value)) throw new Error(`${key} must be an array`);
  return value;
}

function expectString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${key} must be a non-empty string`);
  return value;
}

function expectStrings(record: Record<string, unknown>, key: string): string[] {
  return expectArray(record, key).map((value, index) => {
    if (typeof value !== "string" || value.trim() === "") throw new Error(`${key}[${index}] must be a non-empty string`);
    return value;
  });
}

function expectNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${key} must be a number`);
  return value;
}

function expectCount(record: Record<string, unknown>, key: string): number {
  const value = expectNumber(record, key);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${key} must be a positive integer`);
  return value;
}

function expectNumbers(record: Record<string, unknown>, key: string, length: number): number[] {
  const values = expectArray(record, key);
  if (values.length !== length || values.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
    throw new Error(`${key} must be ${length} numbers`);
  }
  return values.filter((value): value is number => typeof value === "number");
}
