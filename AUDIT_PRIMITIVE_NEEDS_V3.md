# Primitive Needs for v3 — Consolidated

**Source:** [AUDIT_PER_MODULE_2026-05.md](AUDIT_PER_MODULE_2026-05.md) §E across 11 modules + §G-L cross-cutting.
**Purpose:** input to v3 design system migration prompt. Each primitive listed with module justification (≥2 consumers preferred), proposed API skeleton, and build estimate.

---

## TL;DR

**Already-shipped v1 primitives that just need broader adoption** (most v3 work):
- `<PageHeader>` — current adoption 3/84 routes. Needs sweep across 60+ pages.
- `<SectionCard>` (alias of CollapsibleCard) — current 4/84. Needs sweep.
- `<FieldGrid>` + `<FieldGrid.Row>` — current 3/84. Sweep all 76 raw inputs in booking-form + ~50 in Settings forms.
- `<KpiRow>` — current 1/84. Sweep wherever inline `<dl className="grid …">` appears (Dashboard, Billing, Finance, Reports, Warehouse, Crew home).
- `<SummaryRail>` — current 2/84. Reuse opportunity in /operations/[id]/payments, /rekap, /design, /crew.
- `<EmptyState>` — current 32/84. Sweep modules at <100% adoption (Reports, Finance, Reminders, Notifications buckets).
- `<Combobox>` — replace remaining 30 NativeSelect callsites.
- `<TextField>` / `<NumberField>` / `<MoneyInput>` / `<PhoneInput>` / `<TextareaField>` — shipped Gap #5; consume in form sweeps.

**New primitives demanded by ≥2 modules** (build in v3 Phase 0):
- `<SeverityBadge>` (extension of `<Badge>` with critical/warning/info/success aliases) — Notifications + future Audit Log + Warehouse stock status. **High demand.**
- `<DateRangeFilter>` — Reports + Finance + Audit Log + Billing. **High demand.**
- `<MetricComparison>` (period vs period delta + arrow) — Reports + Finance. **Medium demand.**
- `<ExportButton>` dropdown (PDF/Excel/CSV) — Reports + Billing + future Finance. **Medium demand.**
- `<EntityListPage>` composite (PageHeader + KpiRow + FilterBar + ResponsiveTable + "+ Add" CTA) — 8 of 10 Settings sub-routes + Contacts + Vendor master + Crew master. **Very high demand.**
- `<DiffPreview>` — Settings system config sticky footer + Audit Log row drill-down. **Medium demand.**
- `<NotificationRow>` — Notifications list + Topbar bell dropdown + Reminders potentially. **High demand for topbar inbox.**
- `<SectionCard size="compact">` variant — Crew portal needs reduced padding for mobile. **Single-module but blocks crew migration.**

**New primitives demanded by exactly 1 module** (build only if module migrates in v3 — else defer):
- Finance: `<JournalEntry>`, `<JournalLine>`, `<AccountPicker>`, `<TransactionList>`, `<LedgerRow>`, `<ReconciliationTable>`, `<OpExForm>` — **all gated on Finance P0 features being in v3 scope.**
- Warehouse: `<StockMovement>`, `<InventoryQuantity>`, `<PurchaseLine>`, `<StockStatusBadge>`, `<SupplierPicker>`, `<POForm>` — partly gated on Warehouse P0 (purchase intake).
- Reports: `<PnLTable>`, `<FinancialStatement>`, `<TrialBalance>` — gated on Reports financial statements P0.
- Crew portal: `<RekapWizard>`, `<UploadProgressBar>`, `<DamageReportForm>`, `<EventTimeline>` — gated on crew P1 closure decisions.
- Topbar: `<CommandPalette>` (⌘K) — gated on Settings P0 search.

---

## Tier 1 — High-demand new primitives (build in v3 Phase 0)

### `<SeverityBadge>` (or extend `<Badge>`)

**Justification:**
- Notifications module hand-rolls severity colors inline (critical/warning/info/success)
- Warehouse hand-rolls "Stok Kritis" / "Habis" tone classes
- Audit Log will need critical-action highlighting

