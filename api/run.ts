// api/run.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = {
  maxDuration: 60,
};

type RunInput = {
  title?: string;
  language?: string;
  code: string;
  error?: string;
};

type StreamEvent = {
  kind: string;
  agent?: string;
  status?: string;
  message?: unknown;
  session?: unknown;
  sessionId?: string;
  startedAt?: number;
  content?: string;
  error?: string;
  data?: unknown;
};

function parseBody(body: unknown): Partial<RunInput> {
  if (!body) return {};

  if (typeof body === "string") {
    try {
      return JSON.parse(body) as Partial<RunInput>;
    } catch {
      return {};
    }
  }

  if (typeof body === "object") {
    return body as Partial<RunInput>;
  }

  return {};
}

function sendJson(res: VercelResponse, status: number, data: unknown) {
  return res.status(status).json(data);
}

function sendSse(res: VercelResponse, event: unknown) {
  if (res.writableEnded) return;
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log("[api/run] request received:", req.method);

  try {
    // CORS / preflight
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

      return res.status(204).end();
    }

    // Health check: GET /api/run
    // This helps debugging from browser.
    if (req.method === "GET") {
      return sendJson(res, 200, {
        ok: true,
        route: "/api/run",
        message: "BandFix API is alive",
        hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY?.trim()),
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        time: new Date().toISOString(),
      });
    }

    if (req.method !== "POST") {
      return sendJson(res, 405, {
        ok: false,
        error: "Method Not Allowed",
        allowedMethods: ["GET", "POST", "OPTIONS"],
      });
    }

    const input = parseBody(req.body);

    console.log("[api/run] body parsed:", {
      hasCode: Boolean(input.code),
      language: input.language || "javascript",
      hasError: Boolean(input.error),
      hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY?.trim()),
    });

    if (!input.code || typeof input.code !== "string") {
      return sendJson(res, 400, {
        ok: false,
        error: "`code` is required and must be a string",
      });
    }

    // IMPORTANT FIX FOR VERCEL:
    // Use .js extension in dynamic import.
    // Vercel compiles api/run.ts into api/run.js.
    // Without .js, Node ESM may fail with ERR_MODULE_NOT_FOUND.
    console.log("[api/run] importing runner...");

    const runnerModule = (await import("./_lib/runner.js")) as typeof import("./_lib/runner");

    console.log("[api/run] runner imported successfully");

    const { runDebugSession } = runnerModule;

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("Access-Control-Allow-Origin", "*");

    let closed = false;

    const heartbeat = setInterval(() => {
      if (!closed && !res.writableEnded) {
        try {
          res.write(":hb\n\n");
        } catch (error) {
          console.error("[api/run] heartbeat failed:", error);
          closed = true;
          clearInterval(heartbeat);
        }
      }
    }, 15000);

    req.on("close", () => {
      console.log("[api/run] client disconnected");
      closed = true;
      clearInterval(heartbeat);
    });

    // Initial SSE connection
    res.write(":ok\n\n");

    sendSse(res, {
      kind: "status",
      status: "running",
      message: "Debug session started",
    });

    try {
      console.log("[api/run] starting debug session...");

      for await (const event of runDebugSession({
        title: input.title || "Untitled bug",
        language: input.language || "javascript",
        code: input.code,
        error: input.error || "",
      })) {
        if (closed || res.writableEnded) break;

        sendSse(res, event as StreamEvent);
      }

      if (!closed && !res.writableEnded) {
        sendSse(res, {
          kind: "status",
          status: "completed",
          message: "Debug session completed",
        });
      }

      console.log("[api/run] debug session completed");
    } catch (runnerError) {
      const message =
        runnerError instanceof Error ? runnerError.message : "Unknown runner error";

      console.error("[api/run] runner failed:", runnerError);

      if (!closed && !res.writableEnded) {
        sendSse(res, {
          kind: "error",
          status: "failed",
          error: message,
        });
      }
    } finally {
      closed = true;
      clearInterval(heartbeat);

      if (!res.writableEnded) {
        res.end();
      }
    }
  } catch (fatalError) {
    const message =
      fatalError instanceof Error ? fatalError.message : "Internal Server Error";

    console.error("[api/run] Fatal error:", fatalError);

    if (!res.headersSent) {
      return sendJson(res, 500, {
        ok: false,
        error: message,
      });
    }

    if (!res.writableEnded) {
      sendSse(res, {
        kind: "error",
        status: "failed",
        error: message,
      });

      res.end();
    }
  }
}
