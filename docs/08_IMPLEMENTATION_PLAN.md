# 08 — Implementation Plan

**Project:** Tetra Ops
**Version:** 1.0.0
**Approach:** Incremental, 4-phase build with weekly milestones

---

## 1. Phase Overview

| Phase | Name | Duration | Focus |
|-------|------|----------|-------|
| 1 | Core Operations | 6 weeks | Auth, Master Data, Booking, Operations, Billing |
| 2 | Finance & Inventory | 4 weeks | Warehouse, Settlement, Sinking Funds, Owner Earnings |
| 3 | Smart Features | 4 weeks | Notifications, WhatsApp, PDF, Reports |
| 4 | Polish & Optimization | Ongoing | Crew app polish, Drive integration, Analytics |

**Total estimated build time: 14 weeks** (with vibecoding pace, allowing learning curve)

**No hard deadline** — quality > speed. Each phase has gates that must be met before moving on.

---

## 2. Pre-Phase: Project Setup (Days 1-3)

Before Phase 1, complete one-time setup.

### Day 1 — Accounts & Local Environment

```bash
# 1. Create accounts (one-time, ~30 min total)
#    - GitHub: https://github.com (if no account yet)
#    - Vercel: https://vercel.com (sign up with GitHub)
#    - Supabase: https://supabase.com (sign up with GitHub)
#    - Google Cloud Console: https://console.cloud.google.com

# 2. Install local tools (~15 min)
#    Open Terminal on Mac:

# Install Homebrew if not yet installed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js 20+
brew install node@20

# Verify
node --version  # should show v20.x.x
npm --version

# Install pnpm (faster package manager)
npm install -g pnpm

# Verify
pnpm --version

# Install Git (usually pre-installed on Mac)
git --version
```

### Day 2 — Supabase Project

```bash
# In Supabase dashboard:
# 1. Create new project: "tetra-ops"
#    Region: Singapore (closest to Indonesia)
#    Database Password: STRONG password (save in password manager!)
# 2. Wait ~2 min for provisioning
# 3. Note down:
#    - Project URL: https://xxxxx.supabase.co
#    - anon key (Settings > API)
#    - service_role key (Settings > API, keep SECRET)

# Enable Google OAuth:
# 1. Authentication > Providers > Google > Enable
# 2. (Need Google Cloud OAuth credentials first — see Day 3)
```

### Day 3 — Google Cloud OAuth + Drive API

```bash
# In Google Cloud Console:
# 1. Create new project: "Tetra Ops"
# 2. Enable APIs:
#    - Google Drive API
#    - Google+ API (for OAuth profile)
# 3. Create OAuth 2.0 Client:
#    - Type: Web application
#    - Name: Tetra Ops
#    - Authorized origins:
#      * http://localhost:3000
#      * https://tetra-ops.vercel.app (after first deploy)
#    - Authorized redirect URIs:
#      * http://localhost:3000/auth/callback (Supabase auth)
#      * https://xxxxx.supabase.co/auth/v1/callback
#      * http://localhost:3000/api/auth/google-drive/callback (for Drive)
# 4. Save Client ID + Client Secret

# Configure Supabase:
# 1. Auth > Providers > Google
# 2. Paste Client ID + Client Secret
# 3. Save

# Test sign-in flow can now happen (after app code exists)
```

### Day 3 (continued) — Init Repo + First Deploy

