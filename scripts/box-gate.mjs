import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const name = process.argv[2];
if (name !== "map") {
  console.error(name ? `Unknown gate "${name}". Known gates: map` : "Usage: npm run gates -- <name>");
  process.exit(1);
}
const result = spawnSync(process.execPath, ["--experimental-strip-types", path.join(root, "gates/map-gate.ts")], {
  cwd: root,
  stdio: "inherit",
});
process.exit(result.status ?? 1);
