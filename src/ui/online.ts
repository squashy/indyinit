import { gameIdFromPath, publicShareUrl, seatStorageKey } from "../online/share.ts";

export function bindOnline(doc: Document, fetcher: typeof fetch = globalThis.fetch.bind(globalThis)): void {
  const section = doc.getElementById("online-play");
  const share = doc.getElementById("online-share");
  const message = doc.getElementById("online-message");
  const nameInput = doc.getElementById("online-name");
  const seatsInput = doc.getElementById("online-seats");
  const createButton = doc.getElementById("create-online");
  const joinButton = doc.getElementById("join-online");
  if (!(section instanceof HTMLElement)) return;
  const panel = section;
  const gameId = gameIdFromPath(doc.location.pathname);
  if (joinButton instanceof HTMLButtonElement) joinButton.hidden = gameId === null;
  void probe();
  createButton?.addEventListener("click", () => {
    void onCreate();
  });
  joinButton?.addEventListener("click", () => {
    void onJoin();
  });

  async function probe(): Promise<void> {
    try {
      const response = await fetcher("/api/health/db");
      if (!response.ok) return;
      panel.hidden = false;
      if (gameId) await restore(gameId);
    } catch {
      panel.hidden = true;
    }
  }

  async function restore(id: string): Promise<void> {
    const token = readSeat(doc, id);
    if (!token) return;
    const response = await post(`/api/games/${id}/rejoin`, { seatToken: token });
    if (!response || response.status !== 200) {
      const body = response ? await response.json() as { explanation?: unknown } : null;
      say(typeof body?.explanation === "string" ? body.explanation : "This seat could not rejoin.");
      return;
    }
    const body = await response.json() as { seatIndex?: unknown };
    if (typeof body.seatIndex === "number") say(`You are still seat ${body.seatIndex + 1}.`);
    watch(id);
  }

  function watch(id: string): void {
    let since = 0;
    let wait = 1500;
    const tick = (): void => {
      window.setTimeout(() => {
        void pull();
      }, wait);
    };
    const pull = async (): Promise<void> => {
      if (doc.visibilityState === "hidden") {
        tick();
        return;
      }
      try {
        const response = await fetcher(`/api/games/${id}?since=${since}`);
        if (!response.ok) {
          const body = await response.json() as { explanation?: unknown };
          say(typeof body.explanation === "string" ? body.explanation : "The shared table is unavailable.");
          wait = Math.min(wait * 2, 12000);
        } else {
          const body = await response.json() as { game?: { version?: unknown; play?: { phase?: unknown; activePlayer?: unknown; remaining?: unknown; armies?: unknown } | null } };
          const version = body.game?.version;
          if (typeof version === "number") since = version;
          const view = doc.getElementById("online-view");
          const play = body.game?.play;
          if (view) {
            const phase = play && typeof play.phase === "string" ? play.phase : "lobby";
            const player = play && typeof play.activePlayer === "number" ? play.activePlayer + 1 : 0;
            const remaining = play && typeof play.remaining === "number" ? ` ${play.remaining} to place.` : "";
            const armies = play && Array.isArray(play.armies) ? play.armies.reduce((sum: number, item: unknown) => sum + (typeof item === "object" && item !== null && typeof (item as { armies?: unknown }).armies === "number" ? (item as { armies: number }).armies : 0), 0) : 0;
            view.textContent = `Revision ${typeof version === "number" ? version : 0}. Player ${player}. ${phase}.${remaining} Armies ${armies}.`;
          }
          wait = 1500;
        }
      } catch {
        say("The shared table is down. You can still play on this screen.");
        wait = Math.min(wait * 2, 12000);
      }
      tick();
    };
    void pull();
  }

  async function onCreate(): Promise<void> {
    const name = inputValue(nameInput);
    const seatCount = seatsInput instanceof HTMLInputElement ? Number(seatsInput.value) : 2;
    const response = await post("/api/games", { seatCount, name });
    if (!response) return;
    if (response.status === 201) {
      const body = await response.json() as { gameId?: unknown; seatToken?: unknown };
      if (typeof body.gameId !== "string" || typeof body.seatToken !== "string") {
        say("The shared table did not open.");
        return;
      }
      saveSeat(doc, body.gameId, body.seatToken);
      if (share) share.textContent = publicShareUrl(doc.location.origin, body.gameId);
      say("Share that address. It does not contain your seat key.");
      watch(body.gameId);
      return;
    }
    say(response.status === 400 ? "Use 2 to 6 seats and type your name." : "The shared table did not open.");
  }

  async function onJoin(): Promise<void> {
    if (!gameId) {
      say("Open the shared address to join.");
      return;
    }
    const response = await post(`/api/games/${gameId}/join`, { name: inputValue(nameInput) });
    if (!response) return;
    if (response.status === 200) {
      const body = await response.json() as { seatIndex?: unknown; seatToken?: unknown };
      if (typeof body.seatToken !== "string" || typeof body.seatIndex !== "number") {
        say("The shared table did not open.");
        return;
      }
      saveSeat(doc, gameId, body.seatToken);
      say(`You joined seat ${body.seatIndex + 1}.`);
      watch(gameId);
      return;
    }
    if (response.status === 409) {
      say("That game is full.");
      return;
    }
    if (response.status === 404) {
      say("That game link is not valid.");
      return;
    }
    say("That game is not open for new players.");
  }

  async function post(path: string, body: unknown): Promise<Response | null> {
    try {
      return await fetcher(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    } catch {
      say("The shared table is down. You can still play on this screen.");
      return null;
    }
  }

  function say(text: string): void {
    if (message) message.textContent = text;
  }
}

function inputValue(node: Element | null): string {
  return node instanceof HTMLInputElement ? node.value : "";
}

function saveSeat(doc: Document, gameId: string, seatToken: string): void {
  try {
    doc.defaultView?.localStorage.setItem(seatStorageKey(gameId), seatToken);
  } catch {
    return;
  }
}

function readSeat(doc: Document, gameId: string): string | null {
  try {
    return doc.defaultView?.localStorage.getItem(seatStorageKey(gameId)) ?? null;
  } catch {
    return null;
  }
}
