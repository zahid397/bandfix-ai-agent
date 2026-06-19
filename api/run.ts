// api/run.ts
import { runDebugSession } from "./_lib/runner";
import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = {
  maxDuration: 60, // Vercel Hobby tier max 60s
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. Method Check
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  // Vercel automatically parses JSON bodies into req.body
  const input = req.body;

  if (!input?.code || typeof input.code !== "string") {
    return res.status(400).send("`code` is required");
  }

  // 2. Setup Server-Sent Events (SSE) Headers for Node.js
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  let closed = false;

  // Helper to send data chunks
  const send = (event: any) => {
    if (closed) return;
    res.write(`data: ${JSON.stringify(event)}\n\n`);
    // Force flush if available (helps in some serverless environments)
    if (typeof (res as any).flush === 'function') {
      (res as any).flush();
    }
  };

  // 3. Keep-alive Heartbeat
  res.write(":ok\n\n");
  const heartbeat = setInterval(() => {
    if (!closed) res.write(":hb\n\n");
  }, 15000);

  // Handle client disconnect gracefully
  req.on('close', () => {
    closed = true;
    clearInterval(heartbeat);
  });

  // 4. Run the Agent Pipeline
  try {
    for await (const ev of runDebugSession({
      title: input.title || "Untitled bug",
      language: input.language || "javascript",
      code: input.code,
      error: input.error || "",
    })) {
      if (closed) break;
      send(ev);
    }
  } catch (err) {
    send({ kind: "error", error: err instanceof Error ? err.message : "Unknown error" });
  } finally {
    clearInterval(heartbeat);
    closed = true;
    res.end(); // Close the Node.js response stream
  }
}
