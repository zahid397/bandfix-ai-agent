import type { DebugSession } from "./bandfix-types";

const KEY = "bandfix.sessions.v1";

function read(): DebugSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DebugSession[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(sessions: DebugSession[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(sessions.slice(0, 50)));
}

export const sessionsStore = {
  list(): DebugSession[] {
    return read().sort((a, b) => b.createdAt - a.createdAt);
  },
  get(id: string): DebugSession | undefined {
    return read().find((s) => s.id === id);
  },
  upsert(session: DebugSession): void {
    const all = read().filter((s) => s.id !== session.id);
    all.unshift(session);
    write(all);
  },
  remove(id: string): void {
    write(read().filter((s) => s.id !== id));
  },
  clear(): void {
    write([]);
  },
};
