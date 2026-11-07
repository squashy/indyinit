import { dispatch as engineDispatch, type Session } from "../engine/engine.ts";
import type { Action, CountyId, GameEvent, GameState, PlayerId } from "../types.ts";
import type { MapView } from "./map.ts";
import { bindBattle, type BattleSync } from "./battle.ts";
import {
  bindQuizDialog,
  questionForPending,
  quizCountyLabel,
  type QuizOutcome,
} from "./quiz-dialog.ts";
import type { QuizQuestion } from "../types.ts";

type BattleEvent = Extract<GameEvent, { kind: "battle" }>;

export interface TurnStart {
  readonly state: GameState;
  readonly rng: Session["rng"];
}

export interface TurnController {
  start(session: TurnStart): void;
}

export function reinforcementCount(state: GameState): number {
  const phase = state.phase;
  if (phase.kind === "place") return phase.remaining;
  if (phase.kind === "quiz") return phase.baseIncome + phase.regionIncome;
  return 0;
}

export function reinforcementText(state: GameState): string {
  return `Armies to place: ${reinforcementCount(state)}`;
}

export function phaseText(state: GameState): string {
  const name = playerLabel(state, state.activePlayer);
  switch (state.phase.kind) {
    case "quiz":
      return `This step: Question. ${name}'s turn.`;
    case "place":
      return `This step: Place armies. ${name}, ${state.phase.remaining} still to put on the map.`;
    case "attack":
      return `This step: Attack. ${name}, pick your county, then a neighboring county.`;
    case "occupy":
      return `This step: Move armies in. ${name} must move armies onto the county just taken.`;
    case "fortify":
      return `This step: Fortify. ${name}, click the county armies leave, then the county they enter. Or end the turn.`;
    case "handoff":
      return `This step: Pass the screen to ${playerLabel(state, state.phase.nextPlayer)}.`;
    case "over":
      return `This step: Game over. ${playerLabel(state, state.phase.winner)} wins.`;
  }
}

