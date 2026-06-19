import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ChevronRight,
  Loader2,
  Play,
  Radio,
  RotateCcw,
  Sparkles,
  Square,
  Terminal as TermIcon,
  Trash2,
} from "lucide-react";

import type { AgentId, AgentStatus, SessionInput, StreamEvent } from "@/lib/bandfix-types";
import { AGENTS } from "@/lib/bandfix-types";
import { sessionsStore } from "@/lib/sessions-store";

export const Route = createFileRoute("/_shell/agents")({
  head: () => ({ meta: [{ title: "Agents Control Center — BandFix AI" }] }),
  component: AgentsControlCenter,
});

const DETAILS: Record<AgentId, { responsibilities: string[]; channels: string[] }> = {
  orchestrator: {
    responsibilities: [
      "Announce sessions on #new-session",
      "Dispatch agents in order",
      "Loop revisions back to Fix Generator",
    ],
    channels: ["#new-session", "#session-complete"],
  },
  "bug-finder": {
    responsibilities: ["Read code + stack trace", "Identify root cause + severity", "Publish #bug-report"],
    channels: ["#bug-report"],
  },
  "fix-generator": {
    responsibilities: ["Consume bug report", "Produce corrected source", "Publish #fix-proposal"],
    channels: ["#fix-proposal"],
  },
  reviewer: {
    responsibilities: ["Audit security + performance", "Score 0–100", "Approve or request revision"],
    channels: ["#review-result"],
  },
};

const DEMO_INPUT: SessionInput = {
  title: "Demo: async race condition",
  language: "javascript",
  code: `async function fetchAll(urls) {\n  const results = [];\n  urls.forEach(async (u) => {\n    const r = await fetch(u);\n    results.push(await r.json());\n  });\n  return results; // 🐛 returns before pushes complete\n}`,
  error: "fetchAll() returns [] even when network succeeds",
};

type Line = { kind: "sys" | "agent" | "ok" | "warn" | "err" | "prompt" | "info"; text: string; ts: number };

