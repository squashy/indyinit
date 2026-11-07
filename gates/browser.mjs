import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = path.join(root, "tests/browser/report.md");
const quiz = JSON.parse(await readFile(path.join(root, "data/quiz.json"), "utf8"));
const mapPack = JSON.parse(await readFile(path.join(root, "data/regions/in/map.json"), "utf8"));
const chromeBin = process.env.CHROME_PATH || "/usr/local/bin/google-chrome";
const port = 4188;
const core = [];
const optional = [];
const unchecked = [
  "Screen reader speech for the trip log was not listened to. The live-region attributes were checked.",
  "No color-vision simulator was run. Player swatches were checked for distinct pattern images.",
  "Pinch zoom was not performed.",
  "Computer attack play was not checked. That behavior belongs to the AI owner, not this gate.",
  "A hosted preview URL was not used. This run used the local production build.",
];

async function main() {
  const preview = spawn("npx", ["vite", "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: root,
    stdio: "ignore",
  });
  const userData = await mkdtemp(path.join(tmpdir(), "btt18-"));
  const chrome = spawn(chromeBin, [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--remote-debugging-port=9333",
    `--user-data-dir=${userData}`,
    "about:blank",
  ], { stdio: "ignore" });
  try {
    await waitFor(`http://127.0.0.1:${port}/`, 15000);
    await waitFor("http://127.0.0.1:9333/json/version", 15000);
    const browser = await connectBrowser();
    await browser.check("desktop", 1440, 900, true);
    await browser.check("chromebook", 1366, 768, false);
    await browser.check("phone", 390, 844, false);
    await browser.close();
  } catch (error) {
    const detail = error instanceof Error ? error.stack || error.message : String(error);
    console.error(detail);
    core.push({ name: "browser harness", ok: false, detail, owner: "gates/browser.mjs" });
  } finally {
    preview.kill();
    chrome.kill();
    await new Promise((resolve) => setTimeout(resolve, 200));
    await rm(userData, { recursive: true, force: true }).catch(() => {});
  }
  const failedCore = core.filter((item) => !item.ok);
  await mkdir(path.dirname(reportPath), { recursive: true });
  const text = renderReport();
  await writeFile(reportPath, text);
  console.log(text);
  process.exit(failedCore.length > 0 ? 1 : 0);
}