```bash
# 1. Create new directory and init Next.js
cd ~/Documents
pnpm create next-app@latest tetra-ops --typescript --tailwind --app --src-dir --import-alias "@/*"

# Answer prompts:
#  - TypeScript: Yes
#  - ESLint: No (we use Biome)
#  - Tailwind CSS: Yes
#  - src/ directory: Yes
#  - App Router: Yes
#  - Turbopack: Yes
#  - Customize import alias: Yes, @/*

cd tetra-ops

# 2. Install core dependencies
pnpm add @supabase/supabase-js @supabase/ssr
pnpm add zod react-hook-form @hookform/resolvers
pnpm add lucide-react
pnpm add date-fns
pnpm add @tanstack/react-query
pnpm add zustand
pnpm add sonner
pnpm add clsx tailwind-merge
pnpm add class-variance-authority
pnpm add next-pwa

# 3. Install dev dependencies
pnpm add -D @biomejs/biome
pnpm add -D @types/node
pnpm add -D supabase

# 4. Initialize Biome
pnpm biome init

# 5. Initialize shadcn/ui
pnpm dlx shadcn@latest init
# Select: TypeScript, Tailwind, src/ dir, default style, slate base color

# 6. Add base shadcn components
pnpm dlx shadcn@latest add button input label form select dialog dropdown-menu card badge avatar tabs table toast separator

# 7. Set up env file
cp .env.example .env.local
# Fill in Supabase + Google credentials

# 8. Init git + first commit
git init
git add .
git commit -m "chore: initial project setup"

# 9. Create GitHub repo (via web or gh CLI)
# Then push:
git remote add origin git@github.com:YOUR_USERNAME/tetra-ops.git
git push -u origin main

# 10. Connect to Vercel:
#  - Visit https://vercel.com/new
#  - Import the GitHub repo
#  - Configure env vars (paste Supabase + Google values)
#  - Deploy
#  - Verify https://tetra-ops.vercel.app shows default Next.js page
```

### Day 3 (continued) — Run Schema Migration

```bash
# Option A: Run via Supabase Dashboard (simpler for first time)
# 1. Go to SQL Editor in Supabase dashboard
# 2. Open docs/05_DATABASE_SCHEMA.sql
# 3. Copy all contents
# 4. Paste into SQL Editor
# 5. Click "Run"
# 6. Verify success — check Tables sidebar to see tables created

# Option B: Use Supabase CLI (better long-term)
pnpm supabase login
pnpm supabase link --project-ref YOUR_PROJECT_REF

# Place schema as migration
mkdir -p supabase/migrations
cp docs/05_DATABASE_SCHEMA.sql supabase/migrations/20260101000000_initial_schema.sql

# Apply
pnpm supabase db push
```

### Day 3 (final) — Place Brand Assets

```bash
# Once Rama provides "LOGO TETRA 2026" folder:

# Create brand folder in public/
mkdir -p public/brand public/pwa-icons

# Copy logo files (adjust source path based on where Rama placed them)
cp ~/Downloads/LOGO\ TETRA\ 2026/*.png public/brand/
cp ~/Downloads/LOGO\ TETRA\ 2026/*.svg public/brand/ 2>/dev/null || true

# Generate PWA icons (requires sharp)
pnpm add -D sharp

# Create script: scripts/generate-pwa-icons.ts
cat > scripts/generate-pwa-icons.ts << 'EOF'
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

const SRC = path.resolve('public/brand/logo-square.png');  // or whichever file
const OUT = path.resolve('public/pwa-icons');

const sizes = [192, 512];

async function generate() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  
  for (const size of sizes) {
    await sharp(SRC)
      .resize(size, size, { fit: 'contain', background: { r: 220, g: 41, b: 84, alpha: 1 } })
      .png()
      .toFile(path.join(OUT, `icon-${size}.png`));
    console.log(`✓ icon-${size}.png`);
  }
  
  // Maskable variant (with safe area padding)
  await sharp(SRC)
    .resize(410, 410, { fit: 'contain', background: { r: 220, g: 41, b: 84, alpha: 1 } })
    .extend({ top: 51, bottom: 51, left: 51, right: 51, background: { r: 220, g: 41, b: 84, alpha: 1 } })
    .png()
    .toFile(path.join(OUT, 'icon-maskable-512.png'));
  console.log('✓ icon-maskable-512.png');
}

generate();
EOF

# Run it
pnpm tsx scripts/generate-pwa-icons.ts

# Add to package.json scripts:
# "brand:icons": "tsx scripts/generate-pwa-icons.ts"
```

### Setup Gate — Before Phase 1

Verify all of these work:

