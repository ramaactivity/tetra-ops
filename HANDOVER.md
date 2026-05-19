# HANDOVER — Tetra Ops Rekap & Settlement Module Refactor

**Last updated**: 2026-05-19 (post Prompt 4 — mobile crew UX polish)
**Status**: Owner end-to-end flow LIVE & verified. Crew mobile UX polished (draft auto-save, image compression, success page).
**Repo**: https://github.com/ramaactivity/tetra-ops
**Production**: https://tetra-ops.vercel.app
**Branch**: `main` (commit `6611456` deployed)

---

## Tujuan dokumen ini

Konteks untuk AI lain yang bantu user `ramaactivity` membuat prompt untuk Claude Code di project Tetra Ops. Hindari user perlu re-explain konteks tiap session. Tunjukkan:
- Apa yang sudah dibangun & live (jangan minta build ulang)
- Konvensi & naming aktual yang dipakai (jangan asumsi nama lain)
- User preferences yang sudah surface (jangan tabrak)
- Outstanding items yang siap di-pick up

---

## 1. Project context

**Tetra Ops** = aplikasi management bisnis photobooth Indonesia. Single-tenant, single-business.

**Stack**:
- Next.js 16.2.4 App Router · React 19 · Tailwind v4 · shadcn/ui
- Supabase (Postgres + Auth + Storage proxied via Google Drive)
- Vercel deploy (auto on push to `main`)
- TypeScript strict
- Zod 4.4.3 (note: `z.iso.date()` IS valid Zod v4 — don't flag as bug)
- pnpm (lockfile) tapi mixed dengan ad-hoc npm install

**Roles**:
- `super_admin` — saya/owner pemilik akun yang bisa lakukan semua + reopen settlement
- `owner` — owner-level access, manajemen
- `crew` — field crew submit rekap dari HP
- `pending_approval` — registered tapi belum approved

**Layout groups (App Router)**:
- `src/app/(auth)/` — login, register, pending
- `src/app/(crew)/crew/` — mobile-first crew portal; routes: `/`, `/jadwal`, `/jadwal/[projectId]`, `/jadwal/[projectId]/rekap`, `/jadwal/[projectId]/rekap/success` (Prompt 4), `/alat`, `/fee`, `/profile`
- `src/app/(owner)/` — desktop-first owner panel (sidebar) with mobile bottom-nav fallback

---

## 2. Module yang baru di-refactor: Rekap & Settlement

**Domain**: Setelah event selesai, crew submit rekap (recap konsumsi material event), owner review, lalu owner settle event yang tutup buku dan commit ke ledger.

**Lifecycle**: 
1. Event status `confirmed` → cron auto-transit ke `upcoming` (H-7) → `in_progress` (H) → `awaiting_settlement` (H+1)
2. Crew (atau owner retroaktif) submit rekap via `/crew/jadwal/[projectId]/rekap` atau `/operations/[projectId]/rekap`
3. Owner review di `/operations/[projectId]/rekap` — bisa approve atau reject
4. Owner set fee crew + upload bukti transfer per crew
5. Owner klik Settle → atomic RPC `settle_event` jalankan: stock deduction, journal entries (double-entry GL), sinking funds + owner pool allocation, lock event
6. Event jadi `completed`, crew_rekap.locked=true
7. Super_admin bisa Reopen settlement → reverse semua

**Status berhasil verified end-to-end di production** dengan event `PRJ-20260509-41226` (Little Builder Party Arsya): Revenue Rp 2.250.000, HPP Rp 130.047, OpEx Rp 500.000, Net profit Rp 1.619.953, allocations balanced.

---

## 3. ⚠️ Naming convention — pakai nama AKTUAL, JANGAN naming generic

Project memilih strategi **EXTEND existing Indonesian-named schema** (bukan replace dengan English-named). Banyak prompt template generic pakai naming yang BERBEDA. Tolong always cross-reference:

| Generic name yang sering di-spec | Nama AKTUAL di Tetra Ops |
|---|---|
| `event_recaps` | `crew_rekap` |
| `audit_event_logs` / `audit_logs` | `audit_log` (singular) |
| `inventory_movements` | `stock_movements` |
| `crew_wages` | `crew_assignments` (fee/bonus/reimbursement per assignment row, NO separate wages table) |
| `finance_journals` | `journal_entries` + `journal_lines` (split untuk double-entry) |
| `sinking_fund_allocations` | `sinking_fund_movements` (deposit + withdrawal) |
| `event_recap_save_v3` | App-side `submitRekap` di `src/lib/actions/rekap.ts` (BUKAN RPC) |
| `event_recap_settle` | RPC `settle_event` |
| `event_recap_reopen` | RPC `reopen_settlement` |
| `recap_status_update` | UPDATE column directly + audit_log (no separate RPC) |

Tables baru yang sama-nama:
- `event_recap_proofs` (foto bukti per row, dengan enum `event_recap_proof_type`)
- `event_recap_misc_expenses` (lain-lain per row)
- `frame_size_mapping` (frame_size → mediaset_type + ratios)
- `package_items_mapping` (package → consumable items)

Plus `chart_of_accounts` (PK: `code TEXT` format "X-NNN", not UUID), `event_settlements`, `owner_earnings`, `sinking_funds`.

Detail mapping lengkap: [VERIFICATION_DATABASE.md](VERIFICATION_DATABASE.md).

---

## 4. Architecture key decisions (jangan tabrak)

### 4.1. Strategi extend, bukan replace
Saat user minta tabel/RPC baru yang overlap dengan existing, **selalu cek dulu** apakah sudah ada dengan nama berbeda. Kalau ya, prefer EXTEND (add column/method) over create-new. Hindari duplicate.

### 4.2. RPC SECURITY DEFINER bypass RLS
`settle_event`, `reopen_settlement`, `calculate_recap_hpp/opex`, `_validate_recap_stock_sufficient`, `_create_settlement_journal`, `generate_journal_reference`, `admin_exec_sql` semua pakai `SECURITY DEFINER` dengan `SET search_path = public, extensions`. Ini bypass RLS — penting untuk:
- DDL via admin_exec_sql
- Settle/reopen atomic flow yang tulis ke banyak tabel sekaligus
- HPP/OpEx calc lookup mapping & inventory

### 4.3. Double-entry journal layout
Dr/Cr layout sudah fixed di `_create_settlement_journal` ([supabase/migrations/20260520_settle_event_wrappers.sql](supabase/migrations/20260520_settle_event_wrappers.sql), updated in pass 3):

**Debits**:
- `1-100` Cash = revenue_net − opex_total (net cash inflow; HPP tidak touch cash)
- `5-1xx, 5-411, 5-109` HPP per bucket
- `5-2/3/4xx` OpEx per bucket
- `3-200` Retained Earnings = sinking + owner_pool (transfer ke liability)

**Credits**:
- `4-100` Revenue
- `1-200..1-205, 1-209` Inventory per HPP bucket (asset reduction)
- `2-200..2-203` Sinking liabilities split per fund
- `2-300` Owner pool liability

Sum Dr = Sum Cr = `revenue_net + hpp_total + sinking_total + owner_pool_total`. Verified balanced di production.

**JANGAN ubah ini** kecuali user explicitly minta. Ledger integrity tergantung pada konsistensi.

### 4.4. Stock allowed to go NEGATIVE (user direction)
User explicit: "Stok tidak cukup tidak perlu ada blokir, gunakan mekanisme minus saja. Cukup berikan warning. Nanti kalau ada restock lagi tinggal dikurangi dari minus tersebut."

`settle_event` RPC tidak RAISE EXCEPTION pada shortage — hanya log warning ke `audit_log` (action='stock_warning'). UI SettleButton dialog show warning tapi confirm button tetap enabled.

### 4.5. Locking via `crew_rekap.locked` boolean + `is_reopened` flag
Bukan partial unique index. After settle: `locked=true`. RPC `reopen_settlement` reset `locked=false`. App code dan RLS policy (sejak 20260521 fix) double-enforce.

### 4.6. Frame size snapshot vs live
`crew_rekap.frame_size_snapshot` di-populate saat rekap submit (sudah app code fix di pass 4). `calculate_recap_hpp` pakai `COALESCE(snapshot, event.frame_size)`. Owner ubah event.frame_size nanti tidak affect historical HPP calc.

### 4.7. Reimbursement: per-item attribution, bukan auto-divide
User explicit: "Satu mobil online kan mereka langsung naik bersamaan tidak pisah-pisah" + "biaya mobile online oleh mou dan biaya makan oleh ceca".

UI di CrewFeeForm: tampilkan breakdown info box di top section. Per crew dapat chip buttons "+ Transport Rp 75k", "+ Konsumsi Rp 50k" yang ADDITIVE (klik di crew yang sebenarnya bayar item itu). Plus "reset 0" chip.

Hindari design yang auto-divide total / N crew.

---

## 5. File inventory (jangan lupa cek existing sebelum create new)

### Server actions (`src/lib/actions/`)
- `rekap.ts` (1000+ LOC) — `submitRekap`, `getRekapContext`, `approveRekap`, `rejectRekap`, `planRekapDeduction`
- `settle-event.ts` (new pass 2) — `settleEvent`, `reopenSettlement` (wraps RPC + humanizeRpcError)
- `profit-preview.ts` (new pass 2) — `getProfitPreview`, `checkRecapStock`
- `crew-fees.ts` (new pass 2, updated pass 4) — `saveCrewFees` (accepts `payment_proof_url`), `saveAddonSplit`
- `settlements.ts` (legacy v4) — masih ada, dipakai `/settle` & `/tutup-buku` route lama. Untuk `/rekap` unified pakai `settle-event.ts`.
- `bookings.ts` — `createBooking`
- Lain-lain: rekap-mapping, settlement-prefill, tutup-buku, stock-movements, stock-takes, sinking-funds, dst

### UI components (`src/components/rekap/`)
- `profit-preview-card.tsx` — real-time P&L card collapsible
- `settle-button.tsx` — stock check + confirm dialog (warning mode pass 4)
- `reopen-button.tsx` — super_admin warning modal + reason
- `crew-fee-form.tsx` — per-crew fee input + per-item chip buttons + PaymentProofUpload component
- `addon-split-form.tsx` — photomagnet/keychain paid vs bonus split
- `settled-banner.tsx` — sticky top banner post-settle + View journal + Reopen
- `rekap-form.tsx` — input form (sama untuk crew + owner retroaktif); Prompt 4 added: useRekapDraft hook wiring, draft restored banner, success redirect via useRouter
- `needs-rekap-section.tsx` (Prompt 4) — server component surface event past yang butuh submit/revisi rekap, di-render di `/crew` home + `/crew/jadwal`
- `use-rekap-draft.ts` (Prompt 4) — React hook: load/save draft, beforeunload warning, return restored values + age
- `rekap-proof-upload.tsx` + `single-file-upload.tsx` — Prompt 4 added: client-side image compression via `compressImage()` sebelum Drive upload
- `rekap-hero-card.tsx`, `rekap-summary-tab.tsx`, `rekap-audit-tab.tsx`, `approval-preview.tsx`, `review-buttons.tsx`, dll

### Crew utilities (`src/lib/crew/`) — Prompt 4
- `image-compression.ts` — native Canvas API resize+re-encode, target ≤1MB, JPEG quality 0.82, max 1920px longest edge
- `recap-draft-storage.ts` — localStorage CRUD dengan 7-day TTL, safe storage check (handles disabled cookies)

### Page
- `src/app/(owner)/operations/[projectId]/rekap/page.tsx` (411 LOC) — Server Component yang fetch event + recap + assignments + settlement, dan render state machine (no-rekap → review → pre-settle → settled)
- `src/app/(owner)/operations/[projectId]/settle/page.tsx` — LEGACY (jangan modify, bisa di-deprecate suatu hari)
- `src/app/(owner)/operations/[projectId]/tutup-buku/page.tsx` — LEGACY mega-form (jangan modify)

### Migration files (`supabase/migrations/`)
Latest applied (semua via auto-script setelah 20260521_install_admin_exec_sql):
- `20260520_*` — pass 1 schema foundation (9 files)
- `20260521_install_admin_exec_sql.sql` — auto-apply infrastructure
- `20260521_fix_crew_rekap_rls.sql` — RLS hotfix owner submit retroaktif
- `20260521_set_consumable_prices.sql` — purchase_price_avg seed
- `20260521_backfill_events_frame_size.sql` — fix events.frame_size mismatch
- `20260521_backfill_recap_frame_snapshot.sql` — populate frame_size_snapshot
- `20260522_stock_warning_not_block.sql` — settle_event allow negative stock
- `20260522_crew_payment_proof.sql` — payment_proof_url column

### Scripts (`scripts/`)
- `verify-rekap.ts` — CLI: check, list-events, demo, settle, inspect, reopen, cleanup-reopened, test-rls
- `verify-comprehensive.ts` — Phase 1.1 DB verification driver
- `apply-migration.ts` — Auto-apply migration via admin_exec_sql RPC (smart SQL splitter)

### Docs (project root)
- `AUDIT_REKAP_MODULE.md` — original audit baseline (~45 KB) + Section 13 pass 1 docs
- `REPORT_REKAP_REFACTOR.md` — chronological pass 1-3 progress
- `VERIFICATION_DATABASE.md` / `_INTEGRATION.md` / `_RPC.md` / `_MOBILE_BUG.md` / `_EDGE_CASES.md` / `_FINAL_REPORT.md` — comprehensive verification
- `RLS_DIAGNOSTIC.md` / `RLS_FIX_REPORT.md` — RLS hotfix specific
- `HANDOVER.md` (this file)
- `DESIGN.md` (~50 KB) — design system Vercel-style ink monochrome + Vercel blue links, NO gradients

---

## 6. ⭐ Auto-apply migration workflow (penting buat tahu)

**Tools sudah installed di production**:
1. RPC `admin_exec_sql(p_sql TEXT) RETURNS JSONB` — `SECURITY DEFINER`, restricted to `service_role`, audit_log every call.
2. Script `scripts/apply-migration.ts` — Smart SQL splitter (respects $$, '', --, /* */) + admin_exec_sql RPC caller.

**Workflow**:
```bash
# Write migration:
vi supabase/migrations/YYYYMMDD_<name>.sql

# Apply (one command):
node --experimental-strip-types --env-file=.env.local --no-warnings \
  scripts/apply-migration.ts supabase/migrations/YYYYMMDD_<name>.sql
```

Output: per-statement progress + summary. Stops on first error.

**Saat instructing Claude**: untuk migrasi DDL, sudah tidak perlu suruh user paste manual ke SQL editor. Claude bisa auto-apply via apply-migration.ts. Hemat banyak waktu.

**Catatan**: ada batasan — multi-statement file dengan complex dollar-quoting bisa miss-split. Kalau ada masalah, fall back ke manual paste. Rare edge case.

---

## 7. User preferences / conventions yang sudah surface

Cantumkan di setiap prompt — jangan minta Claude lakukan sebaliknya:

1. **Naming**: Indonesian untuk domain (crew, rekap, sinking, dll). English untuk technical (settle, journal, audit).
2. **Design**: NO gradients. Pakai surface ladder + hairline borders. Ink monochrome (CTA = #171717) + Vercel blue link only. NO red/orange (warning pakai amber subtle).
3. **Stock**: Allowed to go NEGATIVE. Warning ya, block tidak.
4. **Reimbursement**: Per-item attribution, BUKAN auto-divide.
5. **Auto-apply migration**: Pakai `scripts/apply-migration.ts`, jangan suruh user paste manual.
6. **Commit + push**: Setelah feature/fix, push ke main langsung (Vercel auto-deploy). User authorized via permission rules di `.claude/settings.local.json`. JANGAN local merge `git merge feat/...`, pakai `git push origin <branch>:main` kalau perlu fast-forward.
7. **Verification**: Setelah change yang impact production, ALWAYS prove via:
   - typecheck (`npx tsc --noEmit`)
   - apply-migration output (kalau ada DDL)
   - inspect script untuk verify state (`scripts/verify-rekap.ts inspect <project-id>`)
8. **Bahasa user-facing**: Indonesian friendly. Toast messages, error messages, button labels, dll.
9. **Code style**: TypeScript strict, no console.log di production code, follow existing patterns (useTransition + router.refresh pattern, useState + onChange for forms, dll).
10. **MEMORY system di Claude Code**: user punya auto-memory di `~/.claude/projects/-Users-masrampc-Desktop-tetra-ops/memory/` yang sudah store reference workflow (admin_exec_sql, OAuth config, dll). Claude future sessions akan baca otomatis.

---

## 8. Production state snapshot (per 2026-05-19 16:10)

### Database
- 15 inti tabel + 4 new tabel ada (`event_recap_proofs`, `event_recap_misc_expenses`, `frame_size_mapping`, `package_items_mapping`)
- 7 RPC functions ada (settle_event, reopen_settlement, calculate_recap_hpp/opex, _validate_recap_stock_sufficient, _create_settlement_journal, generate_journal_reference)
- 1 admin function: `admin_exec_sql`
- RLS enabled di semua tabel relevan (post 20260521 RLS hotfix include owner INSERT path)
- 68 chart_of_accounts seeded (17 baru di pass 1)
- 3 frame_size_mapping seeded (4R, 2R, polaroid)
- 9 consumable purchase_price_avg di-set (MEDIA-BASIC Rp 941, dll)

### Code (commit `6611456` deployed)
- Owner UI unified rekap+settlement live di `/operations/[projectId]/rekap`
- Stock warning mode (not block)
- Reimbursement per-item chips
- Payment proof upload per crew
- SettledBanner + Reopen flow working
- /settle dan /tutup-buku legacy routes masih exist (bisa di-deprecate di pass berikutnya)
- **Crew mobile UX polished (Prompt 4)**:
  - "Perlu submit rekap" surface di `/crew` home + `/crew/jadwal` (server component `NeedsRekapSection`)
  - Client-side image compression (native Canvas API, no extra dep) di `RekapProofUpload` + `SingleFileUpload` — ~10-20× lebih kecil payload
  - localStorage draft auto-save (7-day TTL) + beforeunload warning + restored notice banner di `RekapForm`
  - Dedicated success page `/crew/jadwal/[projectId]/rekap/success` with summary + back CTAs

### Verified working end-to-end
- `PRJ-20260515-36078` Naurah & Sahil — settled, journal balanced Rp 2.351.500 (early demo)
- `PRJ-20260509-41226` Little Builder Party Arsya — settled, Net profit Rp 1.619.953 (live UI test)

### Production limitations / known data anomalies
- Beberapa event historical punya `frame_size = 'none'` walaupun package 2R/4R. Migration 20260521_backfill_events_frame_size sudah fix 8 events. Future events via booking form should be OK.
- `event_settlements.event_id` masih UNIQUE constraint (not partial). Re-settle setelah reopen butuh manual cleanup. Workaround tersedia via `scripts/verify-rekap.ts cleanup-reopened <project-id>`.

---

## 9. Outstanding items / recommended next prompts

### Quick wins (effort: S, no design discussion needed)
- **Set purchase_price_avg untuk EQ-* items**: equipment items yang belum di-set harga (untuk depreciation calc nanti)
- **Min-length validation di reject notes**: saat ini bisa "asdf" lolos (5 char min cukup)
- **Aria-label hidden inputs**: SettlementForm punya hidden input tanpa aria-label
- **Deprecate `/settle` & `/tutup-buku` legacy routes**: redirect ke `/rekap`, atau hapus

### Medium effort (M)
- ~~**Mobile Crew UI improvement**~~ — ✅ **DONE Prompt 4** (commit `6611456`). Detail di [REPORT_MOBILE_CREW.md](REPORT_MOBILE_CREW.md).
- **Frame Size Mapping settings UI** — tabel `frame_size_mapping` sudah seeded (4R/2R/polaroid) tapi belum ada CRUD UI. Owner butuh ini untuk adjust ratio per frame size tanpa SQL.
- **Package Items Mapping settings UI** — tabel `package_items_mapping` sudah ada tapi belum ada CRUD UI. Owner butuh untuk define paket include item apa.
- **PWA offline draft submit** — draft sudah persisted di localStorage, tapi submit butuh online. Tambah service worker + background sync queue untuk truly offline submission.
- **Concurrency lock di submitRekap** — UPSERT race condition kalau 2 crew submit bersamaan. Add `FOR UPDATE` di server action.
- **Notification trigger ke owner saat rekap submitted** — currently silent. Wire ke push notification system (infra `push-subscriptions` sudah ada).
- **View Journal page**: SettledBanner punya tombol "View journal" link ke `/finance?journal=...`. Build dedicated journal detail view yang nampilkan double-entry lines.
- **Equipment depreciation**: Beban Penyusutan 5-500 sudah ada di COA. Build flow untuk monthly depreciation auto-allocation.
- **Owner pool withdrawal flow**: ada di finance dashboard tapi UX bisa di-polish (saat ini tombol "Record withdrawal" + investor share link).
- **Re-settle after reopen support**: ubah `event_settlements.event_id` constraint ke partial unique `WHERE is_reopened = false`.

### Larger effort (L)
- **Recurring/scheduled events**: support template booking yang generate event series
- **Multi-tenant prep**: kalau Tetra mau franchise atau open-up untuk photobooth lain
- **Financial reports**: P&L per period, balance sheet, cash flow dari journal_entries (currently hanya event_settlements view)
- **Inventory restock workflow**: receive PO, batch costing (FIFO/avg), supplier mgmt

### Anti-patterns / DO NOT
- Jangan minta Claude buat **tabel baru** kalau ada existing yang bisa di-extend
- Jangan minta **schema rename** (mis. crew_rekap → event_recaps) — semua app code references break, butuh refactor besar
- Jangan kembali ke **stock-block-on-shortage** behavior (user explicit lawan)
- Jangan minta **auto-divide reimbursement** (user explicit lawan)
- Jangan modify `_create_settlement_journal` double-entry layout kecuali ada bug nyata

---

## 10. Cara prompting Claude yang efektif untuk Tetra Ops

Saat user kasih kamu task description, prompt Claude dengan:

1. **Reference existing docs**: "lihat AUDIT_REKAP_MODULE.md / REPORT_REKAP_REFACTOR.md / HANDOVER.md sebelum mulai"
2. **Explicit naming**: pakai nama tabel/RPC AKTUAL (crew_rekap bukan event_recaps)
3. **Mention auto-apply tool**: "untuk migration, pakai scripts/apply-migration.ts"
4. **Mention permissions**: ".claude/settings.local.json sudah punya permission git push/merge/gh"
5. **Tell Claude to verify**: "setelah selesai, run typecheck + commit + push + Vercel deploy"
6. **Production safety**: untuk perubahan destructive (settle, deletion, schema change), wajib explicit confirmation user di awal
7. **User maunya seminim mungkin manual**: kalau ada cara auto via script, prioritize itu

**Example good prompt**:
> Tetra Ops task: tambah field `payment_due_date` ke crew_assignments untuk track kapan fee harus dibayar.
> 
> Reference HANDOVER.md untuk konteks lengkap. Pakai `scripts/apply-migration.ts` untuk apply migration. Update saveCrewFees server action dan CrewFeeForm UI. Setelah selesai: typecheck → commit → push ke main.

**Example bad prompt** (jangan):
> Add `payment_due_date` to event_recaps table  — wrong table name (it's `crew_rekap` / `crew_assignments`)
> 
> Generate migration SQL for me to paste manually — user gak mau manual (pakai apply-migration.ts)
> 
> Make sure stock check blocks if insufficient — user explicit lawan, sudah warning only

---

## 11. Refs file untuk konteks deeper

| File | Buat baca kalau... |
|---|---|
| [AUDIT_REKAP_MODULE.md](AUDIT_REKAP_MODULE.md) | Original audit + DB schema + state machine + integrations + recommendations |
| [REPORT_REKAP_REFACTOR.md](REPORT_REKAP_REFACTOR.md) | Chronological pass 1-3 (foundation + UI + bugfixes) |
| [REPORT_MOBILE_CREW.md](REPORT_MOBILE_CREW.md) | Prompt 4 deliverable — mobile crew UX polish (needs-rekap surface, image compression, draft auto-save, success page) |
| [VERIFICATION_FINAL_REPORT.md](VERIFICATION_FINAL_REPORT.md) | Executive summary post-verification |
| [VERIFICATION_DATABASE.md](VERIFICATION_DATABASE.md) | Full spec→actual mapping |
| [VERIFICATION_RPC.md](VERIFICATION_RPC.md) | settle_event 16-step trace + atomicity proof |
| [RLS_FIX_REPORT.md](RLS_FIX_REPORT.md) | RLS history + auto-apply infra documentation |
| [DESIGN.md](DESIGN.md) | Design system invariants |
| `~/.claude/projects/-Users-masrampc-Desktop-tetra-ops/memory/` | Claude auto-memory (workflow refs, OAuth config, design rules) |

---

## 12. Git history snapshot

```
* 6611456 (HEAD -> main, origin/main) feat(crew): mobile UX polish — needs-rekap surface, image compression, draft auto-save, success page
* 31e2afe docs: HANDOVER.md untuk AI prompt assistant
* 31c2998 feat(rekap): stock warning + reimbursement UX + payment proof upload
* 5b26188 fix(rekap): consumable prices + frame_size data backfill + snapshot population
* 40b5a42 feat(rekap): verification reports + RLS hotfix for owner retroactive insert
* 31341de feat(infra): admin_exec_sql RPC + apply-migration.ts auto-apply workflow
* 6f89a5a docs(rekap): add chronological refactor progress report
* 79c9565 fix(rekap): pass 3 — settle_event bugfixes from e2e verification
* a64d695 feat(rekap): pass 2 — unified owner rekap & settlement UI
* 13591fd feat(rekap): pass 1 — DB schema refactor foundation
* c2290a8 fix(operations): pass icons as ReactNode to CollapsibleCard
```

Total session work cumulative: ~10 commits, ~7000+ lines code added, ~35 files baru, e2e verified live.

---

## 13. Pending action items untuk user (manual)

Hanya kalau perlu:
- [ ] Set inventory `purchase_price_avg` untuk equipment items (Beban Penyusutan calc nanti)
- [ ] (Optional) Cleanup demo data dari early testing (crew_rekap row dari demo PRJ-20260515-36078, 2 buggy journal entries pre pass-3 fix)
- [ ] (Optional) Rotate Supabase service role key periodically (best practice security)

---

**End of handover.** Pekerjaan paused di state stabil. Resume dengan prompt selanjutnya kapan saja.