function renderReport() {
  const lines = [
    "# Browser gate report",
    "",
    "Run against the local production build (`npm run build` then this gate's preview). Optional misses do not block release. A core row blocks only when it is a real gameplay obstruction.",
    "",
    "## Core",
    "",
    ...core.map((item) => `- ${item.ok ? "pass" : "FAIL"}: ${item.name}. ${item.detail}${item.owner ? ` Owner: \`${item.owner}\`.` : ""}`),
    "",
    "## Optional",
    "",
    ...optional.map((item) => `- ${item.ok ? "pass" : "note"}: ${item.name}. ${item.detail}${item.owner ? ` Owner: \`${item.owner}\`.` : ""}`),
    "",
    "## Not checked",
    "",
    ...unchecked.map((item) => `- ${item}`),
    "",
  ];
  if (core.every((item) => item.ok)) {
    lines.push("No core gameplay obstruction was observed in this run.", "");
  }
  return lines.join("\n");
}

async function connectBrowser() {
  const version = await (await fetch("http://127.0.0.1:9333/json/version")).json();
  const browserSocket = new WebSocket(version.webSocketDebuggerUrl);
  await socketOpen(browserSocket);
  const browser = new Cdp(browserSocket);
  const target = await browser.send("Target.createTarget", { url: "about:blank" });
  const session = await browser.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  const page = new Cdp(browserSocket, session.sessionId);
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Network.enable");
  const pageErrors = [];
  page.on("Runtime.exceptionThrown", (event) => {
    pageErrors.push(event.exceptionDetails?.exception?.description || event.exceptionDetails?.text || "page exception");
  });
  page.on("Runtime.consoleAPICalled", (event) => {
    if (event.type === "error") pageErrors.push(event.args?.map((arg) => arg.value || arg.description).join(" ") || "console error");
  });
  const failed = [];
  page.on("Network.loadingFailed", (event) => {
    if (event.type === "Document" || event.type === "Script" || event.type === "Stylesheet") failed.push(event.errorText || event.type);
  });
  return {
    pageErrors,
    failed,
    async check(name, width, height, full) {
      pageErrors.length = 0;
      failed.length = 0;
      await page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 });
      await page.send("Page.navigate", { url: `http://127.0.0.1:${port}/` });
      await waitUntil(page, "document.readyState === 'complete' && document.getElementById('start-game')");
      await type(page, "input[name='player-name-0']", "Ada");
      await type(page, "input[name='player-name-1']", "Bo");
      await click(page, "#start-game");
      await waitUntil(page, "document.getElementById('quiz-dialog') && document.getElementById('quiz-dialog').hidden === false");
      const opened = await evalJson(page, `(() => {
        const quiz = document.getElementById('quiz-dialog').getBoundingClientRect();
        const column = document.querySelector('.map-column').getBoundingClientRect();
        const county = document.querySelector('.is-quiz-county');
        const countyBox = county ? county.getBoundingClientRect() : null;
        const overlap = (a, b) => !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
        const buttons = [...document.querySelectorAll('#quiz-choices button, #skip-quiz')].map((node) => {
          const box = node.getBoundingClientRect();
          return { h: Math.round(box.height), w: Math.round(box.width) };
        });
        const swatches = [...document.querySelectorAll('#player-stats .player-swatch')].map((node) => getComputedStyle(node).backgroundImage);
        return {
          notice: document.querySelector('.quiz-unverified')?.textContent || '',
          heading: document.getElementById('quiz-county')?.textContent || '',
          highlighted: county?.getAttribute('data-county-id') || '',
          prompt: document.getElementById('quiz-question')?.textContent || '',
          before: document.getElementById('reinforcement-count')?.textContent || '',
          columnOverlap: overlap(column, quiz),
          countyOverlap: countyBox ? overlap(countyBox, quiz) : true,
          sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          buttons,
          swatches: new Set(swatches).size,
          live: document.getElementById('trip-log')?.getAttribute('aria-live') || '',
        };
      })()`);
      const expectedName = mapPack.counties.find((county) => county.id === opened.highlighted)?.name || "";
      recordCore(`${name} quiz names the highlighted county`, opened.heading === expectedName && opened.highlighted !== "", `${opened.heading} / ${opened.highlighted}`, "src/ui/quiz-dialog.ts and src/ui/map.ts");
      recordCore(`${name} questions unverified`, opened.notice === "Questions unverified", opened.notice, "src/ui/quiz-dialog.ts");
      recordCore(`${name} dialog does not cover the quiz county`, opened.countyOverlap === false && opened.columnOverlap === false, `county ${opened.countyOverlap} column ${opened.columnOverlap}`, "src/styles.css");
      recordCore(`${name} no sideways scroll`, opened.sideways === false, String(opened.sideways), "src/styles.css");
      const short = opened.buttons.filter((button) => button.h < 44 || button.w < 44);
      recordOptional(`${name} 44px quiz targets`, short.length === 0, short.length ? JSON.stringify(short) : `${opened.buttons.length} controls`, "src/styles.css");
      recordOptional(`${name} distinct player patterns`, opened.swatches >= 2, `${opened.swatches} background images`, "src/styles/theme.css");
      recordOptional(`${name} trip log live region`, opened.live === "polite", opened.live, "index.html");
      if (full) await fullTurn(page, opened.prompt);
      recordCore(`${name} no page errors`, pageErrors.length === 0 && failed.length === 0, [...pageErrors, ...failed].join("; ") || "none", "src/main.ts");
    },
    async close() {
      browserSocket.close();
    },
  };

  async function fullTurn(pageSocket, prompt) {
    const answer = findAnswer(prompt);
    recordCore("shipped prompt found", Boolean(answer), prompt.slice(0, 80), "data/quiz.json");
    if (!answer) return;
    const clicked = await evalJson(pageSocket, `(() => {
      const button = [...document.querySelectorAll('#quiz-choices button')].find((item) => item.textContent === ${JSON.stringify(answer)});
      if (!button) return false;
      button.scrollIntoView({ block: 'center', inline: 'nearest' });
      const rect = button.getBoundingClientRect();
      button.dataset.btt18 = 'answer';
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    })()`);
    if (!clicked) {
      recordCore("correct choice is on screen", false, "button missing", "src/ui/quiz-dialog.ts");
      return;
    }
    await mouse(pageSocket, clicked.x, clicked.y);
    await waitUntil(pageSocket, "(document.getElementById('phase')?.textContent || '').includes('places armies')");
    const scored = await evalJson(pageSocket, `(() => ({
      result: document.getElementById('quiz-result')?.textContent || '',
      reinforcement: document.getElementById('reinforcement-count')?.textContent || '',
    }))()`);
    const income = scored.reinforcement.match(/Armies to place: (\d+)\. Counties (\d+), regions (\d+), question (\d+)\./);
    recordCore("correct answer shows +2 once", scored.result.includes("2 armies"), scored.result, "src/ui/quiz-dialog.ts");
    recordCore("reinforcement matches engine income", Boolean(income) && Number(income[1]) === Number(income[2]) + Number(income[3]) + Number(income[4]) && income[4] === "2", scored.reinforcement, "src/ui/turn.ts");
    for (let step = 0; step < 40; step += 1) {
      const label = await evalJson(pageSocket, "document.getElementById('phase')?.textContent || ''");
      if (String(label).includes("may attack")) break;
      const id = await evalJson(pageSocket, "document.querySelector('#map [data-owner=\\'0\\']')?.getAttribute('data-county-id') || ''");
      if (!id) break;
      await click(pageSocket, `[data-county-id="${id}"]`);
    }
    const attack = await evalJson(pageSocket, `(() => {
      const state = JSON.parse(localStorage.getItem('battle-for-the-92.save') || '{}').state;
      const mine = state.holdings.filter((item) => item.owner === state.activePlayer && item.armies >= 2);
      for (const from of mine) {
        const neighbors = state.config.map.counties.find((county) => county.id === from.countyId)?.neighbors || [];
        const enemy = neighbors.find((id) => state.holdings.find((item) => item.countyId === id)?.owner !== state.activePlayer);
        if (enemy) return { from: from.countyId, to: enemy };
      }
      return null;
    })()`);
    recordCore("a legal enemy attack exists", Boolean(attack), JSON.stringify(attack), "src/ui/map.ts");
    if (!attack) return;
    await click(pageSocket, `[data-county-id="${attack.from}"]`);
    await click(pageSocket, `[data-county-id="${attack.to}"]`);
    await waitUntil(pageSocket, "document.querySelector('#battle-dialog button')");
    const marks = await evalJson(pageSocket, `(() => ({
      source: document.querySelector('.is-source')?.getAttribute('data-county-id') || '',
      target: document.querySelector('.is-target')?.getAttribute('data-county-id') || '',
    }))()`);
    recordCore("attack selects an enemy target", marks.source === attack.from && marks.target === attack.to, JSON.stringify(marks), "src/ui/map.ts");
    await click(pageSocket, "#battle-dialog button");
    await waitUntil(pageSocket, "(document.querySelector('.attack-dice')?.textContent || '').includes('Attack dice')");
    const occupy = await evalJson(pageSocket, "document.getElementById('occupy-dialog')?.hidden === false");
    if (occupy) {
      await click(pageSocket, ".occupy-move");
      await waitUntil(pageSocket, "document.getElementById('occupy-dialog')?.hidden === true");
    }
    await click(pageSocket, "#end-attacks");
    await waitUntil(pageSocket, "(document.getElementById('phase')?.textContent || '').includes('may move armies once')");
    const plan = await evalJson(pageSocket, `(() => {
      const state = JSON.parse(localStorage.getItem('battle-for-the-92.save') || '{}').state;
      const owned = new Set(state.holdings.filter((item) => item.owner === state.activePlayer).map((item) => item.countyId));
      const neighborsOf = (id) => state.config.map.counties.find((county) => county.id === id)?.neighbors || [];
      const reachable = (start) => {
        const seen = new Set([start]);
        const queue = [start];
        while (queue.length) {
          const current = queue.shift();
          for (const next of neighborsOf(current)) {
            if (!owned.has(next) || seen.has(next)) continue;
            seen.add(next);
            queue.push(next);
          }
        }
        return seen;
      };
      for (const source of state.holdings.filter((item) => item.owner === state.activePlayer && item.armies >= 2)) {
        const reach = reachable(source.countyId);
        const friend = [...reach].find((id) => id !== source.countyId);
        if (!friend) continue;
        const disconnected = [...owned].find((id) => id !== source.countyId && !reach.has(id)) || '';
        const enemy = state.holdings.find((item) => item.owner !== state.activePlayer)?.countyId || '';
        return { source: source.countyId, friend, disconnected, enemy };
      }
      return null;
    })()`);
    recordCore("a connected friendly fortify destination exists", Boolean(plan), JSON.stringify(plan), "src/ui/map.ts");
    if (!plan) return;
    const before = await badges(pageSocket, plan.source, plan.friend);
    await click(pageSocket, `[data-county-id="${plan.source}"]`);
    await click(pageSocket, `[data-county-id="${plan.enemy}"]`);
    await click(pageSocket, ".fortify-move");
    const enemy = await evalJson(pageSocket, `(() => ({
      target: document.querySelector('.is-target')?.getAttribute('data-county-id') || '',
      status: document.getElementById('error-status')?.textContent || '',
      phase: document.getElementById('phase')?.textContent || '',
    }))()`);
    const enemyBadges = await badges(pageSocket, plan.source, plan.friend);
    recordCore("enemy fortify is rejected", enemy.target === "" && enemy.status.length > 0 && enemy.phase.includes("may move armies once") && enemyBadges.source === before.source, enemy.status, "src/ui/map.ts and src/ui/turn.ts");
    if (plan.disconnected) {
      await click(pageSocket, `[data-county-id="${plan.source}"]`);
      await click(pageSocket, `[data-county-id="${plan.disconnected}"]`);
      await click(pageSocket, ".fortify-move");
      const blocked = await evalJson(pageSocket, `(() => ({
        target: document.querySelector('.is-target')?.getAttribute('data-county-id') || '',
        status: document.getElementById('error-status')?.textContent || '',
        phase: document.getElementById('phase')?.textContent || '',
      }))()`);
      const blockedBadges = await badges(pageSocket, plan.source, plan.friend);
      recordCore("disconnected fortify is rejected", blocked.target === "" && blocked.status.length > 0 && blocked.phase.includes("may move armies once") && blockedBadges.source === before.source, blocked.status, "src/ui/map.ts and src/ui/turn.ts");
    } else {
      unchecked.push("This deal had no disconnected friendly county, so that rejection was not observed.");
    }
    await click(pageSocket, `[data-county-id="${plan.source}"]`);
    await click(pageSocket, `[data-county-id="${plan.friend}"]`);
    const aimed = await evalJson(pageSocket, "document.querySelector('.is-target')?.getAttribute('data-county-id') || ''");
    const sourceBefore = Number(before.source);
    const friendBefore = Number(before.friend);
    await click(pageSocket, ".fortify-move");
    await waitUntil(pageSocket, "!(document.getElementById('phase')?.textContent || '').includes('may move armies once')");
    const after = await badges(pageSocket, plan.source, plan.friend);
    recordCore("fortify moves exactly one army", aimed === plan.friend && Number(after.source) === sourceBefore - 1 && Number(after.friend) === friendBefore + 1, `${before.source}->${after.source}, ${before.friend}->${after.friend}`, "src/ui/turn.ts");
    const handoff = await evalJson(pageSocket, "document.querySelector('#handoff-dialog p')?.textContent || ''");
    recordCore("human handoff is shown", handoff.includes("Bo"), handoff, "src/ui/turn.ts");
    await click(pageSocket, ".handoff-ready");
    await waitUntil(pageSocket, "document.getElementById('quiz-dialog')?.hidden === false");
    await click(pageSocket, "#skip-quiz");
    await waitUntil(pageSocket, "(document.getElementById('quiz-result')?.textContent || '').includes('0 armies')");
    const skipped = await evalJson(pageSocket, "document.getElementById('reinforcement-count')?.textContent || ''");
    recordCore("skip scores 0", String(skipped).includes("question 0"), String(skipped), "src/ui/quiz-dialog.ts");
    await pageSocket.send("Page.reload", { ignoreCache: true });
    await waitUntil(pageSocket, "document.readyState === 'complete' && document.getElementById('continue-game')");
    await click(pageSocket, "#continue-game");
    await waitUntil(pageSocket, "document.querySelectorAll('#map [data-owner]').length === 92");
    recordCore("continue restores the saved deal", true, "92 owned counties restored", "src/ui/setup.ts");
    const focusMoved = await evalJson(pageSocket, `(() => {
      const map = document.getElementById('map');
      map.focus();
      const before = document.activeElement?.id || '';
      map.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      const after = document.activeElement?.getAttribute('data-county-id') || '';
      const ring = getComputedStyle(document.getElementById('start-game')).outlineStyle;
      return { before, after, ring };
    })()`);
    recordOptional("keyboard county focus", Boolean(focusMoved.after) && focusMoved.after !== focusMoved.before, JSON.stringify(focusMoved), "src/ui/map.ts");
    await pageSocket.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    const motion = await evalJson(pageSocket, "getComputedStyle(document.getElementById('start-game')).transitionDuration");
    recordOptional("reduced motion shortens transitions", motion === "0.00001s" || motion === "0s" || motion === "1e-05s", String(motion), "src/styles.css");
  }
}

