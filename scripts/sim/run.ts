import { writeFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import { formatAiBench, formatReport, loadIndianaBoard, runAiBenchmark, runSimulation } from "./harness.ts";
import type { SimOptions } from "./harness.ts";
import type { Mode } from "../../src/types.ts";

/** Fixed bench seeds, listed before any game is played. Each is played twice with the seats swapped. */
export const AI_BENCH_SEEDS: readonly number[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33,
  34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64,
  65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95,
  96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120,
  121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144,
  145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168,
  169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 192,
  193, 194, 195, 196, 197, 198, 199, 200,
];

const USAGE = "usage: node --experimental-strip-types scripts/sim/run.ts [--seeds 50] [--players 2] [--mode quick60|total92] [--success 0.6] [--max-steps 2000] [--run-seed sim]";

export type Cli = { readonly help: true } | { readonly help: false; readonly options: SimOptions };

export function parseArgs(argv: readonly string[]): Cli {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--help" || flag === "-h") return { help: true };
    if (!flag?.startsWith("--")) throw new Error(USAGE);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`${flag} needs a value\n${USAGE}`);
    values.set(flag, value);
    index += 1;
  }
  const seeds = values.get("--seeds");
  const players = values.get("--players");
  const mode = values.get("--mode");
  const success = values.get("--success");
  const maxSteps = values.get("--max-steps");
  const runSeed = values.get("--run-seed");
  const known = new Set(["--seeds", "--players", "--mode", "--success", "--max-steps", "--run-seed"]);
  for (const flag of values.keys()) {
    if (!known.has(flag)) throw new Error(`unknown option ${flag}\n${USAGE}`);
  }
  const options: SimOptions = {
    ...(seeds === undefined ? {} : { seeds: readInt("--seeds", seeds) }),
    ...(players === undefined ? {} : { players: readInt("--players", players) }),
    ...(mode === undefined ? {} : { mode: readMode(mode) }),
    ...(success === undefined ? {} : { success: readSuccess(success) }),
    ...(maxSteps === undefined ? {} : { maxSteps: readInt("--max-steps", maxSteps) }),
    ...(runSeed === undefined ? {} : { runSeed }),
  };
  return { help: false, options };
}

function main(): void {
  try {
    if (process.argv.slice(2).includes("--bench")) {
      runBench();
      return;
    }
    const parsed = parseArgs(process.argv.slice(2));
    if (parsed.help) {
      console.log(USAGE);
      return;
    }
    const started = Date.now();
    const report = runSimulation(loadIndianaBoard(), parsed.options);
    console.log(formatReport(report));
    console.log(`time     ${((Date.now() - started) / 1000).toFixed(2)}s`);
    if (report.failures.length > 0) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : "simulation failed");
    process.exitCode = 1;
  }
}

function runBench(): void {
  const started = Date.now();
  const report = runAiBenchmark(loadIndianaBoard(), AI_BENCH_SEEDS, (done, total) => {
    if (done % 20 === 0 || done === total) console.error(`bench ${done}/${total}`);
  });
  const text = formatAiBench(report);
  console.log(text);
  const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "ai-bench.json");
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`json     ${file}`);
  console.log(`time     ${((Date.now() - started) / 1000).toFixed(2)}s`);
  if (report.errors > 0) process.exitCode = 1;
}

function readInt(flag: string, value: string): number {
  if (!/^[0-9]+$/.test(value)) throw new Error(`${flag} expects a positive integer`);
  return Number(value);
}

function readSuccess(value: string): number {
  const success = Number(value);
  if (!Number.isFinite(success)) throw new Error("--success expects a number from 0 to 1");
  return success;
}

function readMode(value: string): Mode {
  if (value === "quick60" || value === "total92") return value;
  throw new Error("--mode expects quick60 or total92");
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(path.resolve(entry)).href) main();