- [ ] `pnpm dev` runs locally at http://localhost:3000
- [ ] Production deployed at https://tetra-ops.vercel.app
- [ ] Supabase project shows tables in dashboard
- [ ] Google OAuth configured (test by visiting Supabase Auth → Users tab; trigger sign-in)
- [ ] `.env.local` has all required values
- [ ] Git repo connected, push works
- [ ] Brand assets in `public/brand/` and `public/pwa-icons/`

---

## 3. Phase 1 — Core Operations (Weeks 1-6)

**Goal:** Working app with auth, master data, booking, operations, basic billing. Owner can manage events end-to-end.

### Week 1: Foundation

**Tasks:**
- Set up Tailwind config with custom theme tokens (color ramps, fonts)
- Implement design tokens (CSS variables for theme switching)
- Create base layout components: TopBar, Sidebar (owner), BottomNav (crew), AuthLayout
- Implement theme toggle (dark/light)
- Set up Supabase client utilities (browser, server, middleware variants)
- Implement auth: middleware for protected routes, login page, OAuth flow
- Create custom `users` table sync logic (Supabase auth → custom users)
- Implement role-based redirect on login

**Milestone:** User can sign in with Google, lands on `/dashboard` (owner) or `/crew` (crew). Pending users see waiting screen.

**Deliverables:**
- Working auth flow
- Empty dashboard pages with proper layouts
- Theme toggle
- Brand colors applied

### Week 2: Master Data

**Tasks:**
- Implement Settings layout with tabs
- Build Packages CRUD (list, create, edit, archive forms)
- Build Add-ons CRUD
- Build Master Crew (users) management
- Build Bank Accounts (super admin)
- Build Inventory Items master CRUD
- Implement bulk CSV import for items + packages

**Milestone:** Super admin can configure all master data via UI. CSV import works.

**Deliverables:**
- All master data screens functional
- Form validation working (Zod)
- CSV import for inventory + packages

### Week 3: New Booking Form

**Tasks:**
- Build single-page booking form with sections
- Implement section-by-section: Channel, Service, Event, Location, Customization, Crew, Modifiers, DP
- Implement live calculations (price, discount, gross-up, grand total)
- Implement crew conflict detection
- Sticky summary bar with running totals
- Save with atomic transaction (event + addons + assignments + initial DP if any)
- Handle edit mode (preserve unchanged fields)

**Milestone:** Owner can create new booking from scratch with all features.

**Deliverables:**
- New booking form (target: <2 min to fill)
- Edit booking working
- Crew assignment with conflict warnings

### Week 4: Operations Command

**Tasks:**
- Build Operations List view with filters (year, month, status, search)
- Implement KPI cards
- Build event detail page with tabs (Overview, Klien, Spec, Crew, Payments, Activity)
- Build Operations Board view (Kanban) — basic version, drag-drop optional Phase 4
- Build Operations Calendar view
- Build Design Hub view
- Implement event status transitions

**Milestone:** Owner can see all events in 4 different views, drill into any event detail.

**Deliverables:**
- 4 operations views functional
- Event detail page complete
- Status transitions working

### Week 5: Billing Module

**Tasks:**
- Build Billing dashboard with KPI cards (Outstanding, Overdue, Collected, Estimated)
- Build invoice list with filters and status tabs
- Implement Payment Logging modal (with proof upload to Supabase Storage)
- Implement journal entry generation on payment (Cash Dr, AR Cr)
- Implement payment status auto-recalc
- Build invoice detail/preview screen

**Milestone:** Owner can log payments and see real-time billing state. Trigger-based status updates working.

**Deliverables:**
- Billing dashboard
- Payment logging flow with proof
- Auto status updates verified

### Week 6: Crew App MVP + Phase 1 Polish

**Tasks:**
- Build Crew dashboard (mobile-first)
- Build Crew Jadwal tab
- Build Crew Event Detail (read-only first version)
- Implement bottom nav for crew layout
- Implement PWA manifest + service worker (basic)
- Test on real Android device
- Fix mobile UX issues
- Phase 1 polish: empty states, loading states, error states
- Bug bash + fixes

