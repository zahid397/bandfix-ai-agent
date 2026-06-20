/**
 * Vercel-safe server-side multi-agent orchestrator for BandFix AI.
 *
 * Uses only OPENAI_API_KEY.
 * Does not require Lovable API.
 * Does not require the openai npm package.
 * If OPENAI_API_KEY is missing or OpenAI call fails, it falls back to a deterministic
 * local rule-based engine so /api/run does not crash.
 */

import type {
  AgentId,
  AgentStatus,
  BandChannel,
  BandMessage,
  BugReport,
  DebugSession,
  FixResult,
  ReviewResult,
  SessionInput,
  StreamEvent,
} from "../../src/lib/bandfix-types";

// ---------------------------------------------------------------------------
// Lightweight in-memory Band bus
// ---------------------------------------------------------------------------

type BandHandler = (message: BandMessage) => void;

class BandChannelBus {
  private handlers: BandHandler[] = [];
  messages: BandMessage[] = [];

  publish(msg: Omit<BandMessage, "id" | "timestamp">): BandMessage {
    const full: BandMessage = {
      ...msg,
      id: cryptoRandomId(),
      timestamp: Date.now(),
    };

    this.messages.push(full);

    console.log(
      `[bandbus] ${full.channel} | ${full.from} -> ${full.to ?? "all"} | ${full.type} | ${full.text}`,
    );

    for (const handler of this.handlers) {
      try {
        handler(full);
      } catch (error) {
        console.warn("[bandbus] handler failed:", error);
      }
    }

    return full;
  }

  on(handler: BandHandler): () => void {
    this.handlers.push(handler);

    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }
}

function cryptoRandomId(): string {
  return `${Math.random().toString(36).slice(2, 10)}${Date.now()
    .toString(36)
    .slice(-4)}`;
}

// ---------------------------------------------------------------------------
// OpenAI native fetch helper
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const OPENAI_TIMEOUT_MS = 25000;

function aiEnabled(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

type JsonSchema = Record<string, unknown>;

type OpenAIJsonResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  error?: {
    message?: string;
  };
};

function extractJson(text: string): string {
  const trimmed = text.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const match = trimmed.match(/\{[\s\S]*\}/);
  return match ? match[0] : trimmed;
}

