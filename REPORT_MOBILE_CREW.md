# REPORT — Mobile Crew UX Polish (Prompt 4)

**Tanggal**: 2026-05-19
**Branch**: `main` (commit + push langsung sesuai HANDOVER §7.6)
**Goal**: Mobile crew submission UI yang seamless di phone, offline-tolerant, dan minim friction.

---

## 1. Executive Summary

| Aspek | Status |
|---|---|
| Approach | **Polish existing**, BUKAN rewrite. Existing `RekapForm` (42 KB) sudah mobile-first dengan section layout, sticky CTA, auto-derived values, stock chips, dan Drive upload. |
| Scope shift | Multi-step wizard → hybrid (collapsible section + sticky CTA + progress) — atas approval user untuk "opsi terbaik & paling nyaman" |
| Route strategy | Refactor **in-place** `/crew/jadwal/*` (Indonesian convention locked di HANDOVER §7.1), TIDAK bikin parallel `/crew/events/*` |
| TypeCheck | ✅ `npx tsc --noEmit` exit 0 |
| New files | 5 |
| Modified files | 5 |
| Net LOC | +400 |

---

## 2. Yang Dikerjakan (4 fokus area)

### 2.1. "Perlu submit rekap" surface visibility

**Problem**: Crew yang habis event tidak punya entry point yang jelas untuk submit rekap. Existing flow: harus navigate ke /crew/jadwal?tab=past → cari event manual → klik → buka rekap. Banyak friction.

**Solution**: Server component `NeedsRekapSection` yang query crew_assignments + events + crew_rekap (join) untuk surface event yang:
- Crew di-assign
- `event.event_date <= today`
- `event.status IN ('awaiting_settlement', 'in_progress')`
- Belum locked (settled)
- Rekap belum ada ATAU rekap ditolak (`is_approved = false`)

Render sebagai amber-tinted card list dengan badge "Belum"/"Revisi", role chip, venue, dan owner's reject reason (kalau ada).

**Files**:
- New: [src/components/rekap/needs-rekap-section.tsx](src/components/rekap/needs-rekap-section.tsx) — 156 LOC
- Modified: [src/app/(crew)/crew/page.tsx](src/app/(crew)/crew/page.tsx) — inject above stat grid
- Modified: [src/app/(crew)/crew/jadwal/page.tsx](src/app/(crew)/crew/jadwal/page.tsx) — inject above tabs

Tap card → langsung navigate ke `/crew/jadwal/[projectId]/rekap`. Section auto-hide kalau tidak ada actionable event.

### 2.2. Client-side image compression

**Problem**: Modern HP punya kamera 12+ MP. Foto bukti 5-12 MB per file. Crew di cellular: upload 3-5 foto bisa makan menit + data quota. Existing Drive route accept up to 8 MB tapi compression tidak dilakukan.

**Solution**: Native Canvas API compression (no extra dep) — resize ke max 1920px longest edge, re-encode JPEG quality 0.82, target ≤1 MB. Skip kalau file sudah kecil atau bukan image (PDF / GIF passthrough). Graceful fallback ke raw file kalau kompresi gagal (e.g., HEIC tanpa OffscreenCanvas support).

Output size typically **10-20× lebih kecil** dari raw mobile photo, masih cukup detail untuk proof photo (counter screen, receipts).

**Files**:
- New: [src/lib/crew/image-compression.ts](src/lib/crew/image-compression.ts) — 99 LOC
- Modified: [src/components/rekap/rekap-proof-upload.tsx](src/components/rekap/rekap-proof-upload.tsx) — wire `compressImage()` sebelum upload
- Modified: [src/components/rekap/single-file-upload.tsx](src/components/rekap/single-file-upload.tsx) — wire `compressImage()` untuk transport proof

Hint text ditambah di UI: "Foto di-kompres otomatis sebelum upload (hemat data)".

### 2.3. Draft auto-save + crash recovery + beforeunload warning

**Problem**: Crew capek habis event, isi form 5-10 menit di HP, browser tab close (battery low, accidental swipe, dll) → semua input hilang. Re-isi dari nol = frustrating.

**Solution**: 3-layer protection:

1. **localStorage draft persistence** ([src/lib/crew/recap-draft-storage.ts](src/lib/crew/recap-draft-storage.ts)) — key `tetra-rekap-draft:<eventId>`, envelope `{savedAt, values}`, 7-day TTL, safe `try/catch` around storage (handles disabled cookies / private browsing).

2. **useRekapDraft hook** ([src/components/rekap/use-rekap-draft.ts](src/components/rekap/use-rekap-draft.ts)) — 88 LOC:
   - On mount: load draft, return `restoredValues` + `restoredAgeMs`
   - On values change: debounce 1.2s, save to localStorage
   - On beforeunload: warn user kalau ada unsaved edits (only after first dirty change)
   - On submit success: caller invokes `clear()`

