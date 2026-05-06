# Brand Assets — Tetra Ops

Folder ini berisi semua aset visual brand Tetra Photobooth yang diperlukan untuk Tetra Ops. Aset ini akan dipakai di:

- Login screen
- Sidebar logo
- PWA install icons (Android, iOS)
- Generated PDF documents (invoice, quotation, BAST, monthly report)
- Email templates (future)
- Social/share previews

---

## 1. File yang Diperlukan

Letakkan file-file berikut di folder ini (`brand-assets/`). Sesuaikan nama persis sesuai daftar — script setup akan rely on nama-nama ini.

### 1.1 Logo Files

| Nama File | Format | Spesifikasi | Wajib? |
|-----------|--------|-------------|--------|
| `logo-full-color.svg` | SVG vector | Logo penuh dengan warna, untuk web display | ✅ |
| `logo-full-color.png` | PNG | Versi raster, transparent background, min 800px wide | ✅ |
| `logo-monochrome-dark.svg` | SVG | Logo monokromatik gelap (hitam atau warna gelap) — untuk light backgrounds | ✅ |
| `logo-monochrome-light.svg` | SVG | Logo monokromatik terang (putih atau warna terang) — untuk dark backgrounds | ✅ |
| `logomark-only.svg` | SVG | Hanya simbol "T." mark, bentuk square — untuk sidebar compact | ✅ |
| `logomark-only.png` | PNG | Versi raster logomark, 512x512px, transparent | ✅ |

### 1.2 Favicon & Touch Icons

| Nama File | Format | Spesifikasi | Wajib? |
|-----------|--------|-------------|--------|
| `favicon.ico` | ICO | 32x32px, untuk browser tab | ✅ |
| `apple-touch-icon.png` | PNG | 180x180px, untuk iOS home screen | ✅ |

### 1.3 PWA Icons (auto-generated dari logomark-only.png)

Tidak perlu upload manual. Script `scripts/generate-pwa-icons.ts` akan generate dari `logomark-only.png` ke folder `public/pwa-icons/`:

- `icon-192.png` — 192x192px PWA icon
- `icon-512.png` — 512x512px PWA icon
- `icon-maskable-512.png` — 512x512px dengan safe-area padding untuk Android adaptive icons

---

## 2. Cara Placement (Setup Script)

Setelah lu drop file logo ke folder ini, jalankan script berikut untuk auto-copy ke `public/` dan generate PWA icons:

```bash
# Dari root project
pnpm brand:place    # Copy logos dari brand-assets/ ke public/brand/
pnpm brand:icons    # Generate PWA icons (192, 512, maskable) dari logomark
```

Atau jalankan langsung kalau script-nya belum ada:

```bash
# Manual copy
mkdir -p public/brand public/pwa-icons
cp brand-assets/*.svg public/brand/
cp brand-assets/*.png public/brand/
cp brand-assets/favicon.ico public/
cp brand-assets/apple-touch-icon.png public/

# Generate PWA icons (butuh sharp)
pnpm tsx scripts/generate-pwa-icons.ts
```

---

## 3. Setup Script Manual (kalau belum ada di repo)

Buat file `scripts/place-brand-assets.ts`:

