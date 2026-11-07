import type { Action, CountyId, Engine, GameState, PlayerId, Rng } from "../src/types.ts";
import { dieFace } from "./rules.fixture.ts";

export type RuleMutant = {
  readonly id: string;
  readonly breaks: string;
  readonly apply: (engine: Engine) => Engine;
};

export const ruleMutants: readonly RuleMutant[] = [
  {
    id: "correct award is 3",
    breaks: "a correct answer adds one army too many",
    apply: (engine) => wrap(engine, (state, action, rng, next) => {
      const result = next(state, action, rng);
      if (!result.ok || action.kind !== "answerQuiz" || result.state.phase.kind !== "place") return result;
      if (result.state.phase.income.quiz !== 2) return result;
      return { ...result, state: addRemaining(result.state, 1) };
    }),
  },
  {
    id: "wrong answer awards 2",
    breaks: "a wrong or skipped answer still pays the quiz bonus",
    apply: (engine) => wrap(engine, (state, action, rng, next) => {
      const result = next(state, action, rng);
      if (!result.ok || result.state.phase.kind !== "place") return result;
      if (result.state.phase.quizResult !== "wrong" && result.state.phase.quizResult !== "skipped") return result;
      return { ...result, state: addRemaining(result.state, 2) };
    }),
  },
  {
    id: "duplicate answer awards 2",
    breaks: "a rejected quiz answer still pays",
    apply: (engine) => wrap(engine, (state, action, rng, next) => {
      const result = next(state, action, rng);
      if (result.ok || action.kind !== "answerQuiz") return result;
      return { ok: true, state: addAnywhere(state, 2), events: [] };
    }),
  },
  {
    id: "ties cost the defender",
    breaks: "an equal high die costs the defender",
    apply: (engine) => wrap(engine, (state, action, rng, next) => {
      if (action.kind !== "attack") return next(state, action, rng);
      const draws: number[] = [];
      const result = next(state, action, () => {
        const value = rng();
        draws.push(value);
        return value;
      });
      if (!result.ok || draws.length === 0) return result;
      const faces = draws.map((value) => dieFace(value));
      if (!faces.every((face) => face === faces[0])) return result;
      return { ...result, state: swapTieLoss(state, result.state, action.from, action.to) };
    }),
  },
  {
    id: "illegal action changes state",
    breaks: "a rejected action still advances the turn",
    apply: (engine) => wrap(engine, (state, action, rng, next) => {
      const result = next(state, action, rng);
      if (result.ok) return result;
      return { ok: true, state: { ...state, turnSequence: state.turnSequence + 1 }, events: [] };
    }),
  },
  {
    id: "fortify ignores the path",
    breaks: "an illegal fortify still moves an army",
    apply: (engine) => wrap(engine, (state, action, rng, next) => {
      const result = next(state, action, rng);
      if (result.ok || action.kind !== "fortify") return result;
      return { ok: true, state: forceShift(state, action.from, action.to), events: [] };
    }),
  },
  {
    id: "repeated handoff pays again",
    breaks: "acknowledging a handoff grants income twice",
    apply: (engine) => wrap(engine, (state, action, rng, next) => {
      if (action.kind !== "acknowledgeHandoff") return next(state, action, rng);
      const result = next(state, action, rng);
      const paid = payAgain(result.ok ? result.state : state);
      return result.ok ? { ...result, state: paid } : { ok: true, state: paid, events: [] };
    }),
  },
];

function wrap(
  engine: Engine,
  reduce: (state: GameState, action: Action, rng: Rng, next: Engine["reduce"]) => ReturnType<Engine["reduce"]>,
): Engine {
  return { ...engine, reduce: (state, action, rng) => reduce(state, action, rng, engine.reduce.bind(engine)) };
}

function addRemaining(state: GameState, extra: number): GameState {
  if (state.phase.kind !== "place") return state;
  return { ...state, phase: { ...state.phase, remaining: state.phase.remaining + extra } };
}

function addAnywhere(state: GameState, extra: number): GameState {
  const first = state.holdings[0];
  if (!first) return state;
  return {
    ...state,
    holdings: state.holdings.map((item, index) => (index === 0 ? { ...item, armies: item.armies + extra } : item)),
  };
}

function swapTieLoss(before: GameState, after: GameState, from: CountyId, to: CountyId): GameState {
  const fromBefore = armyOf(before, from);
  const toBefore = armyOf(before, to);
  const attackLoss = fromBefore - armyOf(after, from);
  const defenseLoss = toBefore - armyOf(after, to);
  if (attackLoss <= 0 || defenseLoss !== 0) return { ...after, turnSequence: after.turnSequence + 1 };
  return {
    ...after,
    holdings: after.holdings.map((item) => {
      if (item.countyId === from) return { ...item, armies: fromBefore };
      if (item.countyId === to) return { ...item, armies: Math.max(0, toBefore - attackLoss) };
      return item;
    }),
  };
}

function forceShift(state: GameState, from: CountyId, to: CountyId): GameState {
  const source = state.holdings.find((item) => item.countyId === from);
  if (!source) return { ...state, turnSequence: state.turnSequence + 1 };
  return {
    ...state,
    turnSequence: state.turnSequence + 1,
    holdings: state.holdings.map((item) => {
      if (item.countyId === from && item.armies >= 2) return { ...item, armies: item.armies - 1 };
      if (item.countyId === to) return { ...item, owner: source.owner, armies: item.armies + (source.armies >= 2 ? 1 : 0) };
      return item;
    }),
  };
}

function payAgain(state: GameState): GameState {
  if (state.phase.kind === "quiz") {
    return { ...state, phase: { ...state.phase, baseIncome: state.phase.baseIncome * 2 } };
  }
  if (state.phase.kind === "place") {
    return {
      ...state,
      phase: {
        ...state.phase,
        remaining: state.phase.remaining + state.phase.income.base,
        income: { ...state.phase.income, base: state.phase.income.base * 2 },
      },
    };
  }
  return addForPlayer(state, state.activePlayer, SECOND_PAY);
}

const SECOND_PAY = 15;

function addForPlayer(state: GameState, player: PlayerId, extra: number): GameState {
  let added = false;
  return {
    ...state,
    holdings: state.holdings.map((item) => {
      if (added || item.owner !== player) return item;
      added = true;
      return { ...item, armies: item.armies + extra };
    }),
  };
}

function armyOf(state: GameState, countyId: CountyId): number {
  return state.holdings.find((item) => item.countyId === countyId)?.armies ?? 0;
}
