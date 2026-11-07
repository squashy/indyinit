import type { Action, CountyId, GameEvent, GameState } from "../types.ts";
import type { MapView } from "./map.ts";
import type { Act } from "./quiz-dialog.ts";

export interface BattleDialog {
  show(state: GameState): void;
}

interface OccupyBounds {
  ok: boolean;
  min: number;
  max: number;
  error: string;
}

let occupyPainting = false;

export function bindBattle(doc: Document, act: Act, map: MapView): BattleDialog {
  const dialog = doc.getElementById("battle-dialog");
  const occupy = doc.getElementById("occupy-dialog");
  const matchup = dialog?.querySelector(".battle-matchup");
  const attackDice = dialog?.querySelector(".attack-dice");
  const defendDice = dialog?.querySelector(".defend-dice");
  const outcome = dialog?.querySelector(".battle-outcome");
  const diceBox = ensureDiceBox(doc, dialog);
  const form = ensureOccupyForm(doc, occupy);
  const moveButton = form?.querySelector(".occupy-move");
  const countInput = form?.querySelector("input[name='occupy-count']") ?? occupy?.querySelector("input[name='occupy-count']");
  let current: GameState | null = null;
  let pending = false;
  let occupyKey = "";
  let occupyOpen = false;
  const seenEvents = new Set<string>();
  let seenEventCount = 0;
  let motionPlays = 0;

  countInput?.addEventListener("input", () => {
    if (occupyPainting || !current || current.phase.kind !== "occupy") return;
    paintOccupy(doc, occupy, current, countInput, moveButton, true);
  });

  const commit = (): void => {
    if (pending || !current || current.phase.kind !== "occupy" || !(countInput instanceof HTMLInputElement)) return;
    const bounds = occupyBounds(current);
    const count = Number(countInput.value);
    if (!bounds.ok || !Number.isSafeInteger(count) || count < bounds.min || count > bounds.max) {
      paintOccupy(doc, occupy, current, countInput, moveButton, true);
      return;
    }
    pending = true;
    const ok = act({ kind: "occupy", count });
    pending = false;
    if (!ok) paintOccupy(doc, occupy, current, countInput, moveButton, true);
  };

  form?.addEventListener("submit", (event) => {
    if (event instanceof Event) event.preventDefault();
    const active = doc.activeElement;
    if (active !== countInput && active !== moveButton) return;
    commit();
  });

  occupy?.addEventListener("keydown", (event) => {
    if (!(event instanceof KeyboardEvent) || !(occupy instanceof HTMLElement) || occupy.hidden) return;
    if (event.key === "Escape") event.preventDefault();
  });

  return {
    show(state) {
      current = state;
      if (state.phase.kind === "occupy") {
        hide(dialog);
        showOccupy(doc, occupy, state, countInput, moveButton, occupyKey, (key) => {
          occupyKey = key;
        });
        if (!occupyOpen && countInput instanceof HTMLElement) countInput.focus();
        occupyOpen = true;
        return;
      }
      const leaving = occupyOpen;
      occupyOpen = false;
      hide(occupy);
      if (leaving && occupy instanceof HTMLElement) {
        const active = doc.activeElement;
        if (active instanceof Node && occupy.contains(active)) {
          const battle = [...state.events].reverse().find((event) => event.kind === "battle");
          const countyId = battle && battle.kind === "battle" ? battle.from : null;
          const source = countyId ? doc.querySelector(`#map [data-county-id="${cssEscape(countyId)}"]`) : null;
          if (source instanceof HTMLElement || source instanceof SVGElement) source.focus();
          else {
            const fallback = doc.getElementById("end-attacks");
            if (fallback instanceof HTMLElement) fallback.focus();
          }
        }
      }
      if (state.phase.kind !== "attack" || !dialog || !diceBox) {
        hide(dialog);
        return;
      }
      const from = map.source();
      const to = map.target();
      if (!from || !to) {
        hide(dialog);
        return;
      }
      const origin = holding(state, from);
      const target = holding(state, to);
      if (!origin || !target || origin.owner !== state.activePlayer || target.owner === state.activePlayer) {
        hide(dialog);
        return;
      }
      const battle = latestBattle(state, from, to);
      const fresh = freshEventKeys(state, seenEvents, () => seenEventCount, (count) => {
        seenEventCount = count;
      });
      const battleKey = battle ? eventKey(battle, state.events.lastIndexOf(battle)) : "";
      if (battle && fresh.has(battleKey)) motionPlays += 1;
      if (dialog) dialog.dataset.motionPlays = String(motionPlays);
      paintBattle(matchup, attackDice, defendDice, outcome, state, from, to, origin.armies, target.armies, battle, Boolean(battle && fresh.has(battleKey) && !reducedMotion()));
      const max = Math.min(3, origin.armies - 1);
      const active = doc.activeElement;
      const previous = Array.from(diceBox.querySelectorAll("button"));
      const activeIndex = active instanceof HTMLButtonElement ? previous.indexOf(active) : -1;
      diceBox.replaceChildren();
      for (let dice = 1; dice <= max; dice += 1) {
        const button = doc.createElement("button");
        button.type = "button";
        button.textContent = dice === 1 ? "Roll 1 die" : `Roll ${dice} dice`;
        const rolled = dice as 1 | 2 | 3;
        button.addEventListener("click", () => {
          if (!current || current.phase.kind !== "attack" || pending) return;
          pending = true;
          const ok = act({ kind: "attack", from, to, dice: rolled });
          pending = false;
          const fought = current ? latestBattle(current, from, to) : null;
          if (ok && fought) {
            if (attackDice) attackDice.textContent = `Attack dice ${fought.attackRolls.join(", ")}.`;
            if (defendDice) defendDice.textContent = `Defend dice ${fought.defenseRolls.join(", ")}.`;
            if (outcome && !outcome.textContent) outcome.textContent = `Attacker lost ${fought.attackLosses}. Defender lost ${fought.defenseLosses}.`;
          } else if (!ok && current && current.phase.kind === "attack") {
            paintBattle(matchup, attackDice, defendDice, outcome, current, from, to, holding(current, from)?.armies ?? origin.armies, holding(current, to)?.armies ?? target.armies, fought, false);
          }
        });
        diceBox.appendChild(button);
      }
      if (activeIndex >= 0) {
        const restored = diceBox.querySelectorAll("button")[activeIndex];
        if (restored instanceof HTMLButtonElement) restored.focus();
      }
      show(dialog);
    },
  };
}

