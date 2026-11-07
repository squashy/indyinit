export function sharePath(gameId: string): string {
  return `/g/${gameId}`;
}

export function publicShareUrl(origin: string, gameId: string): string {
  const base = origin.endsWith("/") ? origin.slice(0, -1) : origin;
  return `${base}${sharePath(gameId)}`;
}

export function seatStorageKey(gameId: string): string {
  return `battle-for-the-92.seat.${gameId}`;
}

export function gameIdFromPath(pathname: string): string | null {
  const match = /^\/g\/([A-Za-z0-9_-]+)$/.exec(pathname);
  return match?.[1] ?? null;
}
