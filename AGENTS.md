# AGENTS.md

Project: Next.js + TypeScript proof-of-concept that runs AI-generated code in a Vercel Sandbox.

## Setup
- Install: `npm install`
- Dev server: `npm run dev`
- Lint: `npm run lint`

## Environment
- `AI_GATEWAY_API_KEY` is required for `/api/agent`.
- Vercel Sandbox requires OIDC credentials. Run `vercel link` and `vercel env pull` to populate `VERCEL_OIDC_TOKEN` locally.

## Code Style
- App Router routes live under `src/app`.
- API route for the agent is `src/app/api/agent/route.ts`.
- Keep UI changes in `src/app/page.tsx` and `src/app/globals.css`.
