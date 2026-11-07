import { attachPanZoom } from "./panzoom.ts";
import { bindMap } from "./ui/map.ts";
import { bindSetup, readGamePacks, type GamePacks } from "./ui/setup.ts";
import { bindTurn, type TurnStart } from "./ui/turn.ts";

export async function boot(doc: Document): Promise<void> {
  const packs = await loadPacks(doc);
  if (!packs) return;
  const svg = doc.getElementById("map");
  if (svg instanceof SVGSVGElement) attachPanZoom(svg);
  const map = bindMap(doc);
  let persist: (session: TurnStart) => void = () => {};
  const turns = bindTurn(doc, {
    map,
    persist(session) {
      persist(session);
    },
  });
  const setup = bindSetup(doc, {
    packs,
    onSession(session) {
      if (session.state.config.players.some((player) => player.kind === "computer")) {
        setStatus(doc, "Every seat at this screen is a person. Set each seat to Person, then start again.");
        return;
      }
      const panel = doc.getElementById("setup");
      if (panel) panel.hidden = true;
      const howTo = doc.querySelector("details.how-to");
      if (howTo instanceof HTMLDetailsElement) howTo.open = false;
      setStatus(doc, "");
      turns.start(session);
    },
  });
  persist = (session) => {
    setup.persist(session);
  };
}

async function loadPacks(doc: Document): Promise<GamePacks | null> {
  let mapRaw: unknown;
  let quizRaw: unknown;
  try {
    const [mapResponse, quizResponse] = await Promise.all([
      fetch("/data/regions/in/map.json"),
      fetch("/data/quiz.json"),
    ]);
    if (!mapResponse.ok || !quizResponse.ok) {
      setStatus(doc, "The map and questions could not be loaded.");
      return null;
    }
    mapRaw = await mapResponse.json();
    quizRaw = await quizResponse.json();
  } catch {
    setStatus(doc, "The map and questions could not be loaded.");
    return null;
  }
  const packs = readGamePacks(mapRaw, quizRaw);
  if (!packs.ok) {
    setStatus(doc, packs.error.message);
    return null;
  }
  return packs.value;
}

function setStatus(doc: Document, message: string): void {
  const status = doc.getElementById("error-status");
  if (status) status.textContent = message;
}

void boot(document);