**Decision:** add severity-aliases to `<Badge variant>` rather than ship a separate primitive. Variants already exist for `success / warning / info / destructive`; add `critical` (= destructive at a louder tone) and `neutral` (= outline) to round out the severity scale.

**API:**
```tsx
<Badge variant="critical">Stok habis</Badge>
<Badge variant="warning">DP H-7</Badge>
<Badge variant="info">Activity</Badge>
<Badge variant="success">Lunas</Badge>
```

**Build:** extend existing `<Badge>` cva variants. ~30min.

### `<DateRangeFilter>`

**Justification:**
- Reports has month picker hand-rolled in 1140 LOC page
- Finance has period filter logic duplicated across 3 files (per old audit §2.6)
- Audit Log lacks date filter entirely
- Billing already uses MonthPicker but limited to month-only

**API:**
```tsx
<DateRangeFilter
  value={{ from: Date, to: Date }}
  onChange={(range) => …}
  presets={["thisMonth", "lastMonth", "thisQuarter", "lastQuarter", "thisYear", "custom"]}
  placeholder="Pilih periode"
/>
```

Internals: composes `<DatePicker>` × 2 + presets chips + popover.

**Build:** ~1 day.

### `<MetricComparison>`

**Justification:**
- Reports lacks prev-month delta (Finance has it, inconsistency per old audit §3.9)
- Finance has duplicated delta arrow logic across sub-sections
- Dashboard could surface deltas on KPI tiles

**API:**
```tsx
<MetricComparison
  current={5_250_000}
  previous={4_800_000}
  format="currency"  // | "number" | "percent"
  comparison="absolute"  // | "percent" | "both"
/>
// → " +Rp 450.000 ↑ (+9.4%)"
```

**Build:** ~half-day.

### `<ExportButton>`

**Justification:**
- Reports P1: no export capability (PDF/Excel/CSV)
- Billing has per-event PDF download but no batch export
- Finance journal browser (if P0 lands) needs CSV export

**API:**
```tsx
<ExportButton
  data={rows}
  formats={["pdf", "xlsx", "csv"]}
  filename="reports-2026-05.xlsx"
/>
```

**Build:** ~1 day (composes DropdownMenu + xlsx + jsPDF integration).

### `<EntityListPage>` composite

**Justification:**
- 8 of 10 Settings sub-routes follow this exact shape
- Contacts list follows it
- Operations vendors list follows it
- **Highest LOC-reduction opportunity in the codebase.**

**API:**
```tsx
<EntityListPage
  title="Vendors"
  backHref="/settings"
  description="Master vendor — pakai di booking form"
  createHref="/settings/vendors/new"
  createLabel="Tambah vendor"
  kpis={[
    { label: "Active", value: activeCount, icon: CheckCircle },
    { label: "Archived", value: archivedCount, icon: Archive },
  ]}
  filterBar={<VendorFilterBar />}
  emptyState={<EmptyState title="Belum ada vendor" />}
>
  <VendorsListTable rows={vendors} />
</EntityListPage>
```

Estimated LOC reduction: ~30% across 8-10 settings pages = ~600 LOC saved.

**Build:** ~1 day (mostly composition; the inner primitives all exist).

### `<NotificationRow>` + `<NotificationInbox>`

**Justification:**
- Notifications module body (line 326 onwards rendering each row as bare `<div className="rounded-xl border …">`)
- v3 spec: topbar bell dropdown needs same row shape

**API:**
```tsx
<NotificationRow
  severity="warning"
  title="DP belum diterima"
  body="Rika & Hendra — H-7"
  timestamp={iso}
  actionHref="/operations/PRJ-…"
  onMarkRead={() => …}
  onDismiss={() => …}
/>

<NotificationInbox
  notifications={recent}
  emptyState={<EmptyState …/>}
/>
```

**Build:** ~1 day.

---

## Tier 2 — Medium-demand new primitives (build during module migration)

### `<DiffPreview>`

**Justification:** Settings system config footer + Audit Log payload viewer.
**API:** before/after JSON or text diff with color highlighting.
**Build:** ~half-day.

### `<SectionCard size="compact">` variant