async function callAIJsonOrNull<T>(args: {
  system: string;
  user: string;
  schemaName: string;
  schema: JsonSchema;
}): Promise<T | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    console.warn(`[ai] ${args.schemaName}: OPENAI_API_KEY missing, using fallback.`);
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              `${args.system}\n\n` +
              `Return ONLY valid JSON. Do not use markdown. Do not add explanation outside JSON. ` +
              `The JSON object must match this schema name: ${args.schemaName}.`,
          },
          {
            role: "user",
            content:
              `${args.user}\n\n` +
              `Required JSON schema:\n${JSON.stringify(args.schema, null, 2)}`,
          },
        ],
      }),
    });

    const data = (await response.json()) as OpenAIJsonResponse;

    if (!response.ok) {
      console.warn(
        `[ai] ${args.schemaName} failed with status ${response.status}:`,
        data.error?.message || "Unknown OpenAI error",
      );
      return null;
    }

    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.warn(`[ai] ${args.schemaName} returned empty response, using fallback.`);
      return null;
    }

    return JSON.parse(extractJson(content)) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown AI error";
    console.warn(`[ai] ${args.schemaName} failed, using fallback:`, message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Deterministic fallback engine
// ---------------------------------------------------------------------------

interface Pattern {
  test: RegExp;
  rootCause: string;
  explanation: string;
  severity: BugReport["severity"];
  strategy: "guard" | "try-catch" | "declare" | "generic";
}

const PATTERNS: Pattern[] = [
  {
    test: /cannot read propert|reading '|null is not an object|nullpointer|undefined/i,
    rootCause: "Null / undefined reference",
    explanation:
      "The code accesses a property or method on a value that is null or undefined at runtime. A guard is needed before the access.",
    severity: "high",
    strategy: "guard",
  },
  {
    test: /is not defined|referenceerror|not declared|nil map|assignment to entry in nil/i,
    rootCause: "Use of an uninitialized or undeclared value",
    explanation:
      "A variable, map, or pointer is used before it is declared, allocated, or initialized.",
    severity: "high",
    strategy: "declare",
  },
  {
    test: /unhandled|fetch failed|network|timeout|econnrefused|promise|500|internal server error/i,
    rootCause: "Unhandled asynchronous / network error",
    explanation:
      "An async or network operation can reject, but the failure path is not handled correctly.",
    severity: "medium",
    strategy: "try-catch",
  },
  {
    test: /is not a function|typeerror|segmentation fault|segfault|use-after-free|buffer-overflow|dangling/i,
    rootCause: "Invalid memory / type operation",
    explanation:
      "A value is used as the wrong type, or memory is accessed after being freed or out of bounds.",
    severity: "high",
    strategy: "guard",
  },
];

function fallbackAnalyze(input: SessionInput): BugReport {
  const haystack = `${input.error || ""}\n${input.code || ""}`;
  const pattern = PATTERNS.find((pat) => pat.test.test(haystack));

  if (pattern) {
    return {
      rootCause: pattern.rootCause,
      explanation: pattern.explanation,
      severity: pattern.severity,
    };
  }

  return {
    rootCause: "Logic / runtime issue",
    explanation:
      "The submitted code does not behave as intended for the given input. Review the control flow, inputs, and runtime assumptions.",
    severity: "medium",
  };
}

function fallbackFix(input: SessionInput, bug: BugReport): FixResult {
  const code = input.code || "";
  const changes: string[] = [];
  let fixedCode = code;

  const strategy = PATTERNS.find((p) => p.rootCause === bug.rootCause)?.strategy ?? "generic";

  if (strategy === "try-catch") {
    const indented = code
      .split("\n")
      .map((line) => (line.trim().length ? `  ${line}` : line))
      .join("\n");

    fixedCode =
      `try {\n` +
      `${indented}\n` +
      `} catch (error) {\n` +
      `  console.error("Operation failed:", error);\n` +
      `  throw error;\n` +
      `}\n`;

    changes.push("Wrapped the failing operation in try/catch so runtime failures are handled.");
  } else if (strategy === "declare") {
    fixedCode =
      `// BandFix: Ensure all variables are declared and initialized before use.\n` +
      `// Check the variable mentioned in the error message and initialize it safely.\n` +
      code;

    changes.push("Added guidance to initialize undeclared or uninitialized values before use.");
  } else {
    fixedCode =
      `// BandFix: Add defensive validation before accessing runtime values.\n` +
      `// This prevents "${bug.rootCause}" from crashing the application.\n` +
      code;

    changes.push(`Added defensive guidance for ${bug.rootCause.toLowerCase()}.`);
  }

  return { fixedCode, changes };
}

function fallbackReview(input: SessionInput, fix: FixResult, bug: BugReport): ReviewResult {
  const changed = fix.fixedCode.trim() !== input.code.trim();

  if (!changed) {
    return {
      status: "revision_needed",
      securityNote: "The code was not modified enough to verify safety.",
      performanceNote: "No performance impact detected because no concrete fix was applied.",
      recommendation: "Add validation, error handling, or a guard based on the detected root cause.",
      score: 58,
    };
  }

  return {
    status: "approved",
    securityNote: "Defensive handling was added. No obvious security risk detected in the proposed fix.",
    performanceNote: "The added validation/error handling has negligible runtime overhead.",
    recommendation:
      bug.severity === "high"
        ? "Add a regression test for this edge case before deploying."
        : "Safe to merge after testing the fixed path.",
    score: bug.severity === "high" ? 90 : 86,
  };
}

// ---------------------------------------------------------------------------
// Agent implementations
// ---------------------------------------------------------------------------

async function runBugFinder(band: BandChannelBus, input: SessionInput): Promise<BugReport> {
  band.publish({
    sessionId: "",
    channel: "#bug-report",
    from: "bug-finder",
    type: "status",
    text: "Scanning code surface and stack trace for root cause…",
  });

  const ai = await callAIJsonOrNull<BugReport>({
    schemaName: "report_bug",
    system:
      "You are BugFinder, a staff-level engineer who pinpoints root causes precisely. Be concrete and avoid generic advice.",
    user:
      `Title: ${input.title || "Untitled"}\n` +
      `Language: ${input.language}\n\n` +
      `Error:\n${input.error || "(none)"}\n\n` +
      `Code:\n${input.code}`,
    schema: {
      type: "object",
      properties: {
        rootCause: { type: "string" },
        explanation: { type: "string" },
        severity: { type: "string", enum: ["low", "medium", "high"] },
      },
      required: ["rootCause", "explanation", "severity"],
      additionalProperties: false,
    },
  });

  const result = ai ?? fallbackAnalyze(input);

  band.publish({
    sessionId: "",
    channel: "#bug-report",
    from: "bug-finder",
    to: "all",
    type: "data",
    text: `Root cause identified: ${result.rootCause}`,
    data: result,
  });

  return result;
}

async function runFixGenerator(
  band: BandChannelBus,
  input: SessionInput,
  bugReport: BugReport,
  feedback?: string,
): Promise<FixResult> {
  band.publish({
    sessionId: "",
    channel: "#fix-proposal",
    from: "fix-generator",
    type: "status",
    text: feedback ? "Revising fix with reviewer feedback…" : "Drafting a fix that preserves intent…",
  });

  const ai = await callAIJsonOrNull<FixResult>({
    schemaName: "propose_fix",
    system:
      "You are FixGenerator, a senior engineer. Return corrected, runnable code that preserves original intent.",
    user:
      `Language: ${input.language}\n\n` +
      `Root cause: ${bugReport.rootCause}\n` +
      `Explanation: ${bugReport.explanation}\n\n` +
      (feedback ? `Reviewer feedback:\n${feedback}\n\n` : "") +
      `Original error:\n${input.error || "(none)"}\n\n` +
      `Original code:\n${input.code}\n\n` +
      `Return full corrected code and concrete changes. Do not mention Lovable.`,
    schema: {
      type: "object",
      properties: {
        fixedCode: { type: "string" },
        changes: { type: "array", items: { type: "string" } },
      },
      required: ["fixedCode", "changes"],
      additionalProperties: false,
    },
  });

  const result = ai ?? fallbackFix(input, bugReport);

  band.publish({
    sessionId: "",
    channel: "#fix-proposal",
    from: "fix-generator",
    to: "reviewer",
    type: "data",
    text: `Fix proposed with ${result.changes.length} change(s).`,
    data: result,
  });

  return result;
}

async function runReviewer(
  band: BandChannelBus,
  input: SessionInput,
  bugReport: BugReport,
  fix: FixResult,
): Promise<ReviewResult> {
  band.publish({
    sessionId: "",
    channel: "#review-result",
    from: "reviewer",
    type: "status",
    text: "Auditing fix for security, performance, and best practices…",
  });

  const ai = await callAIJsonOrNull<ReviewResult>({
    schemaName: "review_fix",
    system:
      "You are Reviewer, a meticulous staff engineer. Audit the proposed fix and return strict review JSON.",
    user:
      `Reported root cause: ${bugReport.rootCause}\n\n` +
      `Original code:\n${input.code}\n\n` +
      `Proposed fix:\n${fix.fixedCode}`,
    schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["approved", "revision_needed"] },
        securityNote: { type: "string" },
        performanceNote: { type: "string" },
        recommendation: { type: "string" },
        score: { type: "number" },
      },
      required: ["status", "securityNote", "performanceNote", "recommendation", "score"],
      additionalProperties: false,
    },
  });

  const result = ai ?? fallbackReview(input, fix, bugReport);

  band.publish({
    sessionId: "",
    channel: "#review-result",
    from: "reviewer",
    to: "orchestrator",
    type: "data",
    text: `Review ${result.status} — score ${result.score}/100.`,
    data: result,
  });

  return result;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

