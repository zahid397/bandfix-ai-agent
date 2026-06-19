export type AgentId = "orchestrator" | "bug-finder" | "fix-generator" | "reviewer";

export type BandChannel =
  | "#new-session"
  | "#bug-report"
  | "#fix-proposal"
  | "#review-result"
  | "#session-complete";

export interface BandMessage {
  id: string;
  sessionId: string;
  channel: BandChannel;
  from: AgentId | "system";
  to?: AgentId | "all";
  type: "status" | "thought" | "data" | "error";
  text: string;
  data?: unknown;
  timestamp: number;
}

export interface BugReport {
  rootCause: string;
  explanation: string;
  severity: "low" | "medium" | "high";
}

export interface FixResult {
  fixedCode: string;
  changes: string[];
}

export interface ReviewResult {
  status: "approved" | "revision_needed";
  securityNote: string;
  performanceNote: string;
  recommendation: string;
  score: number;
}

export interface SessionInput {
  title: string;
  language: string;
  code: string;
  error: string;
}

export interface DebugSession {
  id: string;
  createdAt: number;
  durationMs: number;
  input: SessionInput;
  bugReport: BugReport | null;
  fix: FixResult | null;
  review: ReviewResult | null;
  messages: BandMessage[];
  status: "running" | "complete" | "failed";
  error?: string;
}

export type StreamEvent =
  | { kind: "session"; sessionId: string; startedAt: number }
  | { kind: "message"; message: BandMessage }
  | { kind: "agent-status"; agent: AgentId; status: AgentStatus }
  | { kind: "done"; session: DebugSession }
  | { kind: "error"; error: string };

export type AgentStatus = "idle" | "thinking" | "working" | "complete" | "failed";

export const AGENTS: Array<{
  id: AgentId;
  name: string;
  role: string;
  channel: BandChannel;
  color: string;
  emoji: string;
}> = [
  { id: "orchestrator", name: "Orchestrator", role: "Coordinates the squadron", channel: "#new-session", color: "purple", emoji: "🎼" },
  { id: "bug-finder", name: "Bug Finder", role: "Pinpoints the root cause", channel: "#bug-report", color: "rose", emoji: "🔍" },
  { id: "fix-generator", name: "Fix Generator", role: "Writes the corrected code", channel: "#fix-proposal", color: "blue", emoji: "🛠️" },
  { id: "reviewer", name: "Reviewer", role: "Audits security & quality", channel: "#review-result", color: "cyan", emoji: "✅" },
];
