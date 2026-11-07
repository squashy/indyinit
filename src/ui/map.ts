import type { County, CountyId, GameState, PlayerId } from "../types.ts";

export interface MapView {
  show(state: GameState): void;
  selected(): CountyId | null;
  source(): CountyId | null;
  target(): CountyId | null;
}

interface Marks {
  selected: CountyId | null;
  source: CountyId | null;
  target: CountyId | null;
  scrolledQuiz: CountyId | null;
}

export function bindMap(doc: Document): MapView {
  const svg = doc.getElementById("map");
  const marks: Marks = { selected: null, source: null, target: null, scrolledQuiz: null };
  let state: GameState | null = null;

  const choose = (id: CountyId) => {
    if (!state) return;
    const holding = state.holdings.find((item) => item.countyId === id);
    const county = state.config.map.counties.find((item) => item.id === id);
    if (!holding || !county) return;
    marks.selected = id;
    if (state.phase.kind === "fortify" && marks.source && id !== marks.source) {
      if (holding.owner !== state.activePlayer) {
        marks.target = null;
        setStatus(doc, "Move armies only into a county you hold.");
      } else if (!canSource(state, marks.source) || !ownedPath(state, marks.source, id)) {
        marks.target = null;
        setStatus(doc, "Those counties are not connected through territory you hold, or the county you leave cannot spare an army.");
      } else {
        marks.target = id;
        setStatus(doc, "");
      }
    } else if (state.phase.kind !== "fortify" && marks.source && holding.owner !== state.activePlayer && adjacent(state, marks.source, id)) {
      marks.target = id;
      setStatus(doc, "");
    } else if (holding.owner === state.activePlayer && holding.armies >= 2) {
      marks.source = id;
      marks.target = null;
      setStatus(doc, "");
    } else {
      marks.target = null;
      if (state.phase.kind === "fortify" && !marks.source) {
        setStatus(doc, "Pick a county with at least 2 armies to move from.");
      }
    }
    paint(doc, state, marks);
    showCountyInfo(doc, county, marks, state);
    focusCounty(doc, id);
  };

  const frame = svg?.closest(".map-column") ?? svg;
  frame?.addEventListener("click", (event) => {
    if (!(event instanceof MouseEvent) || !state) return;
    const under = Number.isFinite(event.clientX) ? doc.elementFromPoint(event.clientX, event.clientY) : null;
    const node = countyNode(under) ?? countyNode(event.target);
    const id = node instanceof HTMLElement || node instanceof SVGElement ? node.dataset.countyId : undefined;
    if (!id) return;
    const known = state.config.map.counties.some((county) => county.id === id);
    if (!known) return;
    choose(id as CountyId);
  });

  svg?.addEventListener("keydown", (event) => {
    if (!(event instanceof KeyboardEvent) || !state) return;
    const active = doc.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement) return;
    if (!(svg instanceof Element) || (active !== svg && !(active instanceof Element && svg.contains(active)))) return;
    const counties = state.config.map.counties;
    const current = focusedCounty(doc, counties) ?? marks.selected ?? quizCounty(state) ?? counties[0]?.id ?? null;
    if (!current) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(current);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      const first = counties[0]?.id;
      if (first) focusCounty(doc, first);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      const last = counties[counties.length - 1]?.id;
      if (last) focusCounty(doc, last);
      return;
    }
    const direction = arrowDirection(event.key);
    if (!direction) return;
    event.preventDefault();
    focusCounty(doc, neighbor(counties, current, direction));
  });

  return {
    show(next) {
      state = next;
      if (marks.source && !canSource(next, marks.source)) marks.source = null;
      if (marks.target && !legalTarget(next, marks.source, marks.target)) marks.target = null;
      paint(doc, next, marks);
      const quiz = quizCounty(next);
      if (quiz && quiz !== marks.scrolledQuiz) {
        const node = doc.querySelector(`#map [data-county-id="${cssEscape(quiz)}"]`);
        if (node instanceof Element) node.scrollIntoView({ block: "nearest", inline: "nearest" });
        marks.scrolledQuiz = quiz;
      }
    },
    selected: () => marks.selected,
    source: () => marks.source,
    target: () => marks.target,
  };
}