3. **Integration di [src/components/rekap/rekap-form.tsx](src/components/rekap/rekap-form.tsx)**:
   - Memoized `draftValues` flat record dari semua numeric/JSON state
   - `useEffect` apply restored values via setters (only once on mount)
   - Blue notice banner "Draft dipulihkan · Tersimpan X menit lalu" with dismiss button
   - After success: clear draft + redirect ke success page

Persisted fields: numeric quantities (cetak/media/sleeve/flashdisk/pouch/photomagnet/keychain), transport mode + cost, e-toll, parking, konsumsi, custom_materials JSON, lainnya_items JSON.

**Not persisted** (intentional): `crew_notes` (uncontrolled textarea — would need invasive controlled refactor for marginal value), uploaded file URLs (truth-of-record on Drive already).

### 2.4. Dedicated success page

**Problem**: Existing flow shows inline success banner di form bottom — confusing karena form tetap visible, crew tidak yakin submit sukses atau perlu klik lagi.

**Solution**: Dedicated route `/crew/jadwal/[projectId]/rekap/success`:
- Big circle checkmark
- Title "Rekap berhasil disubmit"
- Summary card: total cetak, total pengeluaran, foto bukti count
- Info card: "Owner akan review & finalize"
- 2 CTAs: "Kembali ke detail event" + "Lihat semua jadwal"

Form auto-redirect via `useRouter().push()` setelah `state?.success === true`. Inline banner di-update ke "Mengarahkan ke ringkasan…" untuk transition feedback.

**Files**:
- New: [src/app/(crew)/crew/jadwal/[projectId]/rekap/success/page.tsx](src/app/(crew)/crew/jadwal/[projectId]/rekap/success/page.tsx) — 156 LOC
- Modified: rekap-form.tsx — wire `useRouter` + success effect

---

## 3. File Inventory

### New files (5)

| File | LOC | Peran |
|---|---|---|
| `src/components/rekap/needs-rekap-section.tsx` | 156 | Server component yang surface "Perlu submit rekap" events |
| `src/lib/crew/image-compression.ts` | 99 | Canvas API based image compressor |
| `src/lib/crew/recap-draft-storage.ts` | 92 | localStorage CRUD with 7-day TTL |
| `src/components/rekap/use-rekap-draft.ts` | 88 | React hook orchestrating draft + beforeunload |
| `src/app/(crew)/crew/jadwal/[projectId]/rekap/success/page.tsx` | 156 | Confirmation page after submit |

### Modified files (5)

| File | Changes |
|---|---|
| `src/app/(crew)/crew/page.tsx` | Import + render `<NeedsRekapSection>` above stat grid |
| `src/app/(crew)/crew/jadwal/page.tsx` | Import + render `<NeedsRekapSection>` above tabs |
| `src/components/rekap/rekap-form.tsx` | useRouter + useRekapDraft wiring, draft restored banner, success redirect, +189 LOC |
| `src/components/rekap/rekap-proof-upload.tsx` | compressImage integration, rename file→rawFile for tracking, hint text |
| `src/components/rekap/single-file-upload.tsx` | compressImage integration |

### Database
**None.** No schema changes. Existing tables (`crew_rekap`, `crew_assignments`, `events`) + existing RLS (post-20260521 hotfix) sufficient.

### Migration
**None.** Tidak butuh apply-migration.ts run.

---

## 4. Test Plan (Manual)

### Functional di local dev

```bash
cd /Users/masrampc/Desktop/tetra-ops
pnpm dev
# or: npm run dev
```

1. **NeedsRekapSection visibility**:
   - Login sebagai crew yang ada assignment di event past dengan status `awaiting_settlement` dan belum submit rekap
   - Buka https://tetra-ops.vercel.app/crew → harusnya amber section "Perlu submit rekap" muncul
   - Tap card → harusnya navigate ke `/crew/jadwal/<projectId>/rekap`
   - Setelah submit, kembali ke /crew → section hilang (atau berkurang)

2. **Image compression**:
   - Buka form rekap di HP (Safari iOS / Chrome Android)
   - Foto besar 5-10 MB di galeri → upload bukti
   - Check Network tab: payload upload harusnya < 1 MB
   - File di Drive tetap valid, viewable
   - PDF / GIF tetap passthrough tanpa kompresi

3. **Draft auto-save**:
   - Isi form 5-10 field
   - Tunggu 1-2 detik (debounce)
   - Reload browser tab (Ctrl+R)
   - Form harusnya restore semua values + tampil banner biru "Draft dipulihkan"
   - Submit → draft auto-cleared (reload lagi → banner tidak muncul)

