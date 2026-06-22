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

### ⚠️ Gotcha utama — Hobby blokir "commit author tidak cocok"
Vercel Hobby **memblok deploy yang commit-author-emailnya tak bisa dipetakan ke akun GitHub di
team** ("The deployment was blocked because the commit email … could not be matched"). Karena
login GitHub sengaja **tidak** di-connect, deploy yang membawa metadata git pasti ke-block.
**Solusi (sudah jalan di workflow):** step `rm -rf .git` SEBELUM `vercel deploy` → metadata
commit dibuang → deploy diatribusikan ke **pemilik token** (anggota team), bukan ke commit
author → lolos. Konsekuensi: di dashboard Vercel deploy muncul tanpa nama commit/branch (sumber
`vercel deploy`). Riwayat di GitHub tetap utuh.

### Jalur utama — push, CI deploy otomatis
```bash
git add <file-saya>           # JANGAN git add -A (ada sesi paralel)
git commit -m "pesan"
git push origin main          # GitHub Actions → vercel deploy → READY (~2 menit)
```
Pantau di **tab Actions** repo (`github.com/ramaactivity/tetra-ops/actions`) sampai hijau,
lalu cek alias `https://tetra-ops-lac.vercel.app`.

Isi `.github/workflows/deploy.yml` (build DI Vercel, bukan prebuilt — prebuilt sempat
menggantung di "Building…"):
```
npm install -g vercel@latest
vercel pull --yes --environment=production --token=$VERCEL_TOKEN
rm -rf .git                                  # buang commit-author → tak ke-block
vercel deploy --prod --token=$VERCEL_TOKEN   # Vercel yang build (install pnpm sendiri)
```

## 🔑 Setup CI (sekali saja) & kalau deploy bermasalah

`orgId` + `projectId` sudah di-inline di workflow (lihat `.vercel/project.json`). Yang perlu
disetel cuma **1 secret**: `VERCEL_TOKEN` di
`github.com/ramaactivity/tetra-ops/settings/secrets/actions` (dibuat di Vercel akun
`visualtetra-9970` → Settings → Tokens, No Expiration). Native Git integration project sudah
**di-disconnect** (Settings → Git) supaya tak dobel-deploy.

Kalau deploy gagal:
1. **Blocked "commit email could not be matched"** → step `rm -rf .git` hilang/ketimpa. Pastikan
   ada sebelum `vercel deploy`.
2. **Actions merah di step Deploy** → token kadaluwarsa/dicabut → buat token baru di Vercel,
   update secret `VERCEL_TOKEN`.
3. **Deploy menggantung di "Building…"** → jangan pakai `--prebuilt`; pakai `vercel deploy --prod`
   biasa (Vercel yang build).
4. **`spawn pnpm ENOENT`** → itu kalau pakai prebuilt + `vercel build` lokal; pola sekarang
   build di Vercel jadi tak perlu pnpm di runner.
5. **Tidak ada run sama sekali** → cek `.github/workflows/deploy.yml` ada di `main`.

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
