import { readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { parseMapPack, parseRegionFile } from "../factory/parse-map.ts";
import type {
  ChoiceLetter,
  County,
  CountyId,
  GameConfig,
  GameState,
  MapPack,
  Mode,
  Player,
  PlayerCount,
  PlayerId,
  QuestionId,
  QuizPack,
  QuizQuestion,
  Region,
} from "../src/types.ts";

const RECORDED_POOL: Record<PlayerCount, number> = { 2: 60, 3: 45, 4: 38, 5: 32, 6: 28 };
const SECOND_SEAT_EXTRA = 15;
const CHOICES = ["A", "B", "C", "D"] as const;

export type Pack = {
  readonly map: MapPack;
  readonly referenceTerritories: number;
};

let packCache: Pack | null = null;

export function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

export function loadPack(): Pack {
  if (packCache) return packCache;
  const root = repoRoot();
  const map = parseMapPack(JSON.parse(readFileSync(path.join(root, "data/regions/in/map.json"), "utf8")));
  const manifest = parseRegionFile(JSON.parse(readFileSync(path.join(root, "regions/in/region.json"), "utf8")));
  packCache = { map, referenceTerritories: manifest.expectedTerritories };
  return packCache;
}

export function withRegionBonus(map: MapPack, bonus: number): MapPack {
  return {
    ...map,
    regions: map.regions.map((region) => ({ ...region, bonus })),
  };
}

export function seats(count: PlayerCount): readonly Player[] {
  const ids: PlayerId[] = [0, 1, 2, 3, 4, 5];
  return ids.slice(0, count).map((id, index) => ({
    id,
    label: `Seat ${index + 1}`,
    kind: "human" as const,
  }));
}

export function quizPack(map: MapPack, include: (county: County) => boolean = () => true): QuizPack {
  const counties: Record<string, QuizQuestion[]> = {};
  for (const county of map.counties) {
    counties[county.id] = include(county) ? [questionFor(county)] : [];
  }
  return {
    version: 1,
    mapDigest: map.digest,
    sourceDigest: "rule-tests",
    counties: counties as QuizPack["counties"],
  };
}

export function emptyQuiz(map: MapPack): QuizPack {
  return quizPack(map, () => false);
}

export function singleCountyQuiz(map: MapPack, countyId: CountyId): QuizPack {
  return quizPack(map, (county) => county.id === countyId);
}

export function gameConfig(map: MapPack, quiz: QuizPack, count: PlayerCount, mode: Mode): GameConfig {
  return { players: seats(count), mode, map, quiz };
}

export function startingPool(count: PlayerCount, seat: number, territories: number, reference: number): number {
  if (reference < 1) throw new Error("the pack has no reference size");
  const base = Math.round((RECORDED_POOL[count] * territories) / reference);
  const extra = count === 2 && seat === 1 ? Math.round((SECOND_SEAT_EXTRA * territories) / reference) : 0;
  return base + extra;
}

export function baseIncome(owned: number): number {
  return Math.max(3, Math.floor(owned / 3));
}

export function quickTarget(territories: number): number {
  return Math.ceil(territories * 0.65);
}

export function reinforcement(owned: number, regionBonus: number, quiz: 0 | 2): number {
  return baseIncome(owned) + regionBonus + quiz;
}

export function dieFace(draw: number): number {
  return 1 + Math.floor(draw * 6);
}

export function drawForFace(face: number): number {
  return (face - 0.5) / 6;
}

export function pairDice(attack: readonly number[], defense: readonly number[]): { attackLosses: number; defenseLosses: number } {
  const left = [...attack].sort((a, b) => b - a);
  const right = [...defense].sort((a, b) => b - a);
  const pairs = Math.min(left.length, right.length);
  let attackLosses = 0;
  let defenseLosses = 0;
  for (let index = 0; index < pairs; index += 1) {
    const attackDie = left[index] ?? 0;
    const defenseDie = right[index] ?? 0;
    if (attackDie > defenseDie) defenseLosses += 1;
    else attackLosses += 1;
  }
  return { attackLosses, defenseLosses };
}

export function holding(state: GameState, countyId: CountyId) {
  const found = state.holdings.find((item) => item.countyId === countyId);
  if (!found) throw new Error("missing holding");
  return found;
}

export function ownedBy(state: GameState, player: PlayerId): CountyId[] {
  return state.holdings.filter((item) => item.owner === player).map((item) => item.countyId);
}

export function armyTotal(state: GameState, player: PlayerId): number {
  return state.holdings.reduce((sum, item) => sum + (item.owner === player ? item.armies : 0), 0);
}

export function fullRegions(state: GameState, player: PlayerId): readonly Region[] {
  const owned = new Set(ownedBy(state, player));
  return state.config.map.regions.filter((region) => region.counties.length > 0 && region.counties.every((id) => owned.has(id)));
}

export function regionBonus(state: GameState, player: PlayerId): number {
  return fullRegions(state, player).reduce((sum, region) => sum + region.bonus, 0);
}

export function countyName(state: GameState, countyId: CountyId): string {
  const county = state.config.map.counties.find((item) => item.id === countyId);
  if (!county) throw new Error("missing county");
  return county.name;
}

export function neighborsOf(state: GameState, countyId: CountyId): readonly CountyId[] {
  const county = state.config.map.counties.find((item) => item.id === countyId);
  if (!county) throw new Error("missing county");
  return county.neighbors;
}

export function questionId(county: County): QuestionId {
  return `q-${county.id}` as QuestionId;
}

function questionFor(county: County): QuizQuestion {
  const choices: Record<ChoiceLetter, string> = {
    A: `${county.name} choice A`,
    B: `${county.name} choice B`,
    C: `${county.name} choice C`,
    D: `${county.name} choice D`,
  };
  return {
    kind: "multipleChoice",
    id: questionId(county),
    countyId: county.id,
    countyName: county.name,
    countySeat: county.name,
    established: 0,
    namedFor: county.name,
    category: "rule-test",
    prompt: `${county.name} is named in this question.`,
    choices,
    correctLetter: "A",
    correctAnswer: choices.A,
  };
}

export function isChoiceOrder(order: readonly ChoiceLetter[]): boolean {
  return order.length === CHOICES.length && CHOICES.every((letter) => order.includes(letter));
}
