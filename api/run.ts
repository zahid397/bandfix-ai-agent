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
  message?: string;
  agent?: string;
  status?: "queued" | "running" | "completed" | "failed";
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      return res.status(204).end();
    }

    if (req.method !== "POST") {
      return sendJson(res, 405, {
        success: false,
        error: "Method Not Allowed",
        allowedMethods: ["POST"],
      });
    }

    const input = parseBody(req.body);

    if (!input.code || typeof input.code !== "string") {
      return sendJson(res, 400, {
        success: false,
        error: "`code` is required and must be a string",
      });
    }

    const openaiKey = process.env.OPENAI_API_KEY;

    if (!openaiKey) {
      return sendJson(res, 500, {
        success: false,
        error: "OPENAI_API_KEY is missing in Vercel Environment Variables",
      });
    }

    const { runDebugSession } = await import("./_lib/runner");

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("Access-Control-Allow-Origin", "*");

    let closed = false;

    const send = (event: StreamEvent) => {
      if (closed || res.writableEnded) return;

      try {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch (error) {
        closed = true;
        console.error("[api/run] Stream write failed:", error);
      }
    };

    const heartbeat = setInterval(() => {
      if (!closed && !res.writableEnded) {
        try {
          res.write(":hb\n\n");
        } catch {
          closed = true;
          clearInterval(heartbeat);
        }
      }
    }, 15000);

    req.on("close", () => {
      closed = true;
      clearInterval(heartbeat);
    });

    res.write(":ok\n\n");

    send({
      kind: "status",
      message: "Debug session started",
      status: "running",
    });

    try {
      for await (const event of runDebugSession({
        title: input.title || "Untitled bug",
        language: input.language || "javascript",
        code: input.code,
        error: input.error || "",
      })) {
        if (closed || res.writableEnded) break;
        send(event);
      }

      send({
        kind: "done",
        message: "Debug session completed",
        status: "completed",
      });
    } catch (error) {
      console.error("[api/run] Runner failed:", error);

      send({
        kind: "error",
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown runner error",
      });
    } finally {
      closed = true;
      clearInterval(heartbeat);

      if (!res.writableEnded) {
        res.end();
      }
    }
  } catch (error) {
    console.error("[api/run] Fatal error:", error);

    if (!res.headersSent) {
      return sendJson(res, 500, {
        success: false,
        error: error instanceof Error ? error.message : "Internal Server Error",
      });
    }

    if (!res.writableEnded) {
      res.write(
        `data: ${JSON.stringify({
          kind: "error",
          status: "failed",
          error: error instanceof Error ? error.message : "Internal Server Error",
        })}\n\n`,
      );
      res.end();
    }
  }
}