function findAnswer(prompt) {
  for (const list of Object.values(quiz.counties)) {
    for (const question of list) {
      if (question.prompt === prompt) return question.correctAnswer;
    }
  }
  return "";
}

function recordCore(name, ok, detail, owner) {
  core.push({ name, ok: Boolean(ok), detail, owner });
}

function recordOptional(name, ok, detail, owner) {
  optional.push({ name, ok: Boolean(ok), detail, owner });
}

async function badges(page, source, friend) {
  return evalJson(page, `(() => ({
    source: document.querySelector('[data-county-id="${source}"] .army-badge-count')?.textContent || '',
    friend: document.querySelector('[data-county-id="${friend}"] .army-badge-count')?.textContent || '',
  }))()`);
}

async function click(page, selector) {
  const box = await evalJson(page, `(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    if (!node) return null;
    node.scrollIntoView({ block: 'center', inline: 'nearest' });
    const rect = node.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + Math.min(rect.height / 2, 20) };
  })()`);
  if (!box) throw new Error(`missing ${selector}`);
  await mouse(page, box.x, box.y);
}

async function mouse(page, x, y) {
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
}

async function type(page, selector, text) {
  await click(page, selector);
  await page.send("Input.insertText", { text });
}

async function evalJson(page, expression) {
  const result = await page.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "evaluate failed");
  return result.result?.value;
}

