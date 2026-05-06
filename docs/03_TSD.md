# 03 — Technical Specification Document (TSD)

**Project:** Tetra Ops
**Version:** 1.0.0
**Companion to:** [02_FSD.md](./02_FSD.md)

---

## 1. Architecture Overview

### 1.1 High-Level Architecture

```
┌──────────────────────────────────────────────────────────┐
│                      USERS (Client)                       │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│   │ Owner Desktop│  │ Crew Mobile  │  │  PWA Install │  │
│   │   Browser    │  │   Browser    │  │   (offline)  │  │
│   └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
└──────────┼─────────────────┼─────────────────┼──────────┘
           │                 │                 │
           └─────────────────┴─────────────────┘
                             │
                             │ HTTPS
                             ▼
┌──────────────────────────────────────────────────────────┐
│              VERCEL EDGE NETWORK (Global CDN)             │
└──────────────────────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────┐
│         NEXT.JS 15 APPLICATION (App Router)               │
│  ┌──────────────────┐    ┌──────────────────────────┐   │
│  │  Server Components│    │  Server Actions          │   │
│  │  (RSC, default)   │    │  (mutations)             │   │
│  └──────────────────┘    └──────────────────────────┘   │
│  ┌──────────────────┐    ┌──────────────────────────┐   │
│  │ Client Components │    │  Route Handlers (API)    │   │
│  │ (interactive UI)  │    │  (webhooks, etc.)        │   │
│  └──────────────────┘    └──────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
┌──────────────┐  ┌──────────────────┐  ┌────────────────┐
│  SUPABASE    │  │  GOOGLE DRIVE    │  │ EXTERNAL APIs  │
│              │  │      API         │  │                │
│  • Postgres  │  │  • Event folders │  │ • Google Maps  │
│  • Auth      │  │  • Photos        │  │ • WhatsApp     │
│  • Storage   │  │  • Documents     │  │   (link only)  │
│  • Realtime  │  │                  │  │                │
└──────────────┘  └──────────────────┘  └────────────────┘
```

### 1.2 Why This Stack

**Next.js 15 (App Router)**
- Free hosting on Vercel with generous limits
- Server Components reduce JS bundle
- Server Actions eliminate API endpoint boilerplate
- Built-in caching strategies
- Mature ecosystem, AI-friendly (Antigravity perform well)

**Supabase**
- Free tier: 500MB DB, 1GB storage, 2GB bandwidth, 50k monthly active users — plenty for ~12 users
- Built-in Auth with Google OAuth (no extra service needed)
- Postgres with Row Level Security (proper data isolation)
- Realtime subscriptions for live updates
- Generated TypeScript types

**Google Drive API**
- Unlimited storage on personal Google account
- Bypasses Supabase storage limits for heavy assets
- Familiar to team (already use Google ecosystem)
- Free, no extra cost

**Tailwind CSS + shadcn/ui**
- Free, owned components (no library lock-in)
- Highly customizable for brand identity
- Mobile-first responsive design
- AI-friendly markup

### 1.3 Why NOT...

- **NOT Firebase:** Less SQL flexibility, harder to do reports
- **NOT NestJS/Express custom backend:** Overkill for this scale, more code to maintain
- **NOT React Native:** PWA covers needs, native = more complexity
- **NOT MongoDB:** Financial data needs ACID, Postgres safer
- **NOT Prisma ORM:** Adds layer of complexity. Supabase client is sufficient. (Reconsider if pain points emerge.)
- **NOT GraphQL:** Server Actions handle mutations elegantly without GraphQL overhead.

---

## 2. Tech Stack — Full List

### 2.1 Frontend

| Layer | Choice | Version | Purpose |
|-------|--------|---------|---------|
| Framework | Next.js | 15.x | React framework with SSR/ISR/RSC |
| Language | TypeScript | 5.x | Type safety |
| Styling | Tailwind CSS | 4.x | Utility CSS |
| Components | shadcn/ui | latest | Headless components (copy-paste, owned) |
| Icons | Lucide React | latest | Icon set |
| Forms | React Hook Form | 7.x | Form state |
| Validation | Zod | 3.x | Schema validation (shared client+server) |
| Data Fetching | TanStack Query | 5.x | Client-side cache (where Server Components insufficient) |
| State | Zustand | 4.x | Minimal client state (UI state only) |
| Date | date-fns | 3.x | Date manipulation (lightweight vs Moment) |
| Charts | Recharts | 2.x | Simple charts (P&L, cash flow) |
| Tables | TanStack Table | 8.x | Headless table with sorting/filtering |
| PDF | @react-pdf/renderer | latest | PDF generation client-side |
| Toast | Sonner | latest | Toast notifications |
| PWA | next-pwa | latest | Service worker + manifest |