function paintBattle(
  matchup: Element | null | undefined,
  attackDice: Element | null | undefined,
  defendDice: Element | null | undefined,
  outcome: Element | null | undefined,
  state: GameState,
  from: CountyId,
  to: CountyId,
  attackNow: number,
  defendNow: number,
  battle: Extract<GameEvent, { kind: "battle" }> | null,
  roll: boolean,
): void {
  const attackBefore = attackNow + (battle?.attackLosses ?? 0);
  const defendBefore = defendNow + (battle?.defenseLosses ?? 0);
  if (matchup) {
    matchup.textContent = battle
      ? `${nameOf(state, from)} (${attackBefore} armies) attacks ${nameOf(state, to)} (${defendBefore} armies). ${nameOf(state, from)} has ${attackNow} armies now. ${nameOf(state, to)} has ${defendNow} armies now.`
      : `${nameOf(state, from)} (${attackNow} armies) attacks ${nameOf(state, to)} (${defendNow} armies).`;
  }
  if (!battle) {
    if (attackDice) attackDice.textContent = "";
    if (defendDice) defendDice.textContent = "";
    if (outcome) outcome.textContent = "";
    return;
  }
  if (attackDice) {
    attackDice.textContent = `Attack dice ${battle.attackRolls.join(", ")}.`;
    attackDice.classList.toggle("is-rolling", roll);
  }
  if (defendDice) {
    defendDice.textContent = `Defend dice ${battle.defenseRolls.join(", ")}.`;
    defendDice.classList.toggle("is-rolling", roll);
  }
  if (outcome) outcome.textContent = `Attacker lost ${battle.attackLosses}. Defender lost ${battle.defenseLosses}.`;
}

function showOccupy(
  doc: Document,
  occupy: HTMLElement | null,
  state: GameState,
  countInput: Element | null | undefined,
  moveButton: Element | null | undefined,
  previousKey: string,
  writeKey: (key: string) => void,
): void {
  if (!occupy || state.phase.kind !== "occupy") return;
  paintOccupy(doc, occupy, state, countInput, moveButton, previousKey === occupyIdentity(state));
  if (previousKey !== occupyIdentity(state) && countInput instanceof HTMLInputElement) {
    const bounds = occupyBounds(state);
    countInput.value = bounds.ok ? String(bounds.min) : "";
  }
  writeKey(occupyIdentity(state));
  show(occupy);
}

function paintOccupy(
  doc: Document,
  occupy: HTMLElement | null,
  state: GameState,
  countInput: Element | null | undefined,
  moveButton: Element | null | undefined,
  keepValue: boolean,
): void {
  if (!occupy || state.phase.kind !== "occupy") return;
  const bounds = occupyBounds(state);
  const battle = latestBattle(state, state.phase.from, state.phase.to);
  occupyPainting = true;
  if (countInput instanceof HTMLInputElement && !keepValue) countInput.value = bounds.ok ? String(bounds.min) : "";
  occupyPainting = false;
  const typed = countInput instanceof HTMLInputElement ? Number(countInput.value) : Number.NaN;
  const typedOk = bounds.ok && Number.isSafeInteger(typed) && typed >= bounds.min && typed <= bounds.max;
  if (countInput instanceof HTMLInputElement) {
    countInput.min = bounds.ok ? String(bounds.min) : "";
    countInput.max = bounds.ok ? String(bounds.max) : "";
  }
  if (moveButton instanceof HTMLButtonElement) moveButton.disabled = !typedOk;
  const hint = occupy.querySelector("p");
  if (hint) {
    const fromName = nameOf(state, state.phase.from);
    const toName = nameOf(state, state.phase.to);
    const losses = battle ? ` Attacker lost ${battle.attackLosses}. Defender lost ${battle.defenseLosses}.` : "";
    if (!bounds.ok) {
      hint.textContent = `Captured ${toName}. ${bounds.error}${losses}`;
      return;
    }
    const rangeError = keepValue && !typedOk ? " That number cannot move in." : "";
    hint.textContent = `Captured ${toName}. Move ${bounds.min} to ${bounds.max} armies from ${fromName}. Leave 1 army behind.${rangeError}${losses}`;
  }
  void doc;
}

