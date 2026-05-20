# Inventory Redesign — Eliminate Box/Pcs/Lembar Confusion

**Date:** 2026-05-21
**Status:** Planning doc — **awaiting user direction** before execution
**Trigger:** Owner-other reported `/warehouse` confusing + inefficient. 3 parallel SKU families (`ITM-BOX-*`, `ITM-PCS-*`, `MEDIA-*`) for the same physical item. `MEDIA-BASIC` showing -122 lembar (silent negative).

---

## TL;DR

Replace 3 confusing SKU families with **1 canonical set + native box/lembar conversion** (using the `inventory_items.unit_conversion JSONB` column that already exists in schema, never used).

**Owner mental model** (think in boxes) **+ system data model** (track in lembar) — both work without forcing crew or owner to translate manually.

Migration is destructive (irreversible). Need user go-ahead on direction before execution.

---

## 1. Current state — what's broken

### 1.1 Three parallel SKU families for the same physical thing

| SKU | Name | Unit | Stock (screenshot) | Avg Cost | Receives rekap deduct? |
| --- | ---- | ---- | ------------------ | -------- | ---------------------- |
| `ITM-BOX-4R` | Box DNP Basic (4R/2R) | Box | 0 | Rp 1.300.000 | ❌ |
| `ITM-BOX-POL` | Box DNP Perforated (Polaroid) | Box | 0 | Rp 1.500.000 | ❌ |
| `ITM-PCS-4R` | Media Set (4R/2R) | Pcs | 0 | Rp 941 | ❌ (orphan) |
| `ITM-PCS-POL` | Media Set DNP Perforated | Pcs | 0 | Rp 1.100 | ❌ (orphan) |
| `MEDIA-BASIC` | Mediaset Basic (4R/2R) | lembar | **-122** | Rp 941 | ✅ |
| `MEDIA-PERF` | Mediaset Perforated (Polaroid) | lembar | 0 | Rp 1.100 | ✅ |

**Same physical reality** = mediaset for 4R/2R prints, stored as boxes, consumed as sheets. **Three SKU views of one thing.** Source of warehouse view confusion.

### 1.2 Pending migration didn't apply

`20260518_rekap_mapping_fix_mediaset.sql` was supposed to:
- Switch `rekap_field_mapping.media_set_used` to ITM-BOX-* (the boxes)
- Set ITM-BOX-* unit='lembar' (semantic flip)
- Soft-delete MEDIA-BASIC + MEDIA-PERF

**Production state contradicts the migration** — ITM-BOX-* still unit='Box', MEDIA-* still active. Either migration not applied or data drifted back.

### 1.3 Box → lembar gap (silent negative stock)

- Owner buys boxes (mental model: I bought 5 boxes mediaset)
- System records stock-in on `ITM-BOX-4R` (5 boxes)
- ❌ Lembar count of MEDIA-BASIC does NOT auto-update
- Crew rekap approved → MEDIA-BASIC -X lembar (no prior stock-in)
- MEDIA-BASIC stock keeps drifting negative

**No "open box" workflow exists** — code/UI has no way to atomically deduct box and add lembar.

### 1.4 Dual mapping tables (single source of truth violated)

Two tables doing nearly the same job:

| Table | Purpose | Used for |
| ----- | ------- | -------- |
| `rekap_field_mapping` (rekap_field, frame_size) → item + qty_per_unit | Action — which SKU to deduct when crew rekap submits | `planRekapDeduction()` server action |
| `frame_size_mapping` (frame_size) → mediaset_per_print, prints_per_mediaset | Info — HPP / anomaly detection | (no consumer surfaced yet) |

These can diverge. Different "qty_per_unit" between them = wrong HPP.

### 1.5 Rekap form field semantics ambiguous

`crew_rekap` table:
```sql
cetak_total INTEGER     -- "200 prints"
media_set_used INTEGER  -- ??? "200 lembar"? "1 box"? "200 prints worth of mediaset"?
sleeve_used INTEGER     -- ??? lembar? pcs? per-print?
```

Current code treats `media_set_used` as **lembar count** (qty_per_unit lookup × media_set_used = inventory deduct).