function paint(doc: Document, state: GameState, marks: Marks): void {
  const nodes = Array.from(doc.querySelectorAll("#map [data-county-id]"));
  const quiz = quizCounty(state);
  let missing = 0;
  for (const holding of state.holdings) {
    const node = nodes.find((item) => countyIdOf(item) === holding.countyId);
    if (!(node instanceof Element)) {
      missing += 1;
      continue;
    }
    const county = state.config.map.counties.find((item) => item.id === holding.countyId);
    const player = state.config.players.find((item) => item.id === holding.owner);
    node.setAttribute("data-owner", String(holding.owner));
    const label = node.querySelector(".county-label");
    const badge = node.querySelector(".army-badge-count");
    if (label) label.textContent = county?.name ?? "";
    if (badge) badge.textContent = String(holding.armies);
    const seat = player ? player.label : `Seat ${holding.owner + 1}`;
    node.setAttribute("aria-label", `${county?.name ?? "County"}, ${seat}, ${holding.armies} armies`);
    node.classList.toggle("is-selected", holding.countyId === marks.selected);
    node.classList.toggle("is-source", holding.countyId === marks.source);
    node.classList.toggle("is-target", holding.countyId === marks.target);
    node.classList.toggle("is-quiz-county", holding.countyId === quiz);
  }
  paintPlayers(doc, state);
  if (missing > 0) setStatus(doc, "Some counties are missing from the map.");
}

function paintPlayers(doc: Document, state: GameState): void {
  const rows = Array.from(doc.querySelectorAll("#player-stats [data-owner]"));
  for (const row of rows) {
    if (!(row instanceof Element)) continue;
    const owner = Number(row.getAttribute("data-owner"));
    const text = row.querySelector("span:not(.player-swatch)");
    if (!text || !isPlayerId(owner)) continue;
    const player = state.config.players.find((item) => item.id === owner);
    if (!player) {
      text.textContent = "Not in this game";
      continue;
    }
    const count = state.holdings.reduce((total, holding) => total + (holding.owner === owner ? 1 : 0), 0);
    const pattern = PATTERNS[owner] ?? "pattern";
    text.textContent = `${player.label} · seat ${owner + 1} · ${pattern} · ${count} ${count === 1 ? "county" : "counties"}`;
  }
}

const PATTERNS = ["checker", "triangles", "dots", "diagonal", "crosshatch", "bars"] as const;

function showCountyInfo(doc: Document, county: County, marks?: Marks, state?: GameState | null): void {
  const section = doc.getElementById("county-info");
  if (!section) return;
  let slot = section.querySelector(".county-facts");
  if (!(slot instanceof HTMLElement)) {
    slot = doc.createElement("div");
    slot.className = "county-facts";
    section.appendChild(slot);
  }
  slot.replaceChildren();
  const name = doc.createElement("p");
  name.textContent = county.name;
  slot.appendChild(name);
  const holding = state?.holdings.find((item) => item.countyId === county.id);
  if (holding && state) {
    const player = state.config.players.find((item) => item.id === holding.owner);
    const seat = player?.label ?? `Seat ${holding.owner + 1}`;
    const summary = doc.createElement("p");
    summary.textContent = `${seat}, ${holding.armies} armies.`;
    slot.appendChild(summary);
  }
  const roles: string[] = [];
  if (marks?.selected === county.id) roles.push("Selected");
  if (marks?.source === county.id) roles.push("Armies leave from here");
  if (marks?.target === county.id) roles.push("Aiming here");
  if (roles.length > 0) {
    const role = doc.createElement("p");
    role.textContent = roles.join(". ") + ".";
    slot.appendChild(role);
  }
  if (county.facts.length === 0) {
    const empty = doc.createElement("p");
    empty.textContent = "No places were supplied for this county.";
    slot.appendChild(empty);
    return;
  }
  for (const fact of county.facts) {
    const line = doc.createElement("p");
    line.textContent = `${fact.label}: ${fact.text}`;
    slot.appendChild(line);
  }
}