### 2.2 Backend (within Next.js)

| Concern | Choice |
|---------|--------|
| Server Logic | Next.js Server Actions + Route Handlers |
| Database Client | @supabase/supabase-js + @supabase/ssr |
| Auth | Supabase Auth (Google OAuth) |
| File Upload | Google Drive API + service account fallback to Supabase Storage |
| Cron Jobs | Vercel Cron (free tier: 2 jobs daily) |
| Background Jobs | Vercel Cron + DB triggers (no Bull/Redis needed) |
| Email (if needed) | Resend (free tier: 100/day) — for password reset only, low priority |

### 2.3 Infrastructure

| Service | Plan | Limits |
|---------|------|--------|
| Vercel | Hobby (Free) | 100GB bandwidth/mo, unlimited deployments |
| Supabase | Free | 500MB DB, 1GB storage, 2GB bandwidth, 50k MAU |
| Google Cloud Console | Free | OAuth + Drive API (no quota issue at our scale) |
| Domain | Optional | Vercel free subdomain (e.g., tetra-ops.vercel.app) |

**Estimated monthly cost: Rp 0**

### 2.4 Development Tools

| Tool | Purpose |
|------|---------|
| Antigravity IDE | AI-powered code editor (primary dev environment) |
| Cursor (alternative) | If Antigravity unavailable |
| pnpm | Package manager (faster than npm) |
| Biome | Linter + formatter (faster than ESLint+Prettier) |
| Drizzle Studio (optional) | DB inspector |
| Postman / Bruno | API testing |
| Chrome DevTools | Debugging |
| Lighthouse | Performance audits |

---

## 3. Data Architecture

### 3.1 Database Schema Overview

Full schema in [05_DATABASE_SCHEMA.sql](./05_DATABASE_SCHEMA.sql). High-level groupings:

**Core Entities:**
- `users` (auth users)
- `events` (the central entity)
- `clients` (denormalized inside events for v1, can extract later)
- `payments`
- `event_settlements`

**Master Data:**
- `packages`
- `addons`
- `event_addons` (junction)
- `bank_accounts`
- `inventory_items`

**Inventory:**
- `stock_movements`
- `equipment_movements`
- `equipment_incidents`

**Financial:**
- `journal_entries`
- `journal_lines` (double-entry)
- `chart_of_accounts`
- `sinking_funds`
- `sinking_fund_movements`
- `owner_earnings`

**Operational:**
- `crew_assignments`
- `crew_rekap` (consumable usage report from crew)
- `notifications`
- `audit_log`

**Settings:**
- `system_config` (key-value)
- `notification_rules`
- `whatsapp_templates`

### 3.2 Key Design Principles

**Principle 1: Single Source of Truth**
- Inventory levels: derived from `stock_movements` (sum), NOT stored as field
- Account balances: derived from `journal_lines` (sum), NOT stored
- Owner earnings: derived from `owner_earnings` ledger
- Trade-off: slightly slower reads, but always accurate

**Principle 2: Append-Only Audit Trail**
- All financial entries are immutable once created
- Corrections happen via reversal entries (negative amounts)
- `audit_log` captures every change to important entities

**Principle 3: Soft Deletes**
- Most entities use `deleted_at` timestamp instead of hard delete
- Allows recovery, preserves historical data integrity
- Hard delete only for super admin in danger zone

**Principle 4: Snapshot at Settlement**
- `event_settlements` stores a SNAPSHOT of all calculations at close time
- Even if rates change later (e.g., Senior fee changes from 200k to 250k), historical settlements unaffected
- Critical for trustworthy financial reports

**Principle 5: Row Level Security (RLS)**
- Every table has RLS policies
- Crew can only see their own data + assigned events
- Owner can see all except super-admin-only fields
- Super admin: full access
- Enforced at DB level, not relying solely on app code

