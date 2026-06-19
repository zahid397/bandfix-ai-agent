import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";
import { Activity, History, Home, PlusCircle, Radio, Sparkles, Terminal, Github, BookOpen, Bell } from "lucide-react";

export const Route = createFileRoute("/_shell")({
  component: ShellLayout,
});

const navItems: Array<{ to: string; label: string; icon: typeof Home; exact?: boolean }> = [
  { to: "/", label: "Landing", icon: Home, exact: true },
  { to: "/create", label: "Create Task", icon: PlusCircle },
  { to: "/cpp-terminal", label: "C++ Debug Terminal", icon: Terminal },
  { to: "/history", label: "History", icon: History },
  { to: "/band-logs", label: "Band Logs", icon: Radio },
  { to: "/agents", label: "Agents", icon: Activity },
];

const menuBar: Array<{ key: string; label: string; items: Array<{ label: string; to?: string; href?: string; hint?: string }> }> = [
  {
    key: "file",
    label: "File",
    items: [
      { label: "New Debug Session", to: "/create", hint: "⌘N" },
      { label: "Open History", to: "/history", hint: "⌘H" },
      { label: "C++ Debug Terminal", to: "/cpp-terminal", hint: "⌘T" },
    ],
  },
  {
    key: "agents",
    label: "Agents",
    items: [
      { label: "Agent Roster", to: "/agents" },
      { label: "Band Logs (Bus)", to: "/band-logs" },
    ],
  },
  {
    key: "help",
    label: "Help",
    items: [
      { label: "Lovable Docs", href: "https://docs.lovable.dev" },
      { label: "Band AI Hackathon", href: "https://band.ai" },
    ],
  },
];

function ShellLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen flex w-full">
      <aside className="hidden md:flex w-64 shrink-0 flex-col glass-strong sticky top-0 h-screen p-4 gap-2 border-r border-border">
        <Link to="/" className="flex items-center gap-2 px-2 py-3">
          <div className="relative">
            <Sparkles className="size-6 text-primary" />
            <div className="absolute inset-0 blur-lg bg-primary/40 -z-10" />
          </div>
          <div className="font-bold text-lg gradient-text tracking-tight">BandFix AI</div>
        </Link>

        <nav className="mt-2 flex flex-col gap-1">
          {navItems.map((item) => {
            const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={[
                  "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all",
                  active
                    ? "bg-gradient-soft text-foreground glow-border"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5",
                ].join(" ")}
              >
                <Icon className="size-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto rounded-xl glass p-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-block size-2 rounded-full bg-success pulse-dot" />
            <span className="text-foreground font-medium">Band Bus Online</span>
          </div>
          5 channels active · in-memory transport
        </div>
      </aside>

      <main className="flex-1 min-w-0 min-h-screen flex flex-col">
        {/* Desktop menu bar */}
        <div className="hidden md:flex sticky top-0 z-20 glass-strong border-b border-border px-4 h-10 items-center gap-1 text-xs">
          {menuBar.map((m) => (
            <div key={m.key} className="relative group">
              <button className="px-3 py-1.5 rounded hover:bg-white/5 text-muted-foreground hover:text-foreground transition">
                {m.label}
              </button>
              <div className="absolute left-0 top-full mt-1 min-w-[220px] glass-strong border border-border rounded-lg p-1 shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition pointer-events-none group-hover:pointer-events-auto z-30">
                {m.items.map((it) =>
                  it.to ? (
                    <Link
                      key={it.label}
                      to={it.to}
                      className="flex items-center justify-between gap-6 px-3 py-1.5 text-xs rounded hover:bg-white/5 text-muted-foreground hover:text-foreground"
                    >
                      <span>{it.label}</span>
                      {it.hint && <span className="font-mono text-[10px] opacity-60">{it.hint}</span>}
                    </Link>
                  ) : (
                    <a
                      key={it.label}
                      href={it.href}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between gap-6 px-3 py-1.5 text-xs rounded hover:bg-white/5 text-muted-foreground hover:text-foreground"
                    >
                      <span>{it.label}</span>
                      <span className="text-[10px] opacity-60">↗</span>
                    </a>
                  ),
                )}
              </div>
            </div>
          ))}
          <div className="ml-auto flex items-center gap-3 text-muted-foreground">
            <a href="https://docs.lovable.dev" target="_blank" rel="noreferrer" className="hover:text-foreground flex items-center gap-1.5"><BookOpen className="size-3.5" />Docs</a>
            <a href="https://github.com" target="_blank" rel="noreferrer" className="hover:text-foreground flex items-center gap-1.5"><Github className="size-3.5" />GitHub</a>
            <button className="hover:text-foreground" aria-label="Notifications"><Bell className="size-3.5" /></button>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-success/15 text-success">
              <span className="inline-block size-1.5 rounded-full bg-success pulse-dot" />
              <span className="font-mono text-[10px]">LIVE</span>
            </div>
          </div>
        </div>

        {/* Mobile header */}
        <div className="md:hidden sticky top-0 z-10 glass-strong px-4 py-3 flex items-center gap-2 border-b border-border">
          <Sparkles className="size-5 text-primary" />
          <div className="font-bold gradient-text">BandFix AI</div>
          <nav className="ml-auto flex gap-3 text-xs text-muted-foreground">
            <Link to="/create" className="hover:text-foreground">Create</Link>
            <Link to="/cpp-terminal" className="hover:text-foreground">C++</Link>
            <Link to="/history" className="hover:text-foreground">History</Link>
            <Link to="/band-logs" className="hover:text-foreground">Logs</Link>
          </nav>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
