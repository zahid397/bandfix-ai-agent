import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = {
  maxDuration: 60,
};

function sendSse(res: VercelResponse, event: unknown) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      return res.status(204).end();
    }

    // GET health check, so GET /api/run never becomes 500
    if (req.method === "GET") {
      return res.status(200).json({
        ok: true,
        route: "/api/run",
        message: "BandFix API is alive",
        hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY),
        time: new Date().toISOString(),
      });
    }

    if (req.method !== "POST") {
      return res.status(405).json({
        ok: false,
        error: "Method Not Allowed",
      });
    }

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("Access-Control-Allow-Origin", "*");

    sendSse(res, {
      kind: "session",
      sessionId: "test-session",
      startedAt: Date.now(),
    });

    await sleep(800);

    sendSse(res, {
      kind: "agent-status",
      agent: "orchestrator",
      status: "complete",
    });

    await sleep(800);

    sendSse(res, {
      kind: "agent-status",
      agent: "bug-finder",
      status: "thinking",
    });

    await sleep(800);

    sendSse(res, {
      kind: "message",
      message: {
        id: "msg-1",
        timestamp: Date.now(),
        sessionId: "test-session",
        channel: "#bug-report",
        from: "bug-finder",
        to: "all",
        type: "data",
        text: "Test root cause found successfully.",
        data: {
          rootCause: "Test success",
          explanation: "The SSE stream is working on Vercel.",
          severity: "medium",
        },
      },
    });

    await sleep(800);

    sendSse(res, {
      kind: "agent-status",
      agent: "bug-finder",
      status: "complete",
    });

    await sleep(800);

    sendSse(res, {
      kind: "agent-status",
      agent: "fix-generator",
      status: "working",
    });

    await sleep(800);

    sendSse(res, {
      kind: "agent-status",
      agent: "fix-generator",
      status: "complete",
    });

    await sleep(800);

    sendSse(res, {
      kind: "agent-status",
      agent: "reviewer",
      status: "complete",
    });

    sendSse(res, {
      kind: "done",
      session: {
        id: "test-session",
        createdAt: Date.now(),
        durationMs: 5000,
        input: {},
        bugReport: {
          rootCause: "Test success",
          explanation: "Vercel SSE stream works.",
          severity: "medium",
        },
        fix: {
          fixedCode: "// test fixed code",
          changes: ["Verified SSE stream"],
        },
        review: {
          status: "approved",
          securityNote: "No issue",
          performanceNote: "No issue",
          recommendation: "SSE route is working",
          score: 100,
        },
        messages: [],
        status: "complete",
      },
    });

    return res.end();
  } catch (error) {
    console.error("[api/run] test route failed:", error);

    if (!res.headersSent) {
      return res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    res.write(
      `data: ${JSON.stringify({
        kind: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      })}\n\n`,
    );

    return res.end();
  }
}