function focusCounty(doc: Document, id: CountyId): void {
  const nodes = Array.from(doc.querySelectorAll("#map [data-county-id]"));
  let target: Element | null = null;
  for (const node of nodes) {
    if (!(node instanceof HTMLElement || node instanceof SVGElement)) continue;
    const on = node.dataset.countyId === id;
    node.tabIndex = on ? 0 : -1;
    if (on) target = node;
  }
  if (target instanceof HTMLElement || target instanceof SVGElement) target.focus();
}

function focusedCounty(doc: Document, counties: readonly County[]): CountyId | null {
  const active = doc.activeElement;
  if (!(active instanceof Element)) return null;
  const node = active.closest("[data-county-id]");
  const id = countyIdOf(node);
  if (!id || !counties.some((county) => county.id === id)) return null;
  return id as CountyId;
}

function neighbor(counties: readonly County[], id: CountyId, direction: Direction): CountyId {
  const from = counties.find((county) => county.id === id);
  if (!from) return id;
  const [x, y] = from.centroid;
  let best: County | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const county of counties) {
    if (county.id === id) continue;
    const dx = county.centroid[0] - x;
    const dy = county.centroid[1] - y;
    const forward = direction === "e" ? dx : direction === "w" ? -dx : direction === "s" ? dy : -dy;
    const sideways = direction === "e" || direction === "w" ? Math.abs(dy) : Math.abs(dx);
    if (forward <= 0 || sideways > forward * 1.25) continue;
    const score = Math.hypot(dx, dy);
    if (score < bestScore) {
      best = county;
      bestScore = score;
    }
  }
  return best?.id ?? id;
}

function arrowDirection(key: string): Direction | null {
  if (key === "ArrowRight") return "e";
  if (key === "ArrowLeft") return "w";
  if (key === "ArrowDown") return "s";
  if (key === "ArrowUp") return "n";
  return null;
}

function countyIdOf(node: Element | null): string | undefined {
  if (!(node instanceof HTMLElement || node instanceof SVGElement)) return undefined;
  return node.dataset.countyId;
}

function countyNode(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) return null;
  const node = target.closest("[data-county-id]");
  return node instanceof Element ? node : null;
}

function quizCounty(state: GameState): CountyId | null {
  return state.phase.kind === "quiz" ? state.phase.pending.countyId : null;
}

function canSource(state: GameState, id: CountyId): boolean {
  const holding = state.holdings.find((item) => item.countyId === id);
  return Boolean(holding && holding.owner === state.activePlayer && holding.armies >= 2);
}

function ownerOf(state: GameState, id: CountyId): PlayerId | null {
  return state.holdings.find((item) => item.countyId === id)?.owner ?? null;
}

function legalTarget(state: GameState, source: CountyId | null, target: CountyId | null): boolean {
  if (!source || !target || source === target) return false;
  if (state.phase.kind === "fortify") return canSource(state, source) && ownedPath(state, source, target);
  return adjacent(state, source, target) && ownerOf(state, target) !== state.activePlayer;
}

function ownedPath(state: GameState, from: CountyId, to: CountyId): boolean {
  const owned = new Set(state.holdings.filter((holding) => holding.owner === state.activePlayer).map((holding) => holding.countyId));
  if (!owned.has(from) || !owned.has(to)) return false;
  const seen = new Set<CountyId>([from]);
  const queue = [from];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    for (const next of state.config.map.counties.find((county) => county.id === current)?.neighbors ?? []) {
      if (!owned.has(next) || seen.has(next)) continue;
      if (next === to) return true;
      seen.add(next);
      queue.push(next);
    }
  }
  return false;
}

function adjacent(state: GameState, from: CountyId, to: CountyId): boolean {
  const left = state.config.map.counties.find((county) => county.id === from)?.neighbors ?? [];
  const right = state.config.map.counties.find((county) => county.id === to)?.neighbors ?? [];
  return left.includes(to) && right.includes(from);
}

function cssEscape(value: string): string {
  return value.replace(/[^0-9A-Za-z_-]/g, "");
}

function isPlayerId(value: number): value is PlayerId {
  return value === 0 || value === 1 || value === 2 || value === 3 || value === 4 || value === 5;
}

function setStatus(doc: Document, message: string): void {
  const status = doc.getElementById("error-status");
  if (status) status.textContent = message;
}

type Direction = "n" | "s" | "e" | "w";