**Milestone:** Crew can install PWA, log in, see assigned events on mobile.

**Deliverables:**
- Crew mobile app (read-only, no actions yet)
- PWA installable
- Phase 1 fully functional

### Phase 1 Gate

Before moving to Phase 2:
- [ ] All Module 1-6 features work end-to-end
- [ ] No critical bugs in happy path
- [ ] Mobile (Crew) experience verified on real device
- [ ] Performance acceptable (no obvious lag)
- [ ] Audit log captures key events
- [ ] Test data: at least 5 dummy events created via UI

---

## 4. Phase 2 — Finance & Inventory (Weeks 7-10)

**Goal:** Complete financial backbone with settlement, inventory tracking, sinking funds, and owner earnings.

### Week 7: Smart Warehouse

**Tasks:**
- Build Warehouse main view with 3 tabs (Consumables, Equipment, Log)
- Implement consumables list with quick stock adjust
- Implement equipment list with location tracking
- Build stock movement log
- Implement stock adjustment modal (with reason)
- Build PO/Restock flow (basic — full reorder workflow can be Phase 4)
- Implement low-stock alerts
- Crew equipment check-out / check-in flow

**Milestone:** Inventory accurately tracked. Equipment movements logged. Stock alerts trigger.

### Week 8: Settlement Engine

**Tasks:**
- Build Settlement modal (2 stages)
- Auto-populate from crew rekap
- Implement HPP calculation per consumable
- Implement OpEx section with all fields
- Live calculation of Net Profit + margin
- Implement atomic settlement closure:
  - Insert event_settlement (snapshot)
  - Auto-deduct inventory
  - Generate journal entries (full double-entry)
  - Update sinking funds
  - Distribute owner earnings
- Handle loss event flow
- Implement reopen settlement (super admin)

**Milestone:** Event can be closed end-to-end with all financial implications correctly recorded.

### Week 9: Crew Rekap + Omni Finance

**Tasks:**
- Build Crew Rekap submission form (mobile)
- Photo upload integration
- Auto-calculate media set / sleeve from cetak count
- Owner review of rekap before settlement
- Build Omni Finance: Kas & Vault tab with cash position
- Build Sinking Fund Matrix configurator
- Implement withdrawal flow from sinking funds
- Build Ledger Jurnal tab
- Build Laba/Rugi tab with project P&L

**Milestone:** Complete financial visibility. Crew submits rekap from phone.

### Week 10: Owner Earnings + Phase 2 Polish

**Tasks:**
- Build Owner Earnings page (per-owner view)
- Implement withdrawal request flow
- Build Reports module: monthly summary
- Build crew fee balance tracking
- Mark crew fee as paid flow
- Phase 2 polish + bug bash
- Performance optimization (queries, indexes verified)

**Milestone:** Each owner can see their earnings. Crew sees their fee balance.

### Phase 2 Gate

- [ ] Full event-to-settlement cycle tested with real data
- [ ] Inventory deduction matches reality
- [ ] Owner earnings calculated correctly across various scenarios (profit, loss, with/without commissions)
- [ ] Sinking funds allocate per rules
- [ ] Journal entries balance (debits = credits) in all cases
- [ ] All financial numbers reconcile

---

## 5. Phase 3 — Smart Features (Weeks 11-14)

**Goal:** Smart automation, communications, reports, polish.

### Week 11: Notifications & Anomaly Radar

**Tasks:**
- Build notification system (DB model exists; build UI + delivery)
- Implement notification inbox
- Top-bar notification bell with unread badge
- Implement Web Push API for PWA
- Implement anomaly detection rules engine (per rule type)
- Daily cron: anomaly scan
- Daily cron: auto status update (confirmed → upcoming → in_progress)
- Dashboard anomaly radar widget

**Milestone:** Owner gets timely alerts about issues before they become problems.

### Week 12: WhatsApp Integration

**Tasks:**
- Build WhatsApp template management UI
- Implement variable resolution
- Generate wa.me links with URL-encoded body
- Add "Send WA" buttons throughout app (billing, event detail)
- Implement reminder scheduler (manual trigger UI for now)
- Build WA template editor

