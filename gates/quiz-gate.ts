import { spawnSync } from "node:child_process";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

export function runQuizGate(root = process.cwd()): { exitCode: number; output: string } {
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--test", path.join(root, "tests/quiz.test.ts"), path.join(root, "factory/import-quiz.test.ts")],
    { cwd: root, encoding: "utf8" },
  );
  return { exitCode: result.status ?? 1, output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim() };
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(path.resolve(entry)).href) {
  const result = runQuizGate();
  console.log(result.output);
  process.exit(result.exitCode);
}