### 3.3 Indexing Strategy

Critical indexes for performance:
- `events`: (event_date), (status), (created_at)
- `payments`: (event_id), (payment_date)
- `stock_movements`: (item_id, created_at), (source, source_id)
- `journal_lines`: (entry_id), (account_code), (created_at)
- `notifications`: (user_id, created_at, is_read)

Full DDL with indexes in `05_DATABASE_SCHEMA.sql`.

---

## 4. Authentication & Authorization

### 4.1 Auth Flow Detail

**Google OAuth via Supabase Auth:**

1. User clicks "Sign in with Google"
2. Supabase redirects to Google consent screen
3. User authorizes Tetra Ops to read their email
4. Google redirects back with authorization code
5. Supabase exchanges code for tokens
6. Supabase creates `auth.users` entry (or finds existing)
7. App middleware:
   - Checks `users` table (custom) for matching email
   - If exists with role: proceed to app
   - If exists with `pending_approval`: show waiting screen
   - If NOT exists: create record with `pending_approval`, notify admin

### 4.2 Session Management

- Supabase manages JWT tokens (access + refresh)
- Stored in HTTP-only cookies (set by `@supabase/ssr`)
- Auto-refresh handled by client library
- Session valid 7 days, then re-auth required

### 4.3 RLS Policies (High-Level)

```sql
-- Users can read their own profile
CREATE POLICY "users_read_own"
ON users FOR SELECT
USING (auth.uid() = id);

-- Crew can read events they're assigned to
CREATE POLICY "crew_read_assigned_events"
ON events FOR SELECT
USING (
  auth.uid() IN (
    SELECT user_id FROM crew_assignments
    WHERE event_id = events.id
  )
  OR
  (SELECT role FROM users WHERE id = auth.uid())
    IN ('owner', 'super_admin')
);

-- Only owners and super_admin can read all events
-- (covered by above)

-- Only super_admin can read audit_log
CREATE POLICY "super_admin_read_audit"
ON audit_log FOR SELECT
USING (
  (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
);
```

Full RLS policies in `05_DATABASE_SCHEMA.sql`.

### 4.4 Authorization in App Code

**Middleware** (`middleware.ts`) checks role for protected routes:
```ts
// Pseudocode
if (path.startsWith('/admin') && user.role !== 'super_admin') {
  redirect('/dashboard');
}
if (path.startsWith('/crew') && user.role !== 'crew') {
  redirect('/dashboard');
}
```

**Server Actions** double-check permissions before mutations:
```ts
async function deleteEvent(eventId: string) {
  const user = await getCurrentUser();
  if (user.role !== 'super_admin') {
    throw new Error('Forbidden');
  }
  // proceed
}
```

---

## 5. File Storage Strategy

### 5.1 Hybrid Approach

**Supabase Storage** (small files, app-managed):
- User avatars (max 500KB each)
- Item images (max 200KB each)
- Brand assets / logos
- Limit: aim < 100MB total to stay under free tier 1GB

**Google Drive** (large files, user-owned):
- Event design files (frame templates)
- Event documentation photos/videos (uploaded by crew)
- Payment proof transfers (high-quality scans)
- Equipment incident photos
- Generated reports archive (monthly PDFs)

### 5.2 Google Drive Integration

