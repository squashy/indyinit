import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  checkRelease,
  classifyCommandResult,
  discoverCommands,
  discoverDataCopy,
  discoverGateNames,
  evidenceDirectoryError,
} from "../scripts/btt19-release-check.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHA = "a".repeat(40);

test("the repository plan is typecheck, each box gate, and one build", () => {
  const pkg = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  const names = discoverGateNames(readFileSync(path.join(repoRoot, "scripts", "box-gate.mjs"), "utf8"));
  const commands = discoverCommands(pkg, names);
  assert.deepEqual(
    commands.map((command) => command.id),
    ["typecheck", "gate:map", "gate:rules", "gate:rules-engine", "gate:quiz", "build"],
  );
  assert.equal(commands.filter((command) => command.id === "build").length, 1);
  assert.equal(commands.some((command) => command.argv.includes("test")), false);
  assert.deepEqual(discoverDataCopy(readFileSync(path.join(repoRoot, "vite.config.ts"), "utf8")), { from: "data", to: "dist/data" });
});

test("a skipped gate is not an executed pass", () => {
  const command = { id: "gate:rules", argv: ["npm", "run", "gates", "--", "rules"], script: "node scripts/box-gate.mjs" };
  const skipped = classifyCommandResult(command, { status: 0, stdout: "rules: SKIP\nskip sample\n" });
  assert.equal(skipped.evidence, "executed");
  assert.equal(skipped.status, "skipped");
  const passed = classifyCommandResult(command, { status: 0, stdout: "rules: PASS\n" });
  assert.equal(passed.status, "pass");
  const missing = classifyCommandResult({ id: "typecheck", missing: true, argv: [], script: null }, null);
  assert.equal(missing.evidence, "missing");
  assert.equal(missing.status, "blocked");
});

test("a clean candidate records executed checks and leaves smoke pending", () => {
  const fixture = writeCandidate();
  const calls = [];
  const result = checkRelease({
    root: fixture.root,
    outDir: fixture.out,
    checkedAt: "2026-11-07T00:00:00.000Z",
    git: cleanGit,
    run: (root, argv) => {
      calls.push(argv.join(" "));
      assert.equal(root, fixture.root);
      return { status: 0, stdout: "ok\n", stderr: "" };
    },
  });
  assert.deepEqual(calls, ["npm run typecheck", "npm run gates -- map", "npm run build"]);
  assert.equal(result.report.automatedVerdict, "pass");
  assert.equal(result.report.releaseVerdict, "blocked");
  assert.equal(result.report.releaseReady, false);
  assert.equal(result.report.exactCommittedCandidate ?? result.report.candidate.exactCommittedCandidate, true);
  assert.equal(result.report.sha, SHA);
  assert.equal(result.report.representation, "exact committed candidate");
  assert.equal(result.report.historicalFactCheck, "not-run");
  assert.equal(result.report.localFullTurn, "pending");
  assert.equal(result.report.publicSmoke, "pending");
  assert.deepEqual(result.report.reasons, ["manual:local-full-turn", "manual:public-smoke"]);
  const byId = Object.fromEntries(result.report.checks.map((check) => [check.id, check]));
  assert.equal(byId.typecheck.evidence, "executed");
  assert.equal(byId["gate:map"].evidence, "executed");
  assert.equal(byId.build.evidence, "executed");
  assert.equal(byId["asset:quiz"].evidence, "inspected");
  assert.equal(byId["asset:quiz"].source, "data/quiz.json");
  assert.equal(byId["asset:quiz"].shipped, "dist/data/quiz.json");
  assert.equal(byId["manual:local-full-turn"].evidence, "manual");
  assert.equal(byId["historical-fact-check"].status, "not-run");
  assert.equal(byId["static-header-config"].status, "pass");
  assert.equal(byId["static-header-config"].declared[0].value, "from-fixture");
  assert.equal(result.exitCode, 1);
  assert.equal(JSON.stringify(result.report).includes("Sample prompt"), false);
});