function occupyBounds(state: GameState): OccupyBounds {
  if (state.phase.kind !== "occupy") return { ok: false, min: 0, max: 0, error: "The armies to move cannot be read." };
  const from = holding(state, state.phase.from);
  if (!from) return { ok: false, min: state.phase.minimum, max: 0, error: "The armies to move cannot be read." };
  const min = state.phase.minimum;
  const max = from.armies - 1;
  if (!Number.isSafeInteger(max) || max < min) {
    return { ok: false, min, max, error: "The armies to move cannot leave 1 army behind." };
  }
  return { ok: true, min, max, error: "" };
}

function occupyIdentity(state: GameState): string {
  if (state.phase.kind !== "occupy") return "";
  return `${state.turnSequence}:${state.phase.from}:${state.phase.to}:${state.phase.minimum}`;
}

function latestBattle(state: GameState, from: CountyId, to: CountyId): Extract<GameEvent, { kind: "battle" }> | null {
  for (let index = state.events.length - 1; index >= 0; index -= 1) {
    const event = state.events[index];
    if (event && event.kind === "battle" && event.from === from && event.to === to) return event;
  }
  return null;
}

function ensureDiceBox(doc: Document, dialog: HTMLElement | null): HTMLElement | null {
  if (!dialog) return null;
  const existing = dialog.querySelector(".dice-actions");
  if (existing instanceof HTMLElement) return existing;
  const box = doc.createElement("div");
  box.className = "dice-actions";
  dialog.appendChild(box);
  return box;
}

function ensureOccupyForm(doc: Document, occupy: HTMLElement | null): HTMLFormElement | null {
  if (!occupy) return null;
  const existing = occupy.querySelector("form");
  if (existing instanceof HTMLFormElement) {
    ensureMoveButton(doc, existing);
    return existing;
  }
  const form = doc.createElement("form");
  form.className = "occupy-form";
  const input = occupy.querySelector("input[name='occupy-count']");
  if (input) form.appendChild(input);
  occupy.appendChild(form);
  ensureMoveButton(doc, form);
  return form instanceof HTMLFormElement ? form : null;
}

function ensureMoveButton(doc: Document, occupy: HTMLElement): HTMLButtonElement | null {
  const existing = occupy.querySelector(".occupy-move");
  if (existing instanceof HTMLButtonElement) {
    existing.type = "submit";
    if (existing.textContent === "" || existing.textContent === "Move in") existing.textContent = "Move armies";
    return existing;
  }
  const button = doc.createElement("button");
  button.type = "submit";
  button.className = "occupy-move";
  button.textContent = "Move armies";
  occupy.appendChild(button);
  return button;
}

function holding(state: GameState, countyId: CountyId) {
  return state.holdings.find((item) => item.countyId === countyId);
}

function nameOf(state: GameState, countyId: CountyId): string {
  return state.config.map.counties.find((county) => county.id === countyId)?.name ?? "County";
}

function cssEscape(value: string): string {
  return value.replace(/[^0-9A-Za-z_-]/g, "");
}

function freshEventKeys(state: GameState, seen: Set<string>, readCount: () => number, writeCount: (count: number) => void): Set<string> {
  if (state.events.length < readCount()) seen.clear();
  writeCount(state.events.length);
  const fresh = new Set<string>();
  state.events.forEach((event, index) => {
    const key = eventKey(event, index);
    if (seen.has(key)) return;
    seen.add(key);
    fresh.add(key);
  });
  return fresh;
}

function eventKey(event: GameEvent, index: number): string {
  if (event.kind === "battle") {
    return `${index}:${event.turnSequence}:battle:${event.from}:${event.to}:${event.attackRolls.join("-")}:${event.defenseRolls.join("-")}:${event.attackLosses}:${event.defenseLosses}`;
  }
  if (event.kind === "quizResolved") return `${index}:${event.turnSequence}:quiz:${event.result}:${event.bonus}`;
  if (event.kind === "capture") return `${index}:${event.turnSequence}:capture:${event.countyId}:${event.moved}`;
  if (event.kind === "phase") return `${index}:${event.turnSequence}:phase:${event.phase}`;
  return `${index}:${event.turnSequence}:${event.kind}`;
}

function reducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function show(dialog: HTMLElement | null): void {
  if (!dialog) return;
  dialog.hidden = false;
}

function hide(dialog: HTMLElement | null): void {
  if (!dialog) return;
  dialog.hidden = true;
}
