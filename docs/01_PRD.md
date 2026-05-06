# 01 — Product Requirements Document (PRD)

**Project:** Tetra Ops
**Version:** 1.0.0
**Status:** Approved for Development
**Owner:** Muhamad Ramadan Saputra (Rama)

---

## 1. Executive Summary

Tetra Ops is the internal operating system for **Tetra Photobooth**, a Bogor-based event photobooth business serving 8-20 events per month with services ranging from classic photobooth printing to 360° spin video booths and editorial magazine box installations.

The current system, built on Google Apps Script + Google Sheets, has hit its scaling limits: slow loading times, poor mobile UX (critical for field crew), unreliable financial reporting, and friction-heavy data entry. Tetra Ops replaces this with a modern, mobile-first PWA built on Next.js + Supabase, designed specifically for event-to-event operations rather than static booth deployments.

The system covers the complete event lifecycle: from initial booking through field execution to financial settlement and archived reporting. It is built to be **operated, not just used** — every screen is designed for the actual workflow of a small photobooth business in Indonesia.

---

## 2. Vision Statement

> "Tetra Ops adalah single source of truth untuk seluruh operasional Tetra Photobooth. Dari booking pertama sampai laporan akhir tahun, semuanya terintegrasi, akurat, dan bisa diakses kapanpun, dimanapun — terutama di handphone crew yang lagi di lapangan."

**Core Principles:**
1. **Mobile-first by necessity** — Crew works in the field. The app must work flawlessly on a phone with shaky 4G.
2. **Owner-centric finance** — Money clarity is non-negotiable. Cash flow, margins, and obligations must be visible in real-time.
3. **Friction-free data entry** — If logging consumable usage takes more than 30 seconds, crew won't do it.
4. **Smart over fancy** — Every "smart" feature must save time or prevent error. No gimmicks.
5. **Indonesian context** — Bahasa Indonesia by default, IDR formatting, WIB timezone, local payment patterns (transfer manual, no payment gateway).

---

## 3. Problem Statement

### Current Pain Points (from Apps Script v1)

**P1 — Performance:** Apps Script + Sheets is slow. A simple page load can take 10-15 seconds. Settlement modal freezes when calculating. This makes daily operations frustrating.

**P2 — Mobile UX:** The current app was designed desktop-first. Crew checking schedule on their phone in transit have to pinch-zoom and scroll horizontally. Forms are nearly unusable.

**P3 — Data Reliability:** Sheets-based backend has no data integrity. Concurrent edits cause data loss. Formula errors propagate silently. Financial reports occasionally show impossible numbers.

**P4 — Manual Reporting:** After every event, Rama manually transcribes WhatsApp reports from crew into the system: "Media: 6203, Sleeve: 4808, FD: 4". This is error-prone and time-consuming.

**P5 — No Inventory Visibility:** Stock levels are tracked manually. Equipment going out for events sometimes don't come back. No formal check-in/check-out flow.

**P6 — Disconnected Workflow:** Booking → Design → Execution → Settlement → Archive — each step lives in a different sheet/tab. Information gets lost between handoffs.

**P7 — Owner Reporting:** With 4 owners, each wants to know "how much did I make this month?" Currently this requires Rama to calculate manually.

### What Success Looks Like

**S1 — Speed:** Page loads under 2 seconds. Modals open instantly. Optimistic UI for all mutations.

**S2 — Mobile Excellence:** Crew can do their entire job (check schedule, see event details, log consumables, upload photos, mark equipment) from their phone with one hand.

**S3 — Data Integrity:** Postgres with proper constraints. Audit log for all financial mutations. No silent failures.

**S4 — Self-Service Crew:** Crew enters consumable rekap via app with photo proof. Owner just reviews and approves.

**S5 — Real-Time Inventory:** Every event auto-deducts consumables. Equipment has explicit check-out/check-in. Low-stock alerts before items run out.

**S6 — Connected Pipeline:** One event flows through all stages with single record-of-truth. Status visible at every stage.

**S7 — Owner Dashboards:** Each owner sees their own earnings (commissions + profit share) at a glance. Monthly reports auto-generated.

