import { readFileSync, readdirSync, statSync } from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { parseMapPack, parseRegionFile } from "../factory/parse-map.ts";
import { checkMap, MINIMUM_TERRITORIES, withAsymmetricEdge, withSelfLoop, type MapIssue } from "./map-check.ts";

export function runMapGate(root = process.cwd()): { exitCode: number; output: string } {
  const folders = readdirSync(path.join(root, "regions"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const blocks: string[] = [];
  let failed = false;
  let injected = false;

  for (const folder of folders) {
    const manifestPath = path.join(root, "regions", folder, "region.json");
    const mapPath = path.join(root, "data", "regions", folder, "map.json");
    let manifest;
    let map;
    try {
      manifest = parseRegionFile(JSON.parse(readFileSync(manifestPath, "utf8")));
      map = parseMapPack(JSON.parse(readFileSync(mapPath, "utf8")));
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unreadable map pack";
      blocks.push(section(folder, [{ severity: "error", code: "shape", detail }]));
      failed = true;
      continue;
    }
    if (manifest.abbr !== folder) {
      blocks.push(section(folder, [{ severity: "error", code: "shape", detail: "folder name and abbr differ" }]));
      failed = true;
      continue;
    }
    if (!injected) {
      const limits = { byteLength: 0, minimumTerritories: 1 };
      const selfLoop = caught(checkMap(withSelfLoop(map), manifest, limits), "self-loop");
      const asymmetric = caught(checkMap(withAsymmetricEdge(map), manifest, limits), "asymmetric");
      blocks.push(section("injected self-loop", selfLoop));
      blocks.push(section("injected asymmetric edge", asymmetric));
      if (selfLoop.some((issue) => issue.detail === "injection was not caught")) failed = true;
      if (asymmetric.some((issue) => issue.detail === "injection was not caught")) failed = true;
      injected = true;
    }
    const byteLength = statSync(mapPath).size;
    const issues = checkMap(map, manifest, { byteLength, minimumTerritories: MINIMUM_TERRITORIES });
    const summary = [
      `${map.counties.length} counties, ${map.regions.length} regions, ${byteLength} bytes`,
      map.regions.map((region) => `${region.name} (${region.counties.length})`).join("; "),
    ].join("\n");
    blocks.push(section(folder, issues, summary));
    if (issues.some((issue) => issue.severity === "error")) failed = true;
  }

  if (!injected) {
    blocks.push(section("injected self-loop", [{ severity: "error", code: "shape", detail: "no map to inject into" }]));
    failed = true;
  }
  return { exitCode: failed ? 1 : 0, output: blocks.join("\n\n") };
}

function caught(issues: readonly MapIssue[], code: MapIssue["code"]): MapIssue[] {
  if (issues.some((issue) => issue.severity === "error" && issue.code === code)) return [...issues];
  return [...issues, { severity: "error", code, detail: "injection was not caught" }];
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(path.resolve(entry)).href) {
  const result = runMapGate();
  console.log(result.output);
  process.exit(result.exitCode);
}

function section(title: string, issues: readonly MapIssue[], summary?: string): string {
  const verdict = issues.some((issue) => issue.severity === "error") ? "FAIL" : "PASS";
  const lines = [`${title}: ${verdict}`];
  for (const issue of issues) lines.push(`${issue.severity === "warning" ? "WARN" : "FAIL"} ${issue.code} ${issue.detail}`);
  if (summary && verdict === "PASS") lines.push(summary);
  return lines.join("\n");
}
