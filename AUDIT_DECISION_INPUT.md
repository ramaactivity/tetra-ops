# V3 Decision Input — Pre-Migration Choices

**Date:** 2026-05-21
**Audience:** decision-makers for the v3 design system migration prompt.
**Source:** [AUDIT_PER_MODULE_2026-05.md](AUDIT_PER_MODULE_2026-05.md) + [AUDIT_PRIMITIVE_NEEDS_V3.md](AUDIT_PRIMITIVE_NEEDS_V3.md).
**Purpose:** answer three questions that determine v3 scope, timeline, and ordering.

---

## Question 1 — Does v3 include P0 feature gaps, or only design refactor?

### The bundle choice

The audit surfaced **15+ outstanding P0 feature gaps** across Finance, Warehouse, Reports, Settings, and Crew portal. Each is genuine work — not design-system territory — but they overlap with v3 because closing them requires building new UI surfaces that we'd otherwise build in v3 design language anyway.

Three coherent scope options:

#### Option A — Design refactor only (minimum v3)

**Includes:**
- All 84 routes adopt v1 primitives (PageHeader, SectionCard, FieldGrid, KpiRow, SummaryRail, EmptyState, Combobox, form-fields).
- 30 NativeSelect → Combobox sweep.
- 46 missing loading.tsx → skeleton parity.
- Tier 1 new primitives (6 items) ship.
- Settings IA restructure (5-domain nav).
- Auth pages (rounded-2xl + shadow-xl) cleanup.

**Excludes:**
- All Finance P0s (OpEx input, journal browser, CoA management, bank reconciliation).
- Warehouse purchase intake.
- Reports financial statements (Balance Sheet, Cash Flow).
- Settings P0 features beyond search (bank accounts read-only, frame size mapping, notification rules /new, contacts /new).
- Crew portal P1 closure (rekap wizard, upload progress, damage reporting).
- TanStack Query re-add.
- Real-time presence indicator.

**Effort:** ~4-5 weeks of focused work (1 dev).
**Risk:** LOW. No business logic touched.
**Outcome:** consistent visual language across the app. Every P0 feature gap remains open, scheduled as separate post-v3 epics.

#### Option B — Design + critical P0s (recommended)

**Adds to Option A:**
- **Settings system config search** (P0) — 1-2 days primitive + UI.
- **Bank Accounts /new + /edit** (P0) — 1 day.
- **Notification Rules /new** (P0) — 1 day.
- **Contacts /new** (P0) — 1 day.
- **Real-time MVP optimistic concurrency** (per DESIGN_SYSTEM §3.10) — 1 day per critical mutation = ~3-4 days total (booking save, settlement, payment).

**Excludes:** Finance domain P0s, Warehouse purchase intake, Reports financial statements, Crew P1s, full real-time UI.

**Effort:** ~6-7 weeks (1 dev).
**Risk:** LOW-MEDIUM. The P0s added are all CRUD-shaped — well-understood patterns.
**Outcome:** users gain meaningful capability (manual config search, bank/contact/rule creation) alongside the visual lift. Finance + Reports + Warehouse remain on their existing trajectory.

#### Option C — Full P0 close-out (everything)

**Adds to Option B:**
- Finance: OpEx input + journal browser + CoA mgmt + bank reconciliation (~10-14 days).
- Warehouse: PO intake + supplier master + GR matching (~5-7 days).
- Reports: financial statements + GL integration + period comparison + export (~10-14 days).
- Crew: rekap wizard + upload progress + damage reporting (~5-7 days).

**Effort:** ~10-14 weeks (1 dev).
**Risk:** HIGH. Touches journal_entries / journal_lines, weighted-avg cost math, GL invariants. Each domain is a feature epic in its own right.
**Outcome:** v3 also closes the longstanding feature gaps. But scope creep risk is real — these workstreams haven't been started, and bundling them with design migration multiplies coordination cost.

### Recommendation: **Option B**

**Why:**
1. The 5 P0s in Option B are all UI-shaped CRUD work — they ride the same primitive sweep. Doing them inside v3 saves a context-switch later.
2. The optimistic concurrency MVP (§3.10) is the actual race-condition guard the business needs. It's small server-side work; deferring it past v3 means shipping a polished UI on a broken concurrency floor.
3. Settings system config search alone justifies the search primitive build — defer past v3 and you ship a redesigned-but-still-broken-IA Settings module.
4. Finance/Warehouse/Reports P0s are bigger and benefit from being separate epics where business stakeholders can scope each independently.

