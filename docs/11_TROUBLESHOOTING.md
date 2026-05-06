# 11 — Troubleshooting Guide

**Purpose:** Common issues you'll hit while building Tetra Ops, with diagnoses and fixes. Updated as new issues emerge.

---

## Table of Contents

1. Setup & Environment Issues
2. Next.js & React Issues
3. Supabase & Database Issues
4. Auth & RLS Issues
5. Forms & Validation Issues
6. Server Actions Issues
7. PWA Issues
8. Vercel Deployment Issues
9. Google Drive API Issues
10. Performance Issues
11. TypeScript Issues
12. Common Vibecoding Mistakes

---

## 1. Setup & Environment Issues

### 1.1 `pnpm: command not found`

**Cause:** pnpm not installed globally.

**Fix:**
```bash
npm install -g pnpm
```

If still not found, check if npm global bin is in your PATH:
```bash
npm config get prefix
# Add the resulting path/bin to your shell PATH (~/.zshrc on Mac)
```

### 1.2 Port 3000 already in use

**Symptom:** `Error: listen EADDRINUSE: address already in use :::3000`

**Fix:**
```bash
# Find what's using the port
lsof -i :3000

# Kill that process (use the PID from above output)
kill -9 {PID}

# Or run dev on different port
PORT=3001 pnpm dev
```

### 1.3 `.env.local` not loaded

**Symptom:** `process.env.NEXT_PUBLIC_SUPABASE_URL` is undefined

**Common causes:**
- File is named `.env` instead of `.env.local`
- File is in wrong directory (must be in project root)
- Variable name typo
- Forgot to restart dev server after adding the variable

**Fix:**
```bash
# Stop dev server (Ctrl+C)
# Verify file exists at root
ls -la .env.local

# Restart
pnpm dev
```

### 1.4 `NEXT_PUBLIC_*` vs server-only env vars

**Rule:** Variables prefixed with `NEXT_PUBLIC_` are exposed to the browser. ANY variable WITHOUT this prefix is server-only.

**Mistake:** Using `process.env.SUPABASE_SERVICE_ROLE_KEY` in a Client Component → returns `undefined` and possibly leaks if you fix it wrong.

**Fix:** Service role key must NEVER be in browser. Use it only in:
- Server Actions
- Route Handlers
- API Routes
- Middleware

```ts
// ❌ Wrong — never do this
'use client';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY; // undefined in browser

// ✅ Right
'use server';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY; // works, server-side only
```

### 1.5 Node version mismatch

**Symptom:** Cryptic build errors, package install failures.

**Fix:**
```bash
node --version
# Should be v20.x or higher

# If lower, install Node 20 via nvm:
nvm install 20
nvm use 20
```

---

## 2. Next.js & React Issues

### 2.1 "You're importing a component that needs `useState`. It only works in a Client Component..."

**Cause:** You're using a React hook (useState, useEffect, etc.) in a Server Component.

**Fix:** Add `'use client'` at the top of the file:
```tsx
'use client';

import { useState } from 'react';
// ...
```

But first ask: **does this really need to be a client component?** Often you can rearrange so only a small interactive part is `'use client'`, keeping the parent as Server Component.

### 2.2 Hydration mismatch error

**Symptom:** Console error: "Hydration failed because the server rendered HTML didn't match the client."

**Common causes:**
- Using `Date.now()` or `Math.random()` during render (different on server vs client)
- Conditional rendering based on `window` (undefined on server)
- Browser-only APIs (localStorage, sessionStorage) used during render

**Fix:**
```tsx
// ❌ Wrong
function Component() {
  return <div>{new Date().toLocaleString()}</div>;
}

// ✅ Right — render only after mount
function Component() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return <div>{new Date().toLocaleString()}</div>;
}
```

Or use a library like `next/dynamic` with `ssr: false` for components that only work client-side.

### 2.3 Async Server Components causing strange errors

**Symptom:** Error like "Functions cannot be passed directly to Client Components..."

**Cause:** Trying to pass server-side functions or non-serializable data as props from Server Component to Client Component.

