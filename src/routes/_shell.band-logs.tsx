import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import type { BandMessage, DebugSession } from "@/lib/bandfix-types";
import { sessionsStore } from "@/lib/sessions-store";

const CHANNELS = ["#new-session", "#bug-report", "#fix-proposal", "#review-result", "#session-complete"] as const;

export const Route = createFileRoute("/_shell/band-logs")({
  head: () => ({ meta: [{ title: "Band Logs — BandFix AI" }] }),
  component: BandLogsPage,
});

function BandLogsPage() {
  const [sessions, setSessions] = useState<DebugSession[]>([]);
  const [channel, setChannel] = useState<string>("all");

  useEffect(() => { setSessions(sessionsStore.list()); }, []);

  const allMessages: Array<BandMessage & { _sessionTitle: string }> = useMemo(() => {
    const flat: Array<BandMessage & { _sessionTitle: string }> = [];
    for (const s of sessions) {
      for (const m of s.messages) flat.push({ ...m, _sessionTitle: s.input.title });
    }
    return flat.sort((a, b) => b.timestamp - a.timestamp);
  }, [sessions]);

  const filtered = channel === "all" ? allMessages : allMessages.filter((m) => m.channel === channel);

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Band Logs</h1>
      <p className="text-muted-foreground text-sm mt-1">
        Every message published on the in-memory Band bus across all squadron runs.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        <FilterButton active={channel === "all"} onClick={() => setChannel("all")}>All</FilterButton>
        {CHANNELS.map((c) => (
          <FilterButton key={c} active={channel === c} onClick={() => setChannel(c)}>{c}</FilterButton>
        ))}
      </div>

      <div className="mt-6 glass rounded-2xl divide-y divide-border overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground text-sm">
            No messages yet — run a squadron to populate the bus.
          </div>
        ) : filtered.map((m) => (
          <div key={m.id} className="p-4 hover:bg-white/[0.02]">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono text-primary">{m.channel}</span>
              <span>·</span>
              <span>{m.from}{m.to ? ` → ${m.to}` : ""}</span>
              <span className="ml-auto">{new Date(m.timestamp).toLocaleString()}</span>
            </div>
            <div className="text-sm mt-1">{m.text}</div>
            <div className="text-xs text-muted-foreground mt-1 italic">on “{m._sessionTitle}”</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={[
        "rounded-full px-3 py-1.5 text-xs font-mono border transition",
        active
          ? "bg-gradient-soft border-primary/40 text-foreground glow-border"
          : "border-border text-muted-foreground hover:text-foreground hover:bg-white/5",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