export function bindTurn(
  doc: Document,
  options: {
    readonly map: MapView;
    persist(session: TurnStart): void;
  },
): TurnController {
  sitDialogsWithTurn(doc);
  const phaseNode = doc.getElementById("phase");
  const reinforcementNode = doc.getElementById("reinforcement-count");
  const endAttacks = doc.getElementById("end-attacks");
  const endTurn = doc.getElementById("end-turn");
  const placeAll = actionButton(doc, "place-armies", "Place all on the selected county");
  const placeOne = actionButton(doc, "place-one", "Place 1 on the selected county");
  placeOne.className = "secondary";
  const fortifyLabel = doc.createElement("label");
  fortifyLabel.textContent = "Armies to move";
  const fortifyInput = doc.createElement("input");
  fortifyInput.type = "number";
  fortifyInput.name = "fortify-count";
  fortifyInput.min = "1";
  fortifyInput.step = "1";
  fortifyInput.inputMode = "numeric";
  fortifyInput.value = "1";
  fortifyLabel.append(fortifyInput);
  const fortifyMove = actionButton(doc, "fortify-move", "Move armies");
  const actions = doc.querySelector(".turn-actions");
  if (actions) {
    actions.append(placeAll, placeOne, fortifyLabel, fortifyMove);
  }
  placeAll.hidden = true;
  placeOne.hidden = true;
  fortifyLabel.hidden = true;
  fortifyMove.hidden = true;
  setDisabled(endAttacks, true);
  setDisabled(endTurn, true);

  let live: Session | null = null;
  let quizHold: { question: QuizQuestion; countyName: string; result: QuizOutcome } | null = null;
  let lastBattle: BattleEvent | null = null;
  let fortifyFrom: CountyId | null = null;
  let fortifyTo: CountyId | null = null;
  let placementCounty: CountyId | null = null;
  let logged = 0;
  let seenStep = "";

  const quiz = bindQuizDialog(doc, {
    answer: onAnswer,
    skip: onSkip,
    continue: onContinue,
  });
  const battle = bindBattle(doc, { roll: onRoll, moveIn: onMoveIn });

  endAttacks?.addEventListener("click", () => {
    if (!live || quizHold || live.state.phase.kind !== "attack") return;
    if (!apply({ kind: "endAttacks" })) return;
    paint();
  });
  endTurn?.addEventListener("click", () => {
    if (!live || quizHold || live.state.phase.kind !== "fortify") return;
    if (!apply({ kind: "skipFortify" })) return;
    paint();
  });
  placeAll.addEventListener("click", () => {
    place(true);
  });
  placeOne.addEventListener("click", () => {
    place(false);
  });
  fortifyMove.addEventListener("click", () => {
    moveFortify();
  });
  fortifyInput.addEventListener("input", () => {
    if (live?.state.phase.kind === "fortify") paint();
  });
  const ready = doc.querySelector("#handoff-dialog .handoff-ready");
  ready?.addEventListener("click", () => {
    if (!live || live.state.phase.kind !== "handoff") return;
    if (!apply({ kind: "acknowledgeHandoff", turnSequence: live.state.turnSequence })) return;
    paint();
  });

  const svg = doc.getElementById("map");
  if (svg instanceof SVGSVGElement) {
    svg.addEventListener("click", (event) => {
      if (!live || quizHold || live.state.phase.kind !== "fortify") return;
      const id = countyFromClick(live.state, event);
      if (!id) return;
      const holding = live.state.holdings.find((item) => item.countyId === id);
      if (!holding || holding.owner !== live.state.activePlayer) return;
      if (!fortifyFrom || fortifyFrom === id) {
        if (holding.armies < 2) return;
        fortifyFrom = id;
        if (fortifyTo === id) fortifyTo = null;
        return;
      }
      fortifyTo = id;
    });
  }
  const frame = svg?.closest(".map-column") ?? svg;
  frame?.addEventListener("click", () => {
    if (!live || quizHold) return;
    paint();
  });

  return {
    start(incoming) {
      live = { state: incoming.state, rng: incoming.rng };
      quizHold = null;
      lastBattle = null;
      fortifyFrom = null;
      fortifyTo = null;
      placementCounty = incoming.state.phase.kind === "quiz" ? incoming.state.phase.pending.countyId : null;
      logged = 0;
      seenStep = "";
      const list = doc.querySelector("#trip-log ol");
      if (list) list.replaceChildren();
      quiz.reset();
      battle.reset();
      paintRegions(doc, incoming.state);
      paint();
    },
  };

  function onAnswer(index: number): void {
    if (!live || quizHold || live.state.phase.kind !== "quiz") return;
    const pending = live.state.phase.pending;
    const question = questionForPending(live.state);
    if (!question) {
      setStatus(doc, "That question is not in the pack.");
      return;
    }
    const countyName = quizCountyLabel(live.state) ?? question.countyName;
    placementCounty = pending.countyId;
    const ok = apply({
      kind: "answerQuiz",
      turnSequence: live.state.turnSequence,
      questionId: pending.questionId,
      answer: { kind: "choice", index },
    });
    if (!ok || !live) return;
    const next = phaseOf(live);
    if (next.kind !== "place") return;
    const result = next.quizResult;
    if (result !== "correct" && result !== "wrong") return;
    quizHold = { question, countyName, result };
    paint();
  }

  function onSkip(): void {
    if (!live || quizHold || live.state.phase.kind !== "quiz") return;
    const pending = live.state.phase.pending;
    const question = questionForPending(live.state);
    if (!question) {
      setStatus(doc, "That question is not in the pack.");
      return;
    }
    const countyName = quizCountyLabel(live.state) ?? question.countyName;
    placementCounty = pending.countyId;
    const ok = apply({
      kind: "skipQuiz",
      turnSequence: live.state.turnSequence,
      questionId: pending.questionId,
    });
    if (!ok) return;
    quizHold = { question, countyName, result: "skipped" };
    paint();
  }

  function onContinue(): void {
    quizHold = null;
    paint();
  }

  function place(all: boolean): void {
    if (!live || quizHold || live.state.phase.kind !== "place") return;
    const countyId = placeTarget(live.state);
    if (!countyId) {
      setStatus(doc, "Choose a county you hold.");
      return;
    }
    const count = all ? live.state.phase.remaining : 1;
    if (!apply({ kind: "place", countyId, count })) return;
    paint();
  }

  function onRoll(dice: 1 | 2 | 3): void {
    if (!live || quizHold || live.state.phase.kind !== "attack") return;
    const pair = attackPair(live.state);
    if (!pair) {
      setStatus(doc, "Choose your county, then a neighboring county.");
      return;
    }
    const result = dispatch({ kind: "attack", from: pair.from, to: pair.to, dice });
    if (!result.ok) return;
    const found = latestBattle(result.events);
    if (found) lastBattle = found;
    paint();
  }

  function onMoveIn(count: number): void {
    if (!live || live.state.phase.kind !== "occupy") return;
    if (!apply({ kind: "occupy", count })) return;
    lastBattle = null;
    paint();
  }

  function moveFortify(): void {
    if (!live || quizHold || live.state.phase.kind !== "fortify") return;
    const pair = fortifyPair(live.state);
    if (!pair) {
      setStatus(doc, "Choose the county armies leave, then the county they enter.");
      return;
    }
    const count = Number(fortifyInput.value);
    const fromName = countyName(live.state, pair.from);
    const toName = countyName(live.state, pair.to);
    if (!apply({ kind: "fortify", from: pair.from, to: pair.to, count })) return;
    appendLog(doc, `${fromName} sends ${count} armies to ${toName}.`);
    fortifyFrom = null;
    fortifyTo = null;
    paint();
  }

  function dispatch(action: Action): { ok: true; events: readonly GameEvent[] } | { ok: false } {
    if (!live) return { ok: false };
    const result = engineDispatch(live, action);
    if (!result.ok) {
      setStatus(doc, result.error.message);
      return { ok: false };
    }
    setStatus(doc, "");
    options.persist({ state: live.state, rng: live.rng });
    return { ok: true, events: result.events };
  }

  function apply(action: Action): boolean {
    return dispatch(action).ok;
  }

  function paint(): void {
    if (!live) return;
    const state = live.state;
    if (state.phase.kind === "quiz") placementCounty = state.phase.pending.countyId;
    if (state.phase.kind !== "fortify") {
      fortifyFrom = null;
      fortifyTo = null;
    }
    if (state.phase.kind !== "attack" && state.phase.kind !== "occupy") lastBattle = null;
    if (!quizHold) options.map.show(state);
    if (phaseNode) phaseNode.textContent = phaseLine(state);
    if (reinforcementNode) reinforcementNode.textContent = reinforcementText(state);
    logEvents(state);
    const placing = state.phase.kind === "place" && !quizHold;
    const fortifying = state.phase.kind === "fortify" && !quizHold;
    placeAll.hidden = !placing;
    placeOne.hidden = !placing;
    fortifyLabel.hidden = !fortifying;
    fortifyMove.hidden = !fortifying;
    setDisabled(endAttacks, state.phase.kind !== "attack" || quizHold !== null);
    setDisabled(endTurn, state.phase.kind !== "fortify" || quizHold !== null);
    const spot = placing ? placeTarget(state) : null;
    if (spot) {
      const name = countyName(state, spot);
      placeAll.textContent = `Place all on ${name}`;
      placeOne.textContent = `Place 1 on ${name}`;
    }
    const move = fortifying ? fortifyPair(state) : null;
    if (move) {
      const from = state.holdings.find((holding) => holding.countyId === move.from);
      if (from) fortifyInput.max = String(Math.max(1, from.armies - 1));
      fortifyMove.disabled = false;
      fortifyMove.textContent = `Move armies: ${countyName(state, move.from)} to ${countyName(state, move.to)}`;
    } else if (fortifying) {
      fortifyMove.disabled = true;
      fortifyMove.textContent = "Choose both counties";
    }
    if (quizHold) {
      quiz.showOutcome(quizHold.question, quizHold.countyName, quizHold.result, reinforcementCount(state));
    } else if (state.phase.kind === "quiz") {
      quiz.showQuestion(state);
    } else {
      quiz.hide();
    }
    const pair = state.phase.kind === "attack" ? attackPair(state) : null;
    const battleView: BattleSync = {
      state,
      from: pair?.from ?? (state.phase.kind === "occupy" ? state.phase.from : lastBattle?.from ?? null),
      to: pair?.to ?? (state.phase.kind === "occupy" ? state.phase.to : lastBattle?.to ?? null),
      lastBattle,
    };
    battle.sync(battleView);
    showCopy(doc, "handoff-dialog", state.phase.kind === "handoff", handoffCopy(state));
    showCopy(doc, "winner-dialog", state.phase.kind === "over", winnerCopy(state));
    scrollStep(state);
  }

  function phaseLine(state: GameState): string {
    const base = phaseText(state);
    if (state.phase.kind === "attack") {
      const chosen = selectedAttack(state);
      if (chosen) return `${base} Attacking ${countyName(state, chosen.from)} into ${countyName(state, chosen.to)}.`;
      if (options.map.source()) return `${base} Now choose a neighboring county.`;
      const hint = legalAttack(state);
      if (!hint) return `${base} No attack is open. Stop attacking.`;
      return `${base} One border you can attack: ${countyName(state, hint.from)} into ${countyName(state, hint.to)}.`;
    }
    if (state.phase.kind === "fortify") {
      if (fortifyFrom && fortifyTo) return `${base} From ${countyName(state, fortifyFrom)} to ${countyName(state, fortifyTo)}.`;
      const hint = legalFortify(state);
      if (!hint) return `${base} No fortify is open. End the turn.`;
      return `${base} One move you can make: ${countyName(state, hint.from)} to ${countyName(state, hint.to)}.`;
    }
    if (state.phase.kind === "place" && !quizHold) {
      const target = placeTarget(state);
      if (target) return `${base} Selected: ${countyName(state, target)}.`;
    }
    return base;
  }

  function selectedAttack(state: GameState): { from: CountyId; to: CountyId } | null {
    const source = options.map.source();
    const target = options.map.target();
    if (source && target && owns(state, source) && !owns(state, target) && adjacent(state, source, target)) {
      return { from: source, to: target };
    }
    return null;
  }

  function attackPair(state: GameState): { from: CountyId; to: CountyId } | null {
    return selectedAttack(state) ?? (options.map.source() ? null : legalAttack(state));
  }

  function fortifyPair(state: GameState): { from: CountyId; to: CountyId } | null {
    if (fortifyFrom && fortifyTo) return { from: fortifyFrom, to: fortifyTo };
    if (fortifyFrom || fortifyTo) return null;
    return legalFortify(state);
  }

  function placeTarget(state: GameState): CountyId | null {
    const selected = options.map.selected();
    if (selected && owns(state, selected)) return selected;
    if (placementCounty && owns(state, placementCounty)) return placementCounty;
    return state.holdings.find((holding) => holding.owner === state.activePlayer)?.countyId ?? null;
  }

  function logEvents(state: GameState): void {
    const list = doc.querySelector("#trip-log ol");
    if (!(list instanceof HTMLElement)) return;
    for (const event of state.events.slice(logged)) {
      const item = doc.createElement("li");
      item.textContent = eventLine(state, event);
      list.append(item);
    }
    logged = state.events.length;
    list.scrollTop = list.scrollHeight;
  }

  function scrollStep(state: GameState): void {
    const key = `${state.turnSequence}:${state.phase.kind}:${quizHold ? "hold" : "go"}`;
    if (seenStep === key) return;
    seenStep = key;
    const countyId = state.phase.kind === "quiz"
      ? state.phase.pending.countyId
      : state.phase.kind === "attack"
        ? attackPair(state)?.from ?? null
        : state.phase.kind === "fortify"
          ? fortifyFrom ?? legalFortify(state)?.from ?? null
          : state.phase.kind === "place"
            ? placeTarget(state)
            : null;
    if (countyId && /^[0-9]+$/.test(countyId)) {
      const node = doc.querySelector(`#map [data-county-id="${countyId}"]`);
      if (node instanceof Element) node.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
    const dialogId = quizHold || state.phase.kind === "quiz"
      ? "quiz-dialog"
      : state.phase.kind === "handoff"
        ? "handoff-dialog"
        : state.phase.kind === "over"
          ? "winner-dialog"
          : state.phase.kind === "occupy"
            ? "occupy-dialog"
            : state.phase.kind === "attack"
              ? "battle-dialog"
              : "phase";
    doc.getElementById(dialogId)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
}

function legalAttack(state: GameState): { from: CountyId; to: CountyId } | null {
  if (state.phase.kind !== "attack") return null;
  for (const holding of state.holdings) {
    if (holding.owner !== state.activePlayer || holding.armies < 2) continue;
    const neighbors = state.config.map.counties.find((county) => county.id === holding.countyId)?.neighbors ?? [];
    for (const neighborId of neighbors) {
      const neighbor = state.holdings.find((item) => item.countyId === neighborId);
      if (!neighbor || neighbor.owner === state.activePlayer || neighbor.armies < 1) continue;
      if (!adjacent(state, holding.countyId, neighborId)) continue;
      return { from: holding.countyId, to: neighborId };
    }
  }
  return null;
}

function legalFortify(state: GameState): { from: CountyId; to: CountyId } | null {
  if (state.phase.kind !== "fortify") return null;
  for (const holding of state.holdings) {
    if (holding.owner !== state.activePlayer || holding.armies < 2) continue;
    const neighbors = state.config.map.counties.find((county) => county.id === holding.countyId)?.neighbors ?? [];
    for (const neighborId of neighbors) {
      const neighbor = state.holdings.find((item) => item.countyId === neighborId);
      if (!neighbor || neighbor.owner !== state.activePlayer) continue;
      if (!adjacent(state, holding.countyId, neighborId)) continue;
      return { from: holding.countyId, to: neighborId };
    }
  }
  return null;
}

function adjacent(state: GameState, from: CountyId, to: CountyId): boolean {
  const left = state.config.map.counties.find((county) => county.id === from)?.neighbors ?? [];
  const right = state.config.map.counties.find((county) => county.id === to)?.neighbors ?? [];
  return left.includes(to) && right.includes(from);
}

function owns(state: GameState, id: CountyId): boolean {
  return state.holdings.some((holding) => holding.countyId === id && holding.owner === state.activePlayer);
}

function eventLine(state: GameState, event: GameEvent): string {
  const actor = playerLabel(state, event.player);
  switch (event.kind) {
    case "phase":
      return phaseLog(actor, event.phase);
    case "quizResolved": {
      const where = event.countyId ? countyName(state, event.countyId) : "a county";
      if (event.result === "correct") return `${actor} answers right on ${where}. +2 armies.`;
      if (event.result === "skipped") return `${actor} skips the question on ${where}. +0 armies.`;
      if (event.result === "noQuestion") return `${actor} has no question this turn. +0 armies.`;
      return `${actor} answers wrong on ${where}. +0 armies.`;
    }
    case "battle":
      return `${countyName(state, event.from)} rolls ${event.attackRolls.join(", ")} against ${countyName(state, event.to)} (${event.defenseRolls.join(", ")}). ${countyName(state, event.from)} loses ${event.attackLosses}. ${countyName(state, event.to)} loses ${event.defenseLosses}.`;
    case "capture":
      return `${actor} takes ${countyName(state, event.countyId)} and moves in ${event.moved} armies.`;
    case "winner":
      return `${actor} wins.`;
  }
}

function phaseLog(actor: string, phase: GameState["phase"]["kind"]): string {
  switch (phase) {
    case "quiz":
      return `${actor}'s turn starts with a question.`;
    case "place":
      return `${actor} places armies.`;
    case "attack":
      return `${actor} may attack.`;
    case "occupy":
      return `${actor} must move armies in.`;
    case "fortify":
      return `${actor} may fortify.`;
    case "handoff":
      return `${actor} passes the screen.`;
    case "over":
      return "The game is over.";
  }
}

function handoffCopy(state: GameState): string {
  if (state.phase.kind !== "handoff") return "Hand the screen to the next player.";
  return `Hand the screen to ${playerLabel(state, state.phase.nextPlayer)}.`;
}

function winnerCopy(state: GameState): string {
  if (state.phase.kind !== "over") return "";
  return `${playerLabel(state, state.phase.winner)} wins.`;
}

function playerLabel(state: GameState, id: PlayerId): string {
  return state.config.players.find((player) => player.id === id)?.label ?? "Player";
}

function countyName(state: GameState, id: CountyId): string {
  return state.config.map.counties.find((county) => county.id === id)?.name ?? "County";
}

function countyFromClick(state: GameState, event: Event): CountyId | null {
  if (!(event.target instanceof Element)) return null;
  const node = event.target.closest("[data-county-id]");
  if (!(node instanceof HTMLElement || node instanceof SVGElement)) return null;
  const raw = node.dataset.countyId;
  if (!raw) return null;
  return state.holdings.find((holding) => holding.countyId === raw)?.countyId ?? null;
}

function latestBattle(events: readonly GameEvent[]): BattleEvent | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.kind === "battle") return event;
  }
  return null;
}

