import { chooseAction, DEFAULT_COMPUTER_CONFIG } from "../ai/ai.ts";
import type { Action, CountyId, GameEvent, GameState, Player, PlayerId, Rng } from "../types.ts";
import type { MapView } from "./map.ts";
import type { Act } from "./quiz-dialog.ts";

export interface TurnChrome {
  show(state: GameState): void;
  hurry(): void;
}

export function bindTurn(doc: Document, act: Act, map: MapView, stateOf: () => GameState | null, random: Rng, drive: (run: () => void) => void): TurnChrome {
  const phase = doc.getElementById("phase");
  const reinforcement = doc.getElementById("reinforcement-count");
  const endAttacks = doc.getElementById("end-attacks");
  const endTurn = doc.getElementById("end-turn");
  const handoff = doc.getElementById("handoff-dialog");
  const winner = doc.getElementById("winner-dialog");
  const ready = doc.querySelector(".handoff-ready");
  const skip = doc.getElementById("skip-quiz");
  const log = doc.querySelector("#trip-log ol");
  const frame = doc.querySelector(".map-column");
  const fortifyButton = ensureFortifyButton(doc);
  let logged = 0;
  let ticket = 0;
  let rushing = false;
  let pendingKey = "";
  let seenPhase = "";

  const chrome: TurnChrome = {
    show(state) {
      paintStatus(doc, phase, reinforcement, state);
      paintLog(doc, log, state, () => logged, (next) => { logged = next; });
      paintHandoff(handoff, state);
      paintWinner(winner, state);
      const attacking = state.phase.kind === "attack";
      const moving = state.phase.kind === "fortify";
      if (endAttacks instanceof HTMLButtonElement) {
        endAttacks.disabled = !attacking;
        endAttacks.hidden = !attacking;
      }
      if (endTurn instanceof HTMLButtonElement) {
        endTurn.disabled = !moving;
        endTurn.hidden = !moving;
        endTurn.textContent = "Skip fortify";
      }
      if (fortifyButton) {
        fortifyButton.hidden = !moving;
        fortifyButton.disabled = !moving;
      }
      syncPhaseFocus(state);
      considerComputer(state);
    },
    hurry() {
      ticket += 1;
      rushing = true;
      for (let step = 0; step < DEFAULT_COMPUTER_CONFIG.maxSteps; step += 1) {
        const state = stateOf();
        if (!state || !computerShouldAct(state)) break;
        const mark = markOf(state);
        stepComputer(state);
        const after = stateOf();
        if (!after || markOf(after) === mark) break;
      }
      rushing = false;
    },
  };

  endAttacks?.addEventListener("click", () => {
    if (!stateOf()) return;
    act({ kind: "endAttacks" });
  });

  endTurn?.addEventListener("click", () => {
    if (!stateOf()) return;
    act({ kind: "skipFortify" });
  });

  fortifyButton?.addEventListener("click", () => {
    const state = stateOf();
    if (!state || state.phase.kind !== "fortify") return;
    const from = map.source();
    const to = map.target();
    if (!from || !to) {
      setStatus(doc, "Pick a county to move from, then a connected county you hold.");
      return;
    }
    act({ kind: "fortify", from, to, count: 1 });
  });

  ready?.addEventListener("click", () => {
    const state = stateOf();
    if (!state) return;
    if (computerShouldAct(state)) {
      chrome.hurry();
      return;
    }
    act({ kind: "acknowledgeHandoff", turnSequence: state.turnSequence });
  });

  handoff?.addEventListener("keydown", (event) => {
    if (!(event instanceof KeyboardEvent) || !(handoff instanceof HTMLElement) || handoff.hidden) return;
    guardDialogKey(doc, handoff, event, true);
  });

  doc.addEventListener("keydown", (event) => {
    if (!(event instanceof KeyboardEvent) || event.key !== "Escape") return;
    const state = stateOf();
    if (!state) return;
    if (state.phase.kind === "quiz" || state.phase.kind === "occupy" || state.phase.kind === "handoff") {
      event.preventDefault();
    }
  });

  skip?.addEventListener("click", () => {
    const state = stateOf();
    if (state && computerShouldAct(state)) chrome.hurry();
  });

  frame?.addEventListener("click", (event) => {
    const state = stateOf();
    if (!state || state.phase.kind !== "place" || computerShouldAct(state) || !(event instanceof MouseEvent)) return;
    const id = countyFromPoint(doc, event.clientX, event.clientY);
    if (!id) return;
    act({ kind: "place", countyId: id, count: 1 });
  });

  return chrome;

  function syncPhaseFocus(state: GameState): void {
    const key = phaseKey(state);
    const changed = key !== seenPhase;
    seenPhase = key;
    if (!changed) return;
    const dialog = phaseDialog(doc, state);
    if (!dialog) return;
    const active = doc.activeElement;
    if (active instanceof Node && dialog.contains(active)) return;
    const control = primaryControl(doc, state);
    if (control instanceof HTMLElement || control instanceof SVGElement) control.focus();
  }

  function considerComputer(state: GameState): void {
    if (rushing || !computerShouldAct(state)) return;
    const key = markOf(state);
    if (key === pendingKey) return;
    pendingKey = key;
    const current = ticket;
    window.setTimeout(() => {
      if (current !== ticket || rushing) return;
      const latest = stateOf();
      if (!latest || markOf(latest) !== key) return;
      stepComputer(latest);
    }, motionDelay());
  }

  function stepComputer(state: GameState): void {
    drive(() => {
      const action = computerAction(state, random);
      if (action) act(action);
    });
  }
}

