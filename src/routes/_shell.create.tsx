import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, Play, Sparkles } from "lucide-react";

import type { SessionInput, StreamEvent } from "@/lib/bandfix-types";
import { sessionsStore } from "@/lib/sessions-store";

export const Route = createFileRoute("/_shell/create")({
  head: () => ({ meta: [{ title: "Create Task — BandFix AI" }] }),
  component: CreatePage,
});

const EXAMPLES: Array<{ label: string; language: string; code: string; error: string; title: string; tag?: string }> = [
  {
    label: "JS — undefined map",
    tag: "easy",
    title: "TypeError on user list",
    language: "javascript",
    code: `function renderUsers(users) {\n  return users.map(u => \`<li>\${u.name}</li>\`).join('');\n}\n\nrenderUsers(null);`,
    error: "TypeError: Cannot read properties of null (reading 'map')",
  },
  {
    label: "Python — off-by-one",
    tag: "easy",
    title: "Off-by-one in average",
    language: "python",
    code: `def average(nums):\n    total = 0\n    for i in range(1, len(nums)):\n        total += nums[i]\n    return total / len(nums)\n\nprint(average([10, 20, 30]))`,
    error: "Result is 16.66 but expected 20",
  },
  {
    label: "React — stale state",
    tag: "medium",
    title: "Stale counter in useEffect",
    language: "typescript",
    code: `import { useEffect, useState } from "react";\n\nexport function Counter() {\n  const [count, setCount] = useState(0);\n  useEffect(() => {\n    const id = setInterval(() => setCount(count + 1), 1000);\n    return () => clearInterval(id);\n  }, []);\n  return <div>{count}</div>;\n}`,
    error: "Counter freezes at 1 — stale closure suspected.",
  },
  {
    label: "C++ — segfault",
    tag: "hard",
    title: "Segfault on null pointer deref",
    language: "cpp",
    code: `#include <iostream>\nusing namespace std;\n\nint main() {\n    int* p = nullptr;\n    *p = 42;            // 💥 deref of nullptr\n    cout << *p << endl;\n    return 0;\n}`,
    error: "Segmentation fault (core dumped)",
  },
  {
    label: "C++ — buffer overflow",
    tag: "hard",
    title: "Stack buffer overflow in loop",
    language: "cpp",
    code: `#include <iostream>\nint main() {\n    int arr[5];\n    for (int i = 0; i <= 5; ++i) {\n        arr[i] = i * 2;     // writes past arr[4]\n    }\n    std::cout << arr[5] << std::endl;\n    return 0;\n}`,
    error: "ASAN: stack-buffer-overflow WRITE of size 4 at offset 20",
  },
  {
    label: "C++ — use-after-free",
    tag: "hard",
    title: "Dangling pointer after delete",
    language: "cpp",
    code: `#include <iostream>\nint main() {\n    int* x = new int(7);\n    delete x;\n    std::cout << *x << std::endl;  // use-after-free\n    return 0;\n}`,
    error: "AddressSanitizer: heap-use-after-free",
  },
  {
    label: "C++ — memory leak",
    tag: "medium",
    title: "Leaked allocation in loop",
    language: "cpp",
    code: `#include <iostream>\nvoid worker() {\n    for (int i = 0; i < 1000; ++i) {\n        int* buf = new int[1024]; // never freed\n        buf[0] = i;\n    }\n}\nint main() { worker(); return 0; }`,
    error: "valgrind: definitely lost: 4,096,000 bytes in 1,000 blocks",
  },
  {
    label: "Go — nil map write",
    tag: "medium",
    title: "Assignment to entry in nil map",
    language: "go",
    code: `package main\nimport "fmt"\nfunc main() {\n    var m map[string]int\n    m["a"] = 1\n    fmt.Println(m)\n}`,
    error: "panic: assignment to entry in nil map",
  },
  {
    label: "Python — mutable default",
    tag: "medium",
    title: "Shared default list across calls",
    language: "python",
    code: `def push(x, bag=[]):\n    bag.append(x)\n    return bag\n\nprint(push(1))\nprint(push(2))  # expected [2], got [1, 2]`,
    error: "Function returns growing list across calls.",
  },
  {
    label: "Rust — borrow error",
    tag: "hard",
    title: "Cannot borrow as mutable twice",
    language: "rust",
    code: `fn main() {\n    let mut v = vec![1,2,3];\n    let a = &mut v;\n    let b = &mut v;\n    a.push(4);\n    b.push(5);\n}`,
    error: "error[E0499]: cannot borrow `v` as mutable more than once",
  },
];