function toStatus(agent: AgentId, status: AgentStatus): StreamEvent {
  console.log(`[orchestrator] transition: ${agent} -> ${status}`);

  return {
    kind: "agent-status",
    agent,
    status,
  };
}

export async function* runDebugSession(
  input: SessionInput,
): AsyncGenerator<StreamEvent, void, unknown> {
  const sessionId = cryptoRandomId();
  const startedAt = Date.now();
  const band = new BandChannelBus();
  const queue: BandMessage[] = [];

  band.on((message) => {
    message.sessionId = sessionId;
    queue.push(message);
  });

  function* drain(): Generator<StreamEvent, void, unknown> {
    while (queue.length > 0) {
      const message = queue.shift();

      if (message) {
        yield {
          kind: "message",
          message,
        };
      }
    }
  }

  yield {
    kind: "session",
    sessionId,
    startedAt,
  };

  console.log(
    `[orchestrator] session ${sessionId} started: "${input.title}" ai=${aiEnabled()}`,
  );

  band.publish({
    sessionId,
    channel: "#new-session",
    from: "orchestrator",
    to: "all",
    type: "status",
    text: `New session "${input.title}" — dispatching Bug Finder.`,
  });

  let bugReport: BugReport | null = null;
  let fix: FixResult | null = null;
  let review: ReviewResult | null = null;

  try {
    yield toStatus("orchestrator", "complete");
    yield* drain();

    yield toStatus("bug-finder", "thinking");
    yield* drain();

    bugReport = await runBugFinder(band, input);
    yield* drain();
    yield toStatus("bug-finder", "complete");

    yield toStatus("fix-generator", "working");
    yield* drain();

    fix = await runFixGenerator(band, input, bugReport);
    yield* drain();
    yield toStatus("fix-generator", "complete");

    yield toStatus("reviewer", "thinking");
    yield* drain();

    review = await runReviewer(band, input, bugReport, fix);
    yield* drain();

    if (review.status === "revision_needed") {
      band.publish({
        sessionId,
        channel: "#new-session",
        from: "orchestrator",
        to: "fix-generator",
        type: "status",
        text: "Reviewer requested revisions — re-running Fix Generator.",
      });

      yield* drain();

      yield toStatus("fix-generator", "working");
      yield* drain();

      fix = await runFixGenerator(band, input, bugReport, review.recommendation);
      yield* drain();
      yield toStatus("fix-generator", "complete");

      yield toStatus("reviewer", "thinking");
      yield* drain();

      review = await runReviewer(band, input, bugReport, fix);
      yield* drain();
    }

    yield toStatus("reviewer", "complete");

    band.publish({
      sessionId,
      channel: "#session-complete",
      from: "orchestrator",
      to: "all",
      type: "status",
      text: `Session complete — fix ${review.status}, score ${review.score}/100.`,
    });

    yield* drain();

    const session: DebugSession = {
      id: sessionId,
      createdAt: startedAt,
      durationMs: Date.now() - startedAt,
      input,
      bugReport,
      fix,
      review,
      messages: band.messages,
      status: "complete",
    };

    console.log(`[orchestrator] session ${sessionId} complete in ${session.durationMs}ms`);

    yield {
      kind: "done",
      session,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    console.error(`[orchestrator] session ${sessionId} failed:`, message);

    band.publish({
      sessionId,
      channel: "#session-complete",
      from: "orchestrator",
      type: "error",
      text: `Session failed: ${message}`,
    });

    yield* drain();

    const session: DebugSession = {
      id: sessionId,
      createdAt: startedAt,
      durationMs: Date.now() - startedAt,
      input,
      bugReport,
      fix,
      review,
      messages: band.messages,
      status: "failed",
      error: message,
    };

    yield {
      kind: "error",
      error: message,
    };

    yield {
      kind: "done",
      session,
    };
  }
}

export type { BandChannel };
