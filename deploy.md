# Cara Deploy Tetra Ops

> Akun yang benar ada di `accounts.md`. **Cek akun dulu sebelum deploy.**
> Mekanisme push + deploy harus SAMA setiap kali.

## ✅ SATU jalur deploy — git push (sejak 2026-06-09)

> ⚠️ **JANGAN deploy lewat dua jalur sekaligus.** Dulu (2026-06-08) git push *dan* `npx vercel
> --prod` sama-sama dipakai → menghasilkan **dua build berbarengan untuk commit yang sama** =
> mubazir. Sekarang **cukup git push.**

Syarat sudah terpenuhi: GitHub `ramaactivity` ter-connect sebagai Sign-in Method di akun
Vercel `visualtetra-9970`, jadi author commit dikenali → **tidak ke-block lagi**.

### Jalur utama — auto-deploy via git push
```bash
git add -A
git commit -m "pesan"
git push origin main          # Vercel auto-deploy commit terakhir → READY
```
Pantau di dashboard sampai `READY` + alias `https://tetra-ops-lac.vercel.app`.

### Cadangan — CLI manual (HANYA kalau Git integration mati / butuh deploy tanpa commit)
```bash
npx vercel --prod --yes --scope visualtetra-9970s-projects
```
Jangan dijalankan barengan dengan git push. Output sukses berakhir `readyState: "READY"`.

> `./scripts/deploy.sh` (deploy hook) masih ada sebagai cadangan terakhir, jarang dipakai.

## 🔑 Kenapa dulu ke-block & bagaimana fix permanennya

Akun Vercel (`visualtetra@gmail.com`) beda dari GitHub (`ramaactivity`). Vercel Hobby + repo
private memblok deploy yang author commit-nya tidak bisa dipetakan ke member team. **Fix yang
benar (bukan ganti email):** connect GitHub `ramaactivity` di
https://vercel.com/account/settings/authentication → Sign-in Methods → GitHub. Sudah dilakukan.

Kalau suatu saat block muncul lagi ("commit author could not be matched to a GitHub account"):
1. Cek https://vercel.com/account/settings/authentication — pastikan GitHub `ramaactivity` masih ter-connect.
2. Cek `npx vercel whoami` = `visualtetra-9970` & `git config user.email` = noreply ramaactivity.
3. Jangan otak-atik email commit — itu sudah benar.

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
