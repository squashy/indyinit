import type { Action, CountyId, GameState } from "../types.ts";
import type { MapView } from "./map.ts";
import type { Act } from "./quiz-dialog.ts";

export interface BattleDialog {
  show(state: GameState): void;
}

export function bindBattle(doc: Document, act: Act, map: MapView): BattleDialog {
  const dialog = doc.getElementById("battle-dialog");
  const occupy = doc.getElementById("occupy-dialog");
  const matchup = dialog?.querySelector(".battle-matchup");
  const attackDice = dialog?.querySelector(".attack-dice");
  const defendDice = dialog?.querySelector(".defend-dice");
  const outcome = dialog?.querySelector(".battle-outcome");
  const diceBox = ensureDiceBox(doc, dialog);
  const moveButton = ensureMoveButton(doc, occupy);
  const countInput = occupy?.querySelector("input[name='occupy-count']");
  let current: GameState | null = null;

  moveButton?.addEventListener("click", () => {
    if (!current || current.phase.kind !== "occupy" || !(countInput instanceof HTMLInputElement)) return;
    const count = Number(countInput.value);
    act({ kind: "occupy", count });
  });

  return {
    show(state) {
      current = state;
      if (state.phase.kind === "occupy") {
        hide(dialog);
        showOccupy(doc, occupy, state, countInput);
        return;
      }
      hide(occupy);
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
      if (matchup) matchup.textContent = `${nameOf(state, from)} attacks ${nameOf(state, to)}.`;
      if (attackDice) attackDice.textContent = "";
      if (defendDice) defendDice.textContent = "";
      if (outcome) outcome.textContent = "";
      const max = Math.min(3, origin.armies - 1);
      diceBox.replaceChildren();
      for (let dice = 1; dice <= max; dice += 1) {
        const button = doc.createElement("button");
        button.type = "button";
        button.textContent = dice === 1 ? "Roll 1 die" : `Roll ${dice} dice`;
        const rolled = dice as 1 | 2 | 3;
        button.addEventListener("click", () => {
          if (!current || current.phase.kind !== "attack") return;
          const before = current.events.length;
          if (!act({ kind: "attack", from, to, dice: rolled })) return;
          const battle = current.events.slice(before).find((event) => event.kind === "battle");
          if (battle && battle.kind === "battle") {
            if (attackDice) attackDice.textContent = `Attack dice ${battle.attackRolls.join(", ")}.`;
            if (defendDice) defendDice.textContent = `Defend dice ${battle.defenseRolls.join(", ")}.`;
            if (outcome) outcome.textContent = `You lost ${battle.attackLosses}. They lost ${battle.defenseLosses}.`;
          }
        });
        diceBox.appendChild(button);
      }
      show(dialog);
    },
  };
}

function showOccupy(doc: Document, occupy: HTMLElement | null, state: GameState, countInput: Element | null | undefined): void {
  if (!occupy || state.phase.kind !== "occupy") return;
  const from = holding(state, state.phase.from);
  const maximum = from ? from.armies - 1 : state.phase.minimum;
  if (countInput instanceof HTMLInputElement) {
    countInput.min = String(state.phase.minimum);
    countInput.max = String(maximum);
    countInput.value = String(state.phase.minimum);
  }
  const hint = occupy.querySelector("p");
  if (hint) {
    hint.textContent = `Move at least ${state.phase.minimum} armies into ${nameOf(state, state.phase.to)}. Leave at least 1 army behind.`;
  }
  show(occupy);
  void doc;
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

function ensureMoveButton(doc: Document, occupy: HTMLElement | null): HTMLButtonElement | null {
  if (!occupy) return null;
  const existing = occupy.querySelector(".occupy-move");
  if (existing instanceof HTMLButtonElement) return existing;
  const button = doc.createElement("button");
  button.type = "button";
  button.className = "occupy-move";
  button.textContent = "Move in";
  occupy.appendChild(button);
  return button;
}

function holding(state: GameState, countyId: CountyId) {
  return state.holdings.find((item) => item.countyId === countyId);
}

function nameOf(state: GameState, countyId: CountyId): string {
  return state.config.map.counties.find((county) => county.id === countyId)?.name ?? "County";
}

function show(dialog: HTMLElement | null): void {
  if (!dialog) return;
  dialog.hidden = false;
}

function hide(dialog: HTMLElement | null): void {
  if (!dialog) return;
  dialog.hidden = true;
}
