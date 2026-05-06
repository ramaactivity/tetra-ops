# 10 — Prompt Library

**Purpose:** Reusable prompt templates for common vibecoding scenarios. Copy, fill in placeholders `{like_this}`, and paste to your AI assistant.

**Prerequisite:** You've already initialized your AI session with the Master Prompt from [09_ANTIGRAVITY_MASTER_PROMPT.md](./09_ANTIGRAVITY_MASTER_PROMPT.md).

---

## Table of Contents

1. Building New Features
2. Database & Schema Changes
3. Forms & Validation
4. Components & UI
5. Server Actions & API
6. Bug Fixes & Debugging
7. Refactoring
8. Performance Optimization
9. Testing
10. Deployment & DevOps
11. Documentation Updates
12. Code Review

---

## 1. Building New Features

### 1.1 Start a New Module

```
I want to start building the {Module Name} module from our FSD.

Before writing code:
1. Read docs/02_FSD.md section "{Section Number} — {Module Name}"
2. Read docs/06_API_SPEC.md section "{Section Number}"
3. Identify which database tables from docs/05_DATABASE_SCHEMA.sql are involved

Then tell me:
- What pages/routes need to be created (per docs/07_FOLDER_STRUCTURE.md)
- What components are needed
- What Server Actions are needed
- What Zod schemas are needed
- Any cross-module dependencies

Don't write code yet. Just give me the plan.
```

### 1.2 Build a Specific Page

```
Build the page at route {route_path}.

Requirements (from FSD section {X}):
{paste relevant FSD content}

Specifications:
- Layout: {owner desktop / crew mobile / etc.}
- Default state: {what shows when user lands here}
- Empty state: {what to show if no data}
- Loading state: {what to show while data loads}
- Filters/controls: {list}
- Actions/buttons: {list}

Use Server Components for data fetching. Add 'use client' only for interactive parts.

Place the page at: src/app/{path}/page.tsx
```

### 1.3 Build a Sub-Component

```
Build a {component_name} component.

Purpose: {one-sentence description}

Props:
- {prop1}: {type} — {description}
- {prop2}: {type} — {description}

Behavior:
- {what user sees}
- {what user can interact with}
- {what callbacks fire}

Styling: per docs/04_DESIGN_SYSTEM.md
- Use design tokens (no hardcoded colors)
- Mobile-first responsive
- Match elevation/spacing rules

Place at: src/components/{path}/{kebab-case-name}.tsx
```

### 1.4 Connect Frontend to Backend

```
I have these pieces:
- Component: {component path} (currently has placeholder data)
- Server Action: {action name} at {action path}

Wire them together:
- Component should call the Server Action on {trigger event}
- Show loading state during the call
- Show error toast if failed (Sonner)
- Show success toast and {refresh / redirect} on success
- Optimistic UI if applicable

Don't change anything else in the component or action. Only connect them.
```

---

## 2. Database & Schema Changes

### 2.1 Add a New Column

```
I need to add a new column to the {table_name} table.

Column details:
- Name: {column_name}
- Type: {pg type}
- Nullable: {yes/no}
- Default: {value or NULL}
- Description/purpose: {what is this for}

Steps:
1. Generate a migration file at supabase/migrations/{timestamp}_add_{column_name}_to_{table}.sql
2. Update the relevant TypeScript types
3. Update any Zod schemas that reference this table
4. Update affected Server Actions to handle the new column
5. List which UI components need updating (don't update them yet)

DON'T modify the original schema file in docs/05_DATABASE_SCHEMA.sql — that's the historical record.
```

### 2.2 Add a New Table

```
I need a new table called {table_name}.

Purpose: {what this table represents}

Columns:
- {col1}: {type, constraints}
- {col2}: {type, constraints}
- ... (list all)

Foreign keys:
- {col} → {referenced_table.column}

Indexes needed:
- On {column(s)} because {reason}

RLS policies:
- {Role} can SELECT when {condition}
- {Role} can INSERT/UPDATE/DELETE when {condition}

Steps:
1. Generate the migration SQL
2. Generate the RLS policies
3. Generate any triggers (e.g., updated_at)
4. Update src/lib/supabase/types.ts (or remind me to regenerate)
5. List downstream code that needs updating
```

### 2.3 Modify Existing Logic

```
I need to change the behavior of {function/trigger/policy name}.

Current behavior:
{describe or paste}

New behavior:
{describe what should happen now}

Reason for change: {explain}

Steps:
1. Generate migration to update the SQL function/trigger/policy
2. Identify affected Server Actions
3. Identify affected components
4. Suggest test cases to verify the change works

Important: Make sure the change is backward-compatible if data exists.
```

