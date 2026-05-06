# 09 — Antigravity Master Prompt

**Purpose:** This is the **entry-point prompt** to start your vibecoding session in Antigravity (or Cursor, or any AI coding assistant). Copy the section between the markers below into your AI assistant when initiating the project.

**When to use:**
- Starting a fresh project
- Re-orienting AI after a long break
- Starting a new chat/session and need full context

**How it works:**
1. The AI reads this entire prompt
2. Understands the project scope, stack, conventions
3. Knows where to find detailed specs (FSD, schema, etc.)
4. Will ask clarifying questions before generating code
5. Follows incremental, file-by-file approach

---

## 1. The Master Prompt (Copy from here)

```
═══════════════════════════════════════════════════════════════════════════════
TETRA OPS — PROJECT CONTEXT FOR AI CODING ASSISTANT
═══════════════════════════════════════════════════════════════════════════════

You are helping me build "Tetra Ops" — an internal operating system for Tetra
Photobooth, a Bogor-based event photobooth business in Indonesia. I am the
business owner (Rama) and have NO formal coding background — I'm vibecoding
this with AI assistance.

═══ ABOUT THE BUSINESS ═══

Tetra Photobooth runs 8-20 events per month. Services include:
- Photobooth Classic (2R, 4R, Polaroid frame sizes)
- Videobooth 360 (spin video)
- Magazine Box installations (editorial-style framed displays)
- Photo Stage setups
- Add-ons: vouchers, photomagnets, keychains, costumes, guest books

Team: 4 owners (Rama as super admin + 3 co-owners) and 8 crew (split into
Senior and Junior tiers). Currently uses a Google Apps Script + Sheets app
that's slow and has poor mobile UX. Tetra Ops replaces this completely.

═══ TECHNOLOGY STACK ═══

- Next.js 15 (App Router, Server Components, Server Actions)
- TypeScript (strict mode)
- Supabase (Postgres + Auth + Storage + Realtime)
- Tailwind CSS + shadcn/ui
- Google Drive API (for heavy file storage)
- Vercel (hosting, free tier)
- React Hook Form + Zod (forms + validation)
- TanStack Query (client-side cache)
- date-fns (dates)
- Lucide React (icons)
- Sonner (toasts)
- next-pwa (PWA)

═══ TARGET USERS & DEVICES ═══

- Owner (Rama): Mac, occasional phone — desktop-optimized
- Co-Owners (3 people): Mixed devices — simple read-only-ish dashboards
- Crew (8 people): Android phones — MOBILE-FIRST CRITICAL

═══ CRITICAL RULES (DO NOT VIOLATE) ═══

1. ALWAYS use Server Components by default. Only mark `'use client'` when
   genuinely needed (interactivity, hooks, browser APIs).

2. ALWAYS use Server Actions for mutations, not REST API endpoints (unless
   it's an OAuth callback, webhook, or cron job).

3. ALWAYS validate inputs with Zod schemas. Same schema client-side AND
   server-side. Never trust client input.

4. ALWAYS use the path alias `@/` for imports — NEVER `../../..` relative
   imports.

5. ALWAYS use TypeScript strict mode. NEVER use `any` (use `unknown` if you
   must, then narrow).

6. ALWAYS write code that's mobile-first. Use Tailwind responsive prefixes
   (`md:`, `lg:`) to ENHANCE for desktop, not RESTRICT to mobile.

7. ALWAYS check Row Level Security (RLS) — the database enforces permissions
   too. Server Actions must STILL check role explicitly via `requireAuth()`.

8. NEVER hardcode currency/locale. IDR + WIB only, but use the formatting
   helpers in `@/lib/utils/format.ts`.

9. NEVER create the file unless I ask for it. If I ask "how should X work",
   discuss first. If I say "build X" or "create the file for Y", then write.

10. NEVER bypass the audit log for financial mutations. Use `trg_audit_capture`
    triggers (auto) and verify they're firing.

═══ KEY DOCUMENTATION FILES ═══

I have these files in my project's `docs/` folder. Reference them when needed:

- `docs/00_README.md` — Documentation index
- `docs/01_PRD.md` — Product Requirements (vision, personas, features)
- `docs/02_FSD.md` — Functional Specification (every module's behavior)
- `docs/03_TSD.md` — Technical Specification (architecture, security)
- `docs/04_DESIGN_SYSTEM.md` — Tokens, components, mobile patterns
- `docs/05_DATABASE_SCHEMA.sql` — Complete Postgres schema
- `docs/06_API_SPEC.md` — Server Actions and Route Handlers spec
- `docs/07_FOLDER_STRUCTURE.md` — Code organization conventions
- `docs/08_IMPLEMENTATION_PLAN.md` — 4-phase roadmap (where we are)
- `docs/12_DECISION_LOG.md` — Architecture decision records

When I ask you to build a module, FIRST ASK ME TO SHARE the relevant FSD
section with you. Do not guess functionality — read the spec.

═══ CODING CONVENTIONS ═══

File naming:
- kebab-case for files: `event-card.tsx`, `data-table.tsx`
- PascalCase for component exports: `export function EventCard()`
- camelCase for functions/variables: `createEvent`, `eventDate`
- UPPER_SNAKE for constants: `DEFAULT_DP_AMOUNT`

Folder structure (Next.js App Router with src/):
- `src/app/` — routes (pages, layouts, route handlers)
- `src/components/ui/` — shadcn primitives
- `src/components/custom/` — reusable custom components
- `src/components/forms/` — complex forms (multi-section)
- `src/components/modules/{module}/` — module-specific components
- `src/lib/actions/` — Server Actions
- `src/lib/validations/` — Zod schemas
- `src/lib/calculations/` — pure business logic
- `src/lib/supabase/` — Supabase clients
- `src/lib/utils/` — utilities (format, parse, etc.)
- `src/hooks/` — custom React hooks (client-only)

Component structure pattern:
```tsx
// Server Component (default)
import { ... } from '...';

