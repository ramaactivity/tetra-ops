# Report Refactor Module Rekap & Settlement — Tetra Ops

**Tanggal**: 2026-05-19
**Branch**: `feat/rekap-refactor` (3 commits, **belum di-push ke remote**, **belum di-merge ke main**)
**Author**: Claude Opus 4.7 (1M context)

---

## 1. Ringkasan Eksekutif

| Aspek | Status |
|---|---|
| Total task prompts yang dikerjakan | **5 prompts** |
| Total commit di branch | **3 commits** |
| File baru | **22 files** (~5,000 LOC) |
| File yang dimodifikasi | **2 files** (page.tsx + migration H) |
| Migration SQL applied ke Supabase production | **9 + 1 re-apply hotfix** |
| Bug yang ke-detect | **6** (4 valid, 1 false positive, 1 outstanding) |
| Bug yang sudah di-fix di branch ini | **4** |
| End-to-end demo settle | ✅ **SUKSES** (PRJ-20260515-36078) |
| Sistem siap production? | ⚠️ **Sebagian** — UI belum di-test manual di browser, beberapa item perlu finalisasi (lihat Section 6) |

---

## 2. Prompt-by-prompt Progress

### Prompt 1 — Audit module (selesai ✅)

**Yang diminta**: Audit menyeluruh module rekap & settlement, bandingkan dengan workflow ideal, output ke `AUDIT_REKAP_MODULE.md`.

**Yang dilakukan**:
- 3 Explore agent paralel scan codebase: struktur, schema DB, integrasi, mobile/desktop UX, bugs
- Audit doc 12 section: code structure, DB schema, state machine, integrations, gap analysis, recommendations
- Verifikasi temuan-temuan critical sebelum claim

**Hasil**:
- File baru: [AUDIT_REKAP_MODULE.md](AUDIT_REKAP_MODULE.md) (~45 KB)
- Section 13 di-update kemudian dengan dokumentasi pass 1 (DB refactor)

**Insight kunci**:
- Module sudah cukup matang (4 phase migration selesai, warehouse auto-deduct + sinking + owner pool sudah jalan)
- 3 blocker terdeteksi: HPP bonus drop bug, journal stub, no confirmation dialog
- Klaim "z.iso.date() bug" dari analisis awal **TIDAK VALID** (verified Zod v4 mendukung method ini)

---

### Prompt 2 — Database schema refactor (selesai ✅)

**Yang diminta**: Setup DB schema untuk dukung refactor: chart of accounts, event recap, frame size mapping, crew fees, journal entries, dst.

**Strategi yang dipilih (atas konfirmasi kamu)**: **EXTEND existing schema** — keep nama tabel lama (crew_rekap, stock_movements, dll), hanya tambah yang missing. SQL file only (kamu apply manual via Supabase Studio).

**Yang dibuat (9 migration files di `supabase/migrations/20260520_*`)**:

| File | Isi |
|---|---|
| `chart_of_accounts_extra_seed.sql` | +17 akun (Mediaset split, Unearned Revenue, revenue per event category, fee crew per role, transport granular, marketing/bonus) |
| `crew_rekap_assignments_extend.sql` | +9 kolom ke `crew_rekap` (frame_size_snapshot, paid/bonus split untuk photomagnet/keychain, locked, locked_at, settled_at, status enum). +3 kolom ke `crew_assignments` (reimbursement_amount, total_fee generated, payment_notes). Backfill status historis. |
| `event_recap_proofs.sql` | Tabel baru + enum `event_recap_proof_type` + backfill dari `proof_photo_urls[]` |
| `event_recap_misc_expenses.sql` | Tabel baru + backfill dari `lainnya_items` JSONB |
| `frame_size_mapping.sql` | Tabel baru + seed 3 row (4R/2R/Polaroid) |
| `package_items_mapping.sql` | Tabel baru untuk package → consumable items mapping |
| `recap_helper_functions.sql` | 3 function: `generate_journal_reference`, `calculate_recap_hpp`, `calculate_recap_opex` |
| `settle_event_wrappers.sql` | 4 function: `_validate_recap_stock_sufficient`, `_create_settlement_journal`, **`settle_event`**, **`reopen_settlement`** |
| `rls_new_tables.sql` | RLS policies untuk 4 tabel baru |

**Commit**: `13591fd` — feat(rekap): pass 1 — DB schema refactor foundation

---

### Prompt 3 — Refactor owner rekap & settlement UI (selesai ✅)