async function waitUntil(page, expression) {
  const started = Date.now();
  while (Date.now() - started < 8000) {
    const value = await evalJson(page, expression);
    if (value) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`timed out waiting for ${expression}`);
}

let nextCdpId = 0;

class Cdp {
  constructor(socket, sessionId) {
    this.socket = socket;
    this.sessionId = sessionId;
    this.pending = new Map();
    this.listeners = new Map();
    if (!socket.__btt18) {
      socket.__btt18 = new Set();
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        for (const client of socket.__btt18) client.receive(message);
      });
    }
    socket.__btt18.add(this);
  }
  receive(message) {
    if (message.id && this.pending.has(message.id)) {
      const waiting = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) waiting.reject(new Error(message.error.message));
      else waiting.resolve(message.result || {});
      return;
    }
    if (this.sessionId && message.sessionId && message.sessionId !== this.sessionId) return;
    const hooks = this.listeners.get(message.method) || [];
    for (const hook of hooks) hook(message.params || {});
  }
  send(method, params = {}) {
    const id = ++nextCdpId;
    const payload = { id, method, params };
    if (this.sessionId) payload.sessionId = this.sessionId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`timed out ${method}`));
      }, 10000);
      this.pending.set(id, {
        resolve(value) {
          clearTimeout(timer);
          resolve(value);
        },
        reject(error) {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.socket.send(JSON.stringify(payload));
    });
  }
  on(method, hook) {
    const hooks = this.listeners.get(method) || [];
    hooks.push(hook);
    this.listeners.set(method, hooks);
  }
}

function socketOpen(socket) {
  return new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
}

async function waitFor(url, timeout) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  throw new Error(`timed out waiting for ${url}`);
}

await main();