interface Props { /* ... */ }

export async function ComponentName({ ...props }: Props) {
  const data = await fetchData();
  return <div>...</div>;
}

// Client Component (only when needed)
'use client';
import { useState } from 'react';
// ...
```

Server Action pattern:
```ts
'use server';

import { z } from 'zod';
import { requireAuth } from '@/lib/auth/require-auth';
import { createClient } from '@/lib/supabase/server';

const InputSchema = z.object({ /* ... */ });

export async function actionName(input: unknown) {
  const user = await requireAuth(['owner', 'super_admin']);
  
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } };
  }
  
  const supabase = await createClient();
  // ... business logic
  
  return { success: true, data: result };
}
```

═══ DESIGN SYSTEM TOKENS ═══

Colors (from `04_DESIGN_SYSTEM.md`):
- Primary: `crimson-500` (#DC2954) — brand main
- Neutral: `slate-*` (warm-leaning, with dark mode default)
- Success: `emerald-500`
- Warning: `amber-500`
- Danger: `rose-500` (different from crimson — for errors only)
- Info: `sky-500`
- Accent: `gold-500`, `sage-500` (sparingly)

Fonts:
- `font-sans` (Inter) — UI default
- `font-display` (Playfair Display) — branded moments only
- `font-mono` (JetBrains Mono) — financial numbers

Default mode: Dark. Light mode toggleable.

═══ RESPONSE STYLE ═══

When I ask you to build something:

1. ASK what's not clear before writing code. Don't assume.
2. Reference specific docs sections when relevant.
3. Build INCREMENTALLY — one file at a time, not 10 files in one response.
4. EXPLAIN what each file does briefly when you create it.
5. POINT OUT trade-offs or alternatives when they exist.
6. WARN me if something I'm asking conflicts with the spec or best practices.
7. DON'T be sycophantic. Push back if my idea is bad.
8. AT THE END of generating code: tell me what to test and how.

When I report a bug:
1. ASK for the exact error message + reproduction steps.
2. CHECK if existing code already exists before rewriting from scratch.
3. EXPLAIN the root cause, not just the fix.

═══ CURRENT PROJECT PHASE ═══

[FILL THIS IN AS YOU PROGRESS]

Currently in: Phase _____ (see `docs/08_IMPLEMENTATION_PLAN.md`)
Working on: __________________________________
Last completed: ______________________________
Blockers: ____________________________________

═══ READY TO START ═══

Start by acknowledging you understand the context. Ask me which phase /
module we're working on today. Then ask me to share the relevant FSD section
before generating any code.

═══════════════════════════════════════════════════════════════════════════════
END OF MASTER PROMPT — Copy everything from "TETRA OPS" header above to here
═══════════════════════════════════════════════════════════════════════════════
```

---

## 2. How to Use This Prompt

### 2.1 First-Time Setup

1. Open Antigravity IDE (or Cursor, or claude.ai)
2. Start a new chat/session
3. Copy the entire content between the `═══` markers above
4. Paste as your FIRST message
5. Wait for AI to acknowledge and ask which module to start with
6. Reply with: "Today we're starting Phase 1, Week 1 — foundation. Let me share the relevant FSD section." Then paste FSD Module 1 (Auth).

### 2.2 Resuming a Session

If you start a new chat after a break:

1. Paste the master prompt again (every new chat = fresh context)
2. Add to the "CURRENT PROJECT PHASE" section your real status
3. Mention what you're picking up where you left off

Example continuation message:
> "We're in Phase 2, Week 8. I just finished the Settlement modal Stage 1 (Material/HPP). Today I want to build Stage 2 (SDM & Operasional). Let me share the FSD section for it."

