import { Link, createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowRight, Bug, CheckCircle2, Radio, Sparkles, Wrench, Zap } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BandFix AI — A squadron of AI agents that debug your code" },
      { name: "description", content: "Watch 4 specialized AI agents collaborate live over Band channels to find, fix, and review bugs in your code." },
      { property: "og:title", content: "BandFix AI — Multi-Agent Debugging" },
      { property: "og:description", content: "Orchestrator, Bug Finder, Fix Generator, and Reviewer — a Band-powered AI squadron for code." },
    ],
  }),
  component: Landing,
});

const agents = [
  { name: "Orchestrator", role: "Plans the mission, opens the channel.", icon: Sparkles, color: "from-purple-500 to-fuchsia-500" },
  { name: "Bug Finder", role: "Pinpoints the precise root cause.", icon: Bug, color: "from-rose-500 to-orange-400" },
  { name: "Fix Generator", role: "Writes optimized, runnable code.", icon: Wrench, color: "from-blue-500 to-cyan-400" },
  { name: "Reviewer", role: "Audits security, perf, and best practices.", icon: CheckCircle2, color: "from-emerald-500 to-teal-400" },
];

function Landing() {
  return (
    <div className="min-h-screen">
      <header className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <Sparkles className="size-5 text-primary" />
          <span className="font-bold gradient-text text-lg">BandFix AI</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm text-muted-foreground">
          <Link to="/history" className="hover:text-foreground">History</Link>
          <Link to="/band-logs" className="hover:text-foreground">Band Logs</Link>
          <Link
            to="/create"
            className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold"
          >
            Launch Squadron
          </Link>
        </nav>
      </header>

      <section className="max-w-7xl mx-auto px-6 pt-16 pb-24 text-center">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="inline-flex items-center gap-2 rounded-full glass px-3 py-1 text-xs text-muted-foreground"
        >
          <Radio className="size-3 text-primary" /> Band AI Hackathon · Track 2 · Multi-Agent
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.05 }}
          className="mt-6 text-5xl md:text-7xl font-extrabold tracking-tight"
        >
          Four AI agents.
          <br />
          <span className="gradient-text">One Band channel. Zero bugs.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15 }}
          className="mt-6 max-w-2xl mx-auto text-lg text-muted-foreground"
        >
          BandFix AI dispatches a specialized squadron — Orchestrator, Bug Finder, Fix Generator
          and Reviewer — that collaborate live over a Band message bus to debug your code.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.25 }}
          className="mt-10 flex items-center justify-center gap-3"
        >
          <Link
            to="/create"
            className="btn-primary rounded-xl px-6 py-3 font-semibold inline-flex items-center gap-2"
          >
            Run the squadron <ArrowRight className="size-4" />
          </Link>
          <Link
            to="/band-logs"
            className="rounded-xl px-6 py-3 font-semibold border border-border glass hover:bg-white/5 transition"
          >
            See Band logs
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mt-20 grid md:grid-cols-4 gap-4"
        >
          {agents.map((a, i) => (
            <motion.div
              key={a.name}
              whileHover={{ y: -4 }}
              transition={{ duration: 0.25 }}
              className="glass rounded-2xl p-5 text-left glow-border"
            >
              <div className={`inline-flex size-10 items-center justify-center rounded-xl bg-gradient-to-br ${a.color} shadow-lg`}>
                <a.icon className="size-5 text-white" />
              </div>
              <div className="mt-4 text-sm text-muted-foreground">Agent {i + 1}</div>
              <div className="text-lg font-semibold">{a.name}</div>
              <div className="text-sm text-muted-foreground mt-1">{a.role}</div>
            </motion.div>
          ))}
        </motion.div>
      </section>

      <section className="max-w-7xl mx-auto px-6 pb-24">
        <div className="grid md:grid-cols-3 gap-4">
          {[
            { icon: Zap, title: "Live Band stream", body: "SSE-powered transcript of every #channel message between agents." },
            { icon: Wrench, title: "Real fixes", body: "Side-by-side diff with the full corrected source — copy or download." },
            { icon: CheckCircle2, title: "QA-gated", body: "Reviewer can request a revision; orchestrator re-dispatches Fix Generator." },
          ].map((f) => (
            <div key={f.title} className="glass rounded-2xl p-6">
              <f.icon className="size-5 text-primary" />
              <div className="mt-3 font-semibold">{f.title}</div>
              <div className="text-sm text-muted-foreground mt-1">{f.body}</div>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        Built for the Band AI Hackathon · Multi-Agent Software Development
      </footer>
    </div>
  );
}
