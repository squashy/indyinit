import { pathToFileURL } from "node:url";
import * as path from "node:path";
import { ruleMutants, type RuleMutant } from "./mutants.ts";
import { ENGINE_MISSING, loadContract, type Tools } from "./rules.engine.ts";
import { ruleCases, type RuleCase } from "./rules.cases.ts";

export async function runRulesGate(): Promise<{ exitCode: number; output: string }> {
  const loaded = await loadContract();
  if (!loaded.ok) {
    const lines = [loaded.reason === ENGINE_MISSING ? ENGINE_MISSING : loaded.reason, "rules: SKIP"];
    for (const ruleCase of ruleCases) lines.push(`skip ${ruleCase.name}`);
    lines.push("mutants: SKIP");
    for (const mutant of ruleMutants) lines.push(`skip ${mutant.id}`);
    return { exitCode: loaded.reason === ENGINE_MISSING ? 0 : 1, output: lines.join("\n") };
  }
  const lines: string[] = [];
  let failed = false;
  for (const ruleCase of ruleCases) {
    const outcome = runCase(ruleCase, loaded.tools);
    lines.push(`${outcome.status} ${ruleCase.name}`);
    if (outcome.detail) lines.push(outcome.detail);
    if (outcome.status === "fail") failed = true;
  }
  lines.unshift(failed ? "rules: FAIL" : "rules: PASS");
  if (failed) {
    lines.push("mutants: SKIP");
    return { exitCode: 1, output: lines.join("\n") };
  }
  let missed = false;
  for (const mutant of ruleMutants) {
    const caughtBy = exerciseMutant(mutant, loaded.tools);
    if (caughtBy) lines.push(`caught ${mutant.id} by ${caughtBy}`);
    else {
      missed = true;
      lines.push(`missed ${mutant.id}`);
    }
  }
  lines.splice(1, 0, missed ? "mutants: FAIL" : "mutants: PASS");
  return { exitCode: missed ? 1 : 0, output: lines.join("\n") };
}

export function exerciseMutant(mutant: RuleMutant, tools: Tools): string | null {
  const broken = mutant.apply(tools.engine);
  const mutated: Tools = { ...tools, engine: broken };
  for (const ruleCase of ruleCases) {
    if (ruleCase.needs === "prepareQuestion" && !tools.prepareQuestion) continue;
    const outcome = runCase(ruleCase, mutated);
    if (outcome.status === "fail") return ruleCase.name;
  }
  return null;
}

function runCase(ruleCase: RuleCase, tools: Tools): { status: "pass" | "fail" | "skip"; detail?: string } {
  if (ruleCase.needs === "prepareQuestion" && !tools.prepareQuestion) {
    return { status: "skip", detail: "prepareQuestion missing" };
  }
  try {
    ruleCase.run(tools);
    return { status: "pass" };
  } catch (error) {
    return { status: "fail", detail: error instanceof Error ? error.message : "failed" };
  }
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(path.resolve(entry)).href) {
  const result = await runRulesGate();
  console.log(result.output);
  process.exit(result.exitCode);
}
