import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Gate entry files. Each runs as its own Node process with type stripping.
const gates = {
  map: "gates/map-gate.ts",
  rules: "gates/rules.gate.ts",
  "rules-engine": "gates/rules-gate.ts",
  quiz: "gates/quiz-gate.ts",
};

// Checkers that export a function but have no entry file of their own.
const inline = {
  security: {
    file: "gates/security-check.ts",
    code: (url) => `
      const { scanTrackedTree, formatSafetyResult } = await import(${JSON.stringify(url)});
      const { issues } = scanTrackedTree(${JSON.stringify(root)});
      console.log(formatSafetyResult(issues));
      process.exit(issues.length === 0 ? 0 : 1);
    `,
  },
};

const names = [...Object.keys(gates), ...Object.keys(inline)];

function run(name) {
  const args = ["--experimental-strip-types"];
  if (Object.hasOwn(gates, name)) {
    args.push(path.join(root, gates[name]));
  } else {
    const { file, code } = inline[name];
    args.push("--input-type=module", "-e", code(pathToFileURL(path.join(root, file)).href));
  }
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: "inherit" });
  return result.status ?? 1;
}

const arg = process.argv[2];

if (arg === "--list") {
  console.log(names.join("\n"));
  process.exit(0);
}

if (arg === "--help" || arg === "-h") {
  console.log(
    `Usage: npm run gates [-- <name> | --list]\n` +
      `With no name, every gate runs in order and the first failure stops the run.\n` +
      `Gates: ${names.join(", ")}`,
  );
  process.exit(0);
}

if (arg !== undefined) {
  if (!names.includes(arg)) {
    console.error(`Unknown gate "${arg}". Known gates: ${names.join(", ")}`);
    process.exit(1);
  }
  process.exit(run(arg));
}

for (const name of names) {
  console.log(`\n== gate ${name}`);
  const status = run(name);
  if (status !== 0) {
    console.error(`gate ${name} failed (exit ${status})`);
    process.exit(status);
  }
}
console.log(`\nall gates passed: ${names.join(", ")}`);