### 2.4 Generate Supabase Types

```
After my schema change, I need to regenerate TypeScript types.

Run this command and let me know if it succeeds:
pnpm supabase gen types typescript --local > src/lib/supabase/types.ts

If we're using remote (linked) DB:
pnpm supabase gen types typescript --linked > src/lib/supabase/types.ts

After generating, scan for any breaking changes — fields that disappeared or types that changed — that might break existing code.
```

---

## 3. Forms & Validation

### 3.1 Build a Zod Schema

```
Generate a Zod schema for {form name / entity}.

Fields and rules:
- {field}: {type} — {validations: required, min, max, regex, etc.}
- {field}: {type} — ...

Custom validators needed:
- {e.g., Indonesian phone number, IDR amount, future date only}

Cross-field validations:
- {e.g., end_time must be after start_time}

Place at: src/lib/validations/{module}.ts

Also generate the inferred TypeScript type:
export type {Name}Input = z.infer<typeof {Name}Schema>;
```

### 3.2 Build a Form Component

```
Build a form for {purpose}.

Schema location: src/lib/validations/{path}.ts (already exists / generate it first)
Submission target: Server Action {action name} at {path}

Form fields (in order):
{list each field with its UI type: text input, select, date picker, file upload, etc.}

UI requirements:
- React Hook Form with Zod resolver
- Use shadcn/ui Form component
- Inline error messages below each field
- Submit button disabled while submitting (with spinner)
- After success: {redirect / clear / show toast}

Mobile considerations:
- {if any specific mobile UX needs}

Place at: src/components/forms/{form-name}/index.tsx
```

### 3.3 Add a New Field to Existing Form

```
I want to add a new field "{field_name}" to the form at {form path}.

Field details:
- Type: {input type}
- Validation: {rules}
- Position in form: {after which existing field}
- Default value: {if any}

Update:
1. The Zod schema (in src/lib/validations/{x}.ts)
2. The form component (UI)
3. The Server Action that processes this form
4. The database table if needed (separate prompt — see Section 2)

Show me the diffs, not full file rewrites.
```

---

## 4. Components & UI

### 4.1 Build a Reusable Component

```
I need a reusable component called {Name}.

Use cases:
- {use case 1}
- {use case 2}
- {use case 3}

API design:
- Props: {list}
- Variants: {list, e.g., size: 'sm' | 'md' | 'lg', variant: 'default' | 'destructive'}
- Composition: {e.g., supports children / has subcomponents}

Behavior:
{describe}

Styling:
- Use class-variance-authority for variants
- Use cn() helper for className merging
- All colors via design tokens (crimson, slate, etc.)

Place at: src/components/custom/{kebab-case-name}.tsx
Or: src/components/ui/{name}.tsx if it's a primitive

Show usage example after building.
```

### 4.2 Style an Existing Component

```
The component at {path} works but doesn't match our design system.

Issues:
- {issue 1, e.g., uses hardcoded #FF0000 instead of tokens}
- {issue 2}

Apply our design system per docs/04_DESIGN_SYSTEM.md:
- {specific token to use}
- {specific spacing/elevation rule}
- {responsive behavior}

Don't change functionality — only styling.
```

### 4.3 Make a Component Mobile-Friendly

```
The component at {path} works on desktop but breaks on mobile.

Current issues on mobile:
- {issue 1, e.g., horizontal scroll}
- {issue 2, e.g., buttons too small to tap}

Apply mobile-first principles per docs/04_DESIGN_SYSTEM.md:
- Tap targets minimum 44px
- Stack columns vertically below `md:` breakpoint
- Use Drawer instead of Dialog for modals on mobile
- {other specific guidance}

Test on viewport widths: 360px, 768px, 1024px, 1440px.
```

### 4.4 Create an Empty State

```
Add an empty state to {component path}.

When to show: {condition, e.g., no events match filters}

Empty state should include:
- Friendly heading: "{Indonesian text}"
- Subheading: "{call to action}"
- Primary CTA button: "{button label}" → {action or route}
- Optional: small illustration or icon

Use our EmptyState component pattern from docs/04_DESIGN_SYSTEM.md.

If we don't have a shared EmptyState component, build one first at:
src/components/custom/empty-state.tsx
```

---

## 5. Server Actions & API

### 5.1 Build a Server Action

