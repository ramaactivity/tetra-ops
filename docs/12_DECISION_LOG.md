# 12 — Decision Log (Architecture Decision Records)

**Project:** Tetra Ops
**Purpose:** Document non-trivial architectural and product decisions, the context that drove them, alternatives considered, and consequences. This is a living document — add entries as new decisions arise.

---

## How to Read This Doc

Each decision follows the **ADR (Architecture Decision Record)** format:

- **DR-XXX:** Sequential ID
- **Title:** Brief, descriptive
- **Status:** `Accepted` / `Superseded by DR-YYY` / `Rejected`
- **Date:** When decided
- **Context:** Why was a decision needed?
- **Decision:** What did we choose?
- **Alternatives Considered:** What else did we evaluate?
- **Consequences:** What does this mean going forward?

---

## How to Add Entries

When you make a non-trivial decision while building, add a new entry. Examples that warrant an ADR:

- Choosing between architectural patterns
- Selecting libraries or services
- Defining business rules with technical implications
- Deviating from FSD spec for a real reason
- Choosing data model trade-offs

**Don't ADR:** small implementation choices (e.g., "named this variable X"), one-off bug fixes, cosmetic tweaks.

---

## Index

- [DR-001: Server Components by Default](#dr-001-server-components-by-default)
- [DR-002: Hybrid File Storage (Supabase + Google Drive)](#dr-002-hybrid-file-storage-supabase--google-drive)
- [DR-003: Snapshot Settlements Instead of Recalculate](#dr-003-snapshot-settlements-instead-of-recalculate)
- [DR-004: No Formal Test Suite for V1](#dr-004-no-formal-test-suite-for-v1)
- [DR-005: Append-Only Ledger for Finance](#dr-005-append-only-ledger-for-finance)
- [DR-006: Skip Historical Data Migration](#dr-006-skip-historical-data-migration)
- [DR-007: Next.js + Supabase as Core Stack](#dr-007-nextjs--supabase-as-core-stack)
- [DR-008: PWA Instead of Native Apps](#dr-008-pwa-instead-of-native-apps)
- [DR-009: Single Tenant for V1](#dr-009-single-tenant-for-v1)
- [DR-010: Mix English + Bahasa Indonesia in Codebase](#dr-010-mix-english--bahasa-indonesia-in-codebase)
- [DR-011: Owner Pool Only on Profitable Events](#dr-011-owner-pool-only-on-profitable-events)
- [DR-012: Rama Direct Sales Sliding Commission Scale](#dr-012-rama-direct-sales-sliding-commission-scale)
- [DR-013: Rama Receives Double Benefit on Direct Channel](#dr-013-rama-receives-double-benefit-on-direct-channel)
- [DR-014: Manual WhatsApp via wa.me Links (No API)](#dr-014-manual-whatsapp-via-wame-links-no-api)
- [DR-015: Crew Rekap Required Before Settlement](#dr-015-crew-rekap-required-before-settlement)
- [DR-016: Sinking Funds CRUD-able by Super Admin](#dr-016-sinking-funds-crud-able-by-super-admin)
- [DR-017: Single-Page Booking Form Instead of Multi-Step Wizard](#dr-017-single-page-booking-form-instead-of-multi-step-wizard)
- [DR-018: shadcn/ui Instead of Component Library](#dr-018-shadcnui-instead-of-component-library)
- [DR-019: Biome Instead of ESLint + Prettier](#dr-019-biome-instead-of-eslint--prettier)
- [DR-020: Dark Mode as Default](#dr-020-dark-mode-as-default)

---

## DR-001: Server Components by Default

**Status:** Accepted
**Date:** Project inception

### Context
Next.js 15 supports both Server Components (RSC) and Client Components. Each has different implications:
- Server Components: render on server, ship zero JS to client, can directly access DB
- Client Components: shipped as JS to browser, support interactivity, hooks, browser APIs

Decision needed: which is the default mental model for this project?

### Decision
**Server Components are the default.** Client Components only when interactivity, hooks, or browser-only APIs are needed. Mark `'use client'` at the smallest possible boundary.

### Alternatives Considered
1. **Client Components by default (legacy React mindset):** Easier mental model for those new to RSC, but ships unnecessary JS.
2. **Mixed without convention:** Each developer decides per file. Leads to inconsistency.

### Consequences
- ✅ Smaller JS bundles (faster page loads, especially on mobile)
- ✅ Direct DB access in components (less plumbing)
- ✅ Better SEO (though minor concern for internal app)
- ⚠️ Steeper learning curve initially
- ⚠️ Some component patterns require restructuring (e.g., interactive parts must be extracted)
- ⚠️ Can't use libraries that depend on browser APIs in Server Components

---

## DR-002: Hybrid File Storage (Supabase + Google Drive)

**Status:** Accepted
**Date:** Project inception

### Context
The app handles two categories of files:
1. **Small, app-managed:** avatars, item images, brand assets (<500KB each)
2. **Large, user-owned:** event photos, design files, payment proofs (1-50MB each)

Supabase free tier: 1GB total storage. Could be exhausted quickly with category 2 files.

Google Drive: practically unlimited via Rama's personal Google account (or Google Workspace).

### Decision
**Use both:**
- Supabase Storage for category 1 (small, app-managed)
- Google Drive (via API, single-account auth from Rama) for category 2

### Alternatives Considered
1. **Supabase Storage only:** Would hit free tier limit within 6-12 months. Upgrade ~$25/mo just for storage.
2. **Google Drive for everything:** Adds latency for small/critical assets. Auth complexity for avatars.
3. **AWS S3 / R2:** More setup, costs money beyond free tiers.

### Consequences
- ✅ Free tier viable indefinitely
- ✅ Drive familiar to team (Indonesian creative teams already use Drive heavily)
- ✅ Files stay accessible even if Tetra Ops goes offline (Drive is independent)
- ⚠️ Two systems to maintain
- ⚠️ Drive API rate limits (10k requests/100s — generous but real)
- ⚠️ Single point of failure: if Rama's Google account suspended, app loses Drive access
- ⚠️ Refresh token management complexity

---

## DR-003: Snapshot Settlements Instead of Recalculate

**Status:** Accepted
**Date:** Project inception

### Context
When an event is settled (closed), the system computes:
- Net profit
- Sinking fund allocations
- Owner pool distribution
- Crew fees
- HPP (cost of goods sold)

These calculations depend on:
- Fixed rates (crew tier rates, owner pool size, commission rules)
- Inventory costs (purchase_price_avg)
- Custom overrides during settlement

These rates can change over time. Question: when viewing a historical settlement, should the system show numbers from when it was closed (snapshot) or recalculate from current rates?

### Decision
**Snapshot at settlement.** All calculated values stored in `event_settlements` table at the moment settlement is closed. Historical settlements never change unless explicitly reopened by super admin.

### Alternatives Considered
1. **Recalculate on view:** Always show current rates applied retroactively. Simpler schema (less columns) but wrong-feeling — historical reports would mutate as rates change.
2. **Hybrid:** Snapshot calculated values but reference rate tables. Complex, error-prone.

### Consequences
- ✅ Historical reports are immutable and trustworthy
- ✅ Auditable — exactly what was decided at the time
- ✅ Rate changes don't break old settlements
- ⚠️ More columns in `event_settlements` table (~25 numeric fields)
- ⚠️ Reopening a settlement requires reversal logic (handled via journal entries)

---

## DR-004: No Formal Test Suite for V1

**Status:** Accepted
**Date:** Project inception

### Context
Standard practice for production apps: unit tests, integration tests, E2E tests with CI/CD gates.

Reality of this project:
- Solo developer (Rama) with no prior coding experience
- Vibecoding pace with AI assistance
- Internal tool with ~12 known users (not public-facing)
- Time spent writing tests = time NOT building features
- TypeScript + Zod provide strong runtime + compile-time safety

### Decision
**No formal test suite for V1.** Quality gates are:
- Manual testing every change before commit
- TypeScript strict mode + Zod runtime validation
- Audit log catches financial mutation issues
- Dogfood with real team for 2 weeks before "official" launch

Add Playwright E2E tests for critical paths (booking, settlement, payment) only when bugs become recurring.

### Alternatives Considered
1. **Full TDD:** Write tests first. Aspirational, but unrealistic given coding skill level + AI flow.
2. **Just unit tests:** Test business logic in `lib/calculations/`. Reasonable but still slow.
3. **Just E2E tests:** Cover happy paths only. Could be done.

### Consequences
- ✅ Faster build velocity in V1
- ✅ Less mental overhead
- ⚠️ Bugs may slip through (acceptable for internal tool)
- ⚠️ Refactoring is riskier without tests as safety net
- ⚠️ Will need to add tests in V2 as app stabilizes

### Future Trigger
Add tests when:
- Same bug recurs 3+ times → write test for that scenario
- Refactor larger than 5 files → write characterization tests first
- App reaches multi-tenant or external users (V2)

---

## DR-005: Append-Only Ledger for Finance

**Status:** Accepted
**Date:** Project inception

### Context
Financial data needs strong integrity. If we allow updating/deleting payments, journal entries, etc., bugs could silently corrupt financial reports.

### Decision
**Financial entries are append-only.** Corrections happen via reversal entries (negative amounts), not direct edits or deletes.

Tables affected:
- `payments` — has `is_reversed` flag
- `journal_entries` — has `is_reversed`, `reversed_by_entry_id`
- `journal_lines` — never updated
- `stock_movements` — never updated, corrections via new movements
- `owner_earnings` — never updated, corrections via new entries
- `sinking_fund_movements` — never updated

### Alternatives Considered
1. **Allow updates with audit trail:** More flexible UI but harder to guarantee integrity.
2. **Soft delete with restore:** Loses the temporal nature of corrections.

### Consequences
- ✅ Auditable — can reconstruct state at any historical point
- ✅ Mistakes are visible (reversal entries show what happened)
- ✅ Easy to compute balances (just SUM with sign)
- ⚠️ More verbose for simple corrections (need a reversal + new entry)
- ⚠️ UI must handle "reversed" filtering correctly

---

## DR-006: Skip Historical Data Migration

**Status:** Accepted
**Date:** Project inception

### Context
The existing Apps Script v1 contains ~100 historical events with associated payments, settlements, and inventory data. Migrating this data would:
- Take significant effort (data shape mismatch)
- Risk data corruption from bad mapping
- Provide limited ongoing value (history is in v1, accessible read-only)

### Decision
**Skip historical migration.** Start fresh with Tetra Ops. Apps Script v1 stays accessible as read-only historical archive.

What gets migrated to Tetra Ops:
- ~20 active upcoming events: manual entry via Onboarding Wizard
- Master data (paket, addons): pre-seeded from PDF pricelist
- Inventory: CSV import via wizard
- Bank balances: manual entry per account at go-live date
- Team members: manual entry in wizard

### Alternatives Considered
1. **Full migration via script:** ~2-3 days work, error-prone with messy historical data.
2. **Migrate only past 6 months:** Half-measure, still complex.
3. **Migrate just summary stats (no transactions):** Limited value.

### Consequences
- ✅ Faster go-live (~30-60 min onboarding vs days of migration)
- ✅ No risk of data corruption
- ✅ Clean baseline for new system
- ⚠️ Cannot generate historical reports across both systems
- ⚠️ Annual reports for 2026 will be partial (only post-go-live data)

---

## DR-007: Next.js + Supabase as Core Stack

**Status:** Accepted
**Date:** Project inception

### Context
Many viable stacks exist. Need to pick one for the long haul.

### Decision
**Next.js 15 (App Router) + Supabase + Vercel.**

### Alternatives Considered

| Stack | Pros | Cons |
|-------|------|------|
| Next.js + Supabase | Free tier, AI-friendly, mature | Vercel/Supabase lock-in |
| Next.js + Firebase | Free tier, Google ecosystem | Less SQL flexibility, harder reports |
| SvelteKit + Supabase | Smaller bundles, fast | Smaller community, less AI training |
| Remix + Supabase | Server-first, good UX patterns | Less mature, smaller ecosystem |
| Custom Express + Postgres | Full control | More code to write/maintain |
| Refine.dev | Built-in admin patterns | Opinionated, harder to customize |

### Consequences
- ✅ Most popular stack → best AI assistance (Claude/GPT trained heavily on this)
- ✅ Free tier covers our scale comfortably
- ✅ Both services have generous limits before paid
- ✅ Strong communities + documentation
- ⚠️ If Vercel pricing changes, costs could spike
- ⚠️ Supabase relatively young (founded 2020) — long-term stability TBD
- ⚠️ Lock-in: harder to migrate off Supabase later (RLS, Auth, Storage all tied)

---

## DR-008: PWA Instead of Native Apps

**Status:** Accepted
**Date:** Project inception

### Context
Crew uses phones primarily. Native apps (iOS/Android) offer:
- Push notifications
- Better offline
- App store presence
- Native feel

PWA offers:
- Single codebase
- Instant updates (no app store review)
- Free
- "Add to Home Screen" approximates native install

### Decision
**PWA for V1.** Reconsider native if push notifications become critical.

### Alternatives Considered
1. **React Native:** Significant complexity, multiple codebases (web + native).
2. **Native iOS + Native Android:** Triple the code. Not feasible solo.
3. **Capacitor wrapper:** PWA wrapped as native. Adds steps without huge gain.

### Consequences
- ✅ Single codebase
- ✅ Free (no Apple/Google developer fees)
- ✅ Instant updates
- ⚠️ iOS push notifications limited (improving but partial)
- ⚠️ Some users might not "install" → won't get full PWA experience
- ⚠️ Background sync limited on iOS

---

## DR-009: Single Tenant for V1

**Status:** Accepted
**Date:** Project inception

### Context
Could design for multi-tenancy from day one (multiple photobooth businesses use same app, isolated data). Or could be single-tenant (Tetra only).

Multi-tenancy adds:
- Tenant ID on every table
- Tenant-aware RLS policies
- Tenant onboarding flows
- Different pricing/feature tiers
- Significant complexity

### Decision
**Single tenant for V1.** Build for Tetra only. Design domain logic to be portable but don't add tenant_id columns yet.

### Alternatives Considered
1. **Multi-tenant from day one:** Future-proof but 2-3x complexity for V1.
2. **Single tenant with tenant_id reserved:** Add tenant_id but always set to 1. Half-measure.

### Consequences
- ✅ Faster V1 build
- ✅ Simpler RLS policies
- ✅ Lower cognitive load
- ⚠️ Major rework needed if Tetra Ops becomes SaaS for other photobooth operators
- ⚠️ Need to schema-migrate everything if multi-tenant later

### Future Trigger
Reconsider if:
- Tetra expands to franchise model
- 3+ external operators express interest in using the app
- Anthropic/business decides to productize

---

## DR-010: Mix English + Bahasa Indonesia in Codebase

**Status:** Accepted
**Date:** Project inception

### Context
This codebase is Indonesian-market focused. Users see Indonesian UI. But code conventions in the JavaScript ecosystem are English.

### Decision
**Mixed approach with clear rules:**

**English (code-facing):**
- All variable names, function names, type names, file names
- All comments, JSDoc, technical docs
- All database table/column names
- All API/Server Action names
- All error codes (`VALIDATION_ERROR`, etc.)

**Bahasa Indonesia (user-facing):**
- All UI labels, button text, messages
- All form placeholders, helper text
- All toast messages, error messages
- Generated PDFs (invoice, BAST, reports)
- WhatsApp templates
- README and onboarding docs intended for non-developers

### Alternatives Considered
1. **All English (including UI):** Confusing for non-tech-savvy team.
2. **All Bahasa Indonesia (including code):** Breaks JS conventions, alienates AI assistance.
3. **i18n library from day one:** Overkill for single-language internal app.

### Consequences
- ✅ AI assistance works well (English code)
- ✅ Team uses app comfortably (Indonesian UI)
- ⚠️ Translation layer needed (UI strings)
- ⚠️ Inconsistency between developer terms and user terms (e.g., "event" → "acara" in UI)

### Implementation Note
String externalization not required for V1 (single-language). UI strings can live inline in components. Add proper i18n only if multi-language ever requested.

---

## DR-011: Owner Pool Only on Profitable Events

**Status:** Accepted
**Date:** Project inception

### Context
Owner pool = Rp 200k per event distributed to 4 owners (Rp 50k each). Question: should this distribute on every event, or only when event is profitable?

If distributed on losses: owners take money out of the business when business is losing money. Bad for cash flow.

If only on profits: aligns owner take-home with business performance.

### Decision
**Owner pool only distributes if `net_profit > 0`.** Loss events skip pool entirely.

Same applies to sinking funds: only allocated on profit.

### Alternatives Considered
1. **Always distribute (regardless of profit):** Simple but financially harmful.
2. **Distribute proportional to profit:** E.g., 10% of profit. Complex, hard to predict.
3. **Distribute fixed amount but adjust if losses pile up:** Too complex.

### Consequences
- ✅ Owner take-home aligned with business health
- ✅ Loss events don't compound damage
- ✅ Simple rule, easy to understand
- ⚠️ Owners might feel "unfair" if 1 loss event blocks payout from many profitable ones in the same month — addressed by monthly view in dashboard

---

## DR-012: Rama Direct Sales Sliding Commission Scale

**Status:** Accepted
**Date:** Project inception

### Context
Rama is the primary salesperson via direct channel (Tetra phone, IG DMs, etc.). When Rama makes a sale, gets a commission. But how to align commission with discount given?

If flat commission regardless of discount: Rama might give big discounts to close deals, hurting margins.

If commission ties to discount: Rama incentivized to negotiate firmly.

### Decision
**Sliding scale based on discount:**
- No discount applied → Rp 100,000 commission
- Discount ≤ 10% → Rp 50,000 commission
- Discount > 10% → Rp 0 commission

### Alternatives Considered
1. **Flat Rp 100k regardless:** Simple but encourages over-discounting.
2. **% of grand total:** Standard approach but tied to size, not negotiation skill.
3. **Custom per event:** Inconsistent, hard to predict.

### Consequences
- ✅ Aligns Rama's interest with maintaining prices
- ✅ Predictable
- ⚠️ Edge cases at threshold (10.01% gets Rp 0 — feels harsh)
- ⚠️ Doesn't reward big-ticket sales differently
- ⚠️ Configurable in settings — can be adjusted later if rules need tweaking

---

## DR-013: Rama Receives Double Benefit on Direct Channel

**Status:** Accepted
**Date:** Project inception

### Context
Rama works two roles: as owner (gets profit pool share) and as salesperson (gets direct commission). For Direct channel events, does Rama get both?

### Decision
**Yes. Rama gets both:**
- Direct commission (Rp 100k / 50k / 0 based on discount)
- Owner pool share (Rp 50k of the Rp 200k pool)

For Direct events, Rama's total per event = direct commission + Rp 50k pool share.

### Alternatives Considered
1. **Either/or (Rama picks one):** Forces awkward choice. Sales work + ownership are distinct contributions.
2. **Reduced pool share for Rama on Direct:** E.g., other owners get Rp 50k, Rama gets Rp 25k. Punitive feeling.

### Consequences
- ✅ Recognizes Rama's dual role
- ✅ Incentivizes Rama to keep selling Direct (most profitable channel)
- ⚠️ Other owners might perceive unfairness — addressed by transparent dashboard showing all earnings
- ⚠️ Doesn't extend if other owners start selling Direct (currently only Rama does this)

### Future Consideration
If other owners start selling Direct, generalize the rule: any owner who sells gets the direct commission AND their pool share.

---

## DR-014: Manual WhatsApp via wa.me Links (No API)

**Status:** Accepted
**Date:** Project inception

### Context
WhatsApp Business API exists but:
- Requires verified business account
- Costs per message after free tier
- Setup complexity (Meta approval)
- Locked-in to API provider

Alternative: `wa.me` links open WhatsApp with pre-filled message. User clicks "Send" manually.

### Decision
**Use `wa.me` links with pre-filled templates.** No API integration in V1.

### Alternatives Considered
1. **WhatsApp Business API:** Automated sending. Costs ~Rp 100-300 per message. Setup overhead.
2. **Twilio WhatsApp:** Same cost model. More setup.
3. **No WhatsApp integration:** Owner manually composes messages. Slow.

### Consequences
- ✅ Free
- ✅ Works immediately, no setup
- ✅ Owner reviews each message before sending (avoids automated spam)
- ⚠️ Manual click required (one extra step)
- ⚠️ Cannot truly automate reminders — must show in dashboard for owner to send
- ⚠️ Cannot track delivery/read status

### Future Trigger
Switch to API if:
- >50 messages/day need sending
- Read receipts important for compliance
- Two-way conversation tracking needed

---

## DR-015: Crew Rekap Required Before Settlement

**Status:** Accepted
**Date:** Project inception

### Context
After event ends, owner needs to know consumable usage (sleeves, media, FD, etc.) to:
- Auto-deduct inventory
- Calculate accurate HPP
- Close event books

Currently in v1, owner manually transcribes WhatsApp reports from crew. Slow and error-prone.

### Decision
**Crew submits rekap (consumable usage) via mobile app, with photo proof, before owner can settle.**

The form:
- Total cetak (system auto-calculates media set + sleeve)
- FD + Pouch used
- Add-on materials (photomagnet, keychain, etc.)
- Required: 1+ photo proof

Owner can edit submitted rekap before settlement (with audit log).

### Alternatives Considered
1. **Owner enters all data manually (status quo):** Slow, error-prone.
2. **Crew submits via WhatsApp, owner transcribes:** Status quo.
3. **Auto-detect from booth software:** Doesn't exist for our hardware.

### Consequences
- ✅ Reduces owner workload by ~70% per settlement
- ✅ Faster turnaround (owner can settle hours after event)
- ✅ Photo proof reduces disputes
- ⚠️ Requires crew compliance (must submit rekap) — addressed by gating fee disbursement to rekap submission
- ⚠️ Owner must trust crew numbers — mitigated by photo + spot-checks

---

## DR-016: Sinking Funds CRUD-able by Super Admin

**Status:** Accepted
**Date:** Project inception

### Context
Initial sinking funds (Equipment 5%, Maintenance 3%, Crew Reserve Rp 100k flat, Emergency 2%) cover most needs. But business priorities change over time.

### Decision
**Sinking funds are fully CRUD-able by super admin via Settings.** Allocation rules (% or flat) and target balances editable. Can add/remove/disable funds.

### Alternatives Considered
1. **Hardcoded 4 funds:** Rigid. Requires code change to adjust rules.
2. **Read-only configuration:** Same rigidity.

### Consequences
- ✅ Business adapts without code changes
- ✅ Future-proof (e.g., if Tetra wants Marketing fund, can add it)
- ⚠️ More complex schema (`sinking_funds` table with config)
- ⚠️ Risk of misconfiguration breaking allocations — UI safeguards (confirmation modals, default reset button) mitigate

---

## DR-017: Single-Page Booking Form Instead of Multi-Step Wizard

**Status:** Accepted
**Date:** Project inception

### Context
v1 used multi-step wizard for new booking. User feedback: tedious, especially for power user (Rama) who creates dozens per month.

### Decision
**Single-page form with collapsible sections + sticky summary bar.**

### Alternatives Considered
1. **Keep multi-step wizard:** Familiar but slow.
2. **Hybrid: wizard for first-time users, single-page after:** Complex to maintain.

### Consequences
- ✅ Power user (Rama) fills form in <2 min
- ✅ All fields visible at once for context
- ✅ Sticky summary shows running total live
- ⚠️ Visually denser (might intimidate first-time users)
- ⚠️ Sections can collapse for cleaner view
- ⚠️ Mobile UX challenging — single page works because owner mostly desktop

---

## DR-018: shadcn/ui Instead of Component Library

**Status:** Accepted
**Date:** Project inception

### Context
Component options:
- **Radix UI / shadcn/ui:** Headless primitives, copy-paste components, owned in repo
- **Material UI / Mantine / Ant Design:** Pre-styled, opinionated
- **Chakra UI:** Themeable, but larger bundle
- **Build custom from scratch:** Maximum control, maximum effort

### Decision
**shadcn/ui** as foundation. Components copied into `src/components/ui/`. Customized for Tetra brand.

### Alternatives Considered
1. **Material UI:** Heavy, opinionated styles. Hard to brand authentically.
2. **Chakra UI:** Good DX, but larger bundle and less aligned with Tailwind workflow.
3. **Custom from scratch:** Too slow, reinventing wheels.

### Consequences
- ✅ Owned components — full customization control
- ✅ Pairs perfectly with Tailwind (Tetra's CSS choice)
- ✅ AI assistants familiar with shadcn patterns
- ✅ No library version lock-in
- ⚠️ Each component update requires manual sync (rare)
- ⚠️ Can't `npm update` components

---

## DR-019: Biome Instead of ESLint + Prettier

**Status:** Accepted
**Date:** Project inception

### Context
JavaScript tooling traditionally: ESLint (linter) + Prettier (formatter). Biome unifies these into single tool, written in Rust, much faster.

### Decision
**Biome.** Single tool for linting + formatting.

### Alternatives Considered
1. **ESLint + Prettier:** Standard but slower, more config files.
2. **No linter (just TypeScript):** Misses many issues.

### Consequences
- ✅ Faster (10x+ vs ESLint)
- ✅ Single config file (`biome.json`)
- ✅ Less dependency footprint
- ⚠️ Smaller plugin ecosystem than ESLint (some specialty rules unavailable)
- ⚠️ Newer tool — some VS Code integrations less polished

---

## DR-020: Dark Mode as Default

**Status:** Accepted
**Date:** Project inception

### Context
Most professional tools (Linear, Notion, Vercel) default to dark or have strong dark themes. Owner Rama works late nights often. Dark mode reduces eye strain.

### Decision
**Default to dark mode.** Light mode toggleable. Stored in user preferences.

### Alternatives Considered
1. **Default to light, dark toggleable:** Standard but Rama prefers dark.
2. **System default (auto):** Respects OS, but users might not know app supports both.

### Consequences
- ✅ Reduces eye strain for night work
- ✅ Better OLED battery on phones (crew app)
- ✅ Premium feel
- ⚠️ First impression for new users might be unexpected
- ⚠️ Requires careful design — must avoid pure black, ensure contrast

---

## DR-021: Next.js 16 Instead of Next.js 15 in Pre-Phase Setup

**Status:** Accepted
**Date:** 2026-05-06

### Context
The master prompt and earlier docs reference "Next.js 15". When `pnpm create next-app@latest` was run during Pre-Phase setup, the latest stable produced was **Next.js 16.2.4**. Pinning to v15 would mean swimming against the current — `create-next-app@15` invocations are still possible but the upgrade path to 16 is short and 16 is fully backward-compatible for App Router, Server Components, and Server Actions (the features the project actually uses).

### Decision
Adopt **Next.js 16.2.4** as the project's framework version. Treat references to "Next.js 15" in earlier docs as approximate ("modern App Router Next.js"), not a strict version pin.

### Alternatives Considered
1. **Pin to Next 15.x via `create-next-app@15`:** Matches docs literally; but means lagging one major version on day 1 and accepting an inevitable upgrade later for security/perf updates.
2. **Use Next 16:** Latest stable, longer support runway, no behavior changes that affect this project's surface area.

### Consequences
- ✅ Longer support window before forced upgrade
- ✅ Latest perf improvements (Turbopack default for `dev` and `build`)
- ⚠️ Must re-read [AGENTS.md](../AGENTS.md) — it warns AI assistants that "this is not the Next.js you know"; trust framework docs over training-data conventions
- ⚠️ Older snippets from FSD/API spec may use 15-era syntax; verify against `node_modules/next/dist/docs/` before copying

### Future Trigger
If a third-party package the project depends on explicitly requires Next ≤15 (unlikely), revisit.

---

## DR-022: Brand Asset Placeholders for Pre-Phase Setup

**Status:** Accepted
**Date:** 2026-05-06

### Context
The brand-assets/README.md specifies 8 canonical files (logo-full-color.svg/.png, logo-monochrome-dark.svg, logo-monochrome-light.svg, logomark-only.svg/.png, favicon.ico, apple-touch-icon.png). The actual provided assets in `brand-assets/` are **6 numbered PNGs** of the wordmark "tetra." in monochrome black or white — no SVGs, no full-color (crimson + gold) version, no square logomark, no favicon, no apple-touch-icon.

Setup cannot block on full brand asset delivery — Phase 1 Week 1 needs to start once Pre-Phase is done. So we proceeded with placeholder mappings.

### Decision
- `scripts/place-brand-assets.ts` maps numbered PNGs to canonical destination names in `public/brand/`:
  - `02. LOGO TETRA BLACK.png` → both `logo-full-color.png` (placeholder) and `logo-monochrome-dark.png`
  - `05. LOGO TETRA WHITE.png` → `logo-monochrome-light.png`
  - `01. LOGO TETRA BLACK.png` → `logomark-only.png` (wordmark stand-in; no proper square mark provided)
  - `06. LOGO TETRA WHITE.png` → `logomark-on-dark.png` (used as source for PWA icons)
- `scripts/generate-pwa-icons.ts` composites the white wordmark on a solid crimson `#DC2954` canvas to produce `icon-192.png`, `icon-512.png`, and `icon-maskable-512.png` (20% safe-zone for Android adaptive masking).
- Numbered originals stay untouched in `brand-assets/`.

### Alternatives Considered
1. **Block setup on receiving full brand kit:** Cleaner long-term, but stalls Phase 1 indefinitely.
2. **Use shadcn defaults / generic placeholder:** Even further from final intent; would require swapping every reference to a generic icon.
3. **Synthesise a logomark via sharp crop:** Possible (extract "ə." from wordmark), but feels worse than using the wordmark as a stand-in until proper assets land.

### Consequences
- ✅ Pre-Phase setup unblocked; PWA install shows a recognisable Tetra icon
- ⚠️ `logo-full-color.png` is currently monochrome black, not the spec'd crimson + gold lockup
- ⚠️ No SVG variants — every logo render is rasterised; minor crispness loss at non-native sizes
- ⚠️ No `favicon.ico` or `apple-touch-icon.png` — Next.js's default `src/app/favicon.ico` will serve until replaced
- ⚠️ `logomark-only.png` is a wordmark, not a square monogram — ill-suited for sidebar compact (32x32) renders

### Phase 1 Polish Follow-ups
- [ ] Rama provides crimson + gold full-color logo (SVG + PNG)
- [ ] Rama provides square logomark "T." or "ə." monogram (SVG + PNG, 512x512+)
- [ ] Rama provides `favicon.ico` (multi-size 16/32/48) and `apple-touch-icon.png` (180x180, crimson bg)
- [ ] Re-run `pnpm brand:place && pnpm brand:icons` after files land

### Future Trigger
When proper brand kit is delivered, drop the numbered-PNG mapping and update `scripts/place-brand-assets.ts` to use canonical filenames in `brand-assets/` directly.

---

## DR-023: Light-mode polish deferred to P5

**Status:** Accepted
**Date:** 2026-05-08

### Context
Sesi 5 redesign master plan (`~/.claude/plans/saya-mau-fokus-polish-eventual-gem.md`) lists light-mode polish as Polish-phase P5 (~4h). Open question whether to fast-track it earlier so the foundation tokens get tested in both themes simultaneously.

### Decision
Light mode is parked at P5. Foundation phases (F1-F4) and all Application phases (A1-A11) target dark mode (the app default). Light tokens are still wired in F1 for forward-compatibility but not actively tested or polished until P5.

### Consequences
- ✅ Reduces F1-F4 scope; one theme to verify per phase
- ✅ Concentrates designer effort where it lands first (dark = default for owners)
- ⚠️ Light-mode bugs may accumulate silently across application phases — need a P5 pass to find/fix them all at once

---

## DR-024: No brand photography in redesign — gradients + iconography only

**Status:** Accepted
**Date:** 2026-05-08

### Context
Master plan §"Open questions" raised whether to commission/integrate Tetra brand photography for hero sections (login, dashboard KPI hero, PDF cover) or rely solely on gradients + iconography.

### Decision
Skip brand photography entirely. All hero/empty/branded moments use the locked Sunrise + Aurora gradients (defined in F1) plus Lucide iconography. Rationale: photos add weight (KB + LCP cost) and Tetra Ops is a daily-use ops app where speed beats imagery.

### Consequences
- ✅ No photo asset pipeline to maintain (no `/public/brand/photos/`)
- ✅ Faster LCP on hero screens
- ✅ Brand stays consistent without depending on photo quality
- ⚠️ Hero moments lean heavily on gradient + typography craft — execute precisely

### Future Trigger
If marketing pages (separate from ops app) ever ship, they may revisit this and use photography there.

---

## DR-025: Empty-state copy generated by Claude (Indonesian, Tetra voice)

**Status:** Accepted
**Date:** 2026-05-08

### Context
Master plan §"Open questions" asked who writes empty-state copy across ~30+ list/table screens. Options: Rama writes manually, or Claude generates in Tetra voice.

### Decision
Claude generates Indonesian copy aligned with Tetra voice (warm, ops-team practical, not overly cute). Generated during the relevant Application phase (A1-A11), reviewed by Rama in PR. Pattern reference: `<EmptyState>` primitive in F3.

### Consequences
- ✅ Consistent voice across all empty states
- ✅ No bottleneck waiting on Rama's wordsmith time
- ⚠️ Rama must spot-check tone in each PR; flag any drift

### Future Trigger
If voice drifts (e.g., AI-generic tone creeps in), pull a few exemplars into a `docs/06_VOICE_GUIDE.md` reference file.

---

## Template for New Decisions

```markdown
## DR-XXX: [Decision Title]

**Status:** Accepted
**Date:** YYYY-MM-DD

### Context
[Why was this decision needed? What was the situation that forced a choice?]

### Decision
[What did we choose?]

### Alternatives Considered
1. **[Alternative 1]:** [Pros and cons]
2. **[Alternative 2]:** [Pros and cons]

### Consequences
- ✅ [Positive consequence]
- ✅ [Positive consequence]
- ⚠️ [Trade-off or risk]
- ⚠️ [Trade-off or risk]

### Future Trigger (optional)
[Conditions under which this decision should be revisited]
```

---

**End of Decision Log**

*Next document: [13_ONBOARDING_WIZARD.md](./13_ONBOARDING_WIZARD.md)*