But field NAME suggests "set" (whole units). Crew confused. Owner confused. Field is redundant when we know `cetak_total + frame_size` (lembar = derivable from prints + recipe).

### 1.6 Negative stock unguarded on rekap path

Sprint B.1 added `addStockMovement` server-action guard against negative stock. But `reviewRekap` → `planRekapDeduction` → direct `stock_movements` insert (line 944 of `actions/rekap.ts`) bypasses any guard.

`20260522_stock_warning_not_block.sql` migration explicitly OK'd negative-balance behavior with the intent: "warn, don't block; restock later brings positive again". That's the policy. **But the warning isn't surfaced anywhere in the UI today.**

### 1.7 Soft-deleted items leak into warehouse list

`/warehouse/page.tsx:54-67` queries `inventory_items` without `deleted_at IS NULL` filter. Any archived SKU still shows up in the list — visual clutter.

---

## 2. Design — new system

### 2.1 Canonical SKU set (9 SKUs total)

| SKU | Name | Base unit | unit_conversion | Notes |
| --- | ---- | --------- | --------------- | ----- |
| `MEDIA-4R` | Mediaset 4R/2R Basic | lembar | `{"lembar": 1, "box": 700}` | Same sheet cuts for both 4R + 2R prints |
| `MEDIA-POL` | Mediaset Polaroid Perforated | lembar | `{"lembar": 1, "box": 1400}` | Perforated cut → 2 polaroid prints per sheet |
| `SLEEVE-4R` | Sleeve 4R | pcs | `{"pcs": 1, "pack": 100}` | (pack only if you buy in bulk) |
| `SLEEVE-2R` | Sleeve 2R | pcs | same | |
| `SLEEVE-POL` | Sleeve Polaroid | pcs | same | |
| `FLASHDISK` | Flashdisk | pcs | `{"pcs": 1}` | |
| `POUCH` | Pouch | pcs | `{"pcs": 1}` | |
| `PHOTOMAGNET` | Photomagnet | pcs | `{"pcs": 1}` | |
| `KEYCHAIN` | Keychain Foto | pcs | `{"pcs": 1}` | |

**Eliminate (archive):**
- `ITM-BOX-4R`, `ITM-BOX-POL` — duplicate of `MEDIA-4R`/`MEDIA-POL` at box unit
- `ITM-PCS-4R`, `ITM-PCS-POL` — duplicate at pcs unit
- `MEDIA-BASIC`, `MEDIA-PERF` — rename to MEDIA-4R / MEDIA-POL (preserve stock history)

### 2.2 Use `unit_conversion` JSONB (already in schema!)

```sql
-- Already exists, never used:
inventory_items.unit_conversion JSONB DEFAULT '{}'::jsonb
```

**Convention:** base unit always = smallest divisible unit (lembar for paper, pcs for items). Other keys = alternate units with multipliers.

Example for MEDIA-4R:
```json
{
  "lembar": 1,
  "box": 700
}
```

UI flow:
- Stock-in "+5 box" → backend converts to 3500 lembar → stock_movements records quantity=3500, memo="purchased as 5 box"
- Warehouse list displays "3500 lembar (5 box equivalent)"
- Crew rekap field internally in lembar; UI lets owner think in either unit

### 2.3 New rekap form fields (per-size prints, derive consumption)

**Current crew_rekap (ambiguous):**
```
cetak_total       INTEGER  -- total prints (sum)
media_set_used    INTEGER  -- ambiguous semantic
sleeve_used       INTEGER  -- ambiguous semantic
```

**Proposed:**
```
cetak_4r          INTEGER DEFAULT 0  -- prints di size 4R
cetak_2r          INTEGER DEFAULT 0  -- prints di size 2R
cetak_polaroid    INTEGER DEFAULT 0  -- prints di size polaroid
-- cetak_total derived: cetak_4r + cetak_2r + cetak_polaroid

flashdisk_used    INTEGER DEFAULT 0  -- still per-piece (no size variant)
pouch_used        INTEGER DEFAULT 0
photomagnet_used  INTEGER DEFAULT 0
keychain_used     INTEGER DEFAULT 0
```

**Drop:** `media_set_used`, `sleeve_used` (derived from cetak per size).

