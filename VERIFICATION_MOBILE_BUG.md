# VERIFICATION_MOBILE_BUG.md — Mobile /create 500 Bug Diagnosis

**Tanggal**: 2026-05-19
**Method**: Source code search + cross-reference dengan audit doc

## Executive Summary

⚠️ **Mobile bug "Code 4173739066" tidak applicable di codebase tetra-ops aktual.**

Reason:
- ❌ Tidak ada route literal `/create` di `src/app/`
- ❌ Tidak ada referensi string "4173739066" di seluruh source (`src/`, `supabase/`, `docs/`)
- Prompt verification kemungkinan pakai template generic yang tidak custom untuk projek ini

## §1. Route Search Results

```bash
find src/app -type d -name "create"
# (no results)
```

**Conclusion**: Tidak ada folder route `/create` di Next.js App Router struktur.

## §2. Alternative Routes (yang ada)

| Function | Actual route | Status |
|---|---|---|
| Buat event/booking baru | `/operations/new` | ✅ Exists |
| Buat backdrop baru | `/settings/backdrops/new` | ✅ Exists |
| Buat addon baru | `/settings/addons/new` | ✅ Exists |
| Buat package baru | `/settings/packages/new` | ✅ Exists |
| Buat sinking fund baru | `/settings/sinking-funds/new` | ✅ Exists |
| Buat inventory item baru | `/settings/items/new` | ✅ Exists |
| Crew register | `/register` | ✅ Exists |
| Crew submit rekap | `/crew/jadwal/[projectId]/rekap` | ✅ Exists |

Tidak ada redirect ke `/create`. Verified via:
```bash
grep -rn "\"/create\"\|'/create'\|href=\"/create\"\|push(\"/create\"\|redirect(\"/create\"" src/
# (no results)
```

## §3. Error Code Search

```bash
grep -rn "4173739066" src/ supabase/ docs/
# (no results = not in source)
```

**Conclusion**: Tidak ada hardcoded error code matching ini. Kemungkinan asal kode:
- Vercel runtime error ID (random per-request)
- Browser console error timestamp
- Custom error dari project lain (template reuse)

## §4. Cross-reference dengan Audit Doc (AUDIT_REKAP_MODULE.md)

Saya sudah investigate isu "halaman /create error 500" di Audit Section 6.5. Conclusion dari sana:

> "Tidak ada literal `/create` route. Booking creation lewat **`/operations/new`** (src/app/(owner)/operations/new/page.tsx).
> Klaim 'z.iso.date() bug' — **TIDAK VALID**. Zod v4.4.3 mendukung `z.iso.date()` (confirmed di node_modules/zod/v4/classic/external.d.ts)."

Hipotesis penyebab 500 di `/operations/new`:

| # | Kemungkinan | Likelihood |
|---|---|---|
| H1 | Salah satu tabel tidak ada di production (mis. backdrops/event_types belum migrate) | Tinggi |
| H2 | RLS policy block SELECT untuk role login | Medium |
| H3 | `createClient()` gagal (env var missing/invalid di production) | Medium |
| H4 | `Promise.all` reject karena salah satu query throw bukan return `{error}` | Medium |
| H5 | Layout fetch user profile gagal | Rendah |

## §5. Verifikasi Production /operations/new Sekarang

Mari kita verifikasi apakah halaman ini error di production yang sudah deploy (commit `6f89a5a`).

**URL untuk test manual**: `https://tetra-ops.vercel.app/operations/new`

⚠️ Saya tidak bisa lakukan browser test otomatis tanpa Playwright + login session. **User perlu test manual dengan login**.

### Test plan untuk user

1. Login ke https://tetra-ops.vercel.app sebagai owner/super_admin
2. Buka `/operations/new` di browser
3. Cek apakah:
   - Halaman load tanpa error (HTTP 200)
   - Form booking creation muncul (package selector, client info, venue, dll)
   - Tidak ada error di console browser (F12 → Console)