test("missing quiz and UI stay blocked, including a library bundle and a rejected build", () => {
  const missing = writeCandidate({ quiz: false, ui: false, distScript: "dist/types.js" });
  write(path.join(missing.root, "public", "data", "quiz.json"), "{}\n");
  write(path.join(missing.root, "dist", "data", "quiz.json"), "{}\n");
  const absent = checkRelease({
    root: missing.root,
    outDir: missing.out,
    git: cleanGit,
    run: () => ({ status: 0, stdout: "ok\n", stderr: "" }),
  });
  const absentById = Object.fromEntries(absent.report.checks.map((check) => [check.id, check]));
  assert.equal(absentById["asset:quiz"].status, "blocked");
  assert.equal(absentById["asset:quiz"].evidence, "missing");
  assert.equal(absentById["asset:quiz"].detail, "data/quiz.json is absent");
  assert.equal(absentById["asset:ui-entry"].status, "blocked");
  assert.equal(absentById["asset:ui-entry"].evidence, "missing");
  assert.match(absentById["asset:ui-entry"].detail, /library bundle/);
  assert.equal(absent.report.automatedVerdict, "blocked");

  const stale = writeCandidate();
  const rejected = checkRelease({
    root: stale.root,
    outDir: path.join(stale.out, "rejected"),
    git: cleanGit,
    run: (root, argv) => ({ status: argv.at(-1) === "build" ? 1 : 0, stdout: "ok\n", stderr: "" }),
  });
  const rejectedById = Object.fromEntries(rejected.report.checks.map((check) => [check.id, check]));
  assert.equal(rejectedById.build.evidence, "executed");
  assert.equal(rejectedById.build.status, "fail");
  assert.equal(rejectedById["asset:quiz"].status, "blocked");
  assert.equal(rejectedById["asset:ui-entry"].status, "blocked");
  assert.notEqual(rejectedById["asset:ui-entry"].status, "pass");

  const mismatched = writeCandidate({ mapDigest: "b".repeat(64) });
  const mismatch = checkRelease({
    root: mismatched.root,
    outDir: path.join(mismatched.out, "mismatch"),
    git: cleanGit,
    run: () => ({ status: 0, stdout: "ok\n", stderr: "" }),
  });
  const mismatchQuiz = mismatch.report.checks.find((check) => check.id === "asset:quiz");
  assert.equal(mismatchQuiz.status, "blocked");
  assert.match(mismatchQuiz.detail, /structural/);
});

test("a dirty or unpinned tree is not exact committed evidence", () => {
  const fixture = writeCandidate();
  const dirty = checkRelease({
    root: fixture.root,
    outDir: fixture.out,
    git: () => ({ ok: true, sha: SHA, branch: "candidate", dirty: true, dirtyPaths: ["data/quiz.json"] }),
    run: () => ({ status: 0, stdout: "ok\n", stderr: "" }),
  });
  assert.equal(dirty.report.candidate.exactCommittedCandidate, false);
  assert.equal(dirty.report.representation, "not exact committed release evidence");
  assert.equal(dirty.report.automatedVerdict, "blocked");
  assert.match(dirty.evidenceFile, /-dirty\.json$/);

  const unpinned = checkRelease({
    root: fixture.root,
    outDir: path.join(fixture.out, "unpinned"),
    git: () => ({ ok: false, sha: null, branch: null, dirty: true, dirtyPaths: [], error: "HEAD could not be pinned" }),
    run: () => ({ status: 0, stdout: "ok\n", stderr: "" }),
  });
  assert.equal(unpinned.report.sha, null);
  assert.equal(unpinned.report.candidate.worktree, "unpinned");
  assert.match(unpinned.evidenceFile, /unpinned\.json$/);
});