**Milestone:** Owner can send any message via WA with one click. Templates customizable.

### Week 13: PDF Generation

**Tasks:**
- Implement Invoice PDF (with Tetra branding)
- Implement Quotation PDF
- Implement BAST PDF (corporate handover)
- Implement Monthly Report PDF (auto-generated)
- Implement P&L Report PDF
- Test PDF generation across browsers
- Storage of generated PDFs to Drive (optional, can fall back to download-only)

**Milestone:** All needed PDFs generate correctly with branding.

### Week 14: Drive Integration + Phase 3 Polish

**Tasks:**
- Implement Google Drive OAuth flow (one-time setup by Rama)
- Auto-create event folders on event creation
- Move file uploads to Drive (rekap photos, equipment incident photos, payment proofs)
- Build "Open in Drive" links throughout app
- Phase 3 polish + bug bash
- Mobile UX final pass

**Milestone:** Drive seamlessly integrated. App ready for daily use.

### Phase 3 Gate

- [ ] All anomalies fire correctly
- [ ] Push notifications work on iPhone + Android
- [ ] PDFs generate and look professional
- [ ] WA links work and look correctly formatted
- [ ] Drive folders auto-create
- [ ] All key flows tested by full team

---

## 6. Phase 4 — Polish & Optimization (Ongoing)

**Goal:** Make the app delightful. Address feedback. Scale-up readiness.

### Continuous Tasks

- Performance optimization based on real usage data
- UI polish based on feedback (animations, micro-interactions)
- Edge case handling
- Empty states, loading states, error states refinement
- Accessibility audit + fixes
- Lighthouse score optimization (target 90+)
- Bundle size optimization
- Image optimization
- Add E2E tests for critical paths (Playwright)
- Documentation updates
- Decision Log additions

### Specific Phase 4 Features

- Operations Board drag-and-drop (if not done in Phase 1)
- Advanced inventory features: PO workflow, vendor management
- Crew performance dashboard
- Recurring events (corporate clients)
- Quotation-to-booking conversion flow
- Stock take audit mode UI
- Advanced reports (multi-month comparisons)
- Bulk operations refinements

### When to Stop / Ship

V1 is **good enough** when:
- All Phase 1-3 gates passed
- Real team uses it daily for 2 weeks without major issues
- Owner is happy with reporting accuracy
- Crew prefers it over WhatsApp grup

Phase 4 is "always-on" — no formal end. Improvements happen as needed.

---

## 7. Onboarding Wizard Implementation

The wizard is implemented **in parallel** with Phase 1, since it's needed for go-live.

**Week 5-6 parallel work:**
- Build wizard layout
- Implement each of 9 steps
- Pre-seed master data into wizard defaults
- Atomic save on completion

**Wizard tested at:** End of Phase 1 (used to populate go-live data)

---

## 8. Daily Workflow (Vibecoding with Antigravity)

### Recommended Daily Routine

**Morning (1-2 hours):**
1. Open Antigravity IDE
2. Read today's task list (from this plan)
3. Open relevant docs (FSD module, design system)
4. Use [09_ANTIGRAVITY_MASTER_PROMPT.md](./09_ANTIGRAVITY_MASTER_PROMPT.md) prompts as starting points
5. Build feature with AI assistance, validate manually

**Afternoon (1-2 hours):**
1. Test what was built in browser (desktop + mobile)
2. Fix obvious issues
3. Write quick brief notes if any decisions made
4. Commit progress with conventional commit message
5. Push to GitHub (auto-deploys to Vercel preview)

**End of week:**
1. Test on real devices
2. Get feedback from team if applicable
3. Update progress in this plan
4. Plan next week

### When Stuck

Order of operations:
1. Re-read relevant FSD section (often answer is there)
2. Check [11_TROUBLESHOOTING.md](./11_TROUBLESHOOTING.md) for common issues
3. Use prompt from [10_PROMPT_LIBRARY.md](./10_PROMPT_LIBRARY.md) to ask AI specifically
4. Check Supabase logs for backend errors
5. Check browser console for frontend errors
6. Search Supabase / Next.js Discord
7. Take a break, come back fresh