**Fix:** Pass only serializable data (strings, numbers, plain objects, arrays) as props. For interactivity, keep the function in the Client Component, or use Server Actions with `bind`:

```tsx
// ✅ Right
import { serverAction } from '@/lib/actions/x';

function ServerComponent() {
  return <ClientComponent action={serverAction} />;
}

'use client';
function ClientComponent({ action }) {
  return <button onClick={() => action()}>Click</button>;
}
```

### 2.4 Image optimization warnings

**Symptom:** `Warning: Using <img> could result in slower LCP. Use <Image> from 'next/image' instead.`

**Fix:**
```tsx
import Image from 'next/image';

// Before:
<img src="/logo.png" alt="Logo" />

// After:
<Image src="/logo.png" alt="Logo" width={100} height={50} />
```

For external images, configure `next.config.mjs`:
```js
images: {
  remotePatterns: [
    { protocol: 'https', hostname: 'lh3.googleusercontent.com' }, // Google avatars
  ],
}
```

### 2.5 Page not refreshing after Server Action

**Symptom:** I create/update something via Server Action, but the page still shows old data.

**Cause:** Next.js cache.

**Fix:** Call `revalidatePath` or `revalidateTag` in the Server Action:
```ts
'use server';
import { revalidatePath } from 'next/cache';

export async function updateEvent(...) {
  // ... mutation
  revalidatePath('/operations');
  revalidatePath(`/operations/${projectId}`);
  return { success: true };
}
```

---

## 3. Supabase & Database Issues

### 3.1 "Failed to fetch" error from Supabase

**Common causes:**
- `NEXT_PUBLIC_SUPABASE_URL` typo
- Network issue
- Supabase project paused (free tier pauses after inactivity)

**Fix:**
1. Check Supabase dashboard — is project active?
2. Verify URL: should be `https://xxx.supabase.co` (no trailing slash)
3. Check browser console for CORS errors

### 3.2 RLS blocking my legitimate query

**Symptom:** Query returns empty array but data exists in DB (verified via SQL Editor).

**Diagnosis:**
1. Open Supabase Dashboard → SQL Editor
2. Run query as authenticated user:
   ```sql
   SET LOCAL request.jwt.claim.sub = 'YOUR_USER_UUID';
   SELECT * FROM events;
   ```
3. If returns empty, RLS is the issue.

**Fix options:**
- Update RLS policy to allow this case
- Use service role client for admin operations:
  ```ts
  import { createClient } from '@supabase/supabase-js';
  const supabaseAdmin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  // This client bypasses RLS — use VERY carefully, server-side only
  ```

### 3.3 Migration fails with "syntax error"

**Cause:** Likely SQL dialect issue or trying to run multiple statements in one execution.

**Fix:**
1. Run migration via Supabase Dashboard SQL Editor (handles multi-statements)
2. Or use the CLI which handles this:
   ```bash
   pnpm supabase db push
   ```

### 3.4 Foreign key violation when inserting

**Symptom:** `ERROR: insert or update on table "X" violates foreign key constraint`

**Fix:**
- Verify the referenced row exists before inserting
- Check column types match (e.g., both UUID)
- If inserting in a transaction, ensure parent insert happens FIRST

### 3.5 "Column does not exist" after schema change

**Cause:** TypeScript types are stale.

**Fix:**
```bash
# Regenerate types
pnpm supabase gen types typescript --linked > src/lib/supabase/types.ts

# Or for local dev:
pnpm supabase gen types typescript --local > src/lib/supabase/types.ts
```

Restart dev server.

### 3.6 `current_stock` calculation wrong

**Symptom:** Stock display doesn't match expected value.

**Diagnosis:**
1. Check stock_movements for the item:
   ```sql
   SELECT direction, quantity, source, created_at
   FROM stock_movements
   WHERE item_id = 'XXX'
   ORDER BY created_at DESC;
   ```
2. Manually sum: total = SUM(IN quantities) - SUM(OUT quantities)
3. Compare to `get_current_stock(item_id)` function output

**If mismatch:**
- Look for movements with weird direction values
- Check if 'adjustment' direction was used incorrectly
- Verify the function logic in schema matches your math

