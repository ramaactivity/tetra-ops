# Design System Polish — Close Gaps Before Phase 2

**Date:** 2026-05-21
**Branch:** `main`
**Trigger:** User request — 10 gaps + ambiguities in `DESIGN_SYSTEM.md` to close before per-route Phase 2 work begins.
**Outcome:** All 10 gaps closed. `DESIGN_SYSTEM.md` is now the airtight foundation for Phase 2 / rekap / payments / crew / design.

---

## TL;DR

11 commits land:
- 9 docs-only updates to `DESIGN_SYSTEM.md` (rules, specs, decisions log).
- 2 code commits: `<EmptyState>` gains an `inline` variant; new `src/components/ui/form-fields.tsx` ships 5 input primitives.
- 1 housekeeping: `tsconfig.json` excludes the untracked `components-reference/` scratch folder so type-checks / builds aren't blocked.
- 1 script: `scripts/lint-design-system.ts` + `pnpm lint:design-system` for token-level enforcement.

Two error-level rules now block CI on new violations:
- `no-native-form-control` (clean today, 0 hits)
- `no-handrolled-popup` (clean today, 0 hits)

Five warn-level rules track outstanding migration debt — 40 warnings total, all in known cleanup queues (auth pages = Phase 3, non-booking forms = Phase 2).

---

## Atomic commits

| Gap | Commit | Scope |
| --- | ------ | ----- |
| #1  | `b5695a8` | §4.7: ban `<NativeSelect>` from user-facing JSX trees. Updated audit grep. §9 Decisions Log seeded. |
| #2  | `d3c7805` | §2.1: deduplicated the back-to-back `<Stack>`/`<Inline>` blocks. Kept as proposed-not-shipped with deferral reasoning. |
| #2 + #3 | `a18815e` | §2.4: `<TimePicker>` full API + behavior contract specced from the shipped implementation. `step` prop deferred. (Decisions Log entries for #2 + #3.) |
| #4  | `5123d1a` | `<EmptyState>` gains `inline` variant (`p-6`, no border) for empties inside `<SectionCard>` bodies. §2.2 spec matrix maps variant × usage × example route + size × pairing. |
| —   | `9aec713` | Housekeeping: `tsconfig.json` excludes `components-reference/` so `npx tsc` / `next build` aren't blocked by the untracked scratch folder. |
| #5  | `07ae83f` | New `src/components/ui/form-fields.tsx` — `<TextField>` / `<NumberField>` / `<MoneyInput>` / `<PhoneInput>` / `<TextareaField>`, all wrapping the canonical `INPUT_CLASS`. §2.4 API matrix + migration policy. |
| #6  | `b08c6c2` | §2.2: `<DataTable>` virtualization deferred with the numbers (18 → 130 → projected <500 rows; React renders 130 in <40ms). Re-evaluation triggers documented. |
| #7  | `c45ad3a` | §3.11: two concrete reference-page polish items — ops list status-column consolidation + project-detail header migration. Both deferred to Phase 3. |
| #8  | `2f1074f` | §3.10: real-time MVP = server-side optimistic concurrency (`UPDATE WHERE updated_at = $`). Full real-time subscription deferred to Phase 5. |
| #9  | `7c2e8aa` | §3.9: operations cluster mobile contract — per-primitive responsive behavior table. `<SummaryRail>` hidden <lg (no bottom sheet); `<PageHeader>` actions wrap → `<DropdownMenu>` if >3; `<SectionCard>` defaultOpen is per-route. |
| #10 | `d87cbd1` | `scripts/lint-design-system.ts` + `pnpm lint:design-system`. 7 rules, severity-by-rule. §6.1 rewritten with rule table + migration strategy + CI hint. |

> Note: Gap #2 split across two commits (`d3c7805` and the leading half of `a18815e`) — the first nailed the dedup, the second piggy-backed the Decisions Log entry for #2 with the §2.4 TimePicker work for #3. Not strictly atomic per gap, but each commit is independently revertable and the Decisions Log + body of `a18815e` makes the split explicit.

---

## Decisions made (and why)

