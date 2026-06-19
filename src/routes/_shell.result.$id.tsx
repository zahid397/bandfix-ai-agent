import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { diffLines } from "diff";
import { ArrowLeft, CheckCircle2, Copy, Download, FileText, Loader2, ShieldCheck, Zap } from "lucide-react";

import { buildMarkdownReport, buildPdfReport, downloadBlob, reportFilename } from "@/lib/report";

import type { DebugSession } from "@/lib/bandfix-types";
import { sessionsStore } from "@/lib/sessions-store";

export const Route = createFileRoute("/_shell/result/$id")({
  head: () => ({ meta: [{ title: "Result — BandFix AI" }] }),
  component: ResultPage,
});

function ResultPage() {
  const { id } = Route.useParams();
  const [session, setSession] = useState<DebugSession | null>(null);

  useEffect(() => {
    setSession(sessionsStore.get(id) ?? null);
  }, [id]);

  if (!session) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-20 text-center">
        <div className="text-muted-foreground">No session found for <code className="font-mono">{id}</code>.</div>
        <Link to="/create" className="btn-primary rounded-lg px-4 py-2 mt-6 inline-block">Start a new run</Link>
      </div>
    );
  }

  return <ResultBody session={session} />;
}

function ResultBody({ session }: { session: DebugSession }) {
  const { input, bugReport, fix, review } = session;

  const diff = useMemo(() => {
    if (!fix) return [] as ReturnType<typeof diffLines>;
    return diffLines(input.code, fix.fixedCode);
  }, [input.code, fix]);

  const [pdfBusy, setPdfBusy] = useState(false);

  function copy(text: string) {
    navigator.clipboard.writeText(text).catch(() => {});
  }

  function exportJson() {
    const report = {
      session: session.id,
      title: input.title,
      language: input.language,
      durationMs: session.durationMs,
      bugReport,
      fix,
      review,
      messages: session.messages,
    };
    downloadBlob(reportFilename(session, "json"), JSON.stringify(report, null, 2), "application/json");
  }

  function exportMarkdown() {
    downloadBlob(reportFilename(session, "md"), buildMarkdownReport(session), "text/markdown");
  }

  async function exportPdf() {
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      const blob = await buildPdfReport(session);
      downloadBlob(reportFilename(session, "pdf"), blob, "application/pdf");
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/history" className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="size-3.5" /> History
        </Link>
        <span>·</span>
        <span className="font-mono">{session.id}</span>
      </div>

      <div className="mt-2 flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{input.title}</h1>
          <div className="text-sm text-muted-foreground">
            {input.language} · {(session.durationMs / 1000).toFixed(1)}s · {session.messages.length} Band messages
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={exportPdf}
            disabled={pdfBusy}
            className="btn-primary rounded-lg px-3 py-2 text-sm inline-flex items-center gap-1.5"
          >
            {pdfBusy ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
            Download PDF
          </button>
          <button onClick={exportMarkdown} className="rounded-lg px-3 py-2 text-sm glass border border-border hover:bg-white/5 inline-flex items-center gap-1.5">
            <Download className="size-4" /> Markdown
          </button>
          <button onClick={exportJson} className="rounded-lg px-3 py-2 text-sm glass border border-border hover:bg-white/5 inline-flex items-center gap-1.5">
            <Download className="size-4" /> JSON
          </button>
          {fix && (
            <button onClick={() => copy(fix.fixedCode)} className="rounded-lg px-3 py-2 text-sm glass border border-border hover:bg-white/5 inline-flex items-center gap-1.5">
              <Copy className="size-4" /> Copy fix
            </button>
          )}
        </div>
      </div>

      {/* Top stat cards */}
      <div className="mt-6 grid md:grid-cols-3 gap-4">
        <StatCard
          tone="rose"
          label="Root cause"
          value={bugReport?.rootCause ?? "—"}
          sub={bugReport ? `Severity ${bugReport.severity}` : ""}
        />
        <StatCard
          tone="blue"
          label="Fix"
          value={fix ? `${fix.changes.length} change(s)` : "—"}
          sub={fix ? "Ready to copy" : ""}
          icon={<Zap className="size-4" />}
        />
        <StatCard
          tone={review?.status === "approved" ? "green" : "amber"}
          label="Reviewer"
          value={review ? `${review.status} · ${review.score}/100` : "—"}
          sub={review?.recommendation ?? ""}
          icon={<ShieldCheck className="size-4" />}
        />
      </div>

      {/* Side-by-side diff */}
      {fix && (
        <div className="mt-8 glass rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold">Side-by-side diff</div>
            <div className="text-xs text-muted-foreground">unified · line-level</div>
          </div>
          <div className="grid md:grid-cols-2 gap-3 font-mono text-xs">
            <CodeBlock title="Original" code={input.code} tone="muted" />
            <CodeBlock title="Fixed" code={fix.fixedCode} tone="primary" />
          </div>

          <div className="mt-4 rounded-lg bg-black/40 border border-border p-3 overflow-x-auto">
            <div className="text-xs text-muted-foreground mb-2">Unified diff</div>
            <pre className="text-xs leading-relaxed">
              {diff.map((part, i) => (
                <span
                  key={i}
                  className={
                    part.added
                      ? "text-success bg-success/10"
                      : part.removed
                        ? "text-destructive bg-destructive/10"
                        : "text-muted-foreground"
                  }
                >
                  {part.added ? "+ " : part.removed ? "- " : "  "}
                  {part.value}
                </span>
              ))}
            </pre>
          </div>
        </div>
      )}

      {/* Agent insights */}
      <div className="mt-6 grid lg:grid-cols-3 gap-4">
        <InsightCard title="Bug Finder" emoji="🔍">
          {bugReport ? (
            <>
              <p className="text-sm"><span className="font-semibold">Root cause:</span> {bugReport.rootCause}</p>
              <p className="text-sm text-muted-foreground mt-2">{bugReport.explanation}</p>
            </>
          ) : <Empty />}
        </InsightCard>
        <InsightCard title="Fix Generator" emoji="🛠️">
          {fix ? (
            <ul className="list-disc pl-4 text-sm space-y-1">
              {fix.changes.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          ) : <Empty />}
        </InsightCard>
        <InsightCard title="Reviewer" emoji="✅">
          {review ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-success" /> {review.status} · {review.score}/100
              </div>
              <p><span className="font-semibold">Security:</span> {review.securityNote}</p>
              <p><span className="font-semibold">Performance:</span> {review.performanceNote}</p>
              <p className="text-muted-foreground">{review.recommendation}</p>
            </div>
          ) : <Empty />}
        </InsightCard>
      </div>

      {/* Band transcript */}
      <div className="mt-6 glass rounded-2xl p-4">
        <div className="font-semibold mb-3">Band transcript</div>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {session.messages.map((m) => (
            <div key={m.id} className="rounded-lg bg-black/30 border border-border p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono text-primary">{m.channel}</span>
                <span>·</span>
                <span>{m.from}{m.to ? ` → ${m.to}` : ""}</span>
                <span className="ml-auto">{new Date(m.timestamp).toLocaleTimeString()}</span>
              </div>
              <div className="text-sm mt-1">{m.text}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CodeBlock({ title, code, tone }: { title: string; code: string; tone: "muted" | "primary" }) {
  return (
    <div className={[
      "rounded-lg border bg-black/40 overflow-hidden",
      tone === "primary" ? "border-primary/40" : "border-border",
    ].join(" ")}
    >
      <div className="px-3 py-2 text-xs border-b border-border flex items-center justify-between">
        <span className={tone === "primary" ? "text-primary" : "text-muted-foreground"}>{title}</span>
      </div>
      <pre className="p-3 text-xs leading-relaxed overflow-x-auto whitespace-pre">{code}</pre>
    </div>
  );
}

function StatCard({ label, value, sub, tone, icon }: { label: string; value: string; sub?: string; tone: "rose" | "blue" | "green" | "amber"; icon?: React.ReactNode }) {
  const accent = {
    rose: "from-rose-500/20 to-rose-500/0",
    blue: "from-blue-500/20 to-blue-500/0",
    green: "from-emerald-500/20 to-emerald-500/0",
    amber: "from-amber-500/20 to-amber-500/0",
  }[tone];
  return (
    <div className={`glass rounded-2xl p-4 relative overflow-hidden`}>
      <div className={`absolute inset-x-0 top-0 h-24 bg-gradient-to-b ${accent} pointer-events-none`} />
      <div className="relative">
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">{icon}{label}</div>
        <div className="mt-1 font-semibold">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </div>
    </div>
  );
}

function InsightCard({ title, emoji, children }: { title: string; emoji: string; children: React.ReactNode }) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{emoji}</span>
        <div className="font-semibold">{title}</div>
      </div>
      {children}
    </div>
  );
}

function Empty() {
  return <div className="text-sm text-muted-foreground">No data returned.</div>;
}