```
Build a Server Action: {actionName}

Reference: docs/06_API_SPEC.md section {x.y}

Specifications:
- Auth required: {role(s)}
- Input shape: {paste schema or describe}
- Output shape: {describe}
- Side effects: {list — DB inserts/updates, notifications, file uploads, etc.}
- Atomic transaction: {yes/no, with explanation}
- Error cases to handle: {list}

Code requirements:
- 'use server' at top
- requireAuth() at top of function
- Zod validation
- Use createClient() from @/lib/supabase/server
- Return ActionResult<T> shape
- Wrap multi-step DB operations in RPC functions (Supabase) for atomicity

Place at: src/lib/actions/{module}.ts (append if file exists)

Show me the code and explain the transaction boundaries.
```

### 5.2 Build a Route Handler

```
Build a Route Handler at {path}.

Purpose: {webhook / cron / file upload / OAuth callback}

Method(s): {GET / POST / etc.}

Auth:
- {public / cron secret / Supabase session / etc.}

Request shape:
- Headers: {list}
- Body: {paste type or describe}

Response shape:
- Success: {describe}
- Errors: {describe}

Place at: src/app/api/{path}/route.ts

Cron jobs need to verify CRON_SECRET header. Reject if missing or wrong.

Show me the code with proper error handling.
```

### 5.3 Add a New Calculation Function

```
Add a pure calculation function to {path}.

Function name: {name}
Purpose: {what it computes}

Input:
{describe shape}

Output:
{describe shape}

Logic:
{describe formula or paste from FSD/business rules}

Requirements:
- Pure function (no DB access, no side effects)
- TypeScript types in/out (no `any`)
- Handle edge cases (zero, negative, null inputs)
- Add inline comments explaining the formula

Place at: src/lib/calculations/{topic}.ts

Add a usage example as JSDoc above the function.
```

---

## 6. Bug Fixes & Debugging

### 6.1 Diagnose a Bug

```
I'm seeing a bug. Please diagnose before suggesting a fix.

Symptom:
{what user sees / what's wrong}

Expected behavior:
{what should happen}

Steps to reproduce:
1. {step 1}
2. {step 2}
3. {bug appears}

Error message (if any):
{paste exact error from console / logs}

Relevant files:
- {file 1}: {paste content}
- {file 2}: {paste content}

Browser/device:
{Chrome desktop / Safari iPhone / Android Chrome / etc.}

Don't fix yet. First explain:
1. What's the root cause?
2. Why is this happening?
3. What are 2-3 ways to fix it, with trade-offs?

Then I'll pick one and you implement it.
```

### 6.2 Fix a Specific Error

```
I keep getting this error:

{paste exact error}

In file: {path}
At line: {number}

Code context:
{paste relevant code, ~20 lines around the error}

The function is called from: {callsite}

Fix it. Show me only the diff. Explain why this fix works.
```

### 6.3 Investigate Slow Performance

```
The {page/component/action} feels slow.

Symptoms:
- {e.g., takes 5 seconds to load on desktop}
- {e.g., laggy when scrolling}
- {e.g., spinner shows for too long}

Steps to investigate:
1. Profile with Chrome DevTools — what's the bottleneck?
2. Check if it's a network issue (slow Server Action) or render issue (heavy component)
3. Check Supabase query logs if it's DB-related

After investigation, suggest concrete fixes.
```

### 6.4 Database Query Issues

```
This Supabase query isn't returning what I expect:

{paste query code}

Expected: {what should be returned}
Actual: {what's actually returned}

Check:
1. Is RLS blocking the result?
2. Is the JOIN filtering more than intended?
3. Are there NULL values causing issues?
4. Is the column name spelled correctly?

Query the same data via Supabase SQL Editor manually to verify. Tell me the SQL to run as a sanity check.
```

---

## 7. Refactoring

### 7.1 Extract Component

```
The component at {path} is getting large ({approx_lines} lines).

I want to extract:
- {sub-section 1}: into a new file {target path}
- {sub-section 2}: into a new file {target path}

Rules:
- Don't change behavior
- Update imports
- Keep TypeScript types tight
- Maintain prop drilling logic correctly

Show me the resulting file structure first, then the code.
```

### 7.2 Move Logic to Lib

```
I have business logic embedded in {component path} that should live in src/lib/.

The logic:
{describe or paste the function/code}

Per our conventions (docs/07_FOLDER_STRUCTURE.md):
- Pure calculation → src/lib/calculations/{topic}.ts
- Server-side mutation → src/lib/actions/{module}.ts
- Utility helper → src/lib/utils/{topic}.ts

Move it to: {target}

Update all callsites. Show me the imports diff.
```

### 7.3 Replace Pattern Throughout Codebase

