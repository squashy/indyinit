import { spawnSync } from "node:child_process";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

export function runRulesGate(root = process.cwd()): { exitCode: number; output: string } {
  return runTest(root, ["tests/rules.test.ts"]);
}

function runTest(root: string, files: readonly string[]): { exitCode: number; output: string } {
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", ...files.map((file) => path.join(root, file))], {
    cwd: root,
    encoding: "utf8",
  });
  return { exitCode: result.status ?? 1, output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim() };
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(path.resolve(entry)).href) {
  const result = runRulesGate();
  console.log(result.output);
  process.exit(result.exitCode);
}