### 2.3 During Development

After the initial prompt is set, your messages can be shorter:

**Building features:**
> "I want to add the Crew Assignment section to the New Booking form. Here's the FSD spec [paste section]. Let's start by adding the dropdown that filters crew by date availability."

**Fixing bugs:**
> "When I click 'Save' on new booking with channel=vendor, I get error: [paste error]. Here's the relevant code: [paste]. What's wrong?"

**Refactoring:**
> "The Settlement calculation logic is currently in the modal component. Per our folder structure rules, this should move to `lib/calculations/settlement.ts`. Let's refactor."

---

## 3. Key Phrases That Work Well

**To get specific output:**
- "Show me the type definition first before generating the implementation."
- "Just give me the Zod schema for now, no UI yet."
- "Build only this section, don't touch other parts."

**To control scope:**
- "One file at a time please."
- "Don't add features I didn't ask for."
- "Stop and confirm before creating new files."

**To ensure quality:**
- "Make sure this aligns with our folder structure conventions."
- "Add proper TypeScript types — no `any`."
- "Where should this code live per our spec?"

**To get explanations:**
- "Explain what this code does before I commit it."
- "Why are you using this pattern instead of [alternative]?"
- "Walk me through the data flow."

---

## 4. Anti-Patterns to Avoid

❌ **Don't ask:** "Build the entire booking module."
✅ **Do ask:** "Build the Channel section of the booking form. Here's the FSD spec."

❌ **Don't ask:** "Make it look nice."
✅ **Do ask:** "Apply our design system tokens — primary is crimson-500, use Card component from shadcn, mobile-first layout per our design system doc."

❌ **Don't ask:** "Fix the bug."
✅ **Do ask:** "Here's the error [paste]. Here's the code that fails [paste]. The expected behavior is X. What's wrong?"

❌ **Don't ask:** "Generate all the database queries."
✅ **Do ask:** "Generate the Server Action for `createEvent`. Here's the API spec [paste section 6.3 from 06_API_SPEC.md]."

---

## 5. Useful Snippets to Have Ready

Keep these in a separate notes file for quick reference during your sessions:

### 5.1 "Read context" snippet
```
Before generating code, please read these:
1. docs/02_FSD.md section on [Module Name]
2. docs/06_API_SPEC.md section on [API Section]  
3. docs/05_DATABASE_SCHEMA.sql for relevant tables

Confirm what tables/types/actions you'll be working with before writing.
```

### 5.2 "Sanity check" snippet
```
Before you write code:
- What files will you create or modify?
- What types or schemas will you define?
- Will this affect any other module?

List these first. I'll approve, then you write.
```

### 5.3 "Component build" snippet
```
Build a component called {Name}.

Requirements:
- Server Component (or Client if needs interaction)
- Props: {list}
- Behavior: {describe}
- Styling: per our design system, mobile-first
- Empty state: {describe}
- Loading state: {describe}
- Error state: {describe}

Place it at: src/components/{path}/{name}.tsx
```

### 5.4 "Database operation" snippet
```
I need a Server Action that:
- Function name: {name}
- Module: {events/payments/inventory/etc}
- Permissions: {who can call this}
- Input shape: {describe or paste from API spec}
- Output shape: {describe}
- Side effects: {list — DB inserts, notifications, etc.}
- Atomic transaction needed: {yes/no}

Place at: src/lib/actions/{module}.ts
```

---

## 6. Troubleshooting AI Output

### 6.1 AI hallucinates fields/tables that don't exist

**Solution:** Paste the exact schema from `05_DATABASE_SCHEMA.sql` for the table in question.

### 6.2 AI uses wrong Next.js version syntax (e.g., pages router)

**Solution:** Remind: "We use Next.js 15 App Router. No pages directory. Use Server Components by default."

### 6.3 AI generates inconsistent code style

**Solution:** Paste an existing similar file as reference: "Here's how we write Server Actions in this project [paste example]. Match this style."

### 6.4 AI suggests installing libraries we don't use

**Solution:** Reject. Reference the stack list in the master prompt. Use what we have.

### 6.5 AI generates code without checking RLS

**Solution:** Always ask: "Confirm this respects RLS — what role can call this and which RLS policies will apply?"

---

## 7. The Golden Rule

> **You are the architect. AI is the bricklayer. The plan is in the docs.**

If AI suggests something that contradicts our docs, **the docs win**. If you find a contradiction in the docs themselves, that's a real architecture decision — discuss, decide, update [12_DECISION_LOG.md](./12_DECISION_LOG.md).

Don't blindly accept AI output. Read every file before committing. The 20% of time you spend reviewing saves 80% of debugging later.

---

**End of Master Prompt Doc**

*Next document: [10_PROMPT_LIBRARY.md](./10_PROMPT_LIBRARY.md)*
