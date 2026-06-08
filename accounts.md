# Akun yang Benar untuk Tetra Ops

> ⚠️ **WAJIB**: push commit & deploy HARUS selalu pakai akun yang sama seperti di bawah.
> Kalau sedang login pakai akun lain → **STOP**, logout dulu, login ke akun yang benar.
> Mekanisme push + deploy harus konsisten setiap kali.

## ✅ Dua identitas (sengaja berbeda — ini NORMAL & benar)

| | Identitas | Peran |
|---|---|---|
| **Akun Vercel** | `visualtetra-9970` — email **`visualtetra@gmail.com`** (login via **Google**) | Pemilik team & project |
| **Akun GitHub** | **`ramaactivity`** — email **`rama.activity98@gmail.com`**, user id **`98883167`** | Pemilik repo & author commit |
| **🔑 Jembatan WAJIB** | GitHub `ramaactivity` **ter-connect sebagai Sign-in Method di akun Vercel** | Inilah yang bikin Vercel mengenali author commit → deploy lolos |

### Detail Vercel
- **Team**: `visualtetra-9970s-projects` (Hobby)
- **Project**: `tetra-ops`
- **Dashboard**: https://vercel.com/visualtetra-9970s-projects/tetra-ops
- **Production URL**: https://tetra-ops-lac.vercel.app

### Detail GitHub
- **Repo**: `ramaactivity/tetra-ops` (branch `main` auto-deploy)
- **Git commit author email**: `98883167+ramaactivity@users.noreply.github.com` (noreply — JANGAN diubah)
- **Git commit author name**: `ramaactivity`

## 🔑 KUNCI deploy tidak ke-block (pelajaran 2026-06-08)

Akun Vercel (`visualtetra@gmail.com`) **beda** dari akun GitHub (`ramaactivity`). Di Vercel
Hobby + repo private, deploy diblok kalau author commit tidak bisa dipetakan ke member team.
**Solusinya BUKAN ganti email commit.** Solusinya: **connect GitHub `ramaactivity` sebagai
Sign-in Method di akun Vercel** —
https://vercel.com/account/settings/authentication → Sign-in Methods → GitHub → connect
sebagai `ramaactivity`. Setelah ter-connect ("Last used just now"), SEMUA jalur deploy lolos
(git push, CLI `vercel --prod`, deploy hook). Ini sudah dilakukan & permanen.

> ❌ Teori lama yang KELIRU (sudah dikoreksi): "email Gmail private bikin block" / "ganti
> author ke noreply" / "CLI & deploy-hook bypass block". Yang benar: yang kurang dulu adalah
> **GitHub login `ramaactivity` belum ter-connect ke akun Vercel**. Begitu di-connect, beres.

## 🔍 Cek sebelum push/deploy

```bash
git config user.email   # harus: 98883167+ramaactivity@users.noreply.github.com
git config user.name    # harus: ramaactivity
git remote -v           # harus: github.com/ramaactivity/tetra-ops
npx vercel whoami       # harus: visualtetra-9970
```

## 🛑 Kalau akun SALAH

### Vercel login ke akun lain
```bash
npx vercel logout
npx vercel login        # login sebagai visualtetra@gmail.com (via Google/email)
```
Lalu pastikan project ter-link: `npx vercel pull --yes --environment=production --scope visualtetra-9970s-projects`

### Git author salah
```bash
git config user.email "98883167+ramaactivity@users.noreply.github.com"
git config user.name  "ramaactivity"
```

## 📜 Sejarah singkat
- Akun lama `ramaactivity98-5695s-projects` dihapus (2026-05-29, exceeded Hobby CPU) → migrasi ke `visualtetra-9970s-projects`.
- 2026-06-08: deploy ke-block "commit could not be matched to a GitHub account". Fix: connect GitHub `ramaactivity` ke akun Vercel `visualtetra-9970`. Lolos.

Lihat juga: `deploy.md`
