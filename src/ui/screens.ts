export type ScreenName = "landing" | "setup" | "game";

export interface ScreenOptions {
  canContinue(): boolean;
}

export interface ScreenControls {
  show(name: ScreenName): void;
  current(): ScreenName | null;
}

const TITLES: Record<ScreenName, string> = {
  landing: "Battle for 92",
  setup: "Set up · Battle for 92",
  game: "Battle for the 92",
};

const FOCUS: Record<ScreenName, string> = {
  landing: "#landing-title",
  setup: "#setup-heading",
  game: "#game-title",
};

export function initialScreen(): ScreenName {
  return "landing";
}

export function bindScreens(doc: Document, options: ScreenOptions): ScreenControls {
  const landing = doc.getElementById("landing");
  const setup = doc.getElementById("setup-screen");
  const game = doc.getElementById("game-screen");
  const setupParent = setup?.parentElement ?? null;
  let current: ScreenName | null = null;

  const show = (name: ScreenName): void => {
    const changed = current !== name;
    current = name;
    if (landing instanceof HTMLElement) landing.hidden = name !== "landing";
    if (game instanceof HTMLElement) game.hidden = name !== "game";
    mountSetup(name === "setup");
    if (name === "landing") paintContinue();
    doc.title = TITLES[name];
    const view = doc.defaultView;
    if (view && typeof view.scrollTo === "function") view.scrollTo(0, 0);
    for (const node of Array.from(doc.querySelectorAll(".side, .phase-dialogs, .map-column, .landing, .setup-screen"))) {
      if (node instanceof HTMLElement) node.scrollTop = 0;
    }
    if (!changed) return;
    const target = doc.querySelector(FOCUS[name]);
    if (target instanceof HTMLElement) target.focus();
  };

  const mountSetup = (on: boolean): void => {
    if (!(setup instanceof HTMLElement) || !setupParent) return;
    const dialog = setup.querySelector("#replace-dialog");
    if (dialog instanceof HTMLElement) dialog.hidden = true;
    if (on) {
      if (!setup.isConnected) setupParent.appendChild(setup);
      setup.hidden = false;
      return;
    }
    setup.hidden = true;
    setup.remove();
  };

  const paintContinue = (): void => {
    const button = doc.getElementById("continue-game");
    if (!(button instanceof HTMLElement)) return;
    let offered = false;
    try {
      offered = options.canContinue();
    } catch {
      offered = false;
    }
    button.hidden = !offered;
  };

  doc.getElementById("new-game")?.addEventListener("click", () => show("setup"));
  doc.getElementById("setup-back")?.addEventListener("click", () => show("landing"));
  doc.getElementById("open-menu")?.addEventListener("click", () => show("landing"));

  return {
    show,
    current: () => current,
  };
}
