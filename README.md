# Tetra Ops

Internal operating system for Tetra Photobooth — replaces the previous Apps Script + Google Sheets workflow.

**Stack:** Next.js 16 (App Router), TypeScript, Supabase (Postgres + Auth + Storage), Tailwind v4 + shadcn/ui, pnpm.

**Spec home:** see [docs/](./docs/) for the PRD, FSD, technical spec, schema, design system, implementation plan, and decision log.

## Local development

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm build        # production build smoke test
pnpm lint         # biome check
```

Required env vars are in `.env.example` — copy to `.env.local` and fill in.

## Deployment

Auto-deploys to Vercel on push to `main`.
