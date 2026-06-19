import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Bug, ChevronRight, Loader2, Play, Square, Terminal as TermIcon, Trash2 } from "lucide-react";

import type { SessionInput, StreamEvent } from "@/lib/bandfix-types";
import { AGENTS } from "@/lib/bandfix-types";
import { sessionsStore } from "@/lib/sessions-store";

export const Route = createFileRoute("/_shell/cpp-terminal")({
  head: () => ({ meta: [{ title: "C++ Debug Terminal — BandFix AI" }] }),
  component: CppTerminalPage,
});

type Line = { kind: "sys" | "stdout" | "stderr" | "agent" | "prompt" | "ok" | "warn"; text: string; ts: number };

const SNIPPETS: Array<{ id: string; label: string; code: string; error: string }> = [
  {
    id: "segfault",
    label: "Null pointer segfault",
    code: `#include <iostream>\nint main() {\n    int* p = nullptr;\n    *p = 42; // 💥\n    std::cout << *p << std::endl;\n    return 0;\n}`,
    error: "Segmentation fault (core dumped)",
  },
  {
    id: "overflow",
    label: "Stack buffer overflow",
    code: `#include <iostream>\nint main() {\n    int arr[5];\n    for (int i = 0; i <= 5; ++i) arr[i] = i;\n    std::cout << arr[5] << std::endl;\n    return 0;\n}`,
    error: "ASAN: stack-buffer-overflow at offset 20",
  },
  {
    id: "uaf",
    label: "Use-after-free",
    code: `#include <iostream>\nint main() {\n    int* x = new int(7);\n    delete x;\n    std::cout << *x << std::endl;\n    return 0;\n}`,
    error: "AddressSanitizer: heap-use-after-free",
  },
  {
    id: "leak",
    label: "Memory leak",
    code: `#include <iostream>\nint main() {\n    for (int i = 0; i < 1000; ++i) {\n        int* b = new int[1024];\n        b[0] = i;\n    }\n    return 0;\n}`,
    error: "valgrind: definitely lost: 4,096,000 bytes",
  },
];