```
I want to replace {old pattern} with {new pattern} across the project.

Examples of old pattern:
{paste 1-2 examples}

New pattern should look like:
{paste the desired form}

Steps:
1. Find all occurrences (use semantic search if available)
2. List them
3. Replace one at a time, showing each diff
4. Don't auto-commit — let me review each

If the find scope is large (>10 files), let's discuss strategy first.
```

---

## 8. Performance Optimization

### 8.1 Bundle Size Audit

```
Run a bundle size analysis:

1. Build the production bundle: pnpm build
2. Read the output — which routes are heaviest?
3. Identify any large dependencies that could be:
   - Lazy-loaded (dynamic import)
   - Replaced with lighter alternatives
   - Used only client-side (move out of Server Component)

Also check:
- Are we importing entire libraries when we only need one function?
- Are there unused dependencies in package.json?

Don't make changes yet. Give me a report first.
```

### 8.2 Database Query Optimization

```
This query is slow:

{paste query}

Run EXPLAIN ANALYZE in Supabase SQL Editor. Tell me:
1. What's the execution plan
2. Where's the bottleneck (sequential scan? bad join?)
3. Are needed indexes missing?
4. Can we rewrite the query to be faster?

Suggest fixes ordered by impact / effort.
```

### 8.3 React Re-render Optimization

```
The component at {path} re-renders too often (visible in React DevTools).

Investigate:
1. What's causing re-renders? Parent re-rendering? Props changing identity? State updates?
2. Is memoization (useMemo, useCallback, React.memo) appropriate here?
3. Is there a higher-up state lift that would help?

Don't fix yet — diagnose first. Then propose the cleanest fix.
```

---

## 9. Testing

### 9.1 Manual Test Plan

```
Generate a manual test plan for {feature/module}.

Cover:
- Happy path (all working as expected)
- Edge cases (empty data, max data, special characters)
- Error cases (invalid input, network failure, permission denied)
- Mobile-specific tests (if applicable)
- Cross-browser (if applicable)

Format as a checklist I can run through.
```

### 9.2 Add Playwright E2E Test (Future)

```
Add a Playwright E2E test for the {workflow name} flow.

Steps to test:
1. {step 1}
2. {step 2}
3. {step 3 — verify outcome}

Use selectors:
- Prefer data-testid attributes
- Fall back to accessible names (aria-label, button text)

Place at: e2e/{flow-name}.spec.ts

Include setup (login as {role}) and teardown (cleanup test data) hooks.
```

---

## 10. Deployment & DevOps

### 10.1 Pre-Deploy Checklist

```
I'm about to deploy a change to production. Help me run a pre-deploy check:

1. Run pnpm build locally — any errors or warnings?
2. Check git status — any uncommitted files I forgot?
3. Run pnpm check — any lint errors?
4. Test the change locally one more time — does it work?
5. Are there environment variables needed in Vercel? (List them)
6. Database migrations needed? (List them — I'll apply manually)
7. Any breaking changes for existing users?

Confirm all 7 are green before I push.
```

### 10.2 Rollback Plan

```
I need to roll back the last deploy. Help me:

1. Identify which Vercel deployment to revert to
2. Walk me through the Vercel dashboard rollback steps
3. If database migrations were applied, are they reversible? Or do we need to write a reverse migration?
4. Notify users? (probably not for this scale)

Give me a step-by-step plan I can execute in <5 min.
```

### 10.3 Add Environment Variable

```
I need to add a new environment variable: {VAR_NAME}

Purpose: {what this is for}

Steps:
1. Add to .env.example with empty value and a comment
2. Add to .env.local with my actual value
3. Update src/types/env.d.ts to type it
4. Add to Vercel dashboard for production
5. Use it in code at: {path}

Show me the diffs. If it's a secret, mark accordingly (never NEXT_PUBLIC_).
```

---

## 11. Documentation Updates

### 11.1 Update Docs After a Feature

```
I just finished implementing {feature}. Update the relevant docs:

Files to update:
- docs/02_FSD.md — if functionality differs from spec, note the change
- docs/06_API_SPEC.md — if new actions/endpoints, add them
- docs/12_DECISION_LOG.md — if I made any non-trivial architecture decisions
- docs/08_IMPLEMENTATION_PLAN.md — mark this task as done

Don't rewrite — show me a diff of what to add/change.

If something we implemented contradicts the spec, that's a real decision — log it in DECISION_LOG.md with rationale.
```

### 11.2 Create Inline Code Documentation