---

## 4. User Personas

### Persona A — Rama (Super Admin / Operating Owner)
- **Role:** Owner, primary admin, sales coordinator, system manager
- **Tech savvy:** High (vibecoder, runs the business operations)
- **Device:** Mostly desktop (Mac), occasional phone
- **Daily tasks:** Input bookings, approve settlements, check cash flow, manage crew, review margins, configure system
- **Pain points:** Time spent on manual transcription, tracking outstanding payments, managing crew assignments
- **Success criteria:** Can run end-to-end operations in <30 min/day

### Persona B — Fahmi, Acuy, Iqbal (Co-Owners)
- **Role:** Owners, mostly passive but want visibility
- **Tech savvy:** Low to medium (regular users, not tech-focused)
- **Device:** Mixed (phone for quick checks, desktop for monthly review)
- **Daily tasks:** Check earnings, see upcoming events, occasionally help with operations
- **Pain points:** Don't understand finance jargon, just want to know "how's the business?"
- **Success criteria:** Can answer "how much did I earn this month?" in one tap

### Persona C — Senior Crew (Lead Operator)
- **Role:** Lead/Operator (Kru A) — runs the booth, handles main camera/printer
- **Tech savvy:** Medium (uses smartphone heavily, social media native)
- **Device:** Phone primarily (Android, mid-range)
- **Daily tasks:** Check assigned events, see event details (location, time, paket, backdrop), check out equipment, run booth, upload documentation, log consumable usage
- **Pain points:** Currently relies on WhatsApp messages that get buried, equipment list is informal
- **Success criteria:** Can prep for event in <5 min from phone

### Persona D — Junior Crew (Assistant)
- **Role:** Asisten (Kru B) — supports lead, handles backdrop/flow management
- **Tech savvy:** Medium
- **Device:** Phone only
- **Daily tasks:** Check assigned events, follow lead's instructions, help with packup/unpacking
- **Pain points:** Less context than senior, sometimes shows up unprepared
- **Success criteria:** Has same event detail visibility as senior

---

## 5. Feature Prioritization Matrix