| Decision | Rationale |
| -------- | --------- |
| **Native controls + `<NativeSelect>` user-facing — banned total** (Gap #1) | One-shape selects = predictable keyboard + a11y across every operations sub-page. Earlier "tolerated for short lists" carve-out was producing inconsistent picks in non-booking forms. NativeSelect file stays as the shadcn Select wrapper — the ban is on JSX appearance, not the source. |
| **`<Switch>` / `<RadioGroup>` — deferred** (Gap #1) | Don't exist yet; segmented-button pattern + checkbox-styled label cards already cover today's binary toggles. Build when a third consumer needs the pattern. |
| **`<Stack>` / `<Inline>` — stays proposed-not-shipped** (Gap #2) | Gap tokens already discipline spacing. Promoting to a primitive = lint-cosmetics until a recurring shape emerges across 20+ unique places. |
| **TimePicker `step` prop — deferred** (Gap #3) | Today's 3 callsites all use 5-min granularity. Per "don't change shipped primitives", spec the shipped surface area; promote `MINUTES` to a derived array when crew-schedule pages need 30-min slots. |
| **`<EmptyState>` `inline` variant — shipped** (Gap #4) | Concrete consumer demand (Phase 2 rekap / payments will have sub-region empties inside `<SectionCard>`). Adds 4 lines of code; avoids double-bordered chrome. |
| **Form-input primitives — built minimal + spec migration gradual** (Gap #5) | 76+ raw `<input className={inputClass}>` callsites in booking-form alone. Shipping typed wrappers + exporting `INPUT_CLASS` as the source of truth lets new code reach for the primitive without forcing a 76-callsite rewrite today. Migration falls into Phase 2 per-route work. |
| **DataTable virtualization — deferred** (Gap #6) | Numbers: 18 rows today, ~130 worst case, projected <500 over 5 years. React renders 130 row components in <40ms. `@tanstack/react-virtual` would add 6KB + complexity for no perceptible win. Re-evaluation triggers documented. |
| **Reference page polish — Phase 3, post Phase 2** (Gap #7) | Per-route Phase 2 work (rekap/payments/crew/design) is where primitive APIs get stress-tested. Touch reference pages last so any API drift is settled first. |
| **Real-time MVP = optimistic concurrency check, full real-time deferred** (Gap #8) | The actual 4-owner risk is silent overwrite, not lack of live UI. Server-side `UPDATE … WHERE updated_at = $` catches that without subscription cost or presence-channel infra. Real-time UI parks at Phase 5; bring forward only on actual user complaint. |
| **`<SummaryRail>` mobile = hidden, no bottom sheet** (Gap #9) | Rail's content is review material — duplicating it as a bottom sheet adds UI without value. Form's existing sticky bottom save bar covers the action need. |
| **Design-system lint = Node script, not Biome plugin** (Gap #10) | Biome 2's plugin API for regex rules is heavier than the value. A 200-line script + `pnpm lint:design-system` gives the same enforcement with a lower bar. Severity migration is per-rule. |

---

## Outstanding migration debt surfaced by Gap #10 script

Run `pnpm lint:design-system` to see this live. Snapshot as of `d87cbd1`:

| Rule | Hits | Where | Cleanup queue |
| ---- | ---- | ----- | ------------- |
| `no-decorative-radius` | 6 | `src/app/(auth)/{login,crew-portal,onboarding,pending}/page.tsx` | Phase 3 polish |
| `no-raw-shadow` | 4 | same auth pages above | Phase 3 polish |
| `no-decorative-color` | 0 | — | — |
| `no-hardcoded-eyebrow` | 0 | — | — |
| `no-native-form-control` | **0 (error-level)** | — | already clean |
| `no-native-select-usage` | 30 | equipment forms, addons forms, backdrops, notification rules, crew invite, etc. | Phase 2 per-route work |
| `no-handrolled-popup` | **0 (error-level)** | — | already clean (Combobox portal fix `3b3c079`) |

Total: 0 errors, 40 warnings. Both error-level rules are clean; the script protects against new violations.

---

## What didn't change (constraint-respected)

- **Shipped primitives untouched** — `SectionCard`, `PageHeader`, `MetaBadge`, `FieldGrid`, `KpiRow`, `SummaryRail`, `Combobox`, `TimePicker`, `DatePicker` kept exact behavior. Only `EmptyState` gained one new variant (additive, defaults unchanged).
- **`<NativeSelect>` file kept** — still the canonical shadcn Select wrapper; the ban is on JSX appearance in user-facing code, not on the source file.
- **No Storybook setup** — deferred per existing plan, post-Phase 3.
- **No `<Switch>` / `<RadioGroup>` primitives built** — deferred until a third consumer needs them.

---

## What's ready for Phase 2

`DESIGN_SYSTEM.md` now answers all the questions Phase 2 work will ask:

1. *Which dropdown primitive?* → §4.7: `<Combobox allowFreeText={false}>`. NativeSelect is banned.
2. *How do I lay out a section?* → §2.1.1: `<SectionCard>` + `<FieldGrid>` + `<FieldGrid.Row>`.
3. *Mobile breakpoint behavior?* → §3.9: per-primitive matrix.
4. *Empty state inside a card?* → §2.2: `variant="inline"`.
5. *How do I prevent race conditions across 4 owners?* → §3.10: optimistic concurrency check on every mutation.
6. *What polish do reference pages still need?* → §3.11: concrete two-item plan, run after per-route Phase 2.
7. *How do I catch violations before PR?* → §6.1 + `pnpm lint:design-system`.

Phase 2 work (rekap → payments → crew → design) can now proceed with the foundation airtight.
