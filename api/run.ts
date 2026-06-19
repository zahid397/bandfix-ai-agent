/**
 * Vercel serverless function — POST /api/run
 *
 * Streams the multi-agent debugging session to the client as Server-Sent
 * Events. The orchestrator starts executing the instant the stream opens, so
 * the client never sees a stuck QUEUED state.
 *
 * Frontend consumer: src/routes/_shell.run.$id.tsx
 * Runtime: Node.js (uses node:events). Max duration 60s — see vercel.json.
 */

import { runDebugSession } from "./_lib/runner";
import type { SessionInput, StreamEvent } from "../src/lib/bandfix-types";

export const config = {
  runtime: "nodejs",
  maxDuration: 60,
};

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let input: SessionInput;
  try {
    input = (await request.json()) as SessionInput;
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  if (!input?.code || typeof input.code !== "string") {
    return new Response("`code` is required", { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const safeEnqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          /* controller already closed */
        }
      };
      const send = (event: StreamEvent) => safeEnqueue(`data: ${JSON.stringify(event)}\n\n`);

      // Open the stream immediately + keep the connection warm during the
      // (potentially long) model calls so no proxy buffers or times us out.
      safeEnqueue(":ok\n\n");
      const heartbeat = setInterval(() => safeEnqueue(":hb\n\n"), 15000);

      try {
        for await (const ev of runDebugSession({
          title: input.title || "Untitled bug",
          language: input.language || "javascript",
          code: input.code,
          error: input.error || "",
        })) {
          send(ev);
        }
      } catch (err) {
        send({ kind: "error", error: err instanceof Error ? err.message : "Unknown error" });
      } finally {
        clearInterval(heartbeat);
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