Crew workflow simplified — only count prints by size. System knows recipe.

### 2.4 Single consumption recipe table (replaces dual mapping)

Replace `rekap_field_mapping` (composite) + `frame_size_mapping` with **one** clean table:

```sql
CREATE TABLE consumption_recipe (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  print_size frame_size NOT NULL,  -- 4r | 2r | polaroid | none
  item_id UUID NOT NULL REFERENCES inventory_items(id),
  qty_per_print NUMERIC(8, 4) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  
  UNIQUE (print_size, item_id)
);
```

Seed:
```
(4r,       MEDIA-4R,    1.0)   -- 1 lembar per 4R print
(2r,       MEDIA-4R,    0.5)   -- 0.5 lembar per 2R print (cut)
(polaroid, MEDIA-POL,   0.5)   -- 0.5 lembar per polaroid print
(4r,       SLEEVE-4R,   1.0)   -- 1 sleeve per print
(2r,       SLEEVE-2R,   1.0)
(polaroid, SLEEVE-POL,  1.0)
```

**Add-on items** (flashdisk, pouch, photomagnet, keychain) — these are **per-event flat counts** independent of print size. NOT in `consumption_recipe`. Surfaced as separate columns in `crew_rekap` + simple direct mapping.

`planRekapDeduction()` becomes much simpler:
```ts
// Pseudo
for each size in [4r, 2r, polaroid]:
  prints = rekap[`cetak_${size}`]
  if prints > 0:
    for recipe of consumption_recipe.where(print_size=size, is_active=true):
      qty = prints × recipe.qty_per_print
      lines.push({item: recipe.item, qty, source: `cetak_${size}`})

for field of ['flashdisk_used', 'pouch_used', 'photomagnet_used', 'keychain_used']:
  // direct 1:1 via add-on mapping table OR hardcoded SKU lookup
  ...
```

No more frame_size_mapping vs rekap_field_mapping diverge risk — one table, clear semantic.

### 2.5 Warehouse view restructured

**Consumables tab** — re-org by category, prominent restock CTA:

```
┌────────────────────────────────────────────────────────────────┐
│ MEDIA-4R  Mediaset 4R/2R Basic                                │
│   Stock: 3.500 lembar  ≈ 5 box                                │
│   Avg cost: Rp 941/lembar  ≈ Rp 658.700/box                   │
│   Status: 🟢 Healthy                                          │
│   [Restock] [Adjust] [✏️] [🗑]                                │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│ MEDIA-POL  Mediaset Polaroid                                  │
│   Stock: -122 lembar  ⚠️ NEGATIVE — restock urgently           │
│   Avg cost: Rp 1.100/lembar  ≈ Rp 1.540.000/box (1400 lembar) │
│   Status: 🔴 Out of stock                                     │
│   [Restock] [Adjust] [✏️] [🗑]                                │
└────────────────────────────────────────────────────────────────┘
```

**Restock dialog** (new, replaces partial-Adjust workflow):
- Direction: locked to `in`, source: locked to `purchase` (the canonical buy-stock path)
- Quantity input with unit toggle: `[ Box ]` `[ Lembar ]` — owner picks
- Unit cost: per-box ATAU per-lembar (auto-converts), **required**
- After save: weighted-avg cost recomputed in lembar terms

**Adjust dialog** (existing, slightly simplified): only for corrections (damage, loss, manual fix). Direction selector kept (in/out/adjustment).

### 2.6 Negative stock policy stays "warn, don't block" (per migration `20260522`)

But surface the warning prominently:
- Warehouse list rows with negative stock → red banner state
- Rekap approval preview → warning panel listing items that would go negative
- Dashboard anomaly radar → alert when any consumable goes negative
- Notification rule → trigger on negative-stock event

Don't block settlement (per migration policy), but make negative-state highly visible.

### 2.7 Settings → Items consolidation

Today `/settings/items` + `/warehouse` both list items with overlapping CRUD. Decision:
- `/warehouse` = operational view (stock-focused, restock, adjust, stock-take)
- `/settings/items` = master config (sku/name/category/recipe mapping)

Both link to each other; same source of truth. Already merged via Sprint A so this just stays as-is.

---

## 3. Migration plan

