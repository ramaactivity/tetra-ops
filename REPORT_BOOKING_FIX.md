# Booking Form — Layout Regression Fix

**Date:** 2026-05-20
**Branch:** main
**Trigger:** User report — "Booking Form Layout Regression" (7 critical issues)

> **Superseded — most decisions in this report were revisited the same day** by the operations consistency pass ([REPORT_OPERATIONS_CONSISTENCY.md](REPORT_OPERATIONS_CONSISTENCY.md)). Specifically:
>
> - Container `wide` (max-w-[1600px]) → reverted to `xl` (max-w-7xl=1280px) to align with `/operations/[projectId]` reference. Commit `fd4066a`.
> - Summary panel 320/360px → tightened to 280px (`SummaryRail width="sm"`). Commit `fd4066a` + `b60602c`.
> - `<input type="time">` native picker → reverted to custom Popover. Commit `d020272`.
> - `<Field>` label-on-top → `<FieldGrid.Row>` label-LEFT for solo fields (paired short fields stay stacked). Commits `cea1eac`/`00ad0d3`/`24263ce`/`442f15b`.
>
> Reads in this file that still apply: helper text → tooltip ⓘ (`5bea6b4`), add-on rows auto-fill grid + no truncate (`c6aa85e`), summary panel mini-timeline + addon breakdown (`4944a88`), loading.tsx skeletons (`2cbee87` rewrote them to match new structure).
>
> See REPORT_OPERATIONS_CONSISTENCY.md §0 "Shipped log" for the canonical state.

## Why this report exists

Session 1 of the booking-form redesign (6afd5fd, 9e34a54, 07c5795) shipped
the layout shell (2-col grid + sticky summary panel + section nav) without
fixing the *container width* it lived inside. The page wrapper still capped
content at `max-w-3xl` (768px), so adding a 320px summary rail starved the
form column down to ~380px on a 1440px screen — fields truncated, paired
grids collapsed, add-on cards lost their labels. This batch fixes the
foundation, then pulls in the polish items the user flagged in the same
report (time picker, helper text, summary panel content, skeletons).

## Atomic commits (this batch)

| Commit  | Scope                                                             |
| ------- | ----------------------------------------------------------------- |
| 6d57e8a | Widen page container + form grid template                         |
| 7cb1374 | Replace circular step badge with eyebrow indicator                |
| c6aa85e | Add-on rows: drop truncate + auto-fill grid + remove 176px ghost  |
| 5ba65c0 | Time picker → native `input[type=time]` + keep preset popup       |
| 5bea6b4 | Helper hints → ⓘ tooltip next to label                            |
| 4944a88 | Summary panel: mini-timeline + per-add-on breakdown               |
| 0ba14f6 | loading.tsx skeletons mirror new 2-col layout                     |

All 7 commits typecheck clean (`npx tsc --noEmit`) and the full
`npx next build` passes after the last commit.

## What changed, file by file

### Foundation — 6d57e8a

- [src/components/layout/container.tsx](src/components/layout/container.tsx)
  → new `size="wide"` variant = `max-w-[1600px]`.
