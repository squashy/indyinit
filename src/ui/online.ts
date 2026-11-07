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
    } catch {
      panel.hidden = true;
    }
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
