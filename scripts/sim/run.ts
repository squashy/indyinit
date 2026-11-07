import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { formatReport, loadIndianaBoard, runSimulation } from "./harness.ts";
import type { SimOptions } from "./harness.ts";
import type { Mode } from "../../src/types.ts";

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
