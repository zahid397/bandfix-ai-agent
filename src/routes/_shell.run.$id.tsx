import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

import { AGENTS } from "@/lib/bandfix-types";
import type { AgentId, AgentStatus, BandMessage, DebugSession, SessionInput, StreamEvent } from "@/lib/bandfix-types";
import { sessionsStore } from "@/lib/sessions-store";

export const Route = createFileRoute("/_shell/run/$id")({
  head: () => ({ meta: [{ title: "Running Squadron — BandFix AI" }] }),
  component: RunPage,
});

function RunPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();

  const [messages, setMessages] = useState<BandMessage[]>([]);
  const [statuses, setStatuses] = useState<Record<AgentId, AgentStatus>>({
    orchestrator: "idle",
    "bug-finder": "idle",
    "fix-generator": "idle",
    reviewer: "idle",
  });
  const [done, setDone] = useState<DebugSession | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  // ── Stream driver ────────────────────────────────────────────────────────
  // StrictMode-safe: each mount starts its own stream and aborts it on cleanup.
  // A `cancelled` flag stops any state updates from an aborted run. We do NOT
  // use a "started" gate that blocks re-mounts — that was the original bug:
  // StrictMode aborted the first stream and then skipped starting a new one,
  // leaving every agent stuck on "queued" forever. In production there is a
  // single mount, so exactly one stream runs.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    // Reload of an already-finished run → show stored data, don't re-stream.
    const stored = sessionsStore.get(id);
    if (stored && stored.status !== "running") {
      setMessages(stored.messages);
      setDone(stored);
      setStatuses({
        orchestrator: "complete",
        "bug-finder": stored.bugReport ? "complete" : "failed",
        "fix-generator": stored.fix ? "complete" : "failed",
        reviewer: stored.review ? "complete" : "failed",
      });
      return;
    }

    let pending: SessionInput | null = null;
    try {
      const raw = window.sessionStorage.getItem(`bandfix.pending.${id}`);
      if (raw) pending = JSON.parse(raw) as SessionInput;
    } catch {
      /* ignore */
    }

    if (!pending) {
      setStreamError("This session has no pending input. Start a new run from Create Task.");
      return;
    }

    (async () => {
      try {
        const res = await fetch("/api/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pending),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          if (!cancelled) {
            setStreamError(
              res.status === 404
                ? "The /api/run endpoint isn't responding. Locally, start the app with `npm run dev` (the API is wired into Vite) or `vercel dev`. On Vercel, make sure the project deployed the api/ function."
                : `Stream failed (${res.status}).`,
            );
          }
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";

        while (true) {
          const { value, done: streamDone } = await reader.read();
          if (streamDone) break;
          buf += decoder.decode(value, { stream: true });

          // SSE events are separated by a blank line. Each block may also be a
          // ":" comment heartbeat, which has no "data:" line — skip those.
          const blocks = buf.split("\n\n");
          buf = blocks.pop() ?? "";
          for (const block of blocks) {
            const dataLine = block.split("\n").find((l) => l.startsWith("data:"));
            if (!dataLine) continue;
            const json = dataLine.slice(5).trim();
            if (!json) continue;
            try {
              const ev = JSON.parse(json) as StreamEvent;
              if (!cancelled) handleEvent(ev);
            } catch {
              /* ignore malformed chunk */
            }
          }
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        if (!cancelled) setStreamError((e as Error).message);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function handleEvent(ev: StreamEvent) {
    if (ev.kind === "message") {
      setMessages((prev) => [...prev, ev.message]);
    } else if (ev.kind === "agent-status") {
      setStatuses((prev) => ({ ...prev, [ev.agent]: ev.status }));
    } else if (ev.kind === "done") {
      setDone(ev.session);
      sessionsStore.upsert(ev.session);
      // Clear the pending input so a later refresh shows the stored result
      // instead of re-running the whole pipeline.
      try {
        window.sessionStorage.removeItem(`bandfix.pending.${id}`);
      } catch {
        /* ignore */
      }
      setTimeout(() => {
        navigate({ to: "/result/$id", params: { id: ev.session.id } });
      }, 900);
    } else if (ev.kind === "error") {
      setStreamError(ev.error);
    } else if (ev.kind === "session") {
      // session metadata — nothing to render directly
    }
  }

  const progress = useMemo(() => {
    const arr = Object.values(statuses);
    const completed = arr.filter((s) => s === "complete").length;
    return Math.round((completed / arr.length) * 100);
  }, [statuses]);

  const displayStatus = (s: AgentStatus): { label: string; tone: "queued" | "running" | "done" | "failed" } => {
    if (s === "complete") return { label: "done", tone: "done" };
    if (s === "failed") return { label: "failed", tone: "failed" };
    if (s === "thinking" || s === "working") return { label: "running", tone: "running" };
    return { label: "queued", tone: "queued" };
  };

  const startTs = messages[0]?.timestamp ?? null;
  const fmtClock = (ts: number) =>
    new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const fmtDelta = (ts: number) => {
    if (!startTs) return "+0.0s";
    const d = (ts - startTs) / 1000;
    return `+${d.toFixed(1)}s`;
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs text-muted-foreground">Session</div>
          <h1 className="text-2xl font-bold tracking-tight">
            {done ? "Squadron complete" : <span className="shimmer-text">Squadron in flight…</span>}
          </h1>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Progress</div>
          <div className="font-mono text-lg">{progress}%</div>
        </div>
      </div>

      <div className="mt-2 h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-purple-500 to-blue-500"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.4 }}
        />
      </div>

      {streamError && (
        <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {streamError} <Link to="/create" className="underline">Try again</Link>
        </div>
      )}

      <div className="mt-6 grid lg:grid-cols-2 gap-4">
        <div className="space-y-3">
          {AGENTS.map((a, idx) => {
            const s = statuses[a.id];
            const ds = displayStatus(s);
            const Icon = ds.tone === "done" ? CheckCircle2 : ds.tone === "failed" ? XCircle : Loader2;
            const spin = ds.tone === "running";
            const agentMsgs = messages.filter((m) => m.from === a.id);
            const firstTs = agentMsgs[0]?.timestamp;
            const lastTs = agentMsgs[agentMsgs.length - 1]?.timestamp;
            const elapsed = firstTs && lastTs && lastTs > firstTs ? ((lastTs - firstTs) / 1000).toFixed(1) + "s" : null;

            return (
              <motion.div key={a.id} layout className="glass rounded-2xl p-4 flex items-center gap-4">
                <div className="flex flex-col items-center justify-center w-8">
                  <div className="text-2xl leading-none">{a.emoji}</div>
                  <div className="mt-1 text-[10px] font-mono text-muted-foreground">#{idx + 1}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-semibold">{a.name}</div>
                    <code className="text-xs text-muted-foreground font-mono">{a.channel}</code>
                    {firstTs && (
                      <span className="text-[11px] font-mono text-muted-foreground">
                        started {fmtClock(firstTs)} ({fmtDelta(firstTs)})
                      </span>
                    )}
                    {elapsed && <span className="text-[11px] font-mono text-muted-foreground">· {elapsed}</span>}
                  </div>
                  <div className="text-sm text-muted-foreground truncate">{a.role}</div>
                </div>
                <div
                  className={[
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border uppercase tracking-wide",
                    ds.tone === "done" && "bg-success/15 text-success border-success/30",
                    ds.tone === "failed" && "bg-destructive/15 text-destructive border-destructive/30",
                    ds.tone === "running" && "bg-primary/15 text-primary border-primary/30",
                    ds.tone === "queued" && "bg-white/5 text-muted-foreground border-border",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <Icon className={`size-3.5 ${spin ? "animate-spin" : ""}`} />
                  {ds.label}
                </div>
              </motion.div>
            );
          })}
        </div>

        <div className="glass rounded-2xl p-4 flex flex-col h-[560px]">
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold">Band channel transcript</div>
            <div className="text-xs text-muted-foreground">{messages.length} msgs</div>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 pr-2">
            {messages.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-lg bg-black/30 border border-border p-3"
              >
                <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                  <span className="font-mono text-primary">{m.channel}</span>
                  <span>·</span>
                  <span>{m.from}{m.to ? ` → ${m.to}` : ""}</span>
                  <span className="ml-auto font-mono tabular-nums">{fmtClock(m.timestamp)}</span>
                  <span className="font-mono tabular-nums text-[11px] text-muted-foreground/70">{fmtDelta(m.timestamp)}</span>
                </div>
                <div className="text-sm mt-1">{m.text}</div>
              </motion.div>
            ))}
            {!messages.length && !streamError && (
              <div className="text-sm text-muted-foreground">
                <span className="shimmer-text">Connecting to Band bus…</span>
              </div>
            )}
            <div ref={logEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