### 3.1 Data preservation strategy

**Option A — Preserve history (RECOMMENDED).** Rename + migrate stock_movements references.
**Option B — Clean slate.** Archive old SKUs, start fresh with new canonical, accept history loss.

User said "Data dan skema lama jangan di jadikan patokan" — leaning Option B for cleanliness. But Option A keeps audit trail. **Owner decision needed.**

### 3.2 Atomic migration steps (Option A)

```
TX BEGIN

1. Upsert new canonical SKUs (MEDIA-4R, MEDIA-POL, etc.) with unit_conversion
   (insert if not exist, update name/conversion if exist)

2. Stock movement re-targeting:
   FOR each row in stock_movements WHERE item_id IN (old SKUs):
     - Determine semantic mapping (e.g. ITM-BOX-4R → MEDIA-4R)
     - If old unit = box AND new unit = lembar:
         new_qty = old_qty × prints_per_box (lookup from frame_size_mapping)
     - UPDATE stock_movements SET item_id = new_id, quantity = new_qty,
       notes = COALESCE(notes,'') || ' [migrated from ' || old_sku || ']'

3. crew_rekap: re-derive cetak_4r/2r/polaroid from existing media_set_used + cetak_total + event.frame_size:
   - If frame_size=4R: cetak_4r = cetak_total, cetak_2r=0, cetak_polaroid=0
   - If 2R: cetak_2r = cetak_total
   - If polaroid: cetak_polaroid = cetak_total
   (Approximation — events rarely mix sizes, but flag any "media_set_used > cetak_total / ratio" for owner review)

4. Drop old rekap_field_mapping rows + frame_size_mapping
   Insert new consumption_recipe rows (seed)

5. Soft-delete old SKUs:
   UPDATE inventory_items SET deleted_at = NOW(), is_active = false
   WHERE sku IN (old SKUs)

6. Recompute purchase_price_avg untuk new SKUs from historical stock_movements 'in' rows (weighted average over preserved migration data)

TX COMMIT
```

**Rollback plan:** keep old SKUs soft-deleted (not hard-delete), so a single `UPDATE deleted_at = NULL` revives them if migration produces wrong numbers.

### 3.3 Code refactor (atomic per concern)

1. **DB schema** — migration files for new tables, columns, recipe seed
2. **Server actions** — `planRekapDeduction` rewrite to use `consumption_recipe`
3. **Stock movements server action** — accept `quantity_unit` param, auto-convert via `unit_conversion`
4. **Warehouse list** — display stock-with-conversion ("3500 lembar ≈ 5 box"), negative-stock banners
5. **Restock dialog** — new component, unit-toggle UI
6. **Adjust dialog** — simplified (existing component, prune purchase-source path)
7. **Rekap form** — per-size cetak fields, drop media_set_used + sleeve_used
8. **Settle event RPC** — verify HPP calc reads from new consumption_recipe
9. **Item form** — add unit_conversion JSON editor (for SKUs that need it)
10. **Settings → Items mapping page** — replace with consumption_recipe editor

### 3.4 Estimated effort

| Phase | Effort | Risk |
| ----- | ------ | ---- |
| DB migration + data backfill | 1 day | HIGH (irreversible if data lost) |
| Server actions rewrite | 1-2 days | MEDIUM |
| Warehouse UI redesign | 1-2 days | LOW |
| Restock/Adjust dialog | 0.5-1 day | LOW |
| Rekap form refactor | 1 day | MEDIUM (crew workflow change) |
| Settings recipe editor | 0.5-1 day | LOW |
| Settlement HPP audit + fix | 0.5 day | MEDIUM |
| End-to-end smoke + QA | 1 day | — |
| **Total** | **~6-9 days** | mixed |

---

## 4. Open questions (need user input before execute)

### Q1: Data preservation — Option A or B?
- **A**: Preserve stock_movements history by re-targeting item_ids + adjusting quantities. Audit trail intact.
- **B**: Clean slate — soft-delete old SKUs without re-targeting. Stock-take after migration becomes the new baseline.

