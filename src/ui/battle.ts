import type { CountyId, GameEvent, GameState } from "../types.ts";

type BattleEvent = Extract<GameEvent, { kind: "battle" }>;
type DieCount = 1 | 2 | 3;

export interface BattleSync {
  readonly state: GameState;
  readonly from: CountyId | null;
  readonly to: CountyId | null;
  readonly lastBattle: BattleEvent | null;
}

export interface BattleController {
  reset(): void;
  sync(view: BattleSync): void;
}

export function bindBattle(
  doc: Document,
  handlers: {
    roll(dice: DieCount): void;
    moveIn(count: number): void;
  },
): BattleController {
  const battle = doc.getElementById("battle-dialog");
  const occupy = doc.getElementById("occupy-dialog");
  const matchup = battle?.querySelector(".battle-matchup");
  const attackDice = battle?.querySelector(".attack-dice");
  const defendDice = battle?.querySelector(".defend-dice");
  const outcome = battle?.querySelector(".battle-outcome");
  const rolls = battle instanceof HTMLElement ? ensureRolls(doc, battle, handlers.roll) : [];
  const occupyInput = occupy?.querySelector("input[name='occupy-count']");
  const moveButton = occupy instanceof HTMLElement ? ensureMove(doc, occupy, occupyInput, handlers.moveIn) : null;
  let occupyKey = "";

  return {
    reset() {
      occupyKey = "";
      if (battle instanceof HTMLElement) battle.hidden = true;
      if (occupy instanceof HTMLElement) occupy.hidden = true;
    },
    sync(view) {
      const phase = view.state.phase;
      const attacking = phase.kind === "attack";
      const occupying = phase.kind === "occupy";
      if (battle instanceof HTMLElement) battle.hidden = !attacking && !occupying;
      if (occupy instanceof HTMLElement) occupy.hidden = !occupying;
      const fromName = view.from ? countyName(view.state, view.from) : "";
      const toName = view.to ? countyName(view.state, view.to) : "";
      if (matchup instanceof HTMLElement) {
        if (view.lastBattle) {
          matchup.textContent = `${countyName(view.state, view.lastBattle.from)} attacked ${countyName(view.state, view.lastBattle.to)}.`;
        } else if (fromName && toName) {
          matchup.textContent = `${fromName} attacks ${toName}.`;
        } else {
          matchup.textContent = "Choose your county, then a neighboring county.";
        }
      }
      if (attackDice instanceof HTMLElement) {
        attackDice.textContent = view.lastBattle ? `Attack dice: ${view.lastBattle.attackRolls.join(", ")}` : "Attack dice:";
      }
      if (defendDice instanceof HTMLElement) {
        defendDice.textContent = view.lastBattle ? `Defense dice: ${view.lastBattle.defenseRolls.join(", ")}` : "Defense dice:";
      }
      if (outcome instanceof HTMLElement) outcome.textContent = outcomeText(view);
      const maxDice = attacking ? diceLimit(view.state, view.from) : 0;
      for (const roll of rolls) {
        roll.button.disabled = !attacking || roll.dice > maxDice || !view.from || !view.to;
        roll.button.textContent = fromName && toName ? `Roll ${roll.dice}: ${fromName} into ${toName}` : `Roll ${roll.dice}`;
      }
      if (!occupying || phase.kind !== "occupy") return;
      const from = view.state.holdings.find((holding) => holding.countyId === phase.from);
      const maximum = from ? from.armies - 1 : phase.minimum;
      const key = `${phase.from}:${phase.to}:${phase.minimum}:${maximum}`;
      if (occupyInput instanceof HTMLInputElement && key !== occupyKey) {
        occupyKey = key;
        occupyInput.min = String(phase.minimum);
        occupyInput.max = String(Math.max(phase.minimum, maximum));
        occupyInput.value = String(phase.minimum);
      }
      if (moveButton) moveButton.textContent = `Move armies into ${countyName(view.state, phase.to)}`;
    },
  };
}

function ensureRolls(
  doc: Document,
  battle: HTMLElement,
  onRoll: (dice: DieCount) => void,
): readonly { readonly button: HTMLButtonElement; readonly dice: DieCount }[] {
  let row = battle.querySelector(".turn-actions");
  if (!(row instanceof HTMLElement)) {
    const created = doc.createElement("div");
    created.className = "turn-actions";
    battle.append(created);
    row = created;
  }
  const faces: readonly DieCount[] = [1, 2, 3];
  return faces.map((dice) => {
    const button = doc.createElement("button");
    button.type = "button";
    button.id = `roll-${dice}`;
    button.textContent = `Roll ${dice}`;
    button.addEventListener("click", () => {
      onRoll(dice);
    });
    row.append(button);
    return { button, dice };
  });
}

function ensureMove(
  doc: Document,
  occupy: HTMLElement,
  input: Element | null | undefined,
  onMove: (count: number) => void,
): HTMLButtonElement {
  const existing = doc.getElementById("occupy-move");
  if (existing instanceof HTMLButtonElement) return existing;
  const button = doc.createElement("button");
  button.type = "button";
  button.id = "occupy-move";
  button.textContent = "Move armies in";
  button.addEventListener("click", () => {
    const raw = input instanceof HTMLInputElement ? Number(input.value) : Number.NaN;
    onMove(raw);
  });
  occupy.append(button);
  return button;
}

function outcomeText(view: BattleSync): string {
  const battle = view.lastBattle;
  if (!battle) return "";
  const fromName = countyName(view.state, battle.from);
  const toName = countyName(view.state, battle.to);
  if (view.state.phase.kind === "occupy" && view.state.phase.to === battle.to) {
    return `${toName} is taken. Move armies in.`;
  }
  return `${fromName} loses ${battle.attackLosses}. ${toName} loses ${battle.defenseLosses}.`;
}

function diceLimit(state: GameState, from: CountyId | null): number {
  if (!from) return 0;
  const holding = state.holdings.find((item) => item.countyId === from);
  if (!holding) return 0;
  return Math.min(3, holding.armies - 1);
}

function countyName(state: GameState, id: CountyId): string {
  return state.config.map.counties.find((county) => county.id === id)?.name ?? "County";
}