function AgentsControlCenter() {
  const navigate = useNavigate();
  const [statuses, setStatuses] = useState<Record<AgentId, AgentStatus>>({
    orchestrator: "idle",
    "bug-finder": "idle",
    "fix-generator": "idle",
    reviewer: "idle",
  });
  const [running, setRunning] = useState(false);
  const [liveMode, setLiveMode] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([
    { kind: "sys", text: "bandfix-cli v1.0 — type `bandfix run` or click Run Full Pipeline", ts: Date.now() },
    { kind: "sys", text: "Band bus online · 5 channels active · in-memory transport", ts: Date.now() },
  ]);
  const [cmd, setCmd] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lines.length]);

  function push(kind: Line["kind"], text: string) {
    setLines((l) => [...l, { kind, text, ts: Date.now() }]);
  }

  function resetAgents() {
    setStatuses({ orchestrator: "idle", "bug-finder": "idle", "fix-generator": "idle", reviewer: "idle" });
    setSessionId(null);
    push("warn", "all agents reset → idle");
  }

  function clearTerminal() {
    setLines([]);
  }

  async function runPipeline(input: SessionInput = DEMO_INPUT, label = "demo pipeline") {
    if (running) return;
    setRunning(true);
    setStatuses({ orchestrator: "thinking", "bug-finder": "idle", "fix-generator": "idle", reviewer: "idle" });
    push("prompt", `$ bandfix run --task "${label}"`);
    push("info", `lang=${input.language} · channels=#new-session,#bug-report,#fix-proposal,#review-result`);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        push("err", `stream failed: HTTP ${res.status}`);
        setRunning(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const chunks = buf.split("\n\n");
        buf = chunks.pop() ?? "";
        for (const chunk of chunks) {
          if (!chunk.startsWith("data:")) continue;
          try {
            const ev = JSON.parse(chunk.slice(5).trim()) as StreamEvent;
            handleEvent(ev);
          } catch {}
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") push("err", (e as Error).message);
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  function handleEvent(ev: StreamEvent) {
    if (ev.kind === "session") {
      setSessionId(ev.sessionId);
      push("ok", `session ${ev.sessionId} started @ ${new Date(ev.startedAt).toLocaleTimeString()}`);
    } else if (ev.kind === "agent-status") {
      setStatuses((s) => ({ ...s, [ev.agent]: ev.status }));
      const name = AGENTS.find((a) => a.id === ev.agent)?.name ?? ev.agent;
      if (ev.status === "thinking" || ev.status === "working") push("agent", `[${name}] ${ev.status}…`);
      else if (ev.status === "complete") push("ok", `[${name}] complete ✓`);
      else if (ev.status === "failed") push("err", `[${name}] failed`);
    } else if (ev.kind === "message") {
      if (!liveMode) return;
      const m = ev.message;
      const agent = AGENTS.find((a) => a.id === m.from)?.name ?? m.from;
      push("agent", `${m.channel}  ${agent} → ${m.to ?? "all"}: ${m.text}`);
    } else if (ev.kind === "done") {
      sessionsStore.upsert(ev.session);
      push("ok", `pipeline complete · score ${ev.session.review?.score ?? "—"}/100 · ${ev.session.durationMs}ms`);
      push("info", `→ open report: /result/${ev.session.id}`);
    } else if (ev.kind === "error") {
      push("err", ev.error);
    }
  }

  function stop() {
    abortRef.current?.abort();
    push("warn", "^C terminated by user");
    setRunning(false);
  }

  function runIndividual(agentId: AgentId) {
    push("info", `solo run requested for ${agentId} — orchestrator will sequence the full pipeline (agents share state via Band).`);
    runPipeline(DEMO_INPUT, `${agentId} focus`);
  }

  function submitCmd(e: React.FormEvent) {
    e.preventDefault();
    const c = cmd.trim();
    if (!c) return;
    push("prompt", `bandfix> ${c}`);
    setCmd("");
    const [head, ...rest] = c.split(/\s+/);
    if (head === "bandfix" && rest[0] === "run") runPipeline();
    else if (head === "bandfix" && rest[0] === "status") {
      AGENTS.forEach((a) => push("info", `  ${a.name.padEnd(16)} ${statuses[a.id]}`));
      push("info", `  session: ${sessionId ?? "—"}`);
    } else if (head === "bandfix" && rest[0] === "reset") resetAgents();
    else if (head === "bandfix" && rest[0] === "debug") {
      const file = rest[1] || "snippet";
      runPipeline({ ...DEMO_INPUT, title: `debug ${file}` }, `debug ${file}`);
    } else if (head === "open" && rest[0] === "report" && sessionId) {
      navigate({ to: "/result/$id", params: { id: sessionId } });
    } else if (head === "clear" || head === ":clear") clearTerminal();
    else if (head === "help" || head === ":help")
      push("info", "commands: bandfix run | bandfix status | bandfix reset | bandfix debug <file> | open report | clear");
    else push("err", `unknown: ${c}  (try help)`);
  }

  const tone: Record<Line["kind"], string> = {
    sys: "text-muted-foreground",
    info: "text-muted-foreground",
    agent: "text-primary",
    ok: "text-emerald-400",
    warn: "text-amber-400",
    err: "text-red-400",
    prompt: "text-blue-400",
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="size-3 text-primary" /> Agents Control Center
          </div>
          <h1 className="mt-1 text-3xl md:text-4xl font-bold tracking-tight">
            The <span className="gradient-text">Squadron</span>, live
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Drive the full Band pipeline, monitor every agent, and command it from the terminal.
          </p>
        </div>

        {/* Global action bar */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => runPipeline()}
            disabled={running}
            className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold inline-flex items-center gap-2"
          >
            {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            {running ? "Running…" : "Run Full Pipeline"}
          </button>
          <button
            onClick={stop}
            disabled={!running}
            className="rounded-lg border border-border bg-surface hover:bg-white/5 px-3 py-2 text-sm inline-flex items-center gap-2 disabled:opacity-40"
          >
            <Square className="size-4" /> Stop
          </button>
          <button
            onClick={resetAgents}
            disabled={running}
            className="rounded-lg border border-border bg-surface hover:bg-white/5 px-3 py-2 text-sm inline-flex items-center gap-2 disabled:opacity-40"
          >
            <RotateCcw className="size-4" /> Reset
          </button>
          <button
            onClick={() => setLiveMode((v) => !v)}
            className={[
              "rounded-lg border px-3 py-2 text-sm inline-flex items-center gap-2 transition",
              liveMode
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : "border-border bg-surface text-muted-foreground hover:bg-white/5",
            ].join(" ")}
          >
            <Radio className={`size-4 ${liveMode ? "animate-pulse" : ""}`} />
            Live Mode {liveMode ? "ON" : "OFF"}
          </button>
        </div>
      </div>

      {/* 2x2 grid */}
      <div className="mt-6 grid md:grid-cols-2 gap-4">
        {AGENTS.map((a) => {
          const s = statuses[a.id];
          const active = s === "thinking" || s === "working";
          const done = s === "complete";
          const failed = s === "failed";
          return (
            <div
              key={a.id}
              className={[
                "relative glass rounded-2xl p-5 transition overflow-hidden",
                active && "ring-2 ring-primary/60 shadow-[0_0_40px_-10px_rgba(168,85,247,0.7)]",
                done && "border-emerald-500/40",
                failed && "border-red-500/50",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {active && (
                <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary via-blue-500 to-primary animate-[shimmer_1.5s_linear_infinite] bg-[length:200%_100%]" />
              )}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="text-3xl">{a.emoji}</div>
                  <div>
                    <div className="font-semibold text-lg">{a.name}</div>
                    <div className="text-xs text-muted-foreground">{a.role}</div>
                  </div>
                </div>
                <StatusPill status={s} />
              </div>

              <div className="mt-4 text-[11px] font-mono flex flex-wrap gap-1.5">
                {DETAILS[a.id].channels.map((c) => (
                  <span key={c} className="rounded-full px-2 py-0.5 bg-primary/15 text-primary border border-primary/30">
                    {c}
                  </span>
                ))}
              </div>
              <ul className="mt-3 space-y-1 text-xs text-muted-foreground list-disc pl-5">
                {DETAILS[a.id].responsibilities.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>

              {/* progress bar */}
              <div className="mt-4 h-1 rounded-full bg-white/5 overflow-hidden">
                <div
                  className={[
                    "h-full transition-all duration-500",
                    done
                      ? "w-full bg-emerald-500"
                      : active
                        ? "w-2/3 bg-gradient-to-r from-primary to-blue-500 animate-pulse"
                        : failed
                          ? "w-full bg-red-500"
                          : "w-0",
                  ].join(" ")}
                />
              </div>

              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => runIndividual(a.id)}
                  disabled={running}
                  className="text-xs rounded-md border border-border bg-surface hover:bg-white/5 px-2.5 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-40"
                >
                  <Play className="size-3" /> Run via pipeline
                </button>
                {sessionId && done && (
                  <Link
                    to="/result/$id"
                    params={{ id: sessionId }}
                    className="text-xs rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 px-2.5 py-1.5"
                  >
                    View report →
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Integrated Terminal */}
      <div className="mt-6 rounded-2xl overflow-hidden border border-border bg-black flex flex-col shadow-[0_0_60px_-20px_rgba(168,85,247,0.5)]">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-black/80">
          <div className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-red-500/80" />
            <span className="size-2.5 rounded-full bg-amber-400/80" />
            <span className="size-2.5 rounded-full bg-emerald-500/80" />
          </div>
          <div className="text-[11px] text-muted-foreground font-mono ml-2 flex items-center gap-1.5">
            <TermIcon className="size-3" /> bandfix@control · ~/squadron
          </div>
          <div className="ml-auto flex items-center gap-1.5 text-[10px] font-mono">
            <span className={`inline-block size-1.5 rounded-full ${running ? "bg-amber-400 animate-pulse" : "bg-emerald-500"}`} />
            <span className="text-muted-foreground">{running ? "running" : "idle"}</span>
            <button
              onClick={clearTerminal}
              className="ml-3 text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              title="Clear terminal"
            >
              <Trash2 className="size-3" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 font-mono text-[12px] leading-relaxed min-h-[280px] max-h-[50vh]">
          {lines.map((l, i) => (
            <div key={i} className={`whitespace-pre-wrap break-words ${tone[l.kind]}`}>
              <span className="text-muted-foreground/60 mr-2">
                {new Date(l.ts).toLocaleTimeString(undefined, { hour12: false })}
              </span>
              {l.text}
            </div>
          ))}
          <div ref={endRef} />
        </div>
        <form onSubmit={submitCmd} className="flex items-center gap-2 px-3 py-2 border-t border-border bg-black/80">
          <ChevronRight className="size-3.5 text-primary" />
          <input
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
            placeholder="try: bandfix run · bandfix status · bandfix debug auth.ts · open report · help"
            className="flex-1 bg-transparent outline-none font-mono text-xs text-foreground placeholder:text-muted-foreground/60"
          />
          <span className="text-[10px] text-muted-foreground font-mono">↵</span>
        </form>
      </div>

      <div className="mt-4 text-xs text-muted-foreground flex flex-wrap gap-4">
        <Link to="/band-logs" className="hover:text-foreground">Open Band Logs →</Link>
        <Link to="/create" className="hover:text-foreground">Create custom task →</Link>
        <Link to="/history" className="hover:text-foreground">Session history →</Link>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: AgentStatus }) {
  const map: Record<AgentStatus, { label: string; cls: string }> = {
    idle: { label: "queued", cls: "bg-white/5 text-muted-foreground border-border" },
    thinking: { label: "thinking", cls: "bg-amber-500/15 text-amber-300 border-amber-500/40" },
    working: { label: "running", cls: "bg-blue-500/15 text-blue-300 border-blue-500/40" },
    complete: { label: "done", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" },
    failed: { label: "failed", cls: "bg-red-500/15 text-red-300 border-red-500/40" },
  };
  const m = map[status];
  const spin = status === "thinking" || status === "working";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-mono ${m.cls}`}>
      {spin && <Loader2 className="size-2.5 animate-spin" />}
      {m.label}
    </span>
  );
}