4. **Beforeunload warning**:
   - Isi 1 field di form
   - Coba tutup tab / navigate away
   - Browser harusnya show confirm dialog "Changes you made may not be saved"
   - Cancel → tetap di form
   - Reset form tanpa edit → close tanpa warning

5. **Success page**:
   - Submit form sampai sukses
   - Auto-redirect ke `/crew/jadwal/<projectId>/rekap/success`
   - Tampil checkmark + summary
   - 2 CTA berfungsi

### Mobile-specific

- [ ] iPhone Safari real device
- [ ] Android Chrome real device
- [ ] Camera capture flow (camera button → take photo → upload)
- [ ] Numeric keyboard pop-up untuk angka
- [ ] No iOS zoom on input focus (font-size >= 16px)
- [ ] Touch targets ≥ 44px (button h-10 = 40px, h-11 = 44px — Sumbar OK)
- [ ] Bottom nav tidak overlap content

### Edge cases

- [ ] Draft restore di browser yang localStorage di-disable → graceful (no crash, no banner)
- [ ] Draft expired (>7 hari) → auto-clear, no restore
- [ ] Compress fail untuk HEIC tanpa Safari support → fallback raw file
- [ ] Crew bukan-assigned akses `/crew/jadwal/<projectId>/rekap/success` → notFound()
- [ ] Crew akses success page sebelum submit rekap → redirect ke form

---

## 5. Outstanding / Known Limitations

| # | Item | Severity | Catatan |
|---|---|---|---|
| 1 | `crew_notes` textarea NOT auto-saved | Low | Uncontrolled component; refactor invasif untuk minor value |
| 2 | Multi-crew event concurrent submit | Low | First-write-wins by app code; UI tidak block 2nd crew. Existing limitation (sebelumnya juga). |
| 3 | Offline submit (no network) | Low | Draft tersimpan, tapi submit butuh online. PWA service worker untuk truly offline = future scope |
| 4 | Image compress di older browsers tanpa OffscreenCanvas + createImageBitmap | Low | Graceful fallback ke raw file; iOS 14+ / Chrome 76+ sudah support |
| 5 | Success page summary expense_total tidak include cost-of-goods bonus | Low | Existing calc pattern, owner UI tampilkan HPP separately |

---

## 6. Anti-Patterns yang Dihindari

- ❌ **Tidak** bikin parallel `/crew/events/*` route → keep `/crew/jadwal/*` per HANDOVER §7.1
- ❌ **Tidak** install browser-image-compression npm dep → native Canvas API zero-dep
- ❌ **Tidak** rebuild RekapForm dari scratch → wrap existing dengan draft hook + image compression
- ❌ **Tidak** bikin RPC baru → reuse `submitRekap` server action existing
- ❌ **Tidak** modify owner UI → all changes isolated di `(crew)/` + shared rekap components
- ❌ **Tidak** bypass RLS — RLS sudah cover crew INSERT (post-20260521 hotfix)

---

## 7. Recommendations untuk Prompt 5

### High-impact polish (effort: S-M)

1. **Frame Size Mapping settings UI** — tabel `frame_size_mapping` sudah seeded (4R/2R/polaroid) tapi belum ada CRUD UI. Owner butuh ini untuk adjust ratio per frame size.
2. **Package Items Mapping settings UI** — sama story, tabel exist tanpa UI.
3. **PWA service worker untuk offline draft submit** — saat ini draft cuma di-restore, belum auto-submit saat online kembali. Tambah background sync queue.
4. **Concurrency lock di submitRekap** — UPSERT race condition kalau 2 crew submit bersamaan. Add `FOR UPDATE` di server action.

### Lower priority

5. **`crew_notes` controlled state** — kalau ada feedback dari crew bahwa notes hilang setelah crash, refactor uncontrolled → controlled untuk include di draft.
6. **Notification trigger ke owner saat rekap submitted** — currently silent. Wire ke push notification system (sudah ada infra `push-subscriptions`).
7. **Progress indicator di sticky CTA** — count "X dari 7 field utama terisi" untuk visual progress.
8. **Audit archive** — `audit_log` grows unbounded. Add monthly archive job.

---

## 8. Manual Test Yang User Perlu Lakukan

Sebelum saya considered "done":

- [ ] Login crew di HP real → verifikasi NeedsRekapSection muncul untuk event past
- [ ] Submit rekap end-to-end (foto + data) → verifikasi compression jalan (cek Network tab payload)
- [ ] Close tab di tengah form → reopen → verifikasi draft restored
- [ ] Submit sampai sukses → verifikasi success page tampil
- [ ] Owner verifikasi rekap submitted bisa di-review di `/operations/<projectId>/rekap` (no regression)

Kalau ada issue / regression, screenshot + paste ke chat, saya investigate.

---

**End of report.** Branch ready di `main`, Vercel auto-deploy akan trigger setelah push.