### Q2: Per-size print fields — accept the crew workflow change?
Crew currently inputs `cetak_total` + `media_set_used`. New flow asks for `cetak_4r` + `cetak_2r` + `cetak_polaroid` separately.
- Pro: derived consumption is exact; no ambiguity
- Con: rekap form has 3 fields where it had 2; some events with mixed sizes need actual per-size counts (no auto-derive possible)
- Mitigation: pre-fill from event.frame_size — single-size events fill in dominant column with cetak_total, others 0

### Q3: Owner mental model — boxes-first or lembar-first display?
- **Boxes-first** (proposed): "5 box (3500 lembar)" — owner-friendly, owner can mentally count boxes
- **Lembar-first**: "3500 lembar (5 box)" — engineer-friendly, exact precision
- Default per item via unit_conversion key order? Or per-owner setting?

### Q4: Migration timing — single big bang or staged?
- **Single big bang**: deploy all changes at once. Brief unavailability. Lower coordination cost.
- **Staged**: schema migration → server action dual-write (old + new) → UI migration → backfill → cutover. Safer but 3-4× more work.

### Q5: Stock-take semantic during migration?
If we re-target stock_movements, what about ongoing stock-take drafts that reference old item_ids?
- Block migration if any draft stock-take has lines referencing old SKUs (force commit/cancel first)
- Auto-cancel any draft stock-take when migration runs (data preserved as "cancelled with notes")

### Q6: Reports / Settlement P&L back-compat?
Settlement RPC reads from `rekap_field_mapping` × `purchase_price_avg`. After migration, RPC must read from `consumption_recipe` + new SKUs. Need to verify:
- Old settled events: P&L numbers preserved (snapshot in settlements table?)
- Future events: use new pipeline
- During migration: brief window where no settlements should be created

---

## 5. Recommended execution sequence

Once user answers Q1–Q6, suggested order:

1. **Pre-flight checks** (1 hour):
   - Verify production migration state (which migrations applied)
   - Snapshot current data (export stock_movements, inventory_items)
   - Pause any in-flight stock-takes / rekap approvals

2. **Schema migration** (1 day):
   - Write & apply: new `consumption_recipe` table
   - Write & apply: `crew_rekap` add cetak_4r/2r/polaroid columns (keep old cols for now)
   - Write & apply: SKU canonicalization + stock_movements re-target
   - Write & apply: soft-delete old SKUs

3. **Server actions** (2 days):
   - Rewrite `planRekapDeduction`
   - Update `addStockMovement` to accept unit param + convert
   - Add settlement RPC test for new path

4. **UI refactor** (3 days):
   - Warehouse list with conversion display
   - New Restock dialog
   - Rekap form per-size
   - Settings recipe editor

5. **Final cleanup** (1 day):
   - Drop old cols from crew_rekap (after smoke test passes)
   - Remove old rekap_field_mapping + frame_size_mapping tables
   - Backfill check: every event has consumption properly attributed

6. **Documentation** (0.5 day):
   - Owner guide: new mental model
   - Crew guide: new rekap form
   - Architecture note in DESIGN_SYSTEM.md or REPORT_INVENTORY.md

---

## 6. Risk register

| Risk | Likelihood | Impact | Mitigation |
| ---- | ---------- | ------ | ---------- |
| Data loss during re-target | Low | HIGH | Snapshot before; soft-delete (not hard); rollback by reversing UPDATE |
| Settlement P&L drift (HPP wrong post-migration) | Medium | HIGH | Smoke test settle_event with sample event before+after; compare numbers |
| Crew confused by new rekap form | Medium | Medium | Inline help text; first-day announcement; pre-fill from event.frame_size |
| Boxes-vs-lembar UI bug (off-by-conversion-factor) | Medium | High | Unit tests on unit_conversion math; QA on 3 box sizes |
| Owner workflow disruption mid-event | Low | Medium | Schedule migration off-peak hours; communicate downtime |
| Existing draft stock-takes break | Low | Low | Auto-cancel drafts before migration; notify owner |

---

## 7. Status

- ✅ Audit complete (this doc)
- ⏸️ **AWAITING USER DECISION** on Q1–Q6 before execution
- ⏳ Once approved: ~6-9 days execution

**Next step:** user reviews Q1–Q6 and gives direction. Then I execute as one coherent batch (with atomic git commits + production migration scripts).
