import { dispatch, type Session } from "./engine/engine.ts";
import type { Action } from "./types.ts";
import { attachPanZoom } from "./panzoom.ts";
import { cue } from "./sound.ts";
import { bindBattle } from "./ui/battle.ts";
import { bindMap } from "./ui/map.ts";
import { bindQuiz } from "./ui/quiz-dialog.ts";
import { bindSetup, readGamePacks, type PlaySession } from "./ui/setup.ts";
import { bindTurn } from "./ui/turn.ts";

void boot();

async function boot(): Promise<void> {
  try {
    const [mapRaw, quizRaw] = await Promise.all([
      loadJson("../data/regions/in/map.json"),
      loadJson("../data/quiz.json"),
    ]);
    const packs = readGamePacks(mapRaw, quizRaw);
    if (!packs.ok) {
      setStatus(packs.error.message);
      return;
    }
    const map = bindMap(document);
    const svg = document.getElementById("map");
    if (svg instanceof SVGSVGElement) attachPanZoom(svg);
    let live: Session | null = null;
    let setup: { persist(session: PlaySession): void } | null = null;
    const act = (action: Action): boolean => {
      if (!live) return false;
      const result = dispatch(live, action);
      if (!result.ok) {
        setStatus(result.error.message);
        return false;
      }
      setStatus("");
      setup?.persist(live);
      render();
      if (action.kind === "answerQuiz" || action.kind === "skipQuiz") cue("quiz");
      else if (action.kind === "attack") cue("battle");
      else cue("turn");
      return true;
    };
    const quiz = bindQuiz(document, act);
    const battle = bindBattle(document, act, map);
    const turn = bindTurn(document, act, map, () => live?.state ?? null);
    const render = (): void => {
      if (!live) return;
      map.show(live.state);
      quiz.show(live.state);
      battle.show(live.state);
      turn.show(live.state);
    };
    const column = document.querySelector(".map-column");
    column?.addEventListener("click", () => {
      if (!live) return;
      battle.show(live.state);
      turn.show(live.state);
    });
    setup = bindSetup(document, {
      packs: packs.value,
      onSession(session) {
        live = { state: session.state, rng: session.rng };
        render();
      },
    });
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "The game could not load.");
  }
}

async function loadJson(path: string): Promise<unknown> {
  const response = await fetch(new URL(path, import.meta.url));
  if (!response.ok) throw new Error("The map or questions could not be loaded.");
  return response.json() as Promise<unknown>;
}

function setStatus(message: string): void {
  const status = document.getElementById("error-status");
  if (status) status.textContent = message;
}