function CppTerminalPage() {
  const navigate = useNavigate();
  const [code, setCode] = useState(SNIPPETS[0].code);
  const [error, setError] = useState(SNIPPETS[0].error);
  const [lines, setLines] = useState<Line[]>([
    { kind: "sys", text: "BandFix g++ debug terminal v1.0 — type `:debug` or hit Run", ts: Date.now() },
    { kind: "sys", text: "Loaded toolchain: g++ 13.2 · gdb 14.1 · valgrind 3.22 · ASAN", ts: Date.now() },
  ]);
  const [running, setRunning] = useState(false);
  const [cmd, setCmd] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lines.length]);

  function push(kind: Line["kind"], text: string) {
    setLines((l) => [...l, { kind, text, ts: Date.now() }]);
  }

  function loadSnippet(id: string) {
    const s = SNIPPETS.find((x) => x.id === id);
    if (!s) return;
    setCode(s.code);
    setError(s.error);
    push("sys", `$ load ${s.id}.cpp  →  ${s.label}`);
  }

  async function runDebug() {
    if (running) return;
    setRunning(true);
    push("prompt", "$ g++ -g -fsanitize=address bug.cpp -o bug && ./bug");
    push("stderr", error);
    push("sys", "Dispatching multi-agent squadron over Band bus…");

    const input: SessionInput = {
      title: "C++ debug terminal run",
      language: "cpp",
      code,
      error,
    };

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
        push("stderr", `stream failed: ${res.status}`);
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
      if ((e as Error).name !== "AbortError") push("stderr", (e as Error).message);
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  function handleEvent(ev: StreamEvent) {
    if (ev.kind === "agent-status") {
      const a = AGENTS.find((x) => x.id === ev.agent);
      const name = a?.name ?? ev.agent;
      if (ev.status === "thinking" || ev.status === "working") push("agent", `[${name}] running…`);
      else if (ev.status === "complete") push("ok", `[${name}] done ✓`);
      else if (ev.status === "failed") push("stderr", `[${name}] failed`);
    } else if (ev.kind === "message") {
      const m = ev.message;
      const agent = AGENTS.find((a) => a.id === m.from)?.name ?? m.from;
      push("agent", `#${m.channel}  ${agent}: ${m.text}`);
    } else if (ev.kind === "done") {
      sessionsStore.upsert(ev.session);
      push("ok", `session ${ev.session.id} complete — opening report…`);
      setTimeout(() => navigate({ to: "/result/$id", params: { id: ev.session.id } }), 1200);
    } else if (ev.kind === "error") {
      push("stderr", ev.error);
    }
  }

  function stop() {
    abortRef.current?.abort();
    push("warn", "^C terminated by user");
    setRunning(false);
  }

  function submitCmd(e: React.FormEvent) {
    e.preventDefault();
    const c = cmd.trim();
    if (!c) return;
    push("prompt", `gdb> ${c}`);
    setCmd("");
    if (c === ":debug" || c === "run" || c === "r") runDebug();
    else if (c === "clear" || c === ":clear") setLines([]);
    else if (c === "help" || c === ":help")
      push("sys", "commands: run | :debug | clear | snippets | quit");
    else if (c === "snippets") SNIPPETS.forEach((s) => push("sys", `  ${s.id.padEnd(10)} ${s.label}`));
    else if (c === "quit" || c === "exit") push("warn", "use Ctrl-D to detach (no-op in web)");
    else push("stderr", `unknown command: ${c}  (try :help)`);
  }

  const toneClass = (k: Line["kind"]) =>
    k === "stderr" ? "text-red-400"
    : k === "stdout" ? "text-foreground"
    : k === "agent" ? "text-primary"
    : k === "ok" ? "text-success"
    : k === "warn" ? "text-amber-400"
    : k === "prompt" ? "text-blue-400"
    : "text-muted-foreground";

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <TermIcon className="size-3 text-primary" /> C++ Debug Terminal · powered by BandFix agents
      </div>
      <h1 className="mt-2 text-3xl md:text-4xl font-bold tracking-tight">
        gdb meets <span className="gradient-text">multi-agent AI</span>
      </h1>
      <p className="mt-2 text-muted-foreground">
        Load a buggy C++ snippet, hit Run, and watch the squadron diagnose segfaults, leaks, and UB in real time.
      </p>

      <div className="mt-6 grid lg:grid-cols-5 gap-4">
        {/* Left: source editor */}
        <div className="lg:col-span-2 glass rounded-2xl p-4 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Bug className="size-4 text-primary" /> bug.cpp
            </div>
            <select
              onChange={(e) => loadSnippet(e.target.value)}
              className="rounded-md bg-surface border border-border text-xs px-2 py-1"
              defaultValue={SNIPPETS[0].id}
            >
              {SNIPPETS.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            spellCheck={false}
            className="flex-1 min-h-[260px] rounded-lg bg-black/60 border border-border px-3 py-2 font-mono text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/60"
          />
          <label className="text-[11px] mt-3 text-muted-foreground font-semibold">Observed runtime error</label>
          <textarea
            value={error}
            onChange={(e) => setError(e.target.value)}
            spellCheck={false}
            className="mt-1 h-20 rounded-lg bg-black/60 border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-primary/60"
          />
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={runDebug}
              disabled={running}
              className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold inline-flex items-center gap-2"
            >
              {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              {running ? "Debugging…" : "Run + Debug"}
            </button>
            <button
              onClick={stop}
              disabled={!running}
              className="rounded-lg border border-border bg-surface hover:bg-white/5 px-3 py-2 text-sm inline-flex items-center gap-2 disabled:opacity-40"
            >
              <Square className="size-4" /> Stop
            </button>
            <button
              onClick={() => setLines([])}
              className="rounded-lg border border-border bg-surface hover:bg-white/5 px-3 py-2 text-sm inline-flex items-center gap-2 ml-auto"
            >
              <Trash2 className="size-4" /> Clear
            </button>
          </div>
        </div>

        {/* Right: terminal */}
        <div className="lg:col-span-3 rounded-2xl overflow-hidden border border-border bg-black flex flex-col shadow-[0_0_60px_-20px_rgba(168,85,247,0.5)]">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-black/80">
            <div className="flex gap-1.5">
              <span className="size-2.5 rounded-full bg-red-500/80" />
              <span className="size-2.5 rounded-full bg-amber-400/80" />
              <span className="size-2.5 rounded-full bg-emerald-500/80" />
            </div>
            <div className="text-[11px] text-muted-foreground font-mono ml-2">bandfix@gdb · ~/debug</div>
            <div className="ml-auto flex items-center gap-1.5 text-[10px] font-mono">
              <span className={`inline-block size-1.5 rounded-full ${running ? "bg-amber-400 animate-pulse" : "bg-success"}`} />
              <span className="text-muted-foreground">{running ? "running" : "idle"}</span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 font-mono text-[12px] leading-relaxed min-h-[420px] max-h-[60vh]">
            {lines.map((l, i) => (
              <div key={i} className={`whitespace-pre-wrap break-words ${toneClass(l.kind)}`}>
                <span className="text-muted-foreground/60 mr-2">{new Date(l.ts).toLocaleTimeString(undefined, { hour12: false })}</span>
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
              placeholder="type :debug, run, snippets, clear, :help"
              className="flex-1 bg-transparent outline-none font-mono text-xs text-foreground placeholder:text-muted-foreground/60"
            />
            <span className="text-[10px] text-muted-foreground font-mono">↵</span>
          </form>
        </div>
      </div>

      <div className="mt-6 text-xs text-muted-foreground">
        Tip: open <Link to="/band-logs" className="text-primary hover:underline">Band Logs</Link> to inspect every channel message produced by this run.
      </div>
    </div>
  );
}