test("header values come from vercel.json and evidence stays outside the tree", () => {
  const source = readFileSync(path.join(repoRoot, "scripts", "btt19-release-check.mjs"), "utf8");
  assert.equal(source.includes("default-src"), false);
  assert.equal(source.includes("deploymentSha"), false);
  assert.equal(source.includes("public/data/quiz.json"), false);
  const fixture = writeCandidate();
  assert.match(evidenceDirectoryError(fixture.root, path.join(fixture.root, "inside")), /outside/);
  let ran = false;
  assert.throws(
    () => checkRelease({ root: fixture.root, outDir: path.join(fixture.root, "inside"), run: () => { ran = true; return { status: 0, stdout: "", stderr: "" }; } }),
    /outside/,
  );
  assert.equal(ran, false);
  const quiz = path.join(fixture.root, "data", "quiz.json");
  const before = createHash("sha256").update(readFileSync(quiz)).digest("hex");
  checkRelease({
    root: fixture.root,
    outDir: fixture.out,
    git: cleanGit,
    run: () => ({ status: 0, stdout: "ok\n", stderr: "" }),
  });
  assert.equal(createHash("sha256").update(readFileSync(quiz)).digest("hex"), before);
});

test("the cli prints help and refuses an in-tree evidence directory", () => {
  const help = spawnSync(process.execPath, [path.join(repoRoot, "scripts", "btt19-release-check.mjs"), "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /pending/);
  const root = mkdtempSync(path.join(tmpdir(), "btt19-cli-"));
  const refused = spawnSync(process.execPath, [path.join(repoRoot, "scripts", "btt19-release-check.mjs"), "--root", root, "--out", path.join(root, "evidence")], {
    encoding: "utf8",
  });
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /outside/);
});

function cleanGit() {
  return { ok: true, sha: SHA, branch: "candidate/btt19-release-verification", dirty: false, dirtyPaths: [] };
}

function writeCandidate(options = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "btt19-candidate-"));
  const out = mkdtempSync(path.join(tmpdir(), "btt19-evidence-"));
  const mapDigest = "ab".repeat(32);
  const quizDigest = options.mapDigest ?? mapDigest;
  write(path.join(root, "package.json"), JSON.stringify({
    scripts: { typecheck: "tsc --noEmit", gates: "node scripts/box-gate.mjs", build: "vite build" },
  }));
  write(path.join(root, "scripts", "box-gate.mjs"), "const gates = {\n  map: \"gates/map-gate.ts\",\n};\n");
  write(path.join(root, "vite.config.ts"), "if (existsSync(\"data\")) cpSync(\"data\", \"dist/data\", { recursive: true });\n");
  const map = {
    version: 1,
    id: "sample",
    digest: mapDigest,
    counties: [{ id: "18001", facts: [] }],
    regions: [{ id: "sample", name: "Sample", counties: ["18001"], bonus: 0, review: "draft" }],
  };
  const mapText = `${JSON.stringify(map)}\n`;
  write(path.join(root, "data", "regions", "in", "map.json"), mapText);
  write(path.join(root, "dist", "data", "regions", "in", "map.json"), mapText);
  if (options.quiz !== false) {
    const quiz = {
      version: 1,
      mapDigest: quizDigest,
      sourceDigest: "cd".repeat(32),
      counties: {
        "18001": [{
          id: "1",
          countyId: "18001",
          prompt: "Sample prompt",
          choices: { A: "one", B: "two", C: "three", D: "four" },
          correctLetter: "A",
          correctAnswer: "one",
        }],
      },
    };
    const quizText = `${JSON.stringify(quiz)}\n`;
    write(path.join(root, "data", "quiz.json"), quizText);
    write(path.join(root, "dist", "data", "quiz.json"), quizText);
  }
  if (options.ui !== false) {
    write(path.join(root, "index.html"), "<!doctype html><script type=\"module\" src=\"/src/main.ts\"></script>\n");
    write(path.join(root, "src", "main.ts"), "export {}\n");
    write(path.join(root, "dist", "index.html"), "<!doctype html><script type=\"module\" src=\"/assets/app.js\"></script>\n");
    write(path.join(root, "dist", "assets", "app.js"), "export {}\n");
  } else if (options.distScript) {
    write(path.join(root, options.distScript), "export {}\n");
  }
  write(path.join(root, "vercel.json"), JSON.stringify({
    headers: [{ source: "/(.*)", headers: [{ key: "X-Test-Policy", value: "from-fixture" }] }],
  }));
  return { root, out };
}

function write(file, text) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
}