**Fix:** Insert a corrective `adjustment` movement to true up the count:
```sql
INSERT INTO stock_movements (item_id, direction, quantity, source, source_description, performed_by)
VALUES ('XXX', 'adjustment', 5, 'manual_adjust', 'Stock take correction', 'YOUR_USER_ID');
```

---

## 4. Auth & RLS Issues

### 4.1 User can sign in but immediately gets logged out

**Cause:** Cookie not being set/read correctly.

**Diagnosis:**
1. Check browser DevTools → Application → Cookies
2. Look for `sb-{project_ref}-auth-token` cookie
3. If missing or has weird value, cookie write failed

**Common fixes:**
- Use `@supabase/ssr` package, not the basic `@supabase/supabase-js` for SSR scenarios
- Ensure `middleware.ts` is correctly forwarding cookies
- Check `next.config.mjs` for any cookie domain issues

### 4.2 User has wrong role / role didn't update

**Cause:** Cached user object in client.

**Fix:**
```ts
// Client side
const supabase = createClient();
await supabase.auth.refreshSession();
window.location.reload();

// Or server side, in Server Action after role update:
revalidatePath('/');
```

### 4.3 OAuth redirects to wrong URL

**Symptom:** After Google sign-in, lands on `localhost:3000` even in production.

**Cause:** Misconfigured redirect URLs in Google Cloud Console or Supabase.

**Fix:**
1. Google Cloud Console → OAuth Client → add prod URL to authorized origins + redirect URIs
2. Supabase Dashboard → Auth → URL Configuration → set Site URL to prod URL
3. In your code, use environment-aware URL:
   ```ts
   const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`;
   ```

### 4.4 RLS policy creates infinite recursion

**Symptom:** Query times out or returns "infinite recursion detected in policy".

**Cause:** RLS policy queries the same table it's protecting.

**Fix:** Use a SECURITY DEFINER function:
```sql
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS user_role AS $$
DECLARE
  v_role user_role;
BEGIN
  SELECT role INTO v_role FROM users WHERE id = auth.uid();
  RETURN v_role;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Then use this function in policies, not direct queries to users
```

The `SECURITY DEFINER` runs the function with the privileges of its definer (postgres), bypassing RLS for that internal lookup.

---

## 5. Forms & Validation Issues

### 5.1 Form submits but shows "Validation error" with no details

**Cause:** Zod error format not surfaced to UI.

**Fix:** In your Server Action, return field-specific errors:
```ts
const parsed = Schema.safeParse(input);
if (!parsed.success) {
  return {
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Invalid input',
      issues: parsed.error.format(),  // <-- field-level errors
    },
  };
}
```

In your form, display issues per field.

### 5.2 React Hook Form not connecting to shadcn Form

**Cause:** Missing `<Form>` provider wrapper.

**Fix:**
```tsx
import { Form } from '@/components/ui/form';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

const form = useForm({
  resolver: zodResolver(Schema),
  defaultValues: { /* ... */ },
});

return (
  <Form {...form}>
    <form onSubmit={form.handleSubmit(onSubmit)}>
      {/* FormField components */}
    </form>
  </Form>
);
```

### 5.3 Date picker timezone issues

**Symptom:** User picks "May 6, 2026" but DB stores "May 5, 2026".

**Cause:** Date converted to UTC during transmission, losing local timezone.

**Fix:** Always store dates as YYYY-MM-DD strings (not Date objects) for date-only fields:
```ts
// Schema
event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),

// Form: format with date-fns
import { format } from 'date-fns';
const formatted = format(date, 'yyyy-MM-dd');

// Display: parse and format back to local
import { parseISO, format } from 'date-fns';
const display = format(parseISO('2026-05-06'), 'dd MMM yyyy');
```

### 5.4 Number input accepting non-numbers

**Symptom:** User types letters in IDR amount field, form submits with NaN.

**Fix:** Use `valueAsNumber` and proper validation:
```tsx
<Input
  type="number"
  min={0}
  step={1000}
  {...register('amount', { valueAsNumber: true })}
/>
```

---

## 6. Server Actions Issues

### 6.1 Server Action returns nothing (undefined)

**Cause:** Forgot to return a value.

**Fix:**
```ts
'use server';