**If Option B feels heavy, fall back to A and explicitly schedule the 5 P0 items as Week 6-8 work** (same dev, just sequentially — not bundled).

---

## Question 2 — Realistic pace

### Module-by-module breakdown

| Module | Pure design refactor | + P0 features in scope | Risk |
| ------ | -------------------- | ---------------------- | ---- |
| Dashboard | 4-6h | n/a (no P0) | LOW |
| Reminders | 6-8h | +1-2h (confirm dialog, label rename) | MEDIUM (batch-client) |
| Notifications | 5-7h | +2-3 days (mark-read lag, batching, real-time bell) | MEDIUM |
| Billing | 8-10h | +2h (PdfDownloadMenu list, status badge fix) | MEDIUM |
| **Finance** | **10-14h** | **+10-14 days** (4 P0 epics) | HIGH |
| **Reports** | **6-8h** | **+2-3 weeks** (financial statements + GL + export) | HIGH |
| Warehouse | 6-8h | +5-7 days (PO intake) + 1 day (negative stock guard) | MEDIUM-HIGH |
| Contacts | 3-4h | +1 day (create form) | LOW |
| Audit Log | 3-4h | n/a beyond NativeSelect swap | LOW |
| **Settings** (10 sub-routes) | **25-30h** | **+8-10 days** (5 P0s + IA restructure) | MEDIUM |
| Crew Portal | 10-12h | +5-7 days (wizard, upload, damage, loading.tsx) | MEDIUM |
| Cross-cutting (topbar, sidebar, modals) | 12-15h | +2 days (command palette, notification inbox) | MEDIUM |
| Tier 1 primitives build | ~32h (4 days) | same | LOW |

### Timeline scenarios

#### Pace A — Design refactor only

- Week 1: Tier 1 primitives + Dashboard canary
- Week 2: Reminders + Notifications
- Week 3: Billing + Warehouse + Reports (design only)
- Week 4: Settings sub-routes batch 1 (addons, backdrops, packages, vendors, whatsapp-templates)
- Week 5: Settings sub-routes batch 2 + system config + Audit Log + Contacts
- Week 6: Finance (design only) + Crew portal + cross-cutting + Phase 3 reference page polish + final QA

**Realistic estimate: 5-6 weeks.**

#### Pace B — Design + critical P0s

- Above + 1-2 weeks distributed:
  - +3-4 days for optimistic-concurrency MVP (booking save, settlement, payment)
  - +2-3 days for command palette + system config search
  - +3-4 days for bank-accounts / notification-rules / contacts /new routes

**Realistic estimate: 7-8 weeks.**

#### Pace C — Everything

- Above + 4-6 weeks for Finance/Reports/Warehouse/Crew P0 epics

**Realistic estimate: 11-14 weeks.**

### Honest pace caveats

- **Estimates assume 1 dev, full-time, no other interrupts.** Real-world: 30-50% slip is typical on multi-week migrations.
- **Audit was code-level only** — no actual screenshot or browser inspection. Real-world bugs (z-index conflicts, focus-trap issues, CLS at unusual viewports) discovered during migration will add ~10-15%.
- **No tests exist for most modules.** Migration ships visual regressions silently. **Recommend allocating 1 day of post-each-week QA on production-like preview deployment**, capped at ~10% of total time.
- **Stakeholder review cycles** for Settings IA restructure (5-domain regroup) might pull in 2-3 rounds of feedback. Don't ship the IA change in Week 4 if the regroup isn't approved by end of Week 2.

### Recommendation: **Pace B (7-8 weeks) with explicit weekly checkpoints**

---

## Question 3 — Module migration order (data-driven)

### Sequencing principles

1. **Canary first** — start with the cleanest module to validate the v3 primitive adoption pattern before harder ones.
2. **High-reuse modules ahead of single-consumer modules** — Reminders + Notifications validate notification-shape primitives that the topbar bell later reuses.
3. **Settings is internal infrastructure** — sweep it as a batch in Weeks 4-5 (mid-migration), not at the end. Many other modules link into Settings; clean it before the topbar/search work consumes the IA.
4. **Finance + Reports are highest-LOC + highest-risk** — schedule late so the team has 4 weeks of primitive maturity behind them.
5. **Crew portal is preserve-first** — don't sweep until the v3 primitives are validated on owner side, then carefully adapt without breaking mobile discipline.
6. **Cross-cutting (topbar/sidebar/modals)** — Week 5-6, after enough modules have migrated to inform the topbar inbox + search shape.