Using **MoSCoW** (Must / Should / Could / Won't) framework, mapped to phases.

### MUST HAVE (V1 Phase 1) — Core Operations
- M1. Authentication & role-based access (Owner / Crew)
- M2. Master data CRUD (Packages, Add-ons, Crew, Items)
- M3. New Booking form (multi-step, optimized for owner input)
- M4. Operations Command (List view with filters by month)
- M5. Billing dashboard (UNPAID / DP / LUNAS / OVERDUE statuses)
- M6. Payment logging with optional proof upload
- M7. Crew dashboard (mobile-first) with assigned events
- M8. Crew event detail view with all info needed for field
- M9. Settings (system config: rates, commissions, sinking funds)
- M10. Onboarding wizard for first-time setup

### SHOULD HAVE (V1 Phase 2) — Financial & Inventory Backbone
- S1. Smart Warehouse with consumables (auto-deduction) & equipment
- S2. Equipment check-out / check-in flow
- S3. Settlement modal (event closing with profit calculation)
- S4. Sinking funds with auto-allocation
- S5. Owner earnings ledger (per-owner virtual balance)
- S6. Project P&L per event
- S7. Cash & Bank ledger (multi-account)
- S8. Journal entries (auto-generated from settlements)
- S9. Operations Calendar view
- S10. Operations Board view (Kanban by status)
- S11. Operations Design Hub view

### COULD HAVE (V1 Phase 3) — Smart Features
- C1. Smart notification system (anomalies, reminders, alerts)
- C2. WhatsApp message generator (pre-filled templates)
- C3. PDF generation (Invoice, Quotation, BAST)
- C4. Auto-reminder scheduler (manual trigger or scheduled)
- C5. Crew consumable rekap with photo proof
- C6. Equipment damage/loss reporting flow
- C7. Multi-event-per-day warning system
- C8. Crew schedule conflict detection
- C9. Per-owner monthly report (simple, non-technical)
- C10. Stock low alerts with reorder suggestions

### WON'T HAVE (V1 — Future or Out of Scope)
- W1. Customer-facing booking website
- W2. Payment gateway integration
- W3. Native iOS/Android apps
- W4. Multi-tenant support
- W5. Advanced analytics with AI predictions
- W6. Integrated CRM with marketing automation
- W7. Public investor deck (was cosmetic in v1, dropped)
- W8. Custom mobile native features (camera direct integration, etc.)

---

## 6. User Stories (Top 20)

These are the highest-priority user stories ordered by business impact. Full backlog lives in FSD.

**As Rama (Super Admin):**
1. I want to create a new event booking in under 2 minutes so I can respond to client inquiries quickly.
2. I want to see all upcoming events at a glance with their payment status so I know what to chase.
3. I want to assign crew to events with automatic conflict warnings so I don't double-book.
4. I want to close an event with one click and see the profit auto-calculated so I can move on.
5. I want to see my cash position across all bank accounts in real-time so I can plan operations.
6. I want to know which events are at risk (no DP, no crew, no design) so I can act before it's a problem.

**As Fahmi/Acuy/Iqbal (Co-Owner):**
7. I want to see my personal earnings this month without understanding accounting so I know my cut.
8. I want to see what events are happening this week so I'm in the loop.
9. I want to see the business is healthy at a glance (cash, profit, events done) so I have peace of mind.

**As Senior Crew (Lead):**
10. I want to see today's events on my phone immediately when I open the app so I know where to go.
11. I want to see complete event details (location, paket, backdrop, PIC contact) without scrolling forever so I can prep efficiently.
12. I want to check out equipment from my phone with a checklist so I don't forget anything.
13. I want to log consumable usage at end of event with photo proof so I don't have to message Rama.
14. I want to see my fee for each event and total this month so I know my income.

**As Junior Crew (Assistant):**
15. I want the same event detail visibility as the lead so I can be a useful team member.
16. I want clear directions to the venue from my current location so I'm never late.

**As any Owner during settlement:**
17. I want to see the full breakdown of revenue, costs, and profit so I trust the numbers.
18. I want sinking funds auto-allocated so I don't forget to set aside maintenance money.
19. I want to log payments to the right bank account so my ledger is accurate.

**As Rama doing onboarding:**
20. I want to set up the entire system in under 1 hour with guided steps so I can start using it the same day.

---

## 7. Success Metrics

### Quantitative (Measurable)
- **Time to create booking:** Current ~5 min → Target <2 min
- **Time to settle event:** Current ~10 min → Target <3 min
- **Page load p95:** Current ~10s → Target <2s
- **Mobile usability score (Lighthouse):** Target >90
- **Onboarding completion time:** Target <1 hour from zero to first booking
- **Crew app adoption:** Target 100% of crew using app within 2 weeks of launch
- **Manual transcription tasks eliminated:** Target ~80% reduction

### Qualitative (Observable)
- Rama can do operations from his phone (currently desktop-only)
- Co-owners check the app voluntarily without being prompted
- Crew prefers the app over WhatsApp grup for event info
- Settlement process feels "fun" not "exhausting"
- Financial reports are trusted (no manual cross-checking)

---

## 8. Constraints & Assumptions

### Constraints
- **Budget:** Free tier only across all services. Total monthly cost target = Rp 0.
- **Team:** Solo developer (Rama, vibecoding with AI assistance in Antigravity IDE).
- **Skill level:** No prior coding experience, relies on AI for implementation.
- **Timeline:** No hard deadline. Quality > speed.
- **Scale:** ~100 historical events to migrate, ~20 active upcoming, ~12 users (4 owners + 8 crew), 8-20 events/month going forward.

### Assumptions
- Free tier limits won't be hit at current scale (validated in TSD).
- Internet connectivity is generally available (PWA offline-first for critical paths only).
- Crew has Android phones with Chrome/PWA support (verified).
- Google account ownership for OAuth (verified — all team has Gmail).
- Indonesian timezone (WIB, UTC+7) and IDR currency are exclusive.

### Risks
- **R1 — Free tier hit:** If Supabase free tier is exceeded, app breaks. Mitigation: Heavy use of Google Drive for files, aggressive query optimization, monitoring dashboards.
- **R2 — Migration complexity:** Importing existing data is the hardest part. Mitigation: Skip historical data, only migrate active events via friendly wizard.
- **R3 — Adoption resistance:** Crew might prefer WhatsApp out of habit. Mitigation: Mobile UX must be objectively better than WA workflow, plus owner enforcement.
- **R4 — Scope creep:** Vibecoding can lead to "let me add this feature" mid-build. Mitigation: Strict phase gates, decision log review before any deviation.

---

## 9. Out of Scope (Explicit Non-Goals)

To prevent scope creep and keep V1 lean:

- **Customer self-service portal** — Clients still book via DM/WA. Sales is human-to-human.
- **Automated marketing** — No email campaigns, no IG auto-post, no funnel automation.
- **Accounting integration** — No Jurnal.id, Xero, QuickBooks integration. Manual export only.
- **AI features** — No GPT-powered anything in V1. Anomaly detection is rule-based, not ML.
- **Multi-language** — Bahasa Indonesia only.
- **Multi-currency** — IDR only.
- **Multi-business** — Single tenant for Tetra Photobooth only. No SaaS.
- **Real-time chat** — Use WhatsApp. Don't reinvent.
- **Approval workflows** — Owner trust is implicit. No multi-step approvals for V1.
- **Time tracking for crew** — Fee is per-event, not per-hour. Don't track hours.

---

## 10. Acceptance Criteria for V1 Launch

V1 is "launched" when:

1. Rama can log in and see all his events for the month
2. A new booking can be created end-to-end without errors
3. A crew member can log in on their phone and see their assigned events
4. A crew member can submit consumable rekap with photo proof from phone
5. An event can be settled with auto-calculated profit and journal entries created
6. Sinking funds auto-allocate after settlement
7. Owner earnings show correctly per individual owner
8. Cash flow report shows accurate balance across all bank accounts
9. Onboarding wizard completes for a fresh deploy in under 1 hour
10. PWA installable and works offline for crew event detail view
11. All page loads under 2 seconds on 4G
12. Lighthouse mobile score >90 on all main pages
13. No data corruption observed in 1 week of dogfooding
14. All 12 team members successfully logged in and used the app

---

## 11. Branding Direction

**Name:** Tetra Ops
**Tagline (internal):** "Operating system for Tetra Photobooth"
**Visual Direction:** "Refined Operator" — 70% professional (Linear/Notion), 20% minimal (Vercel/Apple), 10% delightful (Stripe/Figma micro-interactions)

**Color Palette:** "Tetra Crimson Editorial"
- Primary: Crimson 500 `#DC2954` (matches external brand from pricelist)
- Surface: Slate-warm scale (warm off-white in light, deep slate in dark)
- Semantic: Emerald (success), Amber (warning), Rose (danger), Sky (info)
- Accent: Gold `#D4A574` (premium PDFs), Sage `#84A98C` (sinking funds)

**Typography:**
- UI: Inter (free Google Font)
- Branded: Playfair Display (free, matches pricelist editorial feel)
- Numbers: JetBrains Mono (tabular alignment)

**Default mode:** Dark (with toggle to light)

Full design tokens in `04_DESIGN_SYSTEM.md`.

---

## 12. Future Considerations (Post-V1)

Items deferred for future versions (V1.1, V2):

- **Public landing page** for marketing (separate codebase)
- **Quote-to-booking conversion flow** (sales pipeline)
- **Recurring events** (corporate clients with monthly contracts)
- **Multi-location support** (if Tetra expands to other cities)
- **Investor reports** (quarterly auto-generated PDF for investors)
- **Loyalty system** for repeat clients
- **Vendor/EO management** (full CRM for partner channel)
- **Inventory forecasting** (ML-based reorder predictions)
- **Crew performance scorecard** (after sufficient data accumulated)
- **Customer satisfaction tracking** (post-event survey integration)

---

**End of PRD**

*Next document: [02_FSD.md](./02_FSD.md) — Functional Specification Document*