```typescript
import fs from 'fs';
import path from 'path';

const SRC = path.resolve('brand-assets');
const DEST_BRAND = path.resolve('public/brand');
const DEST_PUBLIC = path.resolve('public');

// Buat folder destinasi
if (!fs.existsSync(DEST_BRAND)) {
  fs.mkdirSync(DEST_BRAND, { recursive: true });
}

// File yang di-copy ke public/brand/
const brandFiles = [
  'logo-full-color.svg',
  'logo-full-color.png',
  'logo-monochrome-dark.svg',
  'logo-monochrome-light.svg',
  'logomark-only.svg',
  'logomark-only.png',
];

// File yang di-copy ke public/ (root)
const rootFiles = [
  'favicon.ico',
  'apple-touch-icon.png',
];

let copiedCount = 0;
let missingCount = 0;

console.log('📦 Placing brand assets...\n');

for (const file of brandFiles) {
  const src = path.join(SRC, file);
  const dest = path.join(DEST_BRAND, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`✓ ${file} → public/brand/`);
    copiedCount++;
  } else {
    console.log(`⚠ ${file} not found in brand-assets/ — skipping`);
    missingCount++;
  }
}

for (const file of rootFiles) {
  const src = path.join(SRC, file);
  const dest = path.join(DEST_PUBLIC, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`✓ ${file} → public/`);
    copiedCount++;
  } else {
    console.log(`⚠ ${file} not found — skipping`);
    missingCount++;
  }
}

console.log(`\nDone. ${copiedCount} files placed, ${missingCount} missing.`);
if (missingCount > 0) {
  console.log('Tambah file yang missing ke folder brand-assets/ dan jalankan ulang script ini.');
}
```

Tambahkan ke `package.json`:

```json
{
  "scripts": {
    "brand:place": "tsx scripts/place-brand-assets.ts",
    "brand:icons": "tsx scripts/generate-pwa-icons.ts"
  }
}
```

---

## 4. Spesifikasi Detail Per File

### 4.1 `logo-full-color.svg` / `.png`

**Penggunaan:** Login screen, header navigation, splash, marketing materials

**Spec:**
- Color: Crimson `#DC2954` + accent gold `#D4A574` jika ada
- Background: Transparent
- Aspect ratio: bebas (biasanya horizontal landscape)
- PNG: minimum 800px wide, max 2000px (untuk file size)
- SVG: vector clean, tanpa raster embeds

### 4.2 `logo-monochrome-dark.svg`

**Penggunaan:** Header pada light mode, footer pada light backgrounds, watermark hint

**Spec:**
- Color: Slate-900 `#18181D` atau pure dark, single color
- Background: Transparent
- SVG only (untuk konsistensi crisp di semua sizes)

### 4.3 `logo-monochrome-light.svg`

**Penggunaan:** Header pada dark mode (default Tetra Ops), footer pada dark backgrounds

**Spec:**
- Color: Slate-50 `#FAFAF9` atau pure white, single color
- Background: Transparent
- SVG only

### 4.4 `logomark-only.svg` / `.png`

**Penggunaan:** Sidebar compact (32x32 atau 40x40), favicon source, PWA icon source

**Spec:**
- Bentuk: Square (1:1 aspect ratio)
- Hanya simbol "T." atau monogram, tanpa wordmark
- PNG: minimum 512x512px
- Pastikan terlihat jelas di ukuran 32x32

### 4.5 `favicon.ico`

**Penggunaan:** Browser tab icon

**Spec:**
- Format: ICO (multi-size: 16x16, 32x32, 48x48 dalam 1 file)
- Bisa generate dari `logomark-only.png` pakai online tool (favicon.io, realfavicongenerator.net)

### 4.6 `apple-touch-icon.png`

**Penggunaan:** iOS Home Screen icon (saat user "Add to Home Screen")

**Spec:**
- Format: PNG
- Size: 180x180px exact
- Background: Solid (bukan transparent — iOS akan render dengan square corners)
- Color: Crimson `#DC2954` background dengan logomark putih di tengah

---

## 5. Checklist Sebelum Go-Live

Sebelum production launch, pastikan semua aset ini ada dan ter-place:

- [ ] `logo-full-color.svg` di brand-assets/
- [ ] `logo-full-color.png` di brand-assets/
- [ ] `logo-monochrome-dark.svg` di brand-assets/
- [ ] `logo-monochrome-light.svg` di brand-assets/
- [ ] `logomark-only.svg` di brand-assets/
- [ ] `logomark-only.png` di brand-assets/
- [ ] `favicon.ico` di brand-assets/
- [ ] `apple-touch-icon.png` di brand-assets/
- [ ] Run `pnpm brand:place` — semua file berhasil copy
- [ ] Run `pnpm brand:icons` — PWA icons generated
- [ ] Verifikasi di `/public/brand/` semua file ada
- [ ] Verifikasi di `/public/pwa-icons/` ada 3 file (192, 512, maskable)
- [ ] Test di browser: tab icon muncul (favicon)
- [ ] Test PWA install di phone — icon di home screen tampil benar
- [ ] Test di dark mode — logo light muncul dengan benar
- [ ] Test di light mode — logo dark muncul dengan benar