**Justification:** Crew portal mobile needs reduced padding.
**Build:** add variant prop to `<SectionCard>` (alias of CollapsibleCard). Pass through to underlying primitive. ~1h.

---

## Tier 3 — Feature-gated primitives (build only if scope includes feature)

### Finance domain (P0 feature work)

**If v3 closes Finance P0s:**
- `<JournalEntry>` / `<JournalLine>` — debit/credit row pair, account lookup, amount, memo. ~1 day.
- `<AccountPicker>` — autocomplete + filter by type. ~half-day.
- `<TransactionList>` / `<LedgerRow>` — chronological + running balance column. ~1 day.
- `<ReconciliationTable>` — 2-col "bank | GL" with match toggles. ~2 days.
- `<OpExForm>` composite — date + account + amount + vendor + receipt. ~half-day.

**Total Finance primitive build: ~5 days** (gated on §AUDIT_DECISION_INPUT.md choice).

### Warehouse domain (P0 purchase intake)

**If v3 ships purchase intake:**
- `<StockMovement>` row primitive. ~half-day.
- `<InventoryQuantity>`. ~30min.
- `<PurchaseLine>`. ~half-day.
- `<SupplierPicker>`. ~half-day.
- `<POForm>` composite. ~1 day.

**Total Warehouse primitive build: ~3 days** (gated).

### Reports domain (financial statements)

**If v3 adds Balance Sheet / Cash Flow:**
- `<PnLTable>` nested category × month grid. ~1 day.
- `<FinancialStatement>` composite. ~1 day.
- `<TrialBalance>` GL summary. ~half-day.

**Total Reports primitive build: ~2.5 days** (gated).

### Crew portal P1 closure

- `<RekapWizard>` multi-step composite. ~2 days.
- `<UploadProgressBar>`. ~half-day.
- `<DamageReportForm>`. ~1 day.
- `<EventTimeline>`. ~half-day.

**Total Crew primitive build: ~4 days** (gated).

### Topbar inbox & search

- `<CommandPalette>` (⌘K) — required for Settings system config P0.
  - Uses base-ui Dialog + Combobox composition. ~2 days.
- `<AvatarStack>` for presence — required when §3.10 Phase 5 real-time ships. Defer.

---

## Build phase summary

| Tier | Items | Total build | When |
| ---- | ----- | ----------- | ---- |
| **Tier 1** (high demand, ≥2 modules) | 6 primitives | **~4 days** | v3 Phase 0 — before module sweeps |
| **Tier 2** (medium demand) | 2 primitives | ~1 day | During module migration |
| **Tier 3 — Finance** | 5 primitives | ~5 days | Only if Finance P0 in scope |
| **Tier 3 — Warehouse** | 5 primitives | ~3 days | Only if purchase intake in scope |
| **Tier 3 — Reports** | 3 primitives | ~2.5 days | Only if financial statements in scope |
| **Tier 3 — Crew** | 4 primitives | ~4 days | Only if P1 closure in scope |
| **Tier 3 — Topbar/Search** | 1 primitive (CommandPalette) | ~2 days | Required for Settings system config P0 |
| **Total v3 primitive work (design refactor only)** | 8 primitives | **~5 days** | — |
| **Total if all Tier 3 included** | 26 primitives | **~22 days** | — |

---

## Out-of-scope confirmations

These came up in audit but are NOT new primitives:

- `<Stack>` / `<Inline>` — explicitly deferred in Gap #2 (lint-cosmetics; build when shape recurs 20+ times). Audit confirms no recurrence pressure.
- `<Switch>` / `<RadioGroup>` — deferred in Gap #1. Existing segmented-button + checkbox-label patterns cover today's surfaces.
- DataTable virtualization — deferred per Gap #6 (data-backed: ~130 row worst case is well under threshold).
- TanStack Query re-add — defer to Phase 5 (Server Components + Promise.all pattern works; only real-time needs cache layer).

---

**End of AUDIT_PRIMITIVE_NEEDS_V3.md.** Decision drivers (which Tier 3 primitives ship) live in [AUDIT_DECISION_INPUT.md](AUDIT_DECISION_INPUT.md).
