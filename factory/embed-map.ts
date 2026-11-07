import type { MapPack } from "../src/types.ts";

// index.html carries the map inline so the board paints before any script runs.
// embedMap rewrites every map-derived number there from map.json, so the page and the
// pack cannot drift: county paths, label and army-badge positions, the state outline,
// the page view box, the backdrop and the neighbor place names.

const LABEL_ABOVE = 8;
const BADGE_BELOW = 8;
const PAD_LEFT = 92;
const PAD_RIGHT = 68;
const PAD_TOP = 34;
const PAD_BOTTOM = 60;

export function pageViewBox(map: MapPack): [number, number, number, number] {
  const [x, y, width, height] = map.viewBox;
  return [x - PAD_LEFT, y - PAD_TOP, width + PAD_LEFT + PAD_RIGHT, height + PAD_TOP + PAD_BOTTOM];
}

export function embedMap(html: string, map: MapPack): string {
  const [vx, vy, vw, vh] = pageViewBox(map);
  const height = map.viewBox[3];
  const width = map.viewBox[2];
  let out = replaceOnce(html, /(<svg id="map" viewBox=")[^"]*(")/, `$1${vx} ${vy} ${vw} ${vh}$2`, "svg view box");
  out = replaceOnce(
    out,
    /(<rect class="map-ground") x="[^"]*" y="[^"]*" width="[^"]*" height="[^"]*"/,
    `$1 x="${vx}" y="${vy}" width="${vw}" height="${vh}"`,
    "map ground",
  );
  const middle = Math.round(height * 0.414);
  const places: Record<string, [number, number]> = {
    "Lake Michigan": [24, -8],
    Illinois: [-84, middle],
    Ohio: [width + 4, middle],
    Kentucky: [210, num(height + 40)],
    "Ohio River": [24, num(height + 16)],
  };
  for (const [name, [x, y]] of Object.entries(places)) {
    out = replaceOnce(
      out,
      new RegExp(`(<text class="map-place") x="[^"]*" y="[^"]*"( font-size="\\d+">${name}</text>)`),
      `$1 x="${x}" y="${y}"$2`,
      `place ${name}`,
    );
  }
  for (const county of map.counties) {
    const [cx, cy] = county.centroid;
    out = replaceOnce(out, new RegExp(`(id="county-shape-${county.id}" d=")[^"]*(")`), `$1${county.path}$2`, `${county.name} path`);
    out = replaceOnce(
      out,
      new RegExp(`(data-county-id="${county.id}"[^]*?<text class="county-label") x="[^"]*" y="[^"]*"`),
      `$1 x="${num(cx)}" y="${(cy - LABEL_ABOVE).toFixed(1)}"`,
      `${county.name} label`,
    );
    out = replaceOnce(
      out,
      new RegExp(`(data-county-id="${county.id}"[^]*?<g class="army-badge" transform="translate\\()[^)]*(\\))`),
      `$1${num(cx)} ${(cy + BADGE_BELOW).toFixed(1)}$2`,
      `${county.name} badge`,
    );
  }
  out = replaceOnce(out, /(<path class="state-outline" d=")[^"]*(")/, `$1${map.outline}$2`, "state outline");
  return out;
}

function replaceOnce(text: string, pattern: RegExp, replacement: string, label: string): string {
  const flags = pattern.flags.replace("g", "");
  if ((text.match(new RegExp(pattern.source, `${flags}g`)) ?? []).length < 1) {
    throw new Error(`index.html has no ${label} to update`);
  }
  return text.replace(pattern, replacement);
}

function num(value: number): number {
  return Math.round(value * 10) / 10;
}
