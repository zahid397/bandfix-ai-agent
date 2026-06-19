import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Dev-only plugin: serves POST /api/run during `npm run dev`.
 *
 * Plain Vite has no serverless runtime, so without this the frontend's
 * fetch("/api/run") would 404 locally and the squadron would never start.
 * This mounts the SAME runner the Vercel function uses, streaming SSE — so
 * `npm run dev` works end-to-end with just an OPENAI_API_KEY in .env (and
 * still progresses via the fallback engine even with no key).
 */
function devApiPlugin(): Plugin {
  return {
    name: "bandfix-dev-api",
    configureServer(server) {
      server.middlewares.use("/api/run", (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("Method Not Allowed");
          return;
        }

        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        req.on("end", async () => {
          let input: { title?: string; language?: string; code?: string; error?: string };
          try {
            input = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
          } catch {
            res.statusCode = 400;
            res.end("Invalid JSON body");
            return;
          }
          if (!input?.code || typeof input.code !== "string") {
            res.statusCode = 400;
            res.end("`code` is required");
            return;
          }

          res.statusCode = 200;
          res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
          res.setHeader("Cache-Control", "no-cache, no-transform");
          res.setHeader("Connection", "keep-alive");
          res.setHeader("X-Accel-Buffering", "no");
          res.write(":ok\n\n");
          const heartbeat = setInterval(() => res.write(":hb\n\n"), 15000);

          try {
            // ssrLoadModule lets Vite transform the TS runner on the fly.
            const mod = (await server.ssrLoadModule("/api/_lib/runner.ts")) as {
              runDebugSession: (i: {
                title: string;
                language: string;
                code: string;
                error: string;
              }) => AsyncGenerator<unknown>;
            };
            for await (const ev of mod.runDebugSession({
              title: input.title || "Untitled bug",
              language: input.language || "javascript",
              code: input.code,
              error: input.error || "",
            })) {
              res.write(`data: ${JSON.stringify(ev)}\n\n`);
            }
          } catch (err) {
            res.write(
              `data: ${JSON.stringify({
                kind: "error",
                error: err instanceof Error ? err.message : "Unknown error",
              })}\n\n`,
            );
          } finally {
            clearInterval(heartbeat);
            res.end();
          }
        });
      });
    },
  };
}

// Plain Vite SPA + TanStack Router file-based routing. Builds to a static
// "dist/" that Vercel serves, with the API function at /api/run.
export default defineConfig({
  plugins: [
    devApiPlugin(),
    TanStackRouterVite({
      target: "react",
      autoCodeSplitting: true,
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
    }),
    react(),
    tsconfigPaths(),
    tailwindcss(),
  ],
  build: {
    outDir: "dist",
    sourcemap: false,
  },
  server: {
    port: 3000,
  },
});