function CreatePage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState("javascript");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  function loadExample(i: number) {
    const ex = EXAMPLES[i];
    setTitle(ex.title);
    setLanguage(ex.language);
    setCode(ex.code);
    setError(ex.error);
  }

  async function handleRun() {
    if (!code.trim()) {
      setErrMsg("Paste some buggy code first.");
      return;
    }
    setErrMsg(null);
    setSubmitting(true);

    const input: SessionInput = {
      title: title.trim() || "Untitled bug",
      language,
      code,
      error,
    };

    // Stash the pending input so the run page can start the stream itself
    const pendingId = `pending-${Date.now()}`;
    try {
      window.sessionStorage.setItem(
        `bandfix.pending.${pendingId}`,
        JSON.stringify(input),
      );
    } catch {}
    navigate({ to: "/run/$id", params: { id: pendingId } });
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Sparkles className="size-3 text-primary" /> New debug session
      </div>
      <h1 className="mt-2 text-3xl md:text-4xl font-bold tracking-tight">
        Dispatch the <span className="gradient-text">AI squadron</span>
      </h1>
      <p className="mt-2 text-muted-foreground">
        Paste your buggy code and any error output. The Orchestrator will open a Band channel
        and coordinate Bug Finder, Fix Generator, and Reviewer in real time.
      </p>

      <div className="mt-8 grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 glass rounded-2xl p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Login form throws TypeError"
                className="mt-1 w-full rounded-lg bg-surface border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/60"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Language</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="mt-1 w-full rounded-lg bg-surface border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/60"
              >
                {["javascript", "typescript", "python", "go", "rust", "cpp", "c", "java", "csharp", "ruby", "php", "other"].map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground">Buggy code</label>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              spellCheck={false}
              placeholder="Paste the source code that misbehaves…"
              className="mt-1 w-full h-72 rounded-lg bg-black/40 border border-border px-3 py-2 font-mono text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/60"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground">Error / observed behavior</label>
            <textarea
              value={error}
              onChange={(e) => setError(e.target.value)}
              spellCheck={false}
              placeholder="Paste a stack trace or describe what goes wrong…"
              className="mt-1 w-full h-28 rounded-lg bg-black/40 border border-border px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/60"
            />
          </div>

          {errMsg && (
            <div className="text-sm text-destructive">{errMsg}</div>
          )}

          <div className="flex items-center justify-between gap-3">
            <Link to="/history" className="text-sm text-muted-foreground hover:text-foreground">View past sessions →</Link>
            <button
              onClick={handleRun}
              disabled={submitting}
              className="btn-primary rounded-xl px-5 py-3 font-semibold inline-flex items-center gap-2"
            >
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              Run Agent Squadron
            </button>
          </div>
        </div>

        <div className="glass rounded-2xl p-5">
          <div className="text-sm font-semibold">Try an example</div>
          <p className="text-xs text-muted-foreground mt-1">
            Prefilled bugs you can hand to the squadron in one click.
          </p>
          <div className="mt-4 space-y-2 max-h-[28rem] overflow-y-auto pr-1">
            {EXAMPLES.map((ex, i) => (
              <button
                key={ex.label}
                onClick={() => loadExample(i)}
                className="w-full text-left rounded-lg border border-border bg-surface hover:bg-white/5 px-3 py-2 text-sm transition"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium">{ex.label}</div>
                  {ex.tag && (
                    <span className={[
                      "text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-mono",
                      ex.tag === "easy" && "bg-success/15 text-success",
                      ex.tag === "medium" && "bg-primary/15 text-primary",
                      ex.tag === "hard" && "bg-destructive/15 text-destructive",
                    ].filter(Boolean).join(" ")}>{ex.tag}</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">{ex.title}</div>
              </button>
            ))}
          </div>
          <div className="mt-6 rounded-lg bg-surface-elevated border border-border p-3 text-xs text-muted-foreground">
            <div className="font-semibold text-foreground mb-1">Band channels used</div>
            <ul className="space-y-1 font-mono">
              <li>#new-session</li>
              <li>#bug-report</li>
              <li>#fix-proposal</li>
              <li>#review-result</li>
              <li>#session-complete</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helpful for type-only export when the stream consumer needs it
export type { StreamEvent };
