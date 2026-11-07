import type { Action, CountyId, GameEvent, GameState, Player, PlayerId } from "../types.ts";
import type { MapView } from "./map.ts";
import type { Act } from "./quiz-dialog.ts";

export interface TurnChrome {
  show(state: GameState): void;
  hurry(): void;
}

export function bindTurn(doc: Document, act: Act, map: MapView, stateOf: () => GameState | null): TurnChrome {
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

  const chrome: TurnChrome = {
    show(state) {
      paintStatus(phase, reinforcement, state);
      paintLog(doc, log, state, () => logged, (next) => { logged = next; });
      paintHandoff(handoff, state);
      paintWinner(winner, state);
      if (endAttacks instanceof HTMLButtonElement) endAttacks.disabled = state.phase.kind !== "attack";
      if (endTurn instanceof HTMLButtonElement) endTurn.disabled = state.phase.kind !== "attack" && state.phase.kind !== "fortify";
      if (fortifyButton) fortifyButton.hidden = state.phase.kind !== "fortify";
      considerComputer(state);
    },
    hurry() {
      ticket += 1;
      rushing = true;
      for (let step = 0; step < 8; step += 1) {
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
    const state = stateOf();
    if (!state || state.phase.kind !== "attack") return;
    act({ kind: "endAttacks" });
  });

  endTurn?.addEventListener("click", () => {
    const state = stateOf();
    if (!state) return;
    if (state.phase.kind === "attack") {
      if (!act({ kind: "endAttacks" })) return;
      const next = stateOf();
      if (next?.phase.kind === "fortify") act({ kind: "skipFortify" });
      return;
    }
    if (state.phase.kind === "fortify") act({ kind: "skipFortify" });
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
    if (state.phase.kind === "handoff") act({ kind: "acknowledgeHandoff", turnSequence: state.turnSequence });
  });

  skip?.addEventListener("click", () => {
    const state = stateOf();
    if (state && computerShouldAct(state)) chrome.hurry();
  });

  frame?.addEventListener("click", (event) => {
    const state = stateOf();
    if (!state || state.phase.kind !== "place" || !(event instanceof MouseEvent)) return;
    const id = countyFromPoint(doc, event.clientX, event.clientY);
    if (!id) return;
    act({ kind: "place", countyId: id, count: 1 });
  });

  return chrome;

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
    const action = computerAction(state);
    if (action) act(action);
  }
}

function computerAction(state: GameState): Action | null {
  const phase = state.phase;
  if (phase.kind === "quiz") {
    return { kind: "skipQuiz", turnSequence: state.turnSequence, questionId: phase.pending.questionId };
  }
  if (phase.kind === "place") {
    const held = state.holdings.find((item) => item.owner === state.activePlayer);
    if (!held) return null;
    return { kind: "place", countyId: held.countyId, count: phase.remaining };
  }
  if (phase.kind === "attack") return { kind: "endAttacks" };
  if (phase.kind === "occupy") return { kind: "occupy", count: phase.minimum };
  if (phase.kind === "fortify") return { kind: "skipFortify" };
  if (phase.kind === "handoff") return { kind: "acknowledgeHandoff", turnSequence: state.turnSequence };
  return null;
}

function computerShouldAct(state: GameState): boolean {
  if (state.phase.kind === "over") return false;
  if (state.phase.kind === "handoff") return player(state, state.phase.nextPlayer)?.kind === "computer";
  return player(state, state.activePlayer)?.kind === "computer";
}

function paintStatus(phaseNode: HTMLElement | null, reinforcement: HTMLElement | null, state: GameState): void {
  const phase = state.phase;
  if (phaseNode) phaseNode.textContent = phaseLabel(state);
  if (!reinforcement) return;
  if (phase.kind === "quiz") {
    reinforcement.textContent = `Armies to place: not yet. Counties ${phase.baseIncome}, regions ${phase.regionIncome}, question not scored.`;
    return;
  }
  if (phase.kind === "place") {
    reinforcement.textContent = `Armies to place: ${phase.remaining}. Counties ${phase.income.base}, regions ${phase.income.regions}, question ${phase.income.quiz}.`;
    return;
  }
  reinforcement.textContent = "Armies to place: 0.";
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
      return "This step: Pass the screen";
    case "over":
      return "This step: Game over";
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
    return `${nameOf(state, event.from)} attacked ${nameOf(state, event.to)}. Attack dice ${event.attackRolls.join(", ")}. Defend dice ${event.defenseRolls.join(", ")}.`;
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