**Authentication:**
- Initial setup: super admin authorizes Tetra Ops with their Google account via OAuth
- Refresh token stored encrypted in `system_config`
- All Drive operations use this single account (Rama's drive)

**Folder Structure (auto-created on first use):**

```
Tetra Ops Storage/
├── 2026/
│   ├── 01-Januari/
│   │   ├── PRJ-20260115-1234 - Afra & Roif/
│   │   │   ├── Design/
│   │   │   ├── Documentation/
│   │   │   └── Payment Proofs/
│   │   └── ...
│   └── 02-Februari/
├── Reports/
│   ├── Monthly/
│   ├── Annual/
│   └── Custom/
├── Brand Assets/
└── Equipment Incidents/
```

**API Operations:**
- `createFolder(parentId, name)` — auto-create on event creation
- `uploadFile(folderId, file)` — for crew uploads
- `getShareableLink(fileId)` — for app display
- `deleteFolder(folderId)` — soft delete (move to trash)

**Fallback:**
If Drive API fails (rate limit, auth expired), files queue locally and retry. Critical files (payment proofs) fall back to Supabase Storage temporarily.

### 5.3 Image Optimization

**Before upload:**
- Compress with `browser-image-compression` library (client-side)
- Target: max 1MB per image, 1920px max dimension
- WebP format if supported, JPEG fallback

**On display:**
- Use Next.js `<Image>` component with `priority` for above-fold
- Lazy load below-fold images
- Generate placeholder blurhash for instant render

---

## 6. Performance Strategy

### 6.1 Targets

- **First Contentful Paint:** <1.0s
- **Largest Contentful Paint:** <2.0s
- **Time to Interactive:** <2.5s
- **Cumulative Layout Shift:** <0.1
- **Lighthouse Mobile Score:** >90
- **Bundle Size (initial):** <200KB gzip

### 6.2 Optimization Techniques

**Server Components by default:**
- Pages, layouts, sections render on server
- Reduces JS shipped to client by 60-80%
- Only interactive parts use Client Components

**Streaming with Suspense:**
- Page shell renders instantly
- Heavy data sections stream in
- Skeleton loaders during streaming

**Static where possible:**
- Marketing pages (login, pending approval) statically generated
- Dashboards dynamic but with edge caching

**Database optimization:**
- Indexes on all foreign keys + sort columns
- Materialized views for heavy aggregations (refresh hourly)
- Pagination on all list views (default 25 rows, configurable)

**Bundle optimization:**
- Dynamic imports for heavy libraries (PDF, charts) — load on demand
- Tree-shaking via Tailwind JIT
- Image optimization automatic via Next/Image

**Caching layers:**
- Browser cache (long TTL for static assets)
- Vercel Edge Cache (route-level)
- React Query cache (client-side data)
- Postgres query cache (Supabase PgBouncer)

### 6.3 Mobile Performance

**Critical for crew app:**
- Service Worker caches: today's events, master data, user profile
- Offline-capable for read operations on cached data
- Background sync for queued mutations (form submissions while offline)
- Skeleton screens (not spinners) for perceived performance

---

## 7. Security Considerations

### 7.1 Threat Model

**In Scope:**
- Unauthorized access to financial data
- Crew accessing other crews' data
- SQL injection via user inputs
- XSS via stored content (notes, descriptions)
- CSRF on state-changing actions

**Out of Scope (lower priority for V1):**
- Advanced persistent threats
- DDoS (Vercel handles)
- Physical device theft of admin laptop

### 7.2 Mitigations

**Authentication:**
- OAuth via Google (no password handling)
- Session tokens HTTP-only cookies
- Auto-logout on inactivity

**Authorization:**
- RLS policies enforced at DB level
- Server Actions verify permissions server-side
- No client-side authorization checks alone

**Input Validation:**
- All user inputs validated with Zod schemas (shared between client + server)
- Server re-validates even if client passed
- Parameterized queries via Supabase client (no string concat SQL)

**Output Sanitization:**
- React auto-escapes by default
- Markdown rendering uses `react-markdown` with sanitization
- File names sanitized before upload

**Secrets Management:**
- All secrets in environment variables (never in code)
- `.env.local` gitignored
- Production secrets in Vercel dashboard
- Service account JSONs not committed

**Audit Trail:**
- All financial mutations logged
- All role changes logged
- Settlement reversal logged
- Retained 6 months minimum

### 7.3 Compliance Notes

- **GDPR/PDP:** Limited applicability (Indonesia-only operations, B2B clients)
- **Financial regulations:** Not regulated as financial institution (we're a service provider, not a financial service)
- **Data retention:** Customer data retained as long as business relationship + 5 years for financial records (per Indonesian tax law)

---

## 8. Environment & Setup

### 8.1 Required Accounts

1. **GitHub** — for code repo
2. **Vercel** — for hosting (link to GitHub)
3. **Supabase** — for database + auth + storage
4. **Google Cloud Console** — for OAuth + Drive API
5. **Google Account (Rama's)** — Drive storage host

### 8.2 Local Development Setup

```bash
# Prerequisites:
# - Node.js 20+
# - pnpm 9+
# - Git

# 1. Clone repo
git clone <repo-url> tetra-ops
cd tetra-ops

# 2. Install dependencies
pnpm install

# 3. Setup environment
cp .env.example .env.local
# Edit .env.local with your Supabase + Google credentials

# 4. Setup Supabase locally (optional, for offline dev)
pnpm supabase start

# 5. Run migrations
pnpm db:migrate

# 6. Seed data (development only)
pnpm db:seed

# 7. Start dev server
pnpm dev

# Open http://localhost:3000
```

### 8.3 Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx  # Server-only, never expose

# Google OAuth (configured in Supabase dashboard, but document here)
# Client ID + Secret managed via Supabase Auth settings

# Google Drive API
GOOGLE_DRIVE_CLIENT_ID=xxx
GOOGLE_DRIVE_CLIENT_SECRET=xxx
GOOGLE_DRIVE_REDIRECT_URI=http://localhost:3000/api/auth/google-drive/callback
GOOGLE_DRIVE_REFRESH_TOKEN=xxx  # Set after first auth flow

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME="Tetra Ops"

# Optional: Cron secret (for Vercel Cron auth)
CRON_SECRET=xxx
```

### 8.4 Production Deployment

```bash
# Push to GitHub main branch
git push origin main

# Vercel auto-deploys
# Configure env vars in Vercel dashboard
# Verify: https://tetra-ops.vercel.app
```

**Production checklist:**
- [ ] All env vars set in Vercel
- [ ] Supabase production project created (separate from dev)
- [ ] Migrations applied to prod
- [ ] Google OAuth callback URL updated to prod URL
- [ ] First super admin user created (Rama)
- [ ] Onboarding wizard completed
- [ ] Sentry / error monitoring configured (optional but recommended)

---

## 9. Monitoring & Observability

### 9.1 Free Tier Tools

**Vercel Analytics** (built-in, free):
- Page load times
- Web Vitals (FCP, LCP, CLS)
- Geographic distribution
- Top pages

**Supabase Logs** (built-in, free):
- API queries
- Auth events
- Errors

**Browser Console** (manual):
- Client-side errors during dev

### 9.2 Optional (when budget allows)

- **Sentry** (error tracking) — free tier 5k errors/month
- **PostHog** (product analytics) — free self-hosted option
- **LogRocket** (session replay) — paid, future consideration

### 9.3 Custom Monitoring Dashboard

Built into app (admin-only) at `/admin/monitoring`:
- Total users (active vs pending)
- Total events MTD
- Storage usage (Supabase)
- Drive API quota usage
- Recent errors (from internal log table)

Cron job daily aggregates these metrics.

---

## 10. Backup & Disaster Recovery

### 10.1 Database Backup

**Supabase automated backups:**
- Free tier: 7 days point-in-time recovery
- Critical for restoration after data corruption

**Custom weekly export:**
- Cron job runs Sunday 2 AM WIB
- Exports all critical tables to CSV
- Uploads to Google Drive (Backups folder)
- Retained 12 weeks (rolling)

### 10.2 File Backup

- Files in Google Drive: Drive's own redundancy + version history
- Critical files (settlements, journal exports): also stored as PDF in Drive

### 10.3 Code Backup

- GitHub repo (primary)
- Vercel deployment history (rollback to any prior deploy)

### 10.4 Recovery Procedures

**Scenario: Accidental data deletion**
- Within 7 days: Supabase point-in-time restore
- After 7 days: restore from weekly CSV backup (manual import)

**Scenario: App breaking change**
- Vercel one-click rollback to previous deploy

**Scenario: Total Supabase failure (extreme)**
- Restore CSV backups to new Postgres instance
- Update env vars to point to new DB
- Redeploy

---

## 11. Scalability Considerations

### 11.1 Current Capacity (Free Tier)

| Resource | Limit | Estimated Usage at 20 events/mo | Headroom |
|----------|-------|----------------------------------|----------|
| Supabase DB | 500 MB | ~50 MB (very rough) | 10x |
| Supabase Storage | 1 GB | ~100 MB | 10x |
| Supabase Bandwidth | 2 GB/mo | ~500 MB | 4x |
| Vercel Bandwidth | 100 GB/mo | ~5 GB | 20x |
| Vercel Function Invocations | 100k/mo | ~50k | 2x |

**Verdict:** Comfortable for 1-2 years at current scale.

### 11.2 When to Scale Up

**Trigger upgrade if any of these:**
- Approaching 80% of any free tier limit
- Page load p95 > 3 seconds despite optimization
- Multiple concurrent users hitting timeout errors
- Need for more than 2 cron jobs (Vercel limit)

**Upgrade path:**
- Supabase Pro ($25/mo): 8 GB DB, 100 GB bandwidth
- Vercel Pro ($20/mo): 1 TB bandwidth, more functions
- Total: $45/mo if needed (Rp 700k)

### 11.3 Future Optimizations (Not V1)

- Move heavy aggregations to materialized views with hourly refresh
- Add Redis cache for session/dashboard queries
- CDN for image assets
- Split into microservices if scaling beyond Tetra (multi-tenant)

---

## 12. Migration Strategy

### 12.1 From Apps Script v1

**Decision:** Skip historical data migration. Start fresh.

**Rationale:**
- 100 historical events = high migration complexity, low ongoing value
- Apps Script v1 stays accessible (read-only) as historical archive
- Risk of data corruption from bad migration > value of having history

**What gets migrated:**
- ~20 active upcoming events: manual entry via onboarding wizard
- Master data (paket, addons): pre-seeded from PDF pricelist
- Inventory: CSV import via wizard
- Bank balances: manual entry per account at go-live date
- Team members: manual entry in wizard

**Total migration effort:** ~30-60 minutes by Rama in onboarding wizard.

### 12.2 CSV Import Format

Documented in [14_CSV_TEMPLATES.md](./14_CSV_TEMPLATES.md). Templates provided in `csv-templates/` folder.

---

## 13. Testing Strategy

### 13.1 V1 Approach: Manual + Critical Paths

Given solo dev + AI assistance, formal test suite is overkill. Strategy:

**Manual testing:**
- Each module manually tested as built (in browser)
- End-to-end flows tested before phase completion
- Friends/team dogfood before "official launch"

**Critical path automation (future):**
- E2E tests for: booking flow, settlement flow, payment logging
- Use Playwright (free, AI-friendly)
- Add to CI/CD pipeline

**Type safety as testing:**
- TypeScript strict mode catches many bugs
- Zod runtime validation
- Supabase generated types ensure DB queries match schema

**No unit tests for V1.** Add when bugs become recurring.

### 13.2 Quality Gates

Before merging any feature:
- [ ] Manual smoke test all happy paths
- [ ] Test edge cases (empty state, errors, slow network)
- [ ] Mobile view verified
- [ ] Accessibility quick check (keyboard nav, contrast)
- [ ] Performance: no obvious regression

---

## 14. Code Quality Standards

### 14.1 Conventions

- **Naming:** kebab-case for files, PascalCase for components, camelCase for functions
- **File structure:** see [07_FOLDER_STRUCTURE.md](./07_FOLDER_STRUCTURE.md)
- **Imports:** absolute paths via `@/` alias, never `../../..`
- **TypeScript:** strict mode, no `any` (use `unknown` if needed)
- **Components:** Server Components by default, mark `'use client'` only when needed
- **State:** prefer Server state via fetch + revalidation, Zustand only for UI state

### 14.2 Linting & Formatting

- Biome (linter + formatter, replaces ESLint + Prettier)
- Pre-commit hook via Husky to run `biome check`
- CI fails on lint errors

### 14.3 Git Workflow

- `main` branch is production
- Feature branches: `feature/{module-name}` (e.g., `feature/billing-module`)
- Commits use conventional format: `feat:`, `fix:`, `chore:`, `refactor:`
- PRs preferred but solo dev can push direct to main with caution

---

## 15. Decision Records (Summary)

Full decisions in [12_DECISION_LOG.md](./12_DECISION_LOG.md). Highlights:

- **DR-001:** Use Server Components by default, not Client. Reduce JS bundle.
- **DR-002:** Hybrid storage (Supabase + Google Drive) instead of one. Free tier optimization.
- **DR-003:** Snapshot settlements rather than recalculate. Trust historical data.
- **DR-004:** No formal test suite for V1. Solo dev pragmatism.
- **DR-005:** Append-only ledger for finance. Auditability.
- **DR-006:** Skip historical data migration. Risk vs reward.

---

**End of TSD**

*Next document: [04_DESIGN_SYSTEM.md](./04_DESIGN_SYSTEM.md) — Design System*
