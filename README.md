# BandFix AI

Multi-agent debugging squadron — four AI agents (Orchestrator, Bug Finder, Fix Generator, Reviewer) collaborate live over a Band message bus to find, fix, and review your code.

**Stack:** Vite + React 19 + TanStack Router (SPA) + Tailwind v4 + shadcn/ui · OpenAI (gpt-4o-mini) · Vercel serverless function with SSE.

---

## Run locally

```bash
npm install
cp .env.example .env
# edit .env and paste your OPENAI_API_KEY
npm run dev
```

Open <http://localhost:3000>.

> Note: the agents only run when the API function is reachable. `npm run dev` serves the frontend; for full agent runs locally use `vercel dev` (see Deploy below), or just deploy to Vercel.

## Deploy to Vercel

1. Push this folder to a Git repo (GitHub/GitLab/Bitbucket).
2. Go to <https://vercel.com/new> and import the repo.
3. Framework preset: **Vite** (auto-detected).
4. In **Environment Variables**, add:

   | Name              | Value              |
   |-------------------|--------------------|
   | `OPENAI_API_KEY`  | `sk-…`             |
   | `OPENAI_MODEL`    | `gpt-4o-mini` (optional, defaults to this) |

5. Click **Deploy**. Done.

`vercel.json` already configures:
- Build command + output directory
- SPA fallback rewrites (so deep links like `/result/abc` work)
- 60s max duration on `/api/run` (multi-agent calls can take 30–50s)

### Or via CLI

```bash
npm i -g vercel
vercel login
vercel link
vercel env add OPENAI_API_KEY
vercel --prod
```

## Project structure

```
bandfix-ai/
├── api/
│   ├── run.ts              # Vercel serverless function — POST /api/run (SSE)
│   └── _lib/
│       └── runner.ts       # The 4-agent runner, calls OpenAI
├── src/
│   ├── components/ui/      # shadcn/ui components
│   ├── lib/                # types, sessions store (localStorage), markdown report
│   ├── routes/             # TanStack Router file-based routes
│   ├── main.tsx            # SPA entry
│   ├── router.tsx          # Router setup
│   └── styles.css          # Tailwind v4 + theme
├── index.html              # Vite entry
├── vercel.json             # Vercel config
├── vite.config.ts          # Vite config (no Lovable wrapper)
└── package.json
```

## How the agents talk

Four agents publish/subscribe over five Band channels:

```
#new-session   →   #bug-report   →   #fix-proposal   →   #review-result   →   #session-complete
 Orchestrator       Bug Finder        Fix Generator        Reviewer            Orchestrator
```

The full transcript is streamed to the client via SSE as the agents work, so the `/run/$id` page renders the conversation live. Sessions are persisted in browser `localStorage`.

## What changed vs. the Lovable version

- Removed `@lovable.dev/vite-tanstack-config` and TanStack Start (SSR) — replaced with plain Vite SPA.
- Removed the Cloudflare Nitro build target that was blocking Vercel deployment.
- Replaced Lovable AI Gateway (`ai.gateway.lovable.dev`) with the official OpenAI SDK.
- Removed Supabase integration and Lovable error-capture wrappers (unused).
- Moved the API route from a TanStack Start file route to a Vercel serverless function at `/api/run.ts`.

UI, routes, and agent behaviour are identical to the Lovable build.