**Yang diminta**: Refactor halaman `/operations/[project_id]/rekap` jadi single page yang cover view → input fee → profit preview → settle → post-settle.

**Yang dibuat (9 file baru)**:

**Server actions** (`src/lib/actions/`):
| File | LOC | Peran |
|---|---|---|
| `settle-event.ts` | 138 | `settleEvent` + `reopenSettlement` wrapper RPC, humanizeRpcError untuk error message Indonesia |
| `profit-preview.ts` | 262 | `getProfitPreview` (call `calculate_recap_hpp/opex` RPC) + `checkRecapStock` |
| `crew-fees.ts` | 154 | `saveCrewFees` (update `crew_assignments`) + `saveAddonSplit` (split photomagnet/keychain) |

**UI components** (`src/components/rekap/`):
| File | LOC | Peran |
|---|---|---|
| `profit-preview-card.tsx` | 251 | Real-time P&L card, HPP/OpEx collapsible breakdown |
| `settle-button.tsx` | 208 | Stock check live + confirmation dialog dengan summary |
| `reopen-button.tsx` | 150 | Super-admin warning modal + mandatory reason input |
| `crew-fee-form.tsx` | 256 | Per-crew fee/bonus/reimbursement dengan auto-suggest |
| `addon-split-form.tsx` | 208 | Photomagnet/keychain paid vs bonus |
| `settled-banner.tsx` | 79 | Sticky banner post-settle dengan view-journal + reopen |

**Page refactor**:
- [src/app/(owner)/operations/[projectId]/rekap/page.tsx](src/app/(owner)/operations/[projectId]/rekap/page.tsx) — 313 → 411 LOC
- State machine: no-rekap → review → pre-settle → settled
- Pre-settle gating: rekap approved + ≥1 proof + crew fees set + stock cukup
- Post-settle: SettledBanner sticky + semua section read-only

**Commit**: `a64d695` — feat(rekap): pass 2 — unified owner rekap & settlement UI

**TypeCheck**: ✅ clean (`npx tsc --noEmit`)

---

### Prompt 4 — Verifikasi action items yang lebih clear (selesai ✅)

**Yang diminta**: Panduan action item verifikasi yang lebih detail dengan URL, instruksi clear untuk non-technical user.

**Yang dilakukan**:
- 6 fase verifikasi step-by-step (apply migrations → verify → run dev → test UI → verify DB → reopen)
- Setiap step ada URL Supabase langsung, SQL query untuk copy-paste, expected outputs

**Hasil**: Kamu berhasil apply semua 9 migration di Fase 1.

---

### Prompt 5 — Saya yang kerjakan Supabase otomatis (selesai ✅)

**Yang diminta**: Saya yang jalankan Supabase verifikasi biar kamu ga perlu copy-paste manual.

**Yang dibuat**: [scripts/verify-rekap.ts](scripts/verify-rekap.ts) (~860 LOC) — single-file CLI driver.

**Commands tersedia**:
```bash
node --experimental-strip-types --env-file=.env.local --no-warnings scripts/verify-rekap.ts <command>

# Commands:
check                              # Fase 2 verifikasi migration
list-events                        # list event eligible settle
demo <project-id>                  # full e2e: seed + approve + settle + inspect
settle <project-id>                # call settle_event RPC saja
inspect <project-id>               # verifikasi settlement results
reopen <project-id> "<reason>"     # call reopen_settlement RPC
cleanup-reopened <project-id>      # delete reopened settlement row (untuk re-settle)
```

**Hasil dari `check`**:
- ✅ 5 account_type lengkap (68 akun total)
- ✅ 3 frame size mapping (4R, 2R, polaroid)
- ✅ Backfill proof photos match dengan legacy
- ✅ Backfill misc expenses match
- ✅ Functions callable
- ✅ Extend columns terbuat

---

### Sub-flow: Demo e2e settle_event (bug detection & fix)

**Yang dilakukan**: Run `demo PRJ-20260515-36078` (Naurah & Sahil, awaiting_settlement).

**Bug #1 — uuid_generate_v4 not found** (commit `79c9565`):
- Root cause: Function di schema `extensions`, tapi `SET search_path = public` di RPC.
- Fix: Ganti 5 occurrence `uuid_generate_v4()` → `gen_random_uuid()` (built-in pg_catalog). Plus extend search_path ke `public, extensions`.
- Kamu re-apply migration H 1× setelah fix.