```
Add JSDoc comments to {file path}.

Cover:
- Brief description of the file's purpose at top
- Each exported function: purpose, params, returns, example
- Complex logic: inline comments explaining "why" (not "what")

Don't over-document obvious code. Focus on:
- Business logic that's not self-explanatory
- Tricky calculations
- Non-obvious side effects
- Workarounds for known issues
```

---

## 12. Code Review

### 12.1 Self-Review Before Commit

```
Review my recent changes before I commit. Files changed:

{list files or paste diff}

Check for:
1. TypeScript: any usage of `any`? Missing types?
2. Conventions: matches our folder structure? Naming consistent?
3. Security: are inputs validated? RLS not bypassed?
4. Performance: any obvious issues (unnecessary re-renders, N+1 queries)?
5. Edge cases: handles empty, null, error states?
6. Mobile: works on phone viewport?
7. Tests: any new logic that needs a manual test plan?

Give me a brief list of issues. Don't auto-fix — let me address each.
```

### 12.2 Compare to Spec

```
I just finished {feature}. Compare what I built to the spec:

Spec location: docs/02_FSD.md section {x.y}

My implementation:
{list files}

Verify:
1. All spec'd behavior is implemented
2. Nothing implemented goes beyond the spec (no scope creep)
3. UI matches design system
4. Edge cases from spec are handled

Report deviations. Big deviations need to either be reverted or logged in DECISION_LOG.md.
```

### 12.3 Security Review

```
Review {file path} for security issues.

Look for:
1. SQL injection risks (string concat in queries)
2. XSS risks (unsafe rendering of user input)
3. Auth bypass (missing requireAuth, leaky RLS)
4. Sensitive data exposure (logs, error messages)
5. CSRF risks (state-changing GET endpoints)
6. Insecure file uploads (no type/size validation)
7. Hardcoded secrets

Be thorough. Better paranoid than sorry.
```

---

## 13. Special Scenarios

### 13.1 Migration from Apps Script V1

```
I have data in my old Google Apps Script + Sheets app at {URL or sheet ref}.

Per our migration strategy (docs/08_IMPLEMENTATION_PLAN.md), we're NOT migrating historical data — only ~20 active upcoming events via the Onboarding Wizard.

For these active events:
{paste data or share screenshot of events}

Help me:
1. Map old fields to new schema fields
2. Identify what's missing (fields I'll need to fill in manually)
3. Validate the data before importing

Don't write import code yet. Just analyze and report.
```

### 13.2 Adding Real Crew/Client Data

```
I'm setting up real data for go-live.

Crew members to add:
{list of names with roles and tiers}

Inventory at hand (from physical count):
{list of items with quantities}

Bank balances (as of go-live date):
{list of account: balance}

Walk me through the Onboarding Wizard flow. Tell me which step to enter each piece of data. Confirm I won't lose data if I close mid-wizard.
```

### 13.3 Handling Sensitive Owner Discussion

```
[For decisions affecting other co-owners]

I'm thinking about changing {policy/rule}, e.g., "Owner Pool from Rp 200k to Rp 300k per event".

This affects all 4 owners' earnings.

Help me:
1. Run scenarios — what's the impact on profit margin and cash flow?
2. Compare current vs proposed using last month's data
3. Identify edge cases (loss events still skip pool? same logic?)
4. Draft a brief WhatsApp message to co-owners explaining the change clearly

Don't write code yet. This is a business decision discussion.
```

---

## 14. Quick One-Liners

For very fast asks:

- "Add a tooltip to {element} saying '{text}'"
- "Make this button disabled when {condition}"
- "Show this number formatted as IDR (use formatIDR helper)"
- "Add a loading skeleton to this card"
- "Move this state up to the parent component"
- "Add aria-label '{text}' to this icon button"
- "Sort this list by {field} descending"
- "Add a search input that filters by {field}"
- "Convert this Server Component to streaming with Suspense"
- "Replace this image with the Next.js Image component"

---

## 15. When AI Output Disappoints

If the AI generates something that doesn't fit:

```
This output doesn't match what I asked.

Specifically:
- {issue 1}
- {issue 2}

Re-read my original prompt above. Pay attention to:
- {specific constraint}
- {specific requirement}

Try again. Don't apologize, just produce the correct output.
```

Or, if it keeps misbehaving:

```
Let's reset this conversation. Re-read docs/09_ANTIGRAVITY_MASTER_PROMPT.md to refresh context. Then I'll restate my request.
```

---

**End of Prompt Library**

*Next document: [11_TROUBLESHOOTING.md](./11_TROUBLESHOOTING.md)*
