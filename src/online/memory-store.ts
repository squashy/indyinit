export type OnlineStatus = "lobby" | "active" | "over";

export interface SeatSlot {
  readonly name: string;
  readonly tokenHash: string;
}

export interface OnlineDocument {
  readonly id: string;
  readonly version: number;
  readonly status: OnlineStatus;
  readonly seatCount: number;
  readonly seats: readonly (SeatSlot | null)[];
  readonly inviteHash: string;
  readonly seed: string;
}

export interface OnlineStore {
  ping(): Promise<boolean>;
  read(id: string): Promise<OnlineDocument | null>;
  create(doc: OnlineDocument): Promise<"ok" | "exists">;
  commit(id: string, expectedVersion: number, next: OnlineDocument): Promise<"ok" | "mismatch" | "missing">;
}

export class MemoryStore implements OnlineStore {
  private readonly docs = new Map<string, OnlineDocument>();

  async ping(): Promise<boolean> {
    return true;
  }

  async read(id: string): Promise<OnlineDocument | null> {
    return this.docs.get(id) ?? null;
  }

  async create(doc: OnlineDocument): Promise<"ok" | "exists"> {
    if (this.docs.has(doc.id)) return "exists";
    this.docs.set(doc.id, doc);
    return "ok";
  }

  async commit(id: string, expectedVersion: number, next: OnlineDocument): Promise<"ok" | "mismatch" | "missing"> {
    const current = this.docs.get(id);
    if (!current) return "missing";
    if (current.version !== expectedVersion) return "mismatch";
    this.docs.set(id, next);
    return "ok";
  }
}