4. Coba submit form dengan data sample:
   - Client name: Test Booking
   - Service type: photobooth
   - Frame size: 4R
   - Date: hari ini + 7 hari
   - Time: 18:00 / 19:00 / 21:00
   - Venue name: Test Venue
   - Custom package price: 2000000
5. Cek apakah create berhasil → redirect ke `/operations/[new-project-id]`

### Kalau tetap error 500

Steps for collecting diagnostic:
1. Buka Vercel dashboard → tetra-ops → Logs
2. Cari error timestamp yang berdekatan dengan klik
3. Capture full stack trace
4. Catat:
   - Request URL
   - Request method
   - Error code dari log
   - Stack trace (tabel/column yang failing kalau ada)
5. Kirim ke saya untuk diagnose

## §6. Most Likely Root Cause (Speculation)

Tanpa Vercel logs di tangan, hipotesis paling kuat:

### Hipotesis A: RLS policy issue di production

Sebelum migration pass 1, beberapa tabel mungkin punya RLS policy yang membatasi SELECT untuk authenticated role. `/operations/new` melakukan 7 SELECT paralel:
- `packages WHERE is_active`
- `addons WHERE is_active`
- `backdrops WHERE is_active`
- `event_types WHERE is_active`
- `users WHERE role IN (super_admin, owner, crew) AND is_active`
- `events WHERE channel='vendor'` (last 50)
- `system_config WHERE key='tax.default_grossup_rate_pct'`

Kalau salah satu RLS deny → query return `data: null` (silent). Tapi `Promise.all` destructuring tetap proceed, page might render with `pages = null` → BookingForm render error.

### Hipotesis B: Migration belum applied di production

Tapi user sudah confirm migrate semua → tidak applicable lagi.

### Hipotesis C: Production env var mismatch

`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` di Vercel mungkin berbeda dengan `.env.local`. Verify di Vercel dashboard → Settings → Environment Variables.

## §7. Proposed Fix (untuk Prompt 4 — jangan implement sekarang)

### Approach 1: Add per-query error handling

Replace `Promise.all` destructuring dengan `Promise.allSettled` + log per failure:

```ts
// BEFORE (current code, src/app/(owner)/operations/new/page.tsx:17-72)
const [
  { data: packages },
  { data: addons },
  // ... 7 queries paralel
] = await Promise.all([...]);

// AFTER (proposed)
const results = await Promise.allSettled([...]);
for (const [idx, r] of results.entries()) {
  if (r.status === 'rejected') {
    console.error(`Query ${idx} failed:`, r.reason);
  }
}
// Extract data dengan fallback ke []
const packages = results[0].status === 'fulfilled' ? results[0].value.data : [];
```

### Approach 2: Add error boundary

Tambah `error.tsx` di `src/app/(owner)/operations/new/error.tsx` supaya render-time error di-catch user-friendly:

```tsx
"use client";
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="...">
      <h2>Gagal load halaman booking</h2>
      <p>{error.message}</p>
      <button onClick={reset}>Coba lagi</button>
    </div>
  );
}
```

### Approach 3: Validate critical data sebelum render

```ts
if (!packages?.length || !backdrops?.length) {
  return <SetupRequired />; // Component yang kasih instruksi ke owner
}
```

## §8. Verdict

**Mobile bug Code 4173739066 untuk `/create` tidak applicable di codebase aktual.**

Possible meanings:
1. ✅ **Most likely**: Template prompt generic — bukan bug nyata di tetra-ops. Skip task ini.
2. **Less likely**: User mengalami 500 di route lain (mungkin `/operations/new`) dengan error ID Vercel yang berbeda. Test manual diperlukan untuk konfirmasi.

**Action items**:
- [ ] User test manual `/operations/new` di production setelah deploy
- [ ] Capture Vercel log kalau error reproduce
- [ ] Kalau confirmed error: kirim stack trace, saya implement fix di pass berikutnya

**Untuk Prompt 4 (Mobile Crew)**: BUG INI **TIDAK BLOCKING**. Prompt 4 fokus mobile crew UI yang independent dari `/operations/new` (booking creation flow).