**Bug #2 — Double-entry journal not balanced** (commit `79c9565`):
- Detect: script `inspect` flag `debit Rp 836.500 vs credit Rp 3.515.000` di journal entry.
- Root cause: 3 sub-bug di `_create_settlement_journal`:
  - Missing Dr Cash untuk revenue inflow + Cr Inventory untuk HPP
  - Salah: credit operating_cash ke Retained Earnings (operating_cash itu leftover, bukan credit line)
  - Salah: aggregate sinking ke 1 akun (2-200) instead of split per fund
- Fix: Rewrite proper double-entry layout (Dr Cash, Dr HPP/OpEx, Dr Retained for transfers; Cr Revenue, Cr Inventory per bucket, Cr Sinking liabilities split per fund, Cr Owner pool).
- Kamu re-apply migration H 2× setelah fix.

**Demo result akhir** (setelah cleanup + retry):
```
Settlement berhasil:
  id=b030e3db-5fb8-4b16-b776-8cb443225573
  journal_entry_id=e047910d-f0d7-4c59-8c98-4c02902b43c2
  revenue_net=Rp 2.000.000, hpp=Rp 0, opex=Rp 485.000
  net_profit=Rp 1.515.000 (75.75%) is_loss=false
  sinking=Rp 251.500, owner_pool=Rp 100.000, op_cash=Rp 1.163.500

Inspect:
  ✅ event_settlements terbuat, journal_entry_id linked
  ✅ 4 stock_movements 'out' (mediaset + sleeve + flashdisk + pouch)
  ✅ JE-20260515-002 (expense) · 13 lines · Dr=Cr=Rp 2.351.500 (BALANCED!)
  ✅ 4 sinking_fund_movements deposit (equipment 75.750, maintenance 45.450, crew_reserve 100k, emergency 30.300)
  ✅ 2 owner_earnings profit_share (Rp 50k × 2 owner = Rp 100k)
  ✅ events.status = completed
  ✅ crew_rekap.status = settled, locked = true
```

**Commit**: `79c9565` — fix(rekap): pass 3 — settle_event bugfixes from e2e verification

---

## 3. Bug Inventory — Status Lengkap

### Yang sudah di-fix di branch ini ✅

| # | Bug | Pass | Commit |
|---|---|---|---|
| 1 | Settlement tanpa confirmation dialog | Pass 2 | `a64d695` |
| 2 | Missing error boundary di crew rekap page | Pass 2 | `a64d695` |
| 3 | `uuid_generate_v4` not found in RPC | Pass 3 | `79c9565` |
| 4 | Double-entry journal mismatch | Pass 3 | `79c9565` |

### Bug yang INVALID (false positive dari audit awal) ❌

| # | Klaim | Realita |
|---|---|---|
| 1 | `z.iso.date()` bug di Zod | Zod v4.4.3 **mendukung** `z.iso.date()` (verified di `node_modules/zod/v4/classic/external.d.ts`). Audit doc Section 7.1.3 di-update. |

### Bug yang masih outstanding (belum di-fix di pass ini) ⚠️

