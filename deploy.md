# Cara Deploy Tetra Ops

> Akun yang benar ada di `accounts.md`. **Cek akun dulu sebelum deploy.**
> Mekanisme push + deploy harus SAMA setiap kali.

## ✅ SATU jalur deploy — git push → GitHub Actions (sejak 2026-06-22)

> ⚠️ **JANGAN deploy lewat dua jalur sekaligus.** Native Git integration Vercel sudah
> **di-disconnect** untuk project ini supaya tidak dobel-deploy dengan CI. Cukup `git push`.

Deploy production dijalankan oleh **GitHub Actions** (`.github/workflows/deploy.yml`) memakai
**Vercel token** (`VERCEL_TOKEN`, secret di GitHub repo) — **bukan** native Git integration.

### Kenapa pakai CI token, bukan native Git integration
Satu GitHub account (`ramaactivity`) cuma bisa **login-connect ke SATU akun Vercel** dalam satu
waktu. Karena tetra-ops / Tiska / Sinara hidup di **3 akun Vercel berbeda** (email beda,
masing-masing Hobby/free — sengaja dipisah biar limit free tidak numpuk), native Git integration
saling rebutan koneksi GitHub → terus lepas & deploy ke-block. **CI token tidak butuh koneksi
login GitHub↔Vercel sama sekali**, jadi koneksi tidak pernah lepas lagi.

### Jalur utama — push, CI deploy otomatis
```bash
git add <file-saya>           # JANGAN git add -A (ada sesi paralel)
git commit -m "pesan"
git push origin main          # GitHub Actions build + deploy → READY
```
Pantau di **tab Actions** repo (`github.com/ramaactivity/tetra-ops/actions`) sampai hijau,
lalu cek alias `https://tetra-ops-lac.vercel.app`.

### Cadangan — CLI manual (kalau Actions mati / butuh deploy tanpa commit)
```bash
vercel pull --yes --environment=production --token=$VERCEL_TOKEN
vercel build --prod --token=$VERCEL_TOKEN
vercel deploy --prebuilt --prod --token=$VERCEL_TOKEN
```
Jangan dijalankan barengan dengan push (nanti dobel). Token dibuat di akun Vercel pemilik
project: Settings → Tokens (scope team `visualtetra-9970`).

## 🔑 Setup CI (sekali saja) & kalau deploy bermasalah

`orgId` + `projectId` sudah di-inline di workflow (lihat `.vercel/project.json`). Yang perlu
disetel cuma **1 secret**: `VERCEL_TOKEN` di
`github.com/ramaactivity/tetra-ops/settings/secrets/actions`.

Kalau deploy gagal:
1. **Actions merah** → buka log step yang gagal. Token kadaluwarsa/dicabut → buat token baru di
   Vercel (Settings → Tokens), update secret `VERCEL_TOKEN`.
2. **Tidak ada run sama sekali** → cek file `.github/workflows/deploy.yml` ada di `main`.
3. **Deploy dobel** → native Git integration belum di-disconnect. Vercel project tetra-ops →
   Settings → Git → Disconnect.
4. Jangan otak-atik email commit — author noreply `ramaactivity` sudah benar (lihat `accounts.md`).

## ⚠️ Env var gotcha
- Sebelum `vercel env pull`: **SELALU** `cp .env.local .env.local.bak` dulu (env di-scope
  Production+Preview only & Sensitive → pull bisa mengosongkan `.env.local`).
- Jangan set `VERCEL_OIDC_TOKEN` manual — Vercel auto-inject saat runtime.
- `.vercel/.env.production.local` hasil `vercel pull` berisi rahasia → gitignored, hapus kalau tidak dipakai.

## ⏰ Cron jobs (via vercel.json)
- `/api/cron/status-transition` — harian 23:00 UTC (06:00 WIB)
- `/api/cron/anomaly-scan` — harian 23:30 UTC (06:30 WIB)
- Auth: header `Authorization: Bearer ${CRON_SECRET}`

Lihat juga: `accounts.md`