---

## 6. Rules Penggunaan Logo

Per [04_DESIGN_SYSTEM.md](../docs/04_DESIGN_SYSTEM.md#16-brand-asset-integration):

### Yang BOLEH:
- Pakai versi yang sesuai context (light bg → monochrome dark, dark bg → monochrome light)
- Resize secara proporsional
- Pakai dengan padding minimum (margin sama dengan tinggi "T." mark di semua sisi)

### Yang TIDAK BOLEH:
- ❌ Stretch atau skew (distortion)
- ❌ Recolor di luar varian monochrome yang sudah disediakan
- ❌ Tambah efek (drop shadow, glow, outline, gradient)
- ❌ Letakkan di background yang busy/clash dengan warna logo
- ❌ Ubah proporsi simbol & wordmark
- ❌ Crop atau potong elemen logo

---

## 7. Folder Structure (After Placement)

Setelah `pnpm brand:place` dan `pnpm brand:icons` berhasil:

```
tetra-ops/
├── brand-assets/                           ← source files (di-edit di sini)
│   ├── logo-full-color.svg
│   ├── logo-full-color.png
│   ├── logo-monochrome-dark.svg
│   ├── logo-monochrome-light.svg
│   ├── logomark-only.svg
│   ├── logomark-only.png
│   ├── favicon.ico
│   ├── apple-touch-icon.png
│   └── README.md                           ← file ini
│
└── public/
    ├── favicon.ico                          ← copied from brand-assets
    ├── apple-touch-icon.png                 ← copied
    ├── brand/                               ← copied logos
    │   ├── logo-full-color.svg
    │   ├── logo-full-color.png
    │   ├── logo-monochrome-dark.svg
    │   ├── logo-monochrome-light.svg
    │   ├── logomark-only.svg
    │   └── logomark-only.png
    └── pwa-icons/                           ← auto-generated
        ├── icon-192.png
        ├── icon-512.png
        └── icon-maskable-512.png
```

---

## 8. Tools untuk Generate Aset

Kalau belum punya semua varian, bisa generate pakai tools gratis:

### Logo Variants
- **Figma** (free) — design tool standar, bisa export SVG/PNG
- **Inkscape** (free) — vector editor

### Favicon
- **realfavicongenerator.net** — upload satu PNG, dapet semua format favicon (ICO + apple-touch + manifest)

### PNG Optimizer
- **TinyPNG** (free, online) — compress PNG tanpa quality loss
- **Squoosh** (free, by Google) — encoding modern

### SVG Optimizer
- **SVGOMG** (free, online) — bersihin SVG dari junk metadata

---

## 9. Update Logo (Future)

Kalau di masa depan branding berubah:

1. Replace file di `brand-assets/` dengan versi baru
2. Run `pnpm brand:place` (overwrite di `public/`)
3. Run `pnpm brand:icons` (regenerate PWA icons)
4. Commit perubahan
5. Deploy
6. Test di browser dengan **hard refresh** (Cmd+Shift+R) untuk bypass cache
7. Notify user yang udah install PWA — service worker akan auto-update saat next visit

---

## 10. Notes

- File di `brand-assets/` **boleh di-commit** ke git (source of truth)
- File di `public/brand/` dan `public/pwa-icons/` adalah **derived** — bisa di-gitignore atau commit (recommended commit untuk konsistensi deploy)
- File ukuran besar (>500KB) sebaiknya optimize dulu sebelum commit

---

**Selamat menempatkan brand asset!** 🎨