| # | Bug | Lokasi | Severity | Workaround sekarang | Future fix |
|---|---|---|---|---|---|
| 1 | HPP `bonus` key dropped di legacy `settlements.ts` | [src/lib/actions/settlements.ts:9-17](src/lib/actions/settlements.ts#L9-L17) | HIGH | Pakai `settle_event` RPC (di SettleButton baru) yang auto-handle bonus. Legacy route `/settle` dan `/tutup-buku` masih pakai code lama. | Tambah `"bonus"` ke `HPP_KEYS` array, atau deprecate legacy routes |
| 2 | `inventory_items.purchase_price_avg = 0` semua item | DB data | DATA (bukan bug code) | HPP selalu Rp 0 sampai harga di-set | User set harga beli via Settings → Items |
| 3 | Re-settle after reopen butuh manual cleanup | DB schema `event_settlements.event_id UNIQUE` | LOW | Pakai `cleanup-reopened` command di verify-rekap.ts | Ubah ke partial unique index `WHERE is_reopened = false` |
| 4 | 2 journal entry sisa demo run 1 yang buggy | DB data | TRIVIAL | Marked `[REVERSED]`, di-freeze sebagai audit trail | Manual DELETE kalau mau bersih total |

---

## 4. State Sistem Sekarang

### Database (Supabase production `rdrkzwesykebhibcwcsj`)

| Item | State |
|---|---|
| Schema migrations | 9 file applied + 2× re-apply migration H (hotfix uuid + journal) |
| New tables | event_recap_proofs, event_recap_misc_expenses, frame_size_mapping, package_items_mapping |
| Extended tables | crew_rekap (+9 col), crew_assignments (+3 col) |
| Chart of accounts | 68 akun total (asset 17, liability 9, equity 3, revenue 11, expense 28) |
| RPC functions | 7 baru (generate_journal_reference, calculate_recap_hpp/opex, _validate_recap_stock_sufficient, _create_settlement_journal, settle_event, reopen_settlement) |
| RLS | Enabled di 4 tabel baru |

### Event state (Naurah & Sahil — yang dipakai demo)

| Field | Value |
|---|---|
| Project ID | PRJ-20260515-36078 |
| Event status | `completed` (settled by demo) |
| Settlement ID | `b030e3db-5fb8-4b16-b776-8cb443225573` |
| Journal entry ID | `e047910d-f0d7-4c59-8c98-4c02902b43c2` |
| Net profit | Rp 1.515.000 |
| Sinking allocated | Rp 251.500 split 4 fund |
| Owner pool | Rp 100.000 split 2 owner |
| crew_rekap | locked=true, status=settled |

### Git state

```
* 79c9565 (HEAD -> feat/rekap-refactor) fix(rekap): pass 3 — settle_event bugfixes
* a64d695 feat(rekap): pass 2 — unified owner rekap & settlement UI
* 13591fd feat(rekap): pass 1 — DB schema refactor foundation
* c2290a8 (main, origin/main) fix(operations): pass icons as ReactNode to CollapsibleCard
```

3 commit di branch, branch baru lokal, **belum push ke origin**.

---

## 5. File Inventory

### File baru di branch ini

**Documentation** (2 files):
- [AUDIT_REKAP_MODULE.md](AUDIT_REKAP_MODULE.md) (~45 KB)
- [REPORT_REKAP_REFACTOR.md](REPORT_REKAP_REFACTOR.md) (file ini)

**Database migrations** (9 files):
- [supabase/migrations/20260520_chart_of_accounts_extra_seed.sql](supabase/migrations/20260520_chart_of_accounts_extra_seed.sql)
- [supabase/migrations/20260520_crew_rekap_assignments_extend.sql](supabase/migrations/20260520_crew_rekap_assignments_extend.sql)
- [supabase/migrations/20260520_event_recap_proofs.sql](supabase/migrations/20260520_event_recap_proofs.sql)
- [supabase/migrations/20260520_event_recap_misc_expenses.sql](supabase/migrations/20260520_event_recap_misc_expenses.sql)
- [supabase/migrations/20260520_frame_size_mapping.sql](supabase/migrations/20260520_frame_size_mapping.sql)
- [supabase/migrations/20260520_package_items_mapping.sql](supabase/migrations/20260520_package_items_mapping.sql)
- [supabase/migrations/20260520_recap_helper_functions.sql](supabase/migrations/20260520_recap_helper_functions.sql)
- [supabase/migrations/20260520_settle_event_wrappers.sql](supabase/migrations/20260520_settle_event_wrappers.sql) (modified 2× untuk bugfix)
- [supabase/migrations/20260520_rls_new_tables.sql](supabase/migrations/20260520_rls_new_tables.sql)

**Server actions** (3 files):
- [src/lib/actions/settle-event.ts](src/lib/actions/settle-event.ts) (138 LOC)
- [src/lib/actions/profit-preview.ts](src/lib/actions/profit-preview.ts) (262 LOC)
- [src/lib/actions/crew-fees.ts](src/lib/actions/crew-fees.ts) (154 LOC)

**React components** (6 files):
- [src/components/rekap/profit-preview-card.tsx](src/components/rekap/profit-preview-card.tsx) (251 LOC)
- [src/components/rekap/settle-button.tsx](src/components/rekap/settle-button.tsx) (208 LOC)
- [src/components/rekap/reopen-button.tsx](src/components/rekap/reopen-button.tsx) (150 LOC)
- [src/components/rekap/crew-fee-form.tsx](src/components/rekap/crew-fee-form.tsx) (256 LOC)
- [src/components/rekap/addon-split-form.tsx](src/components/rekap/addon-split-form.tsx) (208 LOC)
- [src/components/rekap/settled-banner.tsx](src/components/rekap/settled-banner.tsx) (79 LOC)

**Verification script** (1 file):
- [scripts/verify-rekap.ts](scripts/verify-rekap.ts) (~860 LOC)

### File yang dimodifikasi

- [src/app/(owner)/operations/[projectId]/rekap/page.tsx](src/app/(owner)/operations/[projectId]/rekap/page.tsx) — 313 → 411 LOC
- [supabase/migrations/20260520_settle_event_wrappers.sql](supabase/migrations/20260520_settle_event_wrappers.sql) — bugfix uuid + journal

---

## 6. Yang Belum Di-test (Hati-hati di sini)

Saya tidak bisa do browser automation, jadi yang berikut **belum di-verify manual**:

1. **UI flow di browser real**:
   - SettledBanner muncul di event settled? ✗ belum di-cek visual
   - Tombol Reopen muncul untuk super_admin? ✗ belum
   - CrewFeeForm save jalan via UI? ✗ belum di-cek (model di-cek lewat script)
   - AddonSplitForm validation mismatch trigger benar? ✗ belum
   - SettleButton dialog menampilkan summary dengan benar? ✗ belum

2. **Edge cases settlement**:
   - Settlement loss (net_profit < 0) — apakah sinking & owner_pool skip benar?
   - Settlement dengan discount_total > 0 — semantic discount handling
   - Settlement dengan event_addons banyak (10+) — revenue total accurate?

3. **Reopen via UI** (test via script sudah ok, via UI belum)

4. **Production data dengan harga real** — saat ini semua HPP = 0 karena `purchase_price_avg = 0`

---

## 7. Next Steps Recommended

### Sebelum push branch / merge ke main

**Wajib**:
1. Test UI flow di local dev:
   ```bash
   npm run dev
   # buka http://localhost:3000/operations/PRJ-20260515-36078/rekap
   # Verify: SettledBanner muncul, sections read-only, tombol Reopen visible
   ```
2. Set inventory `purchase_price_avg` ke nilai real untuk minimal Mediaset Basic + Sleeve + Flashdisk + Pouch (yang di-pakai test). Re-settle event lain untuk validasi HPP > 0.

**Disarankan**:
3. Fix HPP bonus key di legacy `settlements.ts` (atau lebih clean: deprecate `/settle` dan `/tutup-buku` route, paksa semua flow lewat `/rekap` unified)
4. Test reopen flow lewat UI (kalau perlu, login pakai super_admin account)

### Mid-term improvements

5. Schema: ubah `event_settlements.event_id` UNIQUE jadi partial unique index `WHERE is_reopened = false` untuk support proper re-settle workflow tanpa cleanup script
6. Cleanup demo data:
   ```sql
   -- Delete demo crew_rekap (kalau mau bersih)
   DELETE FROM crew_rekap WHERE id = '928080a8-e4a2-44db-8455-dc9bddd4c6b0';
   -- Atau biarkan, audit trail OK karena terkait event Naurah & Sahil real
   ```
7. Cleanup 2 journal entry buggy dari demo run 1:
   ```sql
   -- ⚠️ Audit trail check dulu sebelum jalankan
   DELETE FROM journal_lines WHERE entry_id IN ('119f77b4-3a96-4289-9990-db9efce70771', '3a8449fe-e979-497a-9506-2dedc2b8eaf0');
   DELETE FROM journal_entries WHERE id IN ('119f77b4-3a96-4289-9990-db9efce70771', '3a8449fe-e979-497a-9506-2dedc2b8eaf0');
   ```

### Long-term

8. Deprecate `close_event_settlement` v4 RPC (legacy, sudah di-superseded oleh `settle_event`)
9. Hapus `/settle` dan `/tutup-buku` route (sudah di-superseded oleh `/rekap` unified)
10. Push branch ke origin + buka PR untuk review

---

## 8. Apa yang Bisa Dilakukan Sekarang

### Opsi A — Test UI di browser (recommended, ~15 menit)
```bash
cd /Users/masrampc/Desktop/tetra-ops
npm run dev
# Buka http://localhost:3000/operations/PRJ-20260515-36078/rekap
# Cek: banner Settled muncul, semua section read-only
# Bonus: klik "View journal" → harusnya link ke /finance?journal=...
```

### Opsi B — Reopen demo settlement & test UI dengan event lain
1. Reopen via script:
   ```bash
   node --experimental-strip-types --env-file=.env.local --no-warnings \
     scripts/verify-rekap.ts reopen PRJ-20260515-36078 "balik untuk test UI"
   ```
2. Refresh halaman di browser → harusnya kembali ke state pre-settle (CrewFeeForm + AddonSplitForm + Settle button visible)

### Opsi C — Lanjut task berikutnya
Apa pun yang ada di backlog kamu — saya siap.

---

**End of report.**