### Prompt Strategy

**Don't:**
- Ask AI to build entire features in one shot ("build the booking form")
- Skip context (assume AI remembers from earlier conversation)

**Do:**
- Build incrementally (one section at a time)
- Always paste relevant FSD section as context
- Ask AI to read existing code before modifying ("here's my current event-card.tsx, please update it to...")
- Verify what AI generates before committing

---

## 9. Risk Mitigation

### Risk: Vibecoding generates bugs

**Mitigation:**
- Manual testing every change before commit
- Strict TypeScript (no `any`)
- Zod validation runtime safeguard
- Audit log catches financial mutation issues
- Daily local backup of `.env.local`

### Risk: Free tier limits hit

**Mitigation:**
- Monitor Supabase usage weekly (dashboard)
- Aggressive use of Drive for files
- Pagination on all list views
- Cache static data
- Scale-up plan ready ($45/mo if needed)

### Risk: Drive API breaks

**Mitigation:**
- Refresh token monitoring
- Fallback to Supabase Storage for critical files
- Re-auth flow callable by super admin

### Risk: Bug in financial logic

**Mitigation:**
- All settlements snapshot in `event_settlements`
- Reopen settlement (super admin) reverses cleanly
- Audit log shows what changed
- Manual reconciliation reports available

### Risk: Team doesn't adopt

**Mitigation:**
- Mobile UX must be objectively better than WA workflow
- Onboarding wizard makes setup painless
- Owner enforces use (no falling back to WA for event info)
- Quick wins early (e.g., Crew Rekap saves Rama transcription time)

---

## 10. Decision Points (Forks Where Plans Might Change)

### Fork: PWA vs Native App

**Currently:** PWA only.
**Trigger to reconsider:** If iOS users have major issues (push notifications limited on iOS PWA), consider PWA + iOS native shell.

### Fork: Single Tenant vs SaaS

**Currently:** Single tenant for Tetra only.
**Trigger to reconsider:** If business expands to other photobooth operators in future. Significant rework needed.

### Fork: Free Tier vs Paid

**Currently:** Free tier all the way.
**Trigger:** Hit 80% of any free tier limit. Upgrade to Pro tiers (~$45/mo).

### Fork: Vibecoding vs Hire Developer

**Currently:** Solo vibecoder.
**Trigger:** If progress stalls >2 weeks without breakthrough, consider hiring help.

---

## 11. Communication Plan

### To Co-Owners (Fahmi, Acuy, Iqbal)

- Weekly summary (max 3 sentences) of progress
- Mid-Phase demos (after Week 3, 6, 10, 14)
- Final launch announcement

### To Crew (8 members)

- Phase 1 end: 1-day training session on app
- Crew rekap form trial run before going live
- Continuous feedback channel (WA grup)

### To Self

- Update [12_DECISION_LOG.md](./12_DECISION_LOG.md) when making non-trivial choices
- Note bugs/ideas in `ISSUES.md` (separate file, gitignored optionally)
- Celebrate milestones

---

## 12. Quick Reference: Daily Commands

```bash
# Start dev server
pnpm dev

# Build production bundle (test before deploy)
pnpm build && pnpm start

# Lint + format
pnpm check

# Update Supabase types after schema change
pnpm supabase gen types typescript --local > src/lib/supabase/types.ts

# Add new shadcn component
pnpm dlx shadcn@latest add {component-name}

# Add new package
pnpm add {package-name}
pnpm add -D {dev-package-name}

# Update all packages (caution)
pnpm update --interactive

# Check what changed
git status
git diff

# Commit + deploy
git add .
git commit -m "feat: implement X"
git push  # → auto-deploys to Vercel
```

---

**End of Implementation Plan**

*Next document: [09_ANTIGRAVITY_MASTER_PROMPT.md](./09_ANTIGRAVITY_MASTER_PROMPT.md)*