function computerAction(state: GameState, random: Rng): Action | null {
  if (state.phase.kind === "handoff") return { kind: "acknowledgeHandoff", turnSequence: state.turnSequence };
  return chooseAction(state, random);
}

function computerShouldAct(state: GameState): boolean {
  if (state.phase.kind === "over") return false;
  if (state.phase.kind === "handoff") return player(state, state.phase.nextPlayer)?.kind === "computer";
  return player(state, state.activePlayer)?.kind === "computer";
}

const PHASE_STEPS = [
  { kind: "quiz", label: "Quiz", optional: false },
  { kind: "place", label: "Place", optional: false },
  { kind: "attack", label: "Attack", optional: false },
  { kind: "occupy", label: "Move-in", optional: true },
  { kind: "fortify", label: "Fortify", optional: false },
  { kind: "handoff", label: "Handoff", optional: false },
] as const;

function paintStatus(doc: Document, phaseNode: HTMLElement | null, reinforcement: HTMLElement | null, state: GameState): void {
  const phase = state.phase;
  if (phaseNode) {
    phaseNode.textContent = phaseLabel(state);
    phaseNode.dataset.step = phase.kind;
    paintTrack(doc, phaseNode, state);
    paintAction(doc, phaseNode, state);
  }
  if (!reinforcement) return;
  const count = ownedCount(state);
  reinforcement.dataset.count = String(count);
  if (phase.kind === "quiz") {
    reinforcement.dataset.base = String(phase.baseIncome);
    reinforcement.dataset.regions = String(phase.regionIncome);
    reinforcement.dataset.quiz = "";
    delete reinforcement.dataset.remaining;
    reinforcement.textContent = `Counties ${count}. Base reinforcement ${phase.baseIncome}. Regions ${phase.regionIncome}. Question not scored.`;
    return;
  }
  if (phase.kind === "place") {
    reinforcement.dataset.base = String(phase.income.base);
    reinforcement.dataset.regions = String(phase.income.regions);
    reinforcement.dataset.quiz = String(phase.income.quiz);
    reinforcement.dataset.remaining = String(phase.remaining);
    reinforcement.textContent = `Counties ${count}. Base reinforcement ${phase.income.base}. Regions ${phase.income.regions}. Question ${phase.income.quiz}. Armies to place ${phase.remaining}.`;
    return;
  }
  delete reinforcement.dataset.base;
  delete reinforcement.dataset.regions;
  delete reinforcement.dataset.quiz;
  reinforcement.dataset.remaining = "0";
  reinforcement.textContent = `Counties ${count}. Armies to place 0.`;
}

function paintTrack(doc: Document, phaseNode: HTMLElement, state: GameState): void {
  const parent = phaseNode.parentElement;
  if (!parent) return;
  let track = parent.querySelector(".phase-track");
  if (!(track instanceof HTMLOListElement)) {
    const created = doc.createElement("ol");
    created.className = "phase-track";
    parent.appendChild(created);
    track = created;
  }
  const byKind = new Map<string, HTMLElement>();
  for (const item of Array.from(track.querySelectorAll("li"))) {
    if (item instanceof HTMLElement && item.dataset.step) byKind.set(item.dataset.step, item);
  }
  for (const step of PHASE_STEPS) {
    let item = byKind.get(step.kind);
    if (!item) {
      item = doc.createElement("li");
      item.dataset.step = step.kind;
      track.appendChild(item);
    }
    item.textContent = step.label;
    const on = state.phase.kind === step.kind;
    if (on) item.setAttribute("aria-current", "step");
    else item.removeAttribute("aria-current");
    item.hidden = step.optional && !on;
    track.appendChild(item);
  }
}

