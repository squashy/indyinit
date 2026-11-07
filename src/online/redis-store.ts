import type { OnlineDocument, OnlineStore } from "./memory-store.ts";

const TTL_SECONDS = 60 * 60 * 24 * 7;

const COMMIT_SCRIPT = `
local raw = redis.call("GET", KEYS[1])
if not raw then return "missing" end
local doc = cjson.decode(raw)
if tonumber(doc.version) ~= tonumber(ARGV[1]) then return "mismatch" end
redis.call("SET", KEYS[1], ARGV[2], "EX", ARGV[3])
return "ok"
`;

export function openConfiguredStore(env: Readonly<Record<string, string | undefined>>): OnlineStore | null {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (typeof url !== "string" || url.length === 0) return null;
  if (typeof token !== "string" || token.length === 0) return null;
  return new UpstashRestStore(url, token);
}

class UpstashRestStore implements OnlineStore {
  private readonly url: string;
  private readonly token: string;

  constructor(url: string, token: string) {
    this.url = url;
    this.token = token;
  }

  async ping(): Promise<boolean> {
    return (await this.command(["PING"])) === "PONG";
  }

  async read(id: string): Promise<OnlineDocument | null> {
    const raw = await this.command(["GET", keyFor(id)]);
    if (typeof raw !== "string") return null;
    try {
      const parsed = JSON.parse(raw) as OnlineDocument;
      if (parsed.id !== id || !Array.isArray(parsed.seats)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  async create(doc: OnlineDocument): Promise<"ok" | "exists"> {
    const written = await this.command(["SET", keyFor(doc.id), JSON.stringify(doc), "EX", String(TTL_SECONDS), "NX"]);
    return written === "OK" ? "ok" : "exists";
  }

  async commit(id: string, expectedVersion: number, next: OnlineDocument): Promise<"ok" | "mismatch" | "missing"> {
    const result = await this.command(["EVAL", COMMIT_SCRIPT, "1", keyFor(id), String(expectedVersion), JSON.stringify(next), String(TTL_SECONDS)]);
    if (result === "ok" || result === "mismatch" || result === "missing") return result;
    return "mismatch";
  }

  private async command(command: readonly string[]): Promise<unknown> {
    try {
      const response = await fetch(this.url, {
        method: "POST",
        headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
        body: JSON.stringify(command),
      });
      if (!response.ok) return null;
      const payload = await response.json() as { result?: unknown };
      return payload.result ?? null;
    } catch {
      return null;
    }
  }
}

function keyFor(id: string): string {
  return `battle-for-the-92:game:${id}`;
}