export async function someAction(input) {
  // ... logic
  return { success: true, data: result }; // <-- ALWAYS return
}
```

### 6.2 Server Action throws unhandled error

**Symptom:** Browser shows generic error, no useful info.

**Fix:** Always wrap in try-catch and return structured errors:
```ts
'use server';

export async function someAction(input) {
  try {
    // ... logic
    return { success: true, data: result };
  } catch (error) {
    console.error('Server Action error:', error); // logs to Vercel
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}
```

### 6.3 Server Action calling another Server Action

**Symptom:** Nesting Server Actions causes weird behavior.

**Fix:** Don't nest. Extract the shared logic to a utility function:
```ts
// ❌ Wrong
export async function actionA() {
  await actionB();
}

// ✅ Right
import { sharedLogic } from './shared';

export async function actionA() {
  await sharedLogic();
}
export async function actionB() {
  await sharedLogic();
}
```

### 6.4 FormData not parsing correctly

**Cause:** Server Actions receive FormData, not plain objects.

**Fix:** Convert FormData to plain object:
```ts
'use server';

export async function action(formData: FormData) {
  const data = Object.fromEntries(formData);
  // Now data is a plain object
  
  const parsed = Schema.safeParse(data);
  // ...
}
```

Or use `useFormState` hook for richer integration.

---

## 7. PWA Issues

### 7.1 PWA not installing on iOS

**Cause:** iOS PWA support has limitations vs Android.

**What works on iOS:**
- Add to Home Screen
- Offline caching
- Standalone mode

**What does NOT work on iOS:**
- Push notifications (limited; iOS 16.4+ partial support)
- Background sync (not supported)
- Web Share Target API (limited)

**Fix:** Document these limitations for crew with iPhones. Consider native wrapper in future if push is critical.

### 7.2 Service worker not updating

**Symptom:** Made changes, deployed, but users see old version.

**Fix:**
1. Update `next-pwa` config to bump cache version on each build:
   ```js
   // next.config.mjs
   const withPWA = require('next-pwa')({
     dest: 'public',
     register: true,
     skipWaiting: true, // <-- forces update
   });
   ```
2. Users may need to close and reopen the app once

### 7.3 Manifest icons not showing

**Symptom:** Default browser icon used instead of Tetra logo.

**Fix:**
1. Verify icons exist at paths in `manifest.json`
2. Verify sizes are correct (192x192, 512x512 minimum)
3. Verify `manifest.json` has correct `start_url` and `display: 'standalone'`
4. Hard refresh and re-add to home screen

---

## 8. Vercel Deployment Issues

### 8.1 Build fails on Vercel but works locally

**Common causes:**
- Different Node version (Vercel uses what's in `engines` of package.json)
- Missing env vars in Vercel dashboard
- Case-sensitivity (Mac is case-insensitive, Linux is)

**Fix:**
1. Add to package.json:
   ```json
   "engines": { "node": ">=20" }
   ```
2. Verify all env vars are set in Vercel dashboard
3. Check imports — `Button` vs `button` is different on Linux

### 8.2 Function timeout on Vercel

**Symptom:** Server Action takes >10 seconds, fails with timeout.

**Cause:** Vercel free tier has 10-second timeout on serverless functions.

**Fix:**
- Optimize the slow operation (DB query, external API call)
- For long-running tasks, use background jobs (e.g., trigger via cron)
- Consider Vercel Pro ($20/mo) for 60-second timeout

### 8.3 Environment variable not being picked up

**Symptom:** Variable set in Vercel dashboard, but app uses undefined.

**Fix:**
1. Verify the variable is set for the right environment (Production, Preview, Development)
2. Redeploy (env changes don't take effect until next deployment)
3. For client-side variables, must be prefixed `NEXT_PUBLIC_`

---

## 9. Google Drive API Issues

### 9.1 "Token has been expired or revoked"

**Cause:** Refresh token expired or user revoked access.

**Fix:**
- Have super admin re-authorize via `/api/auth/google-drive`
- Update stored refresh token in `system_config`

### 9.2 Drive folder creation fails silently

**Diagnosis:** Check Vercel function logs for the actual error.

**Common causes:**
- API quota exceeded (unlikely at our scale)
- Folder ID invalid
- Insufficient permissions

**Fix:**
- Implement retry with exponential backoff
- Fall back to Supabase Storage if Drive consistently fails

### 9.3 Files uploaded but not viewable

**Cause:** File permissions set to private by default.

**Fix:** When uploading, set permissions:
```ts
// Pseudocode
await drive.permissions.create({
  fileId: uploadedFile.id,
  requestBody: { role: 'reader', type: 'anyone' }, // shareable link
});
```

For sensitive files, keep private and use signed URLs.

---

## 10. Performance Issues

### 10.1 Page takes forever to load

**Diagnosis:**
1. Open Chrome DevTools → Network tab
2. Reload page
3. Identify slowest request

**Common culprits:**
- Slow Supabase query (look at request to `/rest/v1/...`)
- Large JS bundle (Initial Connection time high)
- Slow Server Action (Time to First Byte high)

**Fixes:**
- Add database indexes on filtered/sorted columns
- Use Server Components (less JS shipped)
- Paginate long lists
- Use `unstable_cache` for expensive computations

### 10.2 Specific query is slow

**Diagnosis:** Run with EXPLAIN:
```sql
EXPLAIN ANALYZE
SELECT * FROM events
WHERE event_date >= '2026-01-01'
ORDER BY event_date DESC;
```

**Look for:**
- "Seq Scan" on large tables → missing index
- "Filter:" doing work after fetch → push to WHERE if possible

**Fix:** Add appropriate index:
```sql
CREATE INDEX idx_events_date_desc ON events(event_date DESC);
```

### 10.3 N+1 query problem

**Symptom:** Page loads many small requests instead of one efficient request.

**Diagnosis:** Network tab shows dozens of nearly-identical requests.

**Fix:** Use Supabase's join/select syntax to fetch related data in one query:
```ts
// ❌ Wrong — N+1
const events = await supabase.from('events').select('*');
for (const event of events) {
  const crew = await supabase.from('crew_assignments').select('*').eq('event_id', event.id);
  // ...
}

// ✅ Right — single query with join
const events = await supabase
  .from('events')
  .select('*, crew_assignments(*, user:users(*))');
```

---

## 11. TypeScript Issues

### 11.1 "Type 'X' is not assignable to type 'Y'"

**Common causes:**
- Database type doesn't match expected shape (regenerate types)
- Optional vs required field mismatch
- Enum value typo

**Fix:**
- Regenerate Supabase types: `pnpm supabase gen types typescript ...`
- Use type assertion only as last resort: `data as ExpectedType`
- Better: narrow the type with type guards

### 11.2 "Cannot find module '@/...'" 

**Cause:** Path alias not configured.

**Fix:** Verify `tsconfig.json`:
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

Restart your IDE (TypeScript Language Server caches paths).

### 11.3 "Property does not exist on type" for Supabase data

**Cause:** Supabase types stale or wrong query shape.

**Fix:**
1. Regenerate types
2. If using `select('*')` and getting "any", explicitly type:
   ```ts
   import type { Database } from '@/lib/supabase/types';
   type Event = Database['public']['Tables']['events']['Row'];
   const events: Event[] = data as Event[];
   ```

### 11.4 Strict null checks complaining

**Symptom:** "Object is possibly 'null'" warnings everywhere.

**Fix:** Handle null cases explicitly:
```ts
// ❌ Wrong
const name = user.full_name.toUpperCase(); // user might be null

// ✅ Right
if (!user) return null;
const name = user.full_name.toUpperCase();

// Or with optional chaining
const name = user?.full_name?.toUpperCase() ?? 'Unknown';
```

---

## 12. Common Vibecoding Mistakes

### 12.1 AI generates code without context

**Symptom:** AI uses libraries/patterns we don't have.

**Fix:** Always paste:
1. Master prompt context
2. Relevant existing files
3. Specific conventions (path aliases, etc.)

### 12.2 AI writes too many files at once

**Symptom:** AI generates 10 files in one response, you can't review them all carefully.

**Fix:** Insist on one file at a time:
```
Stop. Write only one file at a time. Show it to me, I'll review and confirm before you move to the next.
```

### 12.3 AI invents non-existent fields

**Symptom:** AI uses `event.totalRevenue` but your schema has `revenue_gross`.

**Fix:** Always paste the actual schema:
```
Here's the events table from our schema:
{paste relevant CREATE TABLE statement}

Use only these columns. Don't invent new ones.
```

### 12.4 AI uses outdated Next.js patterns

**Symptom:** AI suggests `getServerSideProps`, `pages/api/`, or other pages-router patterns.

**Fix:** Remind explicitly:
```
We use Next.js 15 with App Router. There's no pages directory. Server Components by default. Server Actions for mutations. Route Handlers (app/api/*/route.ts) for webhooks/cron only.
```

### 12.5 Forgetting to commit before big changes

**Symptom:** AI suggests refactor, you accept, things break, can't roll back cleanly.

**Fix:** Before any refactor or AI-suggested major change:
```bash
git add .
git commit -m "checkpoint: before {description of what AI is about to do}"
```

If it goes wrong: `git reset --hard HEAD`

### 12.6 Skipping manual testing

**Symptom:** Code looks right, but breaks in production.

**Fix:** **ALWAYS** test in browser before committing:
- Happy path on desktop
- Mobile viewport (DevTools responsive mode)
- Error case (e.g., network offline, invalid input)
- Multiple roles if relevant (login as crew, then as owner)

### 12.7 Trusting AI calculations blindly

**Symptom:** Sinking fund or commission math looks right but is subtly wrong.

**Fix:** For ANY financial calculation:
1. Manually compute one example
2. Compare to AI output
3. Verify with multiple scenarios (profit, loss, edge cases)
4. Check journal entries balance (debits = credits)

---

## 13. Emergency Procedures

### 13.1 App is completely down

1. Check Vercel status: status.vercel.com
2. Check Supabase status: status.supabase.com
3. Check recent deploys in Vercel dashboard — rollback if recent deploy
4. Check error logs in Vercel dashboard

### 13.2 Data corruption suspected

1. **Don't panic. Don't make more changes.**
2. Take a snapshot via Supabase point-in-time recovery (free tier: last 7 days)
3. Identify which tables/rows look wrong
4. Use audit_log to understand what happened
5. Restore from snapshot if needed (this is destructive — back up current state first if possible)

### 13.3 Lost local changes

1. Check `git stash list` — sometimes uncommitted changes are stashed
2. Check VS Code's local history (built-in feature)
3. Check Vercel build artifacts (last successful deploy has the previous version)
4. Last resort: re-implement from doc specs

### 13.4 Forgot env var in production

**Symptom:** App deployed but features failing because env var not set.

**Fix:**
1. Add var in Vercel dashboard → Settings → Environment Variables
2. Trigger redeploy: Vercel Dashboard → Deployments → ⋯ menu → Redeploy
3. Or push an empty commit:
   ```bash
   git commit --allow-empty -m "chore: trigger redeploy for env var"
   git push
   ```

---

## 14. When to Ask for Help

If stuck for >1 hour on something, escalate:

1. **Re-read this doc + relevant FSD section** (often the answer is there)
2. **Check Supabase Discord** (https://discord.supabase.com) — very active community
3. **Check Next.js Discord** (https://nextjs.org/discord)
4. **Search Stack Overflow** with specific error message in quotes
5. **Ask AI with full context** (paste error, code, env, what you tried)

If still stuck after all that — it might be a real bug worth filing in the project's ISSUES.md for later research. Move on to the next task.

---

## 15. Maintenance: Keep This Doc Updated

When you encounter a new issue + fix it:

1. Add an entry under the appropriate section
2. Format: **Symptom**, **Cause**, **Fix**
3. Commit with message: `docs: add troubleshooting entry for {issue}`

This becomes more valuable over time — don't skip it.

---

**End of Troubleshooting Guide**

*Next document: [12_DECISION_LOG.md](./12_DECISION_LOG.md)*
