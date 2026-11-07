#!/usr/bin/env node
/**
 * Evidence for one candidate SHA.
 * Runs the discovered typecheck, box gates, and one production build.
 * Writes the report outside the candidate tree.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const TOOL = "btt19-release-check";

const HELP = `Usage: node scripts/btt19-release-check.mjs [--root dir] [--out dir]

Pins HEAD, runs the discovered typecheck, box gates, and one production build,
then inspects the shipped map, quiz, and UI entry. The report is written
outside the candidate tree. Manual full-turn and public smoke stay pending.
Exit 0 is a finished release record. Exit 1 means the report was written and
release evidence is still incomplete. Exit 2 is a usage error.`;

export function parseArgs(argv) {
  const options = { root: process.cwd(), out: null, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--root") options.root = required(argv, (index += 1), arg);
    else if (arg === "--out") options.out = required(argv, (index += 1), arg);
    else throw new Error(`unknown argument ${arg}`);
  }
  return options;
}

function required(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} needs a value`);
  return value;
}

export function discoverGateNames(source) {
  const match = String(source).match(/const gates = \{([\s\S]*?)\n\};/);
  if (!match) return null;
  const names = [];
  for (const line of match[1].split("\n")) {
    const found = line.match(/^\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z_][\w-]*))\s*:/);
    const name = found?.[1] ?? found?.[2] ?? found?.[3];
    if (name) names.push(name);
  }
  return names.length > 0 ? names : null;
}

export function discoverDataCopy(source) {
  const match = String(source).match(/cpSync\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']/);
  if (!match) return null;
  const from = match[1].replace(/\/$/, "");
  const to = match[2].replace(/\/$/, "");
  if (!from || !to || from.includes("..") || to.includes("..")) return null;
  return { from, to };
}

export function discoverCommands(pkg, gateNames) {
  const scripts = pkg?.scripts && typeof pkg.scripts === "object" ? pkg.scripts : {};
  const commands = [];
  pushScript(commands, "typecheck", scripts.typecheck, ["npm", "run", "typecheck"]);
  const gatesScript = typeof scripts.gates === "string" ? scripts.gates : "";
  if (Array.isArray(gateNames) && gateNames.length > 0 && gatesScript.includes("box-gate")) {
    for (const name of gateNames) {
      commands.push({ id: `gate:${name}`, argv: ["npm", "run", "gates", "--", name], script: gatesScript });
    }
  } else {
    commands.push({ id: "gates", missing: true, argv: [], script: gatesScript || null });
  }
  pushScript(commands, "build", scripts.build, ["npm", "run", "build"]);
  return commands;
}

function pushScript(commands, id, script, argv) {
  if (typeof script === "string" && script.trim()) commands.push({ id, argv, script });
  else commands.push({ id, missing: true, argv: [], script: null });
}

export function classifyCommandResult(command, result) {
  if (command.missing) {
    return commandRow(command, "missing", "blocked", `${command.id} was not discovered`);
  }
  const output = `${result?.stdout ?? ""}${result?.stderr ?? ""}`;
  const exitCode = Number.isInteger(result?.status) ? result.status : 1;
  let status = "pass";
  let detail = "";
  if (result?.error || result?.signal || exitCode !== 0) {
    status = "fail";
    detail = result?.error || (result?.signal ? String(result.signal) : `exit ${exitCode}`);
  } else if (command.id.startsWith("gate:")) {
    const skipped = maxCount(output, "skipped");
    if (!output.trim() || /^rules: SKIP$/m.test(output) || /^mutants: SKIP$/m.test(output) || /^skip /m.test(output) || skipped > 0) {
      status = "skipped";
      detail = "the gate skipped work, so this is not an executed pass";
    } else if (maxCount(output, "fail") > 0) {
      status = "fail";
      detail = "the gate reported failures with exit 0";
    }
  }
  const row = commandRow(command, "executed", status, detail);
  row.exitCode = exitCode;
  row.summary = status === "pass" ? brief(output) : "";
  row.outputTail = status === "pass" ? "" : tail(output, 4000);
  return row;
}

function commandRow(command, evidence, status, detail) {
  return {
    id: command.id,
    group: "command",
    evidence,
    status,
    blocksAutomated: true,
    blocksRelease: false,
    command: command.argv.join(" "),
    script: command.script,
    exitCode: null,
    summary: "",
    outputTail: "",
    detail,
  };
}

function maxCount(output, label) {
  let count = 0;
  for (const match of output.matchAll(new RegExp(`(?:#|ℹ)\\s+${label}\\s+(\\d+)`, "g"))) {
    count = Math.max(count, Number(match[1]));
  }
  return count;
}

function brief(output) {
  const counts = output.match(/(?:#|ℹ)\s+(?:tests|pass|fail|skipped)\s+\d+/g);
  if (counts?.length) return counts.join(" ");
  return output.trim().split("\n").filter(Boolean).slice(-2).join(" | ").slice(0, 240);
}

function tail(output, limit) {
  const text = output.trim();
  return text.length <= limit ? text : text.slice(text.length - limit);
}

export function evidenceDirectoryError(root, outDir) {
  if (!existsSync(root)) return "candidate root does not exist";
  const rootReal = realpathSync(root);
  const resolved = path.resolve(outDir);
  let cursor = resolved;
  while (!existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) return "evidence directory is not usable";
    cursor = parent;
  }
  const outReal = path.resolve(realpathSync(cursor), path.relative(cursor, resolved));
  if (outReal === rootReal || outReal.startsWith(`${rootReal}${path.sep}`)) {
    return "evidence directory must stay outside the candidate tree";
  }
  return null;
}

export function inspectAssets(root, buildAccepted) {
  const copy = readDataCopy(root);
  const maps = loadMaps(root, copy);
  return {
    map: inspectMap(root, maps, buildAccepted, copy),
    quiz: inspectQuiz(root, maps, buildAccepted, copy),
    ui: inspectUi(root, buildAccepted),
    headers: inspectHeaders(root),
  };
}

function readDataCopy(root) {
  const file = path.join(root, "vite.config.ts");
  if (!existsSync(file)) return null;
  return discoverDataCopy(readFileSync(file, "utf8"));
}

function shippedRel(copy, sourceRel) {
  if (sourceRel !== copy.from && !sourceRel.startsWith(`${copy.from}/`)) return null;
  return `${copy.to}${sourceRel.slice(copy.from.length)}`;
}

function loadMaps(root, copy) {
  if (!copy) return [];
  const regionsDir = path.join(root, copy.from, "regions");
  if (!existsSync(regionsDir)) return [];
  return readdirSync(regionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `${copy.from}/regions/${entry.name}/map.json`)
    .filter((rel) => existsSync(path.join(root, rel)))
    .sort()
    .map((rel) => ({ rel, shipped: shippedRel(copy, rel), ...readMap(path.join(root, rel)) }));
}

function readMap(file) {
  const parsed = readJson(file);
  if (!parsed.ok || !parsed.value || typeof parsed.value !== "object") return { problem: "unreadable" };
  const pack = parsed.value;
  const counties = Array.isArray(pack.counties) ? pack.counties : [];
  const regions = Array.isArray(pack.regions) ? pack.regions : [];
  return {
    digest: typeof pack.digest === "string" ? pack.digest : "",
    countyIds: new Set(counties.map((county) => county?.id).filter((id) => typeof id === "string")),
    draftRegions: regions.filter((region) => region?.review !== "reviewed").length,
    zeroBonuses: regions.filter((region) => region?.bonus === 0).length,
    emptyFactCounties: counties.filter((county) => !Array.isArray(county?.facts) || county.facts.length === 0).length,
    problem: typeof pack.digest === "string" && counties.length > 0 ? "" : "no digest or counties",
  };
}

function inspectMap(root, maps, buildAccepted, copy) {
  if (!copy) return asset("asset:map", "missing", "blocked", "the build data copy was not found");
  if (maps.length === 0) return asset("asset:map", "missing", "blocked", "map pack is absent");
  const problems = [];
  for (const map of maps) {
    if (map.problem) problems.push(`${map.rel} ${map.problem}`);
    else if (buildAccepted && !sameBytes(path.join(root, map.rel), path.join(root, map.shipped))) {
      problems.push(`${map.rel} is not the file in the build output`);
    }
  }
  if (!buildAccepted) problems.push("build output was not accepted, so the shipped map was not counted");
  const draftRegions = maps.reduce((total, map) => total + (map.draftRegions ?? 0), 0);
  const zeroBonuses = maps.reduce((total, map) => total + (map.zeroBonuses ?? 0), 0);
  const status = problems.length === 0 ? "pass" : "blocked";
  return {
    ...asset("asset:map", status === "pass" ? "inspected" : "missing", status, status === "pass" ? `${maps.length} map pack(s) match the build output` : problems[0]),
    draftRegions,
    zeroBonuses,
    digests: maps.map((map) => map.digest).filter(Boolean),
  };
}

function inspectQuiz(root, maps, buildAccepted, copy) {
  if (!copy) return asset("asset:quiz", "missing", "blocked", "the build data copy was not found");
  const sourceRel = `${copy.from}/quiz.json`;
  const distRel = `${copy.to}/quiz.json`;
  const sourcePath = path.join(root, sourceRel);
  const distPath = path.join(root, distRel);
  if (!existsSync(sourcePath)) return { ...asset("asset:quiz", "missing", "blocked", `${sourceRel} is absent`), source: sourceRel, shipped: distRel };
  const problems = [];
  if (!buildAccepted) problems.push("build output was not accepted, so the shipped quiz pack was not counted");
  else if (!existsSync(distPath)) problems.push(`${distRel} is absent`);
  else if (!sameBytes(sourcePath, distPath)) problems.push(`${distRel} does not match ${sourceRel}`);
  const packPath = buildAccepted && existsSync(distPath) ? distPath : sourcePath;
  const parsed = readJson(packPath);
  let questions = 0;
  let structural = 0;
  let mapDigest = "";
  if (!parsed.ok) structural += 1;
  else {
    const counted = countQuiz(parsed.value ?? {}, maps);
    questions = counted.questions;
    structural = counted.structural;
    mapDigest = counted.mapDigest;
  }
  if (structural > 0) problems.push(`quiz pack has ${structural} structural problem(s)`);
  const status = problems.length === 0 ? "pass" : "blocked";
  const evidence = status === "pass" ? "inspected" : !existsSync(distPath) && buildAccepted ? "missing" : "inspected";
  return {
    ...asset("asset:quiz", evidence, status, status === "pass" ? `${questions} questions shipped at ${distRel}` : problems[0]),
    source: sourceRel,
    shipped: distRel,
    questions,
    structuralProblems: structural,
    mapDigest,
  };
}

function countQuiz(pack, maps) {
  let questions = 0;
  let structural = 0;
  const seen = new Set();
  const countyIds = new Set(maps.flatMap((map) => [...(map.countyIds ?? [])]));
  const counties = pack.counties;
  if (!counties || typeof counties !== "object" || Array.isArray(counties)) structural += 1;
  else {
    for (const [countyId, list] of Object.entries(counties)) {
      if (!Array.isArray(list) || list.length === 0) {
        structural += 1;
        continue;
      }
      if (countyIds.size > 0 && !countyIds.has(countyId)) structural += 1;
      for (const question of list) {
        questions += 1;
        if (!questionShape(question, countyId, seen)) structural += 1;
      }
    }
  }
  const mapDigest = typeof pack.mapDigest === "string" ? pack.mapDigest : "";
  const digests = maps.map((map) => map.digest).filter(Boolean);
  if (pack.version !== 1 || !/^[0-9a-f]{64}$/.test(mapDigest) || !/^[0-9a-f]{64}$/.test(String(pack.sourceDigest ?? ""))) structural += 1;
  if (digests.length > 0 && !digests.includes(mapDigest)) structural += 1;
  return { questions, structural, mapDigest };
}

function questionShape(question, countyId, seen) {
  if (!question || typeof question !== "object") return false;
  if (typeof question.id !== "string" || question.id.length === 0 || seen.has(question.id)) return false;
  seen.add(question.id);
  if (question.countyId !== countyId || typeof question.prompt !== "string" || question.prompt.length === 0) return false;
  const choices = question.choices;
  if (!choices || typeof choices !== "object") return false;
  for (const letter of ["A", "B", "C", "D"]) {
    if (typeof choices[letter] !== "string" || choices[letter].length === 0) return false;
  }
  const letter = question.correctLetter;
  return (letter === "A" || letter === "B" || letter === "C" || letter === "D") && choices[letter] === question.correctAnswer;
}

function inspectUi(root, buildAccepted) {
  const indexPath = path.join(root, "index.html");
  if (!existsSync(indexPath)) {
    return asset("asset:ui-entry", "missing", "blocked", "index.html is absent. A library bundle is not a playable UI entry.");
  }
  const modules = moduleSources(readFileSync(indexPath, "utf8"));
  const local = modules.find((item) => item.rel);
  if (!local || modules.some((item) => item.external || item.inline)) {
    return asset("asset:ui-entry", "missing", "blocked", "index.html has no local module script entry");
  }
  const modulePath = path.resolve(root, local.rel);
  if (!inside(root, modulePath) || !existsSync(modulePath) || readFileSync(modulePath).length === 0) {
    return asset("asset:ui-entry", "missing", "blocked", "the module script does not point at a local entry file");
  }
  if (!buildAccepted) {
    return asset("asset:ui-entry", "missing", "blocked", "build output was not accepted, so the shipped UI entry was not counted");
  }
  const distIndex = path.join(root, "dist", "index.html");
  if (!existsSync(distIndex)) {
    return asset("asset:ui-entry", "missing", "blocked", "dist/index.html is absent. A library bundle is not a playable UI entry.");
  }
  const refs = assetRefs(readFileSync(distIndex, "utf8"));
  const scripts = refs.filter((ref) => ref.kind === "script" && ref.rel);
  if (refs.some((ref) => ref.external) || scripts.length === 0) {
    return asset("asset:ui-entry", "missing", "blocked", "the built document has no local script asset");
  }
  for (const ref of refs.filter((item) => item.rel)) {
    const file = path.resolve(path.join(root, "dist"), ref.rel);
    if (!inside(path.join(root, "dist"), file) || !existsSync(file)) {
      return asset("asset:ui-entry", "missing", "blocked", `built asset ${ref.rel} is absent`);
    }
    if (ref.kind === "script" && looksLikeHtml(readFileSync(file))) {
      return asset("asset:ui-entry", "inspected", "blocked", `built script ${ref.rel} is an HTML document`);
    }
  }
  return asset("asset:ui-entry", "inspected", "pass", "the document entry and its built script are present");
}

function moduleSources(html) {
  const sources = [];
  for (const tag of html.match(/<script\b[^>]*>/gi) ?? []) {
    if (!/\btype\s*=\s*["']module["']/i.test(tag)) continue;
    const src = tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
    sources.push(src ? classifyRef(src[1]) : { inline: true });
  }
  return sources;
}

function assetRefs(html) {
  const refs = [];
  for (const tag of html.match(/<(?:script|link)\b[^>]*>/gi) ?? []) {
    const source = tag.match(/\b(?:src|href)\s*=\s*["']([^"']+)["']/i);
    if (!source) continue;
    const kind = /^<link/i.test(tag) ? "link" : "script";
    if (kind === "link" && !/\brel\s*=\s*["']stylesheet["']/i.test(tag)) continue;
    refs.push({ ...classifyRef(source[1]), kind });
  }
  return refs;
}

function classifyRef(src) {
  const clean = src.split("#")[0]?.split("?")[0] ?? "";
  if (!clean || /^(?:[a-z]+:)?\/\//i.test(clean) || clean.startsWith("data:")) return { external: true };
  const rel = clean.replace(/^\//, "");
  if (!rel || rel.split("/").includes("..")) return { external: true };
  return { rel };
}

function looksLikeHtml(bytes) {
  const start = bytes.subarray(0, 160).toString("utf8").trimStart().toLowerCase();
  return start.startsWith("<!doctype") || start.startsWith("<html") || start.startsWith("<head") || start.startsWith("<body");
}

function inspectHeaders(root) {
  const file = path.join(root, "vercel.json");
  if (!existsSync(file)) return asset("static-header-config", "missing", "blocked", "vercel.json is absent", "config");
  const parsed = readJson(file);
  if (!parsed.ok) return asset("static-header-config", "missing", "blocked", "vercel.json is not readable JSON", "config");
  const declared = [];
  for (const group of Array.isArray(parsed.value?.headers) ? parsed.value.headers : []) {
    for (const header of Array.isArray(group?.headers) ? group.headers : []) {
      if (typeof header?.key === "string" && header.key.trim()) declared.push({ key: header.key, value: String(header.value ?? "") });
    }
  }
  if (declared.length === 0) return asset("static-header-config", "missing", "blocked", "vercel.json declares no response headers", "config");
  return {
    ...asset("static-header-config", "inspected", "pass", "Response headers were read from vercel.json. Public responses are still pending.", "config"),
    declared,
  };
}

function asset(id, evidence, status, detail, group = "asset") {
  return { id, group, evidence, status, blocksAutomated: true, blocksRelease: false, detail };
}

export function evaluateRelease(input) {
  const candidate = describeCandidate(input.git);
  const checks = [
    worktreeCheck(input.git, candidate),
    ...input.commands,
    input.assets.map,
    input.assets.quiz,
    input.assets.ui,
    input.assets.headers,
    manual("manual:local-full-turn", "Local full-turn smoke is pending."),
    manual("manual:public-smoke", "Public asset and header smoke is pending. Compare live headers with vercel.json."),
    {
      id: "historical-fact-check",
      group: "deferred",
      evidence: "deferred",
      status: "not-run",
      blocksAutomated: false,
      blocksRelease: false,
      detail: "Historical checking is deferred and was not run.",
    },
  ];
  const automatedReasons = unmet(checks, false);
  const reasons = unmet(checks, true);
  const automatedReady = automatedReasons.length === 0;
  const releaseReady = reasons.length === 0;
  return {
    tool: TOOL,
    schemaVersion: 1,
    checkedAt: input.checkedAt,
    runtime: process.version,
    sha: candidate.sha,
    candidate,
    representation: candidate.exactCommittedCandidate ? "exact committed candidate" : "not exact committed release evidence",
    automatedVerdict: automatedReady ? "pass" : "blocked",
    automatedReady,
    releaseVerdict: releaseReady ? "pass" : "blocked",
    releaseReady,
    historicalFactCheck: "not-run",
    localFullTurn: "pending",
    publicSmoke: "pending",
    automatedReasons,
    reasons,
    checks,
  };
}

function manual(id, detail) {
  return {
    id,
    group: "manual",
    evidence: "manual",
    status: "pending",
    blocksAutomated: false,
    blocksRelease: true,
    detail,
  };
}

function describeCandidate(git) {
  const sha = typeof git?.sha === "string" && /^[0-9a-f]{40}$/.test(git.sha) ? git.sha : null;
  const dirtyPaths = Array.isArray(git?.dirtyPaths) ? git.dirtyPaths.slice(0, 100) : [];
  const exactCommittedCandidate = Boolean(git?.ok && sha && git.dirty === false);
  return {
    sha,
    branch: git?.branch ?? null,
    worktree: git?.ok && sha ? (git.dirty ? "dirty" : "clean") : "unpinned",
    exactCommittedCandidate,
    dirtyCount: Array.isArray(git?.dirtyPaths) ? git.dirtyPaths.length : 0,
    dirtyPaths,
  };
}

function worktreeCheck(git, candidate) {
  if (candidate.exactCommittedCandidate) {
    return {
      id: "worktree",
      group: "candidate",
      evidence: "inspected",
      status: "pass",
      blocksAutomated: true,
      blocksRelease: false,
      detail: `${candidate.sha} is a clean worktree`,
    };
  }
  return {
    id: "worktree",
    group: "candidate",
    evidence: candidate.sha ? "inspected" : "missing",
    status: "blocked",
    blocksAutomated: true,
    blocksRelease: false,
    detail: candidate.sha
      ? "The worktree has uncommitted changes, so this report is not exact committed release evidence."
      : git?.error || "HEAD could not be pinned to a full SHA.",
  };
}

function unmet(checks, release) {
  return checks
    .filter((check) => check.blocksAutomated || (release && check.blocksRelease))
    .filter((check) => check.status !== "pass")
    .map((check) => check.id);
}

export function checkRelease(options) {
  const root = path.resolve(options.root ?? process.cwd());
  const outDir = path.resolve(options.outDir ?? path.join(tmpdir(), "btt19-release"));
  const outside = evidenceDirectoryError(root, outDir);
  if (outside) throw new Error(outside);
  const git = (options.git ?? defaultGit)(root);
  const pkg = readPackage(root);
  const commands = discoverCommands(pkg, readGateNames(root, pkg));
  const run = options.run ?? defaultRun;
  const commandChecks = commands.map((command) => classifyCommandResult(command, command.missing ? null : run(root, command.argv)));
  const buildAccepted = commandChecks.some((check) => check.id === "build" && check.status === "pass");
  const report = evaluateRelease({
    checkedAt: options.checkedAt ?? new Date().toISOString(),
    git,
    commands: commandChecks,
    assets: inspectAssets(root, buildAccepted),
  });
  mkdirSync(outDir, { recursive: true });
  const evidenceFile = path.join(outDir, evidenceName(report.candidate));
  writeFileSync(evidenceFile, `${JSON.stringify(report, null, 2)}\n`);
  return { exitCode: report.releaseReady ? 0 : 1, report, evidenceFile };
}

function evidenceName(candidate) {
  if (!candidate.sha) return "btt19-release-unpinned.json";
  return `btt19-release-${candidate.sha}${candidate.exactCommittedCandidate ? "" : "-dirty"}.json`;
}

function readPackage(root) {
  const parsed = existsSync(path.join(root, "package.json")) ? readJson(path.join(root, "package.json")) : null;
  return parsed?.ok ? parsed.value : null;
}

function readGateNames(root, pkg) {
  const script = typeof pkg?.scripts?.gates === "string" ? pkg.scripts.gates : "";
  const match = script.match(/(\S*box-gate\S*)/);
  if (!match) return null;
  const file = path.resolve(root, match[1]);
  if (!inside(root, file) || !existsSync(file)) return null;
  return discoverGateNames(readFileSync(file, "utf8"));
}

function readJson(file) {
  try {
    return { ok: true, value: JSON.parse(readFileSync(file, "utf8")) };
  } catch {
    return { ok: false };
  }
}

function sameBytes(left, right) {
  if (!existsSync(left) || !existsSync(right)) return false;
  const a = readFileSync(left);
  const b = readFileSync(right);
  return a.equals(b);
}

function inside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function defaultGit(root) {
  const sha = spawnSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" });
  const branch = spawnSync("git", ["-C", root, "rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" });
  const status = spawnSync("git", ["-C", root, "status", "--porcelain"], { encoding: "utf8" });
  if ((sha.status ?? 1) !== 0 || (status.status ?? 1) !== 0) {
    return { ok: false, sha: null, branch: null, dirty: true, dirtyPaths: [], error: String(sha.stderr || status.stderr || "git could not pin HEAD").trim() };
  }
  const shaText = String(sha.stdout ?? "").trim();
  const dirtyPaths = String(status.stdout ?? "")
    .split("\n")
    .map((line) => line.replace(/\r$/, ""))
    .filter((line) => line.length > 0)
    .map((line) => line.slice(3).trim());
  const pinned = /^[0-9a-f]{40}$/.test(shaText);
  return {
    ok: pinned,
    sha: pinned ? shaText : null,
    branch: String(branch.stdout ?? "").trim() || null,
    dirty: dirtyPaths.length > 0,
    dirtyPaths,
    error: pinned ? "" : "HEAD is not a full SHA",
  };
}

function defaultRun(root, argv) {
  const result = spawnSync(argv[0], argv.slice(1), {
    cwd: root,
    encoding: "utf8",
    timeout: 300000,
    maxBuffer: 8 * 1024 * 1024,
    env: process.env,
  });
  return {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error ? result.error.message : "",
  };
}

export function printSummary(report, evidenceFile) {
  console.log(
    [
      TOOL,
      `automated: ${report.automatedVerdict}`,
      `release: ${report.releaseVerdict}`,
      `sha: ${report.sha ?? "unpinned"}`,
      `worktree: ${report.candidate.worktree}`,
      `exactCommittedCandidate: ${report.candidate.exactCommittedCandidate}`,
      `representation: ${report.representation}`,
      `historicalFactCheck: ${report.historicalFactCheck}`,
      `localFullTurn: ${report.localFullTurn}`,
      `publicSmoke: ${report.publicSmoke}`,
      `automatedBlocking: ${report.automatedReasons.join(", ") || "none"}`,
      `releaseBlocking: ${report.reasons.join(", ") || "none"}`,
      `evidence: ${evidenceFile}`,
    ].join("\n"),
  );
  for (const check of report.checks) if (check.outputTail) console.error(`\n${check.id}\n${check.outputTail}`);
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invoked) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      console.log(HELP);
      process.exit(0);
    }
    const result = checkRelease({ root: args.root, outDir: args.out ?? path.join(tmpdir(), "btt19-release") });
    printSummary(result.report, result.evidenceFile);
    process.exit(result.exitCode);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "release check failed");
    process.exit(2);
  }
}