function paintAction(doc: Document, phaseNode: HTMLElement, state: GameState): void {
  const parent = phaseNode.parentElement?.parentElement ?? phaseNode.parentElement;
  if (!parent) return;
  let action = parent.querySelector("#phase-action") ?? doc.getElementById("phase-action");
  if (!(action instanceof HTMLElement)) {
    action = doc.createElement("p");
    action.id = "phase-action";
    action.className = "phase-action";
    parent.appendChild(action);
  }
  action.textContent = actionText(state);
}

function actionText(state: GameState): string {
  switch (state.phase.kind) {
    case "quiz":
      return "Answer the question, or skip it.";
    case "place":
      return "Place armies on counties you hold.";
    case "attack":
      return "Attack a bordering county, or stop attacking.";
    case "occupy":
      return "Move armies into the county you took.";
    case "fortify":
      return "Move armies once, or skip fortify.";
    case "handoff":
      return "Pass the screen, then press Ready.";
    case "over":
      return "The game is over.";
  }
}

function phaseLabel(state: GameState): string {
  const name = player(state, state.activePlayer)?.label ?? "Player";
  switch (state.phase.kind) {
    case "quiz":
      return `This step: ${name} answers a question`;
    case "place":
      return `This step: ${name} places armies`;
    case "attack":
      return `This step: ${name} may attack`;
    case "occupy":
      return `This step: ${name} moves armies in`;
    case "fortify":
      return `This step: ${name} may move armies once`;
    case "handoff":
      return `This step: ${name} passes the screen`;
    case "over":
      return `This step: ${name} finished the game`;
  }
}

function paintHandoff(dialog: HTMLElement | null, state: GameState): void {
  if (!dialog) return;
  if (state.phase.kind !== "handoff") {
    dialog.hidden = true;
    return;
  }
  const next = player(state, state.phase.nextPlayer);
  const paragraph = dialog.querySelector("p");
  if (paragraph) {
    paragraph.textContent = next?.kind === "computer"
      ? `${next.label} is playing. Ready skips the wait.`
      : `Hand the screen to ${next?.label ?? "the next player"}.`;
  }
  dialog.hidden = false;
}

function paintWinner(dialog: HTMLElement | null, state: GameState): void {
  if (!dialog) return;
  if (state.phase.kind !== "over") {
    dialog.hidden = true;
    return;
  }
  const paragraph = dialog.querySelector("p");
  const name = player(state, state.phase.winner)?.label ?? "Player";
  const mode = state.phase.mode === "quick60" ? "Quick" : "Total";
  if (paragraph) paragraph.textContent = `${name} wins ${mode}.`;
  dialog.hidden = false;
}

function paintLog(doc: Document, log: Element | null, state: GameState, read: () => number, write: (next: number) => void): void {
  if (!(log instanceof HTMLOListElement)) return;
  let cursor = read();
  if (state.events.length < cursor) {
    log.replaceChildren();
    const fresh = doc.createElement("li");
    fresh.textContent = "Nothing has happened yet.";
    log.appendChild(fresh);
    cursor = 0;
  }
  while (cursor < state.events.length) {
    const event = state.events[cursor];
    cursor += 1;
    if (!event) continue;
    const line = eventLine(state, event);
    if (!line) continue;
    const placeholder = log.querySelector("li");
    if (placeholder?.textContent === "Nothing has happened yet.") placeholder.remove();
    const item = doc.createElement("li");
    item.textContent = line;
    log.appendChild(item);
  }
  write(cursor);
}

function eventLine(state: GameState, event: GameEvent): string | null {
  const name = player(state, event.player)?.label ?? "Player";
  if (event.kind === "quizResolved") {
    if (event.result === "correct") return `${name} answered right and got 2 armies.`;
    if (event.result === "noQuestion") return `${name} had no question and got 0 armies.`;
    return `${name} got 0 armies.`;
  }
  if (event.kind === "battle") {
    return `${nameOf(state, event.from)} attacked ${nameOf(state, event.to)}. Attack dice ${event.attackRolls.join(", ")}. Defend dice ${event.defenseRolls.join(", ")}. Attacker lost ${event.attackLosses}. Defender lost ${event.defenseLosses}.`;
  }
  if (event.kind === "capture") return `${name} moved ${event.moved} armies into ${nameOf(state, event.countyId)}.`;
  if (event.kind === "winner") return `${name} wins.`;
  return null;
}

function player(state: GameState, id: PlayerId): Player | undefined {
  return state.config.players.find((item) => item.id === id);
}

function nameOf(state: GameState, countyId: CountyId): string {
  return state.config.map.counties.find((county) => county.id === countyId)?.name ?? "County";
}

