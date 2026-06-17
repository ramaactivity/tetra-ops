# Backup desain — DNA Vercel (sebelum redesign UpGradely)

Snapshot tampilan **lama** Tetra Ops (DNA Vercel: stark, ink + emerald, zero-gradient, radius 6px)
yang diambil sebelum redesign ke DNA "UpGradely" (gradient pastel, kartu rounded besar, CTA hitam,
aksen lime + oranye).

## Apa isi folder ini
File penentu desain lama, disalin apa adanya untuk referensi cepat (tanpa perlu git):

- `DESIGN.md` — spec design system lama
- `MOBILE.md` — spec mobile lama
- `globals.css` — token Tailwind v4 (`@theme inline`) lama
- `layout.tsx` — wiring font & root layout lama

> Folder ini hanya cermin baca. Sumber kebenaran untuk revert adalah **git** (di bawah).

## Backup git (presisi)

- **Tag**: `design-vercel-dna` (commit tepat sebelum redesign)
- **Branch**: `backup/design-vercel-dna`
- Keduanya sudah di-push ke `origin`.
- Redesign dikerjakan di branch: `redesign/upgradely-dna`.

## Cara kembali ke desain lama

**1. Lihat-lihat tanpa mengubah apa pun**
```
git checkout backup/design-vercel-dna   # atau: git checkout design-vercel-dna
# ...lihat-lihat...
git checkout redesign/upgradely-dna     # balik ke kerjaan baru
```

**2. Kembalikan hanya tampilan (paling umum)** — ambil ulang file desain dari backup, lalu commit:
```
git checkout design-vercel-dna -- \
  DESIGN.md MOBILE.md \
  src/app/globals.css src/app/layout.tsx \
  src/components/ui src/components/layouts src/components/operations
git commit -m "revert: kembali ke desain DNA Vercel"
```
(Sesuaikan daftar path bila ada file lain yang tersentuh redesign.)

**3. Kembali total ke kondisi sebelum redesign**
```
git switch backup/design-vercel-dna
# atau (HATI-HATI, hanya jika tak ada kerjaan lain yang ingin dipertahankan):
# git switch main && git reset --hard design-vercel-dna
```

**4. Toggle dua desain berdampingan**
Simpan keduanya sebagai branch dan pindah sesuai kebutuhan sampai diputuskan mana yang di-merge ke `main`:
- `backup/design-vercel-dna` = desain lama
- `redesign/upgradely-dna` = desain baru