function paintRegions(doc: Document, state: GameState): void {
  const list = doc.querySelector("#regions ul");
  if (!(list instanceof HTMLElement) || list.dataset.filled === "yes") return;
  list.dataset.filled = "yes";
  for (const region of state.config.map.regions) {
    const item = doc.createElement("li");
    item.textContent = region.review === "reviewed"
      ? `${region.name}: ${region.bonus} armies for owning every county in it.`
      : `${region.name}: bonus still in draft.`;
    list.append(item);
  }
}

function sitDialogsWithTurn(doc: Document): void {
  const step = doc.getElementById("phase")?.closest("section");
  if (!step) return;
  for (const id of ["winner-dialog", "handoff-dialog", "occupy-dialog", "battle-dialog", "quiz-dialog"]) {
    const node = doc.getElementById(id);
    if (node) step.insertAdjacentElement("afterend", node);
  }
}

function showCopy(doc: Document, id: string, visible: boolean, text: string): void {
  const section = doc.getElementById(id);
  if (!(section instanceof HTMLElement)) return;
  section.hidden = !visible;
  if (!visible) return;
  const paragraph = section.querySelector("p");
  if (paragraph) paragraph.textContent = text;
}

function actionButton(doc: Document, id: string, label: string): HTMLButtonElement {
  const existing = doc.getElementById(id);
  if (existing instanceof HTMLButtonElement) return existing;
  const button = doc.createElement("button");
  button.type = "button";
  button.id = id;
  button.textContent = label;
  return button;
}

function setDisabled(node: Element | null, disabled: boolean): void {
  if (node instanceof HTMLButtonElement) node.disabled = disabled;
}

function appendLog(doc: Document, line: string): void {
  const list = doc.querySelector("#trip-log ol");
  if (!(list instanceof HTMLElement)) return;
  const item = doc.createElement("li");
  item.textContent = line;
  list.append(item);
  list.scrollTop = list.scrollHeight;
}

function phaseOf(session: Session): GameState["phase"] {
  return session.state.phase;
}

function setStatus(doc: Document, message: string): void {
  const status = doc.getElementById("error-status");
  if (status) status.textContent = message;
}