### Suggested order

#### Week 1 — Foundation
- **Day 1-2:** Tier 1 new primitives (Badge variants, DateRangeFilter, MetricComparison, ExportButton, EntityListPage, NotificationRow). Defer NotificationRow if topbar inbox slips to Week 6.
- **Day 3:** Auth pages cleanup (rounded-2xl + shadow-xl).
- **Day 4-5:** **Dashboard** (canary).

#### Week 2 — List + workflow modules
- **Day 1-2:** **Reminders.**
- **Day 3-4:** **Notifications.** Surface `<NotificationRow>` usage; informs topbar work.
- **Day 5:** **Audit Log** (small, ~3-4h) + **Contacts** (~3-4h) + start Tier 1 polish.

#### Week 3 — Forms-heavy + tables
- **Day 1-2:** **Billing.** Migrate payment-form to FieldGrid + NativeSelect → Combobox.
- **Day 3-4:** **Warehouse** (design refactor + negative-stock guard). Defer PO intake.
- **Day 5:** Mid-migration QA pass; capture any primitive-API drift.

#### Week 4 — Settings batch
- **Day 1-2:** Settings sub-routes batch A: addons, backdrops, packages, whatsapp-templates (simple).
- **Day 3:** vendors (largest).
- **Day 4:** sinking-funds, items.
- **Day 5:** notification-rules + bank-accounts (+ P0 /new if Option B).

#### Week 5 — Settings finish + cross-cutting + Reports/Finance design
- **Day 1-2:** Settings root (system config + search primitive + command palette).
- **Day 3:** Crew settings page (3-table split into SectionCards).
- **Day 4-5:** **Reports** (design only). **Finance** (design only).

#### Week 6 — Crew portal + topbar + final polish
- **Day 1-2:** Crew portal (8 routes) — preserve mobile discipline, add `SectionCard size="compact"`.
- **Day 3:** Topbar inbox + command palette wire-up.
- **Day 4:** Phase 3 reference page polish (ops list dense status column; project-detail header migration).
- **Day 5:** Full QA at 1280/1440/1920 + 375 across migrated modules.

#### Week 7-8 (Option B only) — Critical P0s
- Optimistic concurrency MVP rolled out per critical mutation.
- Bank Accounts / Notification Rules / Contacts /new routes.
- Final QA + production cutover.

### Anti-recommendation: don't migrate Finance + Reports + Settings in the same week

Each is its own multi-day surface. Spreading them across weeks 4-5 (Settings + Reports/Finance design) avoids primitive-API revision storms.

---

## Decision summary table

| Question | Recommended answer |
| -------- | ------------------ |
| 1. v3 scope? | **Option B** — design + critical P0s (Settings search/bank/contacts/rules + concurrency MVP) |
| 2. Realistic pace? | **7-8 weeks** with weekly checkpoints + 10% QA buffer |
| 3. Module order? | Dashboard → Reminders → Notifications → Audit Log/Contacts → Billing → Warehouse → Settings batch → Reports/Finance (design) → Crew portal → Cross-cutting/Topbar → Reference page polish |

---

## Open questions for human decision

1. **Are the 4 Finance P0s a v3 epic or post-v3 work?** Default recommendation: post-v3 (~3-4 weeks separate effort). If business pressure is high, can lift into v3 — adds ~3-4 weeks to timeline.
2. **Is the 5-domain Settings IA restructure approved?** If not, sweep individual sub-routes in their current nav location and defer regroup. Decision needed by end of Week 2.
3. **Crew portal `<SectionCard size="compact">` variant — ship it or hold off?** If we promote SectionCard with a compact variant, every module gets the option. If we don't, crew portal can't fully adopt without padding regression.
4. **TanStack Query re-add — confirm deferred to Phase 5?** Audit shows zero current usage; Server Components + Promise.all works. Real-time MVP (§3.10) can ride raw Server Actions; presence indicator can wait.
5. **Reports financial statements (Balance Sheet, Cash Flow) — feature epic or v3 inclusion?** Largest gated decision after Finance.

---

**End of AUDIT_DECISION_INPUT.md.** This + `AUDIT_PRIMITIVE_NEEDS_V3.md` + `AUDIT_PER_MODULE_2026-05.md` are the input set for the v3 migration prompt.
