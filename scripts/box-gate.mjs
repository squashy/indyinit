import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gates = { map: "gates/map-gate.ts", rules: "gates/rules-gate.ts", quiz: "gates/quiz-gate.ts" };
const name = process.argv[2];
const file = name && Object.hasOwn(gates, name) ? gates[name] : undefined;
if (!file) {
  console.error(name ? `Unknown gate "${name}". Known gates: ${Object.keys(gates).join(", ")}` : "Usage: npm run gates -- <name>");
  process.exit(1);
}
const result = spawnSync(process.execPath, ["--experimental-strip-types", path.join(root, file)], {
  cwd: root,
  stdio: "inherit",
});
process.exit(result.status ?? 1);
