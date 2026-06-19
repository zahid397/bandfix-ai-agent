import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";

import type { DebugSession } from "@/lib/bandfix-types";
import { sessionsStore } from "@/lib/sessions-store";

export const Route = createFileRoute("/_shell/history")({
  head: () => ({ meta: [{ title: "History — BandFix AI" }] }),
  component: HistoryPage,
});

function HistoryPage() {
  const [sessions, setSessions] = useState<DebugSession[]>([]);
  useEffect(() => { setSessions(sessionsStore.list()); }, []);

  function remove(id: string) {
    sessionsStore.remove(id);
    setSessions(sessionsStore.list());
  }

  function clearAll() {
    if (!confirm("Clear all stored sessions?")) return;
    sessionsStore.clear();
    setSessions([]);
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">History</h1>
          <p className="text-muted-foreground text-sm mt-1">All squadron runs stored locally on this device.</p>
        </div>
        {sessions.length > 0 && (
          <button onClick={clearAll} className="text-sm text-destructive hover:underline">Clear all</button>
        )}
      </div>

      {sessions.length === 0 ? (
        <div className="mt-12 glass rounded-2xl p-12 text-center">
          <p className="text-muted-foreground">No sessions yet.</p>
          <Link to="/create" className="btn-primary rounded-lg px-4 py-2 mt-4 inline-block">Run your first squadron</Link>
        </div>
      ) : (
        <div className="mt-6 space-y-2">
          {sessions.map((s) => (
            <div key={s.id} className="glass rounded-xl p-4 flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <Link to="/result/$id" params={{ id: s.id }} className="font-semibold hover:underline truncate block">
                  {s.input.title}
                </Link>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {new Date(s.createdAt).toLocaleString()} · {s.input.language} · {(s.durationMs / 1000).toFixed(1)}s · {s.messages.length} msgs
                </div>
              </div>
              <StatusBadge session={s} />
              <button onClick={() => remove(s.id)} className="text-muted-foreground hover:text-destructive p-2" aria-label="Delete">
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ session }: { session: DebugSession }) {
  if (session.status === "failed") {
    return <span className="text-xs rounded-full px-2 py-1 bg-destructive/15 text-destructive border border-destructive/30">failed</span>;
  }
  const score = session.review?.score;
  const approved = session.review?.status === "approved";
  return (
    <span className={`text-xs rounded-full px-2 py-1 border ${approved ? "bg-success/15 text-success border-success/30" : "bg-amber-500/15 text-amber-400 border-amber-500/30"}`}>
      {approved ? "approved" : "revision"} {score != null ? `· ${score}` : ""}
    </span>
  );
}