function countyFromPoint(doc: Document, x: number, y: number): CountyId | null {
  const under = doc.elementFromPoint(x, y);
  if (!(under instanceof Element)) return null;
  const node = under.closest("[data-county-id]");
  if (!(node instanceof HTMLElement || node instanceof SVGElement)) return null;
  const id = node.dataset.countyId;
  return id ? id as CountyId : null;
}

function markOf(state: GameState): string {
  const phase = state.phase;
  const extra = phase.kind === "place" ? String(phase.remaining) : phase.kind === "quiz" ? phase.pending.questionId : "";
  return `${state.turnSequence}:${phase.kind}:${extra}:${state.events.length}`;
}

function setStatus(doc: Document, message: string): void {
  const status = doc.getElementById("error-status");
  if (status) status.textContent = message;
}

function phaseKey(state: GameState): string {
  const phase = state.phase;
  if (phase.kind === "quiz") return `quiz:${state.turnSequence}:${phase.pending.questionId}`;
  if (phase.kind === "occupy") return `occupy:${phase.from}:${phase.to}:${phase.minimum}`;
  if (phase.kind === "handoff") return `handoff:${state.turnSequence}:${phase.nextPlayer}`;
  return `${state.turnSequence}:${phase.kind}`;
}

function phaseDialog(doc: Document, state: GameState): HTMLElement | null {
  const id = state.phase.kind === "quiz" ? "quiz-dialog" : state.phase.kind === "occupy" ? "occupy-dialog" : state.phase.kind === "handoff" ? "handoff-dialog" : "";
  if (!id) return null;
  const dialog = doc.getElementById(id);
  return dialog instanceof HTMLElement && !dialog.hidden ? dialog : null;
}

function primaryControl(doc: Document, state: GameState): HTMLElement | SVGElement | null {
  switch (state.phase.kind) {
    case "quiz": {
      const choice = doc.querySelector("#quiz-choices button");
      if (choice instanceof HTMLButtonElement && !choice.disabled && isShown(choice)) return choice;
      const skip = doc.getElementById("skip-quiz");
      return skip instanceof HTMLButtonElement ? skip : null;
    }
    case "place": {
      const map = doc.getElementById("map");
      if (map instanceof HTMLElement || map instanceof SVGElement) return map;
      return null;
    }
    case "attack": {
      const button = doc.getElementById("end-attacks");
      return button instanceof HTMLButtonElement ? button : null;
    }
    case "occupy": {
      const input = doc.querySelector("#occupy-dialog input[name='occupy-count']");
      return input instanceof HTMLInputElement ? input : null;
    }
    case "fortify": {
      const button = doc.getElementById("end-turn");
      return button instanceof HTMLButtonElement ? button : null;
    }
    case "handoff": {
      const ready = doc.querySelector("#handoff-dialog .handoff-ready");
      return ready instanceof HTMLButtonElement ? ready : null;
    }
    default:
      return null;
  }
}

function guardDialogKey(doc: Document, dialog: HTMLElement, event: KeyboardEvent, mandatory: boolean): void {
  if (event.key === "Escape") {
    if (mandatory) event.preventDefault();
    return;
  }
  if (event.key !== "Tab") return;
  const items = focusables(dialog);
  const first = items[0];
  const last = items[items.length - 1];
  if (!first || !last) return;
  const active = doc.activeElement;
  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

function focusables(root: HTMLElement): HTMLElement[] {
  const nodes = Array.from(root.querySelectorAll("button, input, select, textarea, [tabindex]"));
  const items: HTMLElement[] = [];
  for (const node of nodes) {
    if (!(node instanceof HTMLElement) || !isShown(node)) continue;
    if ((node instanceof HTMLButtonElement || node instanceof HTMLInputElement || node instanceof HTMLSelectElement) && node.disabled) continue;
    items.push(node);
  }
  return items;
}

function isShown(node: HTMLElement): boolean {
  let current: Element | null = node;
  while (current) {
    if (current instanceof HTMLElement && current.hidden) return false;
    current = current.parentElement;
  }
  return true;
}

function ownedCount(state: GameState): number {
  return state.holdings.reduce((total, holding) => total + (holding.owner === state.activePlayer ? 1 : 0), 0);
}

function motionDelay(): number {
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return reduce ? 0 : 700;
}

function ensureFortifyButton(doc: Document): HTMLButtonElement | null {
  const actions = doc.querySelector(".turn-actions");
  if (!actions) return null;
  const existing = actions.querySelector(".fortify-move");
  if (existing instanceof HTMLButtonElement) return existing;
  const button = doc.createElement("button");
  button.type = "button";
  button.className = "fortify-move secondary";
  button.textContent = "Move 1 army";
  button.hidden = true;
  actions.appendChild(button);
  return button;
}