- [src/app/(owner)/operations/new/page.tsx](src/app/(owner)/operations/new/page.tsx#L112)
  → swap the ad-hoc `mx-auto w-full max-w-3xl` for `<Container size="wide">`.
- [src/app/(owner)/operations/[projectId]/edit/page.tsx](src/app/(owner)/operations/[projectId]/edit/page.tsx#L109)
  → `Container size="sm"` → `Container size="wide"`.
- [src/components/booking/booking-form.tsx:958](src/components/booking/booking-form.tsx#L958)
  → grid template `minmax(0,1fr)_320px` → `minmax(640px,1fr)_320px`
  at `lg`, then `minmax(640px,1fr)_360px` at `xl`. Form column can no
  longer fall below the 2-col field-grid breakpoint.

### Section indicator — 7cb1374

- [src/components/booking/booking-form.tsx:2668-2700](src/components/booking/booking-form.tsx#L2668)
  → 32px circular Badge per section → low-emphasis eyebrow line
  `01 · SUMBER BOOKING`. Drops the `pl-9` child indent so fields
  reclaim the full form-column width.

### Add-on rows — c6aa85e

- [src/components/booking/booking-form.tsx:2184](src/components/booking/booking-form.tsx#L2184)
  → per-category `space-y-1` stack → auto-fill grid at `xl`
  (`grid-cols-[repeat(auto-fill,minmax(320px,1fr))]`).
- Drop `truncate` on the name label so long names like
  "Voucher 4R Tambahan 50pcs" wrap instead of getting cut.
- Remove the 176px "Klik untuk pilih" placeholder on unselected
  rows — the checkbox already signals the affordance.

### Time picker — 5ba65c0

- [src/components/ui/time-picker.tsx](src/components/ui/time-picker.tsx)
  → rewritten around `<input type="time" step={300}>`. Drops
  ~80 LOC of custom HH/MM segmented input + arrow-step logic.
- Preset popup (08:00 / 10:00 / 13:00 …) preserved via Clock
  button — still the fastest way to pick common Tetra start slots.
- Public API unchanged: same `value` / `onValueChange` /
  `aria-invalid` props, so all 3 booking-form callsites work
  without edits.

### Helper text → tooltip — 5bea6b4

- [src/components/booking/booking-form.tsx](src/components/booking/booking-form.tsx#L2730)
  → new `HelpTooltip` primitive + optional `tooltip?: string` prop
  on `<Field>`. Renders a HelpCircle ⓘ next to the label;
  base-ui Tooltip shows the text on hover/focus.
- Static hints migrated: `booker_name`, `client_wa`, `pic_name`,
  `pic_wa`, `vendor_pic_name`, `vendor_contact`, `client_name`.
- Dynamic state hints kept inline (Auto-fill, Manual override,
  Maps resolve status) since they reflect live state.
- `<TooltipProvider>` wraps the booking-form tree so all tooltips
  share the 250ms open delay.

### Summary panel content — 4944a88

- [src/components/booking/_shared/summary-panel.tsx](src/components/booking/_shared/summary-panel.tsx)
  → new `eventTimeline` prop replaces the collapsed `"11:00–14:00"`
  string with a 3-step mini-timeline (Setup → Mulai → Selesai)
  when any time field is filled. Mulai is emphasized; Clock icon
  on Setup signals the auto -1h offset.
- New `addonLines` prop shows top-4 add-ons by amount under the
  total row, with `+N item lainnya` overflow.
- [src/components/booking/booking-form.tsx:683](src/components/booking/booking-form.tsx#L683)
  → new `addonLines` memo sorted by total desc, wired through.

### Loading skeletons — 0ba14f6

- [src/app/(owner)/operations/new/loading.tsx](src/app/(owner)/operations/new/loading.tsx)
- [src/app/(owner)/operations/[projectId]/edit/loading.tsx](src/app/(owner)/operations/[projectId]/edit/loading.tsx)
  → both rewritten. Use `Container size="wide"`, render the 2-col
  grid (form col + summary aside), 4 cluster groups with paired
  field skeletons each, and a sticky summary panel mock with
  event/klien/pricing rows + 2 action buttons. Prevents the
  narrow-then-wide layout snap the user observed.

## Viewport verification

Tested by reading the rendered grid math (no live browser run available
in this environment — please verify the screenshots once Vercel preview
is up). Form column width at each viewport, assuming a 240px sidebar +
~64px page padding + 24px grid gap:

| Viewport | Form col   | Summary | Field grid                         | Notes |
| -------- | ---------- | ------- | ---------------------------------- | ----- |
| 1920     | ~1192px    | 360px   | 2-col paired + add-on auto-fill 2× | Optimal |
| 1600     | ~912px     | 360px   | 2-col paired + add-on auto-fill 2× | Optimal |
| 1440     | ~752px     | 360px   | 2-col paired + add-on auto-fill 2× | Add-on cards 320px each |
| 1280     | ~592px     | 360px   | 2-col paired, add-on 1-col         | xl breakpoint just hit |
| 1024     | ~640px (min) | 320px | 2-col paired, add-on 1-col       | min-w-640 enforces; if narrower, side scroll instead of collapse |
| 768      | full (1-col)| hidden | Single column                      | Summary drops; sticky bottom bar reinstated by lg:hidden |
| 375      | full       | hidden  | Single column                      | Mobile baseline |

> The form column's `minmax(640px,1fr)` deliberately overflows below
> 1024px viewport rather than collapsing — preferring a side-scroll
> to a layout that loses field pairings. The sticky bottom bar still
> works on mobile because the summary panel is `hidden lg:block`.

## Out of scope for this batch

The user's regression report also mentioned a "Cluster A-D extraction"
follow-up (gradually moving the 11 `<Section>` instances into 4
`<ClusterCard>` primitives). That remains pending and was deliberately
left out of this batch — it's a refactor, not a regression fix, and
attempting it in the same commit train would have made each commit
harder to revert if needed. See REPORT_BOOKING_REDESIGN.md for the
cluster mapping.

## Smoke tests to run after deploy

1. `/operations/new` on 1440px viewport: confirm paired fields render
   side-by-side (Tanggal+Jam Mulai, Setup+Selesai, Kota+Provinsi,
   Nama Pembooking+WA Pembooking, Nama PIC+WA PIC).
2. Add-on row: confirm long names wrap (don't truncate) and that at
   xl+ the rows pack into 2 columns.
3. Time picker: confirm the native time picker opens (system UI on
   mobile, dropdown on desktop) and the Clock button still surfaces
   the preset chips.
4. Tooltip ⓘ: hover a field with a tooltip (e.g. WA Pembooking) and
   confirm the popup renders inside the form, not clipped.
5. Summary panel: fill setup/start/end times — confirm 3-row mini
   timeline replaces the single time-range line.
6. Summary panel pricing: add 5+ add-ons and confirm the breakdown
   shows top 4 with "+N item lainnya" overflow.
7. Hard refresh on `/operations/new` while throttled: confirm the
   skeleton matches the final layout (no width snap).
