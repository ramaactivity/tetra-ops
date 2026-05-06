# 13 — Onboarding Wizard (Setup Pertama)

**Project:** Tetra Ops
**Bahasa:** Indonesia (untuk dibaca tim Tetra non-developer)
**Tujuan dokumen:** Panduan visual & alur lengkap Onboarding Wizard yang dijalankan saat pertama kali Tetra Ops di-deploy.

---

## 1. Kapan Wizard Muncul?

Wizard muncul **otomatis** saat:
- Sistem mendeteksi `system_config.is_initialized = false`
- User yang login adalah Super Admin (Rama)

Kalau bukan Rama yang login pertama, mereka diarahkan ke halaman "Akun menunggu persetujuan admin".

Setelah wizard selesai sekali, **tidak bisa muncul lagi** kecuali super admin reset manual via Settings → Danger Zone.

---

## 2. Estimasi Waktu

**Total: 30-60 menit** (tergantung kompleksitas data awal)

Per langkah:
- Step 1: Welcome — 1 menit
- Step 2: Business Profile — 3 menit
- Step 3: Master Data — 5 menit
- Step 4: Tim Kamu — 10-15 menit
- Step 5: Inventory Awal — 10-20 menit
- Step 6: Saldo Awal — 5 menit
- Step 7: Klien Eksisting — 0-5 menit (skip default)
- Step 8: Active Events — 5-15 menit (tergantung jumlah event aktif)
- Step 9: Done & Tutorial — 2 menit

---

## 3. Layout Umum Wizard

Setiap step menggunakan layout yang sama:

```
┌─────────────────────────────────────────────────────┐
│  Logo Tetra                            (?) Bantuan  │
├─────────────────────────────────────────────────────┤
│  Progress: [■■■□□□□□□] Step 3 of 9                  │
├─────────────────────────────────────────────────────┤
│                                                       │
│   {Judul Step}                                        │
│   {Subjudul / penjelasan singkat}                    │
│                                                       │
│   {Konten step di sini — form, opsi, dll.}           │
│                                                       │
│                                                       │
├─────────────────────────────────────────────────────┤
│  [← Kembali]              [Skip]    [Lanjut →]      │
└─────────────────────────────────────────────────────┘
```

**Auto-save draft:** Setiap step otomatis disimpan ke database. Kalau user tutup browser di tengah jalan, bisa lanjut dari step terakhir saat login lagi.

**Tombol "Skip":** Hanya muncul di step yang opsional (Step 7 dan 8).

**Tombol "Kembali":** Selalu tersedia kecuali di Step 1.

---

## 4. Detail Per Step

### 4.1 Step 1: Welcome

**Judul:** "Selamat datang di Tetra Ops!"

**Subjudul:** "Yuk kita setup operasional Tetra dalam beberapa langkah."

**Konten:**

```
┌─────────────────────────────────────────────────────┐
│                                                       │
│         🎉                                            │
│                                                       │
│   Selamat datang di Tetra Ops!                       │
│                                                       │
│   Sebelum mulai pakai aplikasinya, kita akan         │
│   setup beberapa data dasar dulu. Tenang, panduan    │
│   ini cuma butuh sekitar 30-60 menit.                │
│                                                       │
│   Yang akan kita siapkan:                            │
│   ✓ Profil bisnis kamu                               │
│   ✓ Paket dan add-on (sudah pre-fill)                │
│   ✓ Tim Tetra (owner & crew)                         │
│   ✓ Stok awal inventory                              │
│   ✓ Saldo bank di awal                               │
│   ✓ Event yang sudah di-booking                      │
│                                                       │
│   Bisa dipause dan dilanjut nanti — data tersimpan   │
│   otomatis. Siap?                                    │
│                                                       │
│            [🚀 Mulai Setup]                          │
│                                                       │
└─────────────────────────────────────────────────────┘
```

**Action:** Klik "Mulai Setup" → ke Step 2.

---

### 4.2 Step 2: Business Profile

**Judul:** "Profil Bisnis Tetra"

**Subjudul:** "Info ini muncul di invoice, header PDF, dan footer aplikasi."

**Form fields:**

| Field | Tipe | Default | Required |
|-------|------|---------|----------|
| Nama Bisnis | Text | "Tetra Photobooth" | ✅ |
| Tagline | Text | "Memorable photobooth experiences" | ❌ |
| Alamat Operasional | Textarea | (kosong) | ✅ |
| Email Kontak | Email | (kosong) | ✅ |
| Nomor WA Bisnis | Phone (+62) | (kosong) | ✅ |
| Logo (Upload) | File | (kosong) | ❌ (recommended) |

**Mockup:**

```
┌─────────────────────────────────────────────────────┐
│  Progress: [■■□□□□□□□] Step 2 of 9                  │
├─────────────────────────────────────────────────────┤
│                                                       │
│   Profil Bisnis Tetra                                │
│   Info ini muncul di invoice & header PDF            │
│                                                       │
│   Nama Bisnis *                                      │
│   ┌───────────────────────────────────────────┐    │
│   │ Tetra Photobooth                          │    │
│   └───────────────────────────────────────────┘    │
│                                                       │
│   Tagline (opsional)                                 │
│   ┌───────────────────────────────────────────┐    │
│   │ Memorable photobooth experiences          │    │
│   └───────────────────────────────────────────┘    │
│                                                       │
│   Alamat Operasional *                               │
│   ┌───────────────────────────────────────────┐    │
│   │                                            │    │
│   │                                            │    │
│   └───────────────────────────────────────────┘    │
│                                                       │
│   Email Kontak *      Nomor WA *                     │
│   ┌──────────────┐   ┌──────────────────┐         │
│   │              │   │ +62               │         │
│   └──────────────┘   └──────────────────┘         │
│                                                       │
│   Logo (opsional, max 2MB)                           │
│   ┌───────────────────────────────────────────┐    │
│   │   [📁 Pilih File]   atau drag-drop di sini│    │
│   └───────────────────────────────────────────┘    │
│                                                       │
├─────────────────────────────────────────────────────┤
│  [← Kembali]                       [Lanjut →]       │
└─────────────────────────────────────────────────────┘
```

**Validasi:**
- Email format valid
- Nomor WA format Indonesia (+62 atau 08xxx)
- Logo max 2MB, format PNG/JPG/SVG

**Saved to:** `system_config` (key: `business_name`, `business_tagline`, dll.)

**Action:** Klik "Lanjut" → ke Step 3.

---

### 4.3 Step 3: Master Data (Paket & Add-on)

**Judul:** "Paket & Add-on"

**Subjudul:** "Sudah di-pre-fill dari pricelist 2026. Cek dan sesuaikan kalau perlu."

**Mockup:**

```
┌─────────────────────────────────────────────────────┐
│  Progress: [■■■□□□□□□] Step 3 of 9                  │
├─────────────────────────────────────────────────────┤
│                                                       │
│   Paket & Add-on                                     │
│   Pre-filled dari pricelist 2026.                    │
│                                                       │
│   📦 PAKET (32 items)                                │
│   ┌───────────────────────────────────────────┐    │
│   │ ✓ 2R Unlimited 2 Jam      Rp 2.000.000   │    │
│   │ ✓ 2R Unlimited 3 Jam      Rp 2.500.000   │    │
│   │ ✓ 2R Unlimited 4 Jam      Rp 3.000.000   │    │
│   │ ... (32 items)                            │    │
│   │                                            │    │
│   │ [+ Tambah Paket Custom]                   │    │
│   └───────────────────────────────────────────┘    │
│                                                       │
│   ✨ ADD-ON (7 items)                                │
│   ┌───────────────────────────────────────────┐    │
│   │ ✓ Voucher Photobooth 100 pcs   Rp 25.000 │    │
│   │ ✓ Guest Books Photo 25 lembar Rp 200.000 │    │
│   │ ✓ Photomagnet 50 cetak        Rp 350.000 │    │
│   │ ✓ Break Time / 1 Jam          Rp 150.000 │    │
│   │ ✓ Album Photostripe 20 hal.   Rp 100.000 │    │
│   │ ✓ Costume Sleeve 1000 lembar  Rp 1.5jt   │    │
│   │ ✓ Keychain Station            Rp 10k/pcs │    │
│   │                                            │    │
│   │ [+ Tambah Add-on Custom]                  │    │
│   └───────────────────────────────────────────┘    │
│                                                       │
│   ℹ️ Klik checklist untuk enable/disable item        │
│   ℹ️ Klik nama item untuk edit nama/harga            │
│                                                       │
├─────────────────────────────────────────────────────┤
│  [← Kembali]                       [Lanjut →]       │
└─────────────────────────────────────────────────────┘
```

**Behavior:**
- Semua item pre-filled dari seed data (sudah ada saat schema migration)
- User bisa:
  - Toggle enable/disable per item (checklist)
  - Edit nama/harga (klik item → modal edit)
  - Tambah custom paket/add-on

**Action:** Klik "Lanjut" → ke Step 4.

**Saved to:** Update `packages.is_active` dan `addons.is_active` per pilihan user.

---

### 4.4 Step 4: Tim Kamu

**Judul:** "Tim Tetra"

**Subjudul:** "Owner dan Crew yang akan pakai aplikasi ini."

**Mockup:**

```
┌─────────────────────────────────────────────────────┐
│  Progress: [■■■■□□□□□] Step 4 of 9                  │
├─────────────────────────────────────────────────────┤
│                                                       │
│   Tim Tetra                                          │
│   Tambahkan semua owner dan crew yang akan pakai    │
│   aplikasi. Mereka akan login pakai Google.         │
│                                                       │
│   👑 OWNERS                                          │
│   ┌───────────────────────────────────────────┐    │
│   │ 1. Muhamad Ramadan Saputra (Rama)         │    │
│   │    📧 rama@gmail.com                      │    │
│   │    📱 +6281xxx                            │    │
│   │    Role: Super Admin                      │    │
│   │    [✏️ Edit]                              │    │
│   ├───────────────────────────────────────────┤    │
│   │ 2. [Tambah Owner...]                      │    │
│   │    📧 ...@gmail.com                       │    │
│   │    📱 +62...                              │    │
│   │    Role: Owner                            │    │
│   └───────────────────────────────────────────┘    │
│                                                       │
│   👷 CREW                                            │
│   ┌───────────────────────────────────────────┐    │
│   │ 1. [Nama Crew]                            │    │
│   │    📧 crew1@gmail.com                     │    │
│   │    📱 +62...                              │    │
│   │    Tier: ⚪ Senior  ⚪ Junior              │    │
│   │    Fee Override: (kosong = pakai default) │    │
│   ├───────────────────────────────────────────┤    │
│   │ [+ Tambah Crew]                           │    │
│   └───────────────────────────────────────────┘    │
│                                                       │
│   ℹ️ Email harus pakai Gmail (untuk login OAuth)     │
│   ℹ️ Crew akan dapat notifikasi saat di-assign event │
│                                                       │
├─────────────────────────────────────────────────────┤
│  [← Kembali]                       [Lanjut →]       │
└─────────────────────────────────────────────────────┘
```

**Field per anggota:**

| Field | Tipe | Required | Catatan |
|-------|------|----------|---------|
| Nama Lengkap | Text | ✅ | |
| Nickname | Text | ❌ | Default: nama depan |
| Email Gmail | Email | ✅ | Untuk login OAuth |
| Nomor WA | Phone | ✅ | |
| Role | Radio: Super Admin / Owner / Crew | ✅ | |
| Tier (jika Crew) | Radio: Senior / Junior | ✅ if Crew | |
| Fee Override | Number | ❌ | Pakai default tier kalau kosong |

**Pre-filled:**
- Rama (Super Admin) sudah otomatis ada (dari OAuth login)
- Slot kosong untuk Fahmi, Acuy, Iqbal sebagai Owner

**Validasi:**
- Email harus unik
- Email harus format Gmail (untuk OAuth)
- Minimal 1 Super Admin

**Action:** Klik "Lanjut" → ke Step 5.

**Saved to:** `users` table.

**Catatan penting:** Anggota tim baru bisa login pakai Google account mereka setelah onboarding selesai. Pertama kali login, status mereka jadi `active` (bukan `pending_approval`) karena udah pre-approved oleh super admin di wizard ini.

---

### 4.5 Step 5: Inventory Awal

**Judul:** "Stok Inventory Awal"

**Subjudul:** "Berapa banyak barang yang kamu punya saat ini?"

**Mockup (dengan 2 mode):**

```
┌─────────────────────────────────────────────────────┐
│  Progress: [■■■■■□□□□] Step 5 of 9                  │
├─────────────────────────────────────────────────────┤
│                                                       │
│   Stok Inventory Awal                                │
│   Catat berapa banyak barang yang kamu punya hari   │
│   ini.                                                │
│                                                       │
│   Pilih cara input:                                  │
│   ⦿ Smart Form (recommended untuk pemula)           │
│   ⦾ Bulk Import CSV (untuk advanced user)           │
│                                                       │
│   ─────────────────────────────────────────────     │
│                                                       │
│   📦 KONSUMABEL                                      │
│                                                       │
│   ┌───────────────────────────────────────────┐    │
│   │ Sleeve 2R                                 │    │
│   │ Stok saat ini: [____] pcs                 │    │
│   │ Min alert: [____] pcs                     │    │
│   │ Harga beli rata-rata: Rp [____] /pcs      │    │
│   ├───────────────────────────────────────────┤    │
│   │ Sleeve 4R                                 │    │
│   │ ...                                        │    │
│   ├───────────────────────────────────────────┤    │
│   │ Media Set 4R (1400 pcs/box)              │    │
│   │ Stok saat ini: [_] box + [____] pcs       │    │
│   │ ...                                        │    │
│   ├───────────────────────────────────────────┤    │
│   │ Flashdisk                                 │    │
│   │ Pouch                                     │    │
│   │ Photomagnet                               │    │
│   │ Keychain Acrylic                          │    │
│   │ ...                                        │    │
│   └───────────────────────────────────────────┘    │
│                                                       │
│   🔧 ALAT & GEAR (Equipment)                         │
│                                                       │
│   ☑ Saya punya item ini (centang yang relevan)      │
│                                                       │
│   ☑ Camera Sony A7         Qty: [_]  Harga: [____]  │
│   ☐ Camera Sony A7C        Qty: [_]                 │
│   ☑ Printer DNP DS620A     Qty: [_]                 │
│   ☐ Printer Selphy CP1300  Qty: [_]                 │
│   ☑ Lighting Setup         Qty: [_]                 │
│   ... (daftar lengkap dari template)                │
│                                                       │
│   [+ Tambah Item Custom]                             │
│                                                       │
├─────────────────────────────────────────────────────┤
│  [← Kembali]                       [Lanjut →]       │
└─────────────────────────────────────────────────────┘
```

**Mode Bulk CSV:**

```
   Mode: Bulk Import CSV
   ─────────────────────────────────────────────
   
   1. Download template CSV:
      [📥 template_inventory_consumables.csv]
      [📥 template_inventory_equipment.csv]
   
   2. Isi data di Excel/Sheets
   
   3. Upload kembali:
      [📁 Pilih File CSV]
   
   ✓ Validasi format otomatis
   ✓ Preview sebelum import
   ✓ Bisa undo kalau salah
```

**Pre-seeded items:** Lihat template CSV di folder `csv-templates/`. Semua item dari inventory v1 sudah ada di template.

**Validasi:**
- Stok ≥ 0
- Min alert ≥ 0 (boleh 0)
- Harga ≥ 0
- Untuk equipment: kondisi default `normal`, lokasi default `gudang_pusat`

**Saved to:** `inventory_items` table (initial state) + `stock_movements` (initial 'in' entries dengan source: 'manual_adjust', description: 'Initial stock from onboarding').

**Catatan:** Saat user save Step 5, sistem otomatis bikin stock_movement entries supaya `current_stock` calculation tetap akurat.

**Action:** Klik "Lanjut" → ke Step 6.

---

### 4.6 Step 6: Saldo Awal

**Judul:** "Saldo Awal Bank"

**Subjudul:** "Berapa saldo di setiap rekening per tanggal go-live?"

**Mockup:**

```
┌─────────────────────────────────────────────────────┐
│  Progress: [■■■■■■□□□] Step 6 of 9                  │
├─────────────────────────────────────────────────────┤
│                                                       │
│   Saldo Awal Bank                                    │
│   Catat saldo per rekening saat ini.                 │
│                                                       │
│   Tanggal Go-Live: [📅 06/05/2026]                  │
│                                                       │
│   ─────────────────────────────────────────────     │
│                                                       │
│   💵 Kas Tunai                                       │
│   Saldo: Rp [____________]                           │
│                                                       │
│   🏦 Bank BCA                                        │
│   No. Rekening: [____________]                       │
│   Atas Nama: [____________]                          │
│   Saldo: Rp [____________]                           │
│   ☑ Set sebagai rekening default penerima            │
│                                                       │
│   🏦 Bank Mandiri                                    │
│   No. Rekening: [____________]                       │
│   Atas Nama: [____________]                          │
│   Saldo: Rp [____________]                           │
│                                                       │
│   🏦 Bank BSI                                        │
│   No. Rekening: [____________]                       │
│   Atas Nama: [____________]                          │
│   Saldo: Rp [____________]                           │
│                                                       │
│   [+ Tambah Rekening Lain]                           │
│                                                       │
│   ℹ️ Saldo ini dicatat sebagai "Modal Awal" di       │
│      laporan keuangan.                                │
│                                                       │
├─────────────────────────────────────────────────────┤
│  [← Kembali]                       [Lanjut →]       │
└─────────────────────────────────────────────────────┘
```

**Pre-filled rekening (dari schema seed):**
- Kas Tunai (COA 1-100)
- Bank BCA (COA 1-110, default)
- Bank Mandiri (COA 1-111)
- Bank BSI (COA 1-112)

**Saved to:**
- `bank_accounts` table (update account_number, account_holder)
- `journal_entries` + `journal_lines`: Initial balance entries
  - Debit: Bank account (1-1xx)
  - Credit: Modal Owner (3-100)
  - Description: "Saldo awal Tetra Ops go-live {tanggal}"

**Validasi:**
- Saldo ≥ 0 (boleh 0 kalau rekening kosong)
- Tanggal go-live tidak boleh di masa depan

**Action:** Klik "Lanjut" → ke Step 7.

---

### 4.7 Step 7: Klien Eksisting (Opsional)

**Judul:** "Klien Lama"

**Subjudul:** "Punya database klien dari sistem lama? (Boleh skip kalau ga ada)"

**Mockup:**

```
┌─────────────────────────────────────────────────────┐
│  Progress: [■■■■■■■□□] Step 7 of 9                  │
├─────────────────────────────────────────────────────┤
│                                                       │
│   Klien Lama (Opsional)                              │
│                                                       │
│   ℹ️ Tidak ada klien lama untuk di-import?           │
│      Klik Skip — kamu bisa input klien baru saat    │
│      booking nanti.                                   │
│                                                       │
│   Cara import:                                       │
│   ⦿ Skip (recommended)                              │
│   ⦾ Import via CSV                                  │
│                                                       │
│   ─────────────────────────────────────────────     │
│                                                       │
│   Mode: Import via CSV                               │
│                                                       │
│   1. Download template:                              │
│      [📥 template_clients.csv]                       │
│                                                       │
│   2. Isi data klien lama yang masih aktif           │
│      (yang berpotensi booking lagi)                  │
│                                                       │
│   3. Upload kembali:                                 │
│      [📁 Pilih File CSV]                             │
│                                                       │
│   Format kolom:                                      │
│   - nama_klien                                       │
│   - whatsapp                                         │
│   - email (opsional)                                 │
│   - kategori_event_terakhir                          │
│   - tanggal_event_terakhir                           │
│   - notes                                            │
│                                                       │
├─────────────────────────────────────────────────────┤
│  [← Kembali]    [Skip Step Ini]    [Lanjut →]       │
└─────────────────────────────────────────────────────┘
```

**Default behavior:** Skip. User klik "Skip Step Ini" → langsung ke Step 8.

**Saved to:** `clients` table (kalau ada — V1 ngga punya tabel ini secara explicit, info klien embedded di `events` table; CSV import bisa skip aja).

**Catatan teknis:** Karena V1 ga punya tabel `clients` yang separate, step ini sebenarnya hanya pre-populate suggestion list untuk autocomplete saat booking. Kalau skip, autocomplete tetap bisa kerja dari history events.

**Action:** Klik "Lanjut" atau "Skip" → ke Step 8.

---

### 4.8 Step 8: Active Events

**Judul:** "Event yang Sudah Di-Booking"

**Subjudul:** "Punya event yang udah di-booking dan akan datang? Input di sini."

**Mockup:**

```
┌─────────────────────────────────────────────────────┐
│  Progress: [■■■■■■■■□] Step 8 of 9                  │
├─────────────────────────────────────────────────────┤
│                                                       │
│   Event yang Sudah Di-Booking                        │
│   Tambahkan event yang sudah confirm dan akan       │
│   datang dalam beberapa minggu/bulan ke depan.       │
│                                                       │
│   ⦿ Saya tidak punya event aktif (skip)             │
│   ⦾ Saya punya event aktif: [_] event               │
│                                                       │
│   ─────────────────────────────────────────────     │
│                                                       │
│   Event 1 of 3                                       │
│                                                       │
│   Klien:                                             │
│   ┌───────────────────────────────────────────┐    │
│   │ Nama klien: [____________________]        │    │
│   │ WA: [+62____________]                     │    │
│   │ Email: [____________] (opsional)          │    │
│   └───────────────────────────────────────────┘    │
│                                                       │
│   Sumber:                                            │
│   ⦿ Direct  ⦾ Vendor/EO  ⦾ Relasi                  │
│                                                       │
│   Acara:                                             │
│   ┌───────────────────────────────────────────┐    │
│   │ Kategori: ⦿ Pernikahan ⦾ Khitanan ⦾...   │    │
│   │ Tanggal: [📅 ____________]                │    │
│   │ Jam Mulai: [⏰ ____]                       │    │
│   │ Lokasi: [____________________]             │    │
│   └───────────────────────────────────────────┘    │
│                                                       │
│   Paket:                                             │
│   ┌───────────────────────────────────────────┐    │
│   │ Pilih paket: [▼ ...]                      │    │
│   │ Add-on: [ pilih multi ▼ ]                  │    │
│   └───────────────────────────────────────────┘    │
│                                                       │
│   Keuangan:                                          │
│   ┌───────────────────────────────────────────┐    │
│   │ Grand Total: Rp [____________]            │    │
│   │ DP yang sudah masuk: Rp [____________]    │    │
│   │ Masuk ke: [▼ Bank BCA]                    │    │
│   └───────────────────────────────────────────┘    │
│                                                       │
│   [💾 Simpan & Tambah Event Berikutnya]              │
│                                                       │
│   ────────────────────────────────────────────       │
│   Event 1: Afra & Roif - Pernikahan - 12/05/26  ✓  │
│   Event 2: (belum diisi)                             │
│   Event 3: (belum diisi)                             │
│                                                       │
├─────────────────────────────────────────────────────┤
│  [← Kembali]                       [Lanjut →]       │
└─────────────────────────────────────────────────────┘
```

**Field minimum (versi simplified vs booking form):**

| Field | Required |
|-------|----------|
| Nama Klien | ✅ |
| WA Klien | ✅ |
| Email Klien | ❌ |
| Channel (Direct/Vendor/Relasi) | ✅ |
| Kategori Acara | ✅ |
| Tanggal Acara | ✅ |
| Jam Mulai Cetak | ✅ |
| Lokasi/Venue | ✅ |
| Paket | ✅ (pilih dari yang ada di Step 3) |
| Add-on | ❌ |
| Grand Total | ✅ (auto-fill dari paket + add-on, bisa override) |
| DP Masuk | ❌ (kosong = belum DP) |
| Bank Penerima | ✅ if DP > 0 |

**Behavior:**
- User input event satu per satu
- Klik "Simpan & Tambah Event Berikutnya" → save event ke list, kosongkan form, tambah counter
- Kalau ngga ada event lagi, klik "Lanjut →"

**Saved to:**
- `events` table (per event)
- `event_addons` (kalau ada)
- `payments` (kalau DP > 0)
- `journal_entries` (revenue accrual + cash receipt)

**Status default:** `confirmed` kalau DP ada, `draft` kalau belum DP.

**Catatan:** Crew assignment **belum** di-input di onboarding. Itu dikerjakan setelah onboarding selesai, lewat menu Operations Edit per event. Cara ini dipilih karena assignment crew sering berubah dan tergantung availability.

**Action:** Klik "Lanjut" → ke Step 9.

---

### 4.9 Step 9: Done & Tutorial

**Judul:** "Selamat! Setup Selesai 🎉"

**Subjudul:** "Tetra Ops siap dipakai."

**Mockup:**

```
┌─────────────────────────────────────────────────────┐
│  Progress: [■■■■■■■■■] Step 9 of 9 — DONE!          │
├─────────────────────────────────────────────────────┤
│                                                       │
│         🎉🎊                                          │
│                                                       │
│   Selamat! Setup Selesai.                            │
│   Tetra Ops siap dipakai.                            │
│                                                       │
│   Ringkasan setup:                                   │
│                                                       │
│   ┌─────────────┬─────────────┬─────────────┐      │
│   │ 12          │ 6           │ Rp 27jt     │      │
│   │ Tim Aktif   │ Bank Akun   │ Saldo Total │      │
│   └─────────────┴─────────────┴─────────────┘      │
│                                                       │
│   ┌─────────────┬─────────────┬─────────────┐      │
│   │ 32          │ 7           │ 3           │      │
│   │ Paket       │ Add-on      │ Active Event│      │
│   └─────────────┴─────────────┴─────────────┘      │
│                                                       │
│   ─────────────────────────────────────────────     │
│                                                       │
│   📺 Tutorial Cepat (2 menit):                       │
│   ┌───────────────────────────────────────────┐    │
│   │  ▶ [Video Tutorial Embed]                  │    │
│   │     "Cara Pakai Tetra Ops Sehari-hari"    │    │
│   └───────────────────────────────────────────┘    │
│                                                       │
│   Yang bisa kamu lakukan sekarang:                   │
│   ✅ Buat booking pertama                            │
│   ✅ Lihat event aktif di Operations                 │
│   ✅ Setup crew assignment per event                 │
│   ✅ Ajak tim onboarding (kirim link login)         │
│                                                       │
│   ┌───────────────────────────────────────────┐    │
│   │  [🚀 Mulai Pakai Tetra Ops]               │    │
│   └───────────────────────────────────────────┘    │
│                                                       │
│   ─────────────────────────────────────────────     │
│                                                       │
│   📚 Butuh bantuan?                                  │
│   - Cek dokumentasi di /docs                         │
│   - Hubungi developer kalau ada bug                  │
│                                                       │
└─────────────────────────────────────────────────────┘
```

**On submit:**
1. `system_config.is_initialized = true` (set permanen)
2. Trigger notifikasi welcome ke semua tim yang udah di-add
3. Redirect ke `/dashboard`

**Behavior penting:**
- Setelah klik "Mulai Pakai Tetra Ops", wizard **tidak bisa muncul lagi** otomatis
- Kalau ada salah input di onboarding, fix manual via Settings (untuk master data) atau Operations (untuk events)
- Reset wizard hanya bisa via Super Admin → Settings → Danger Zone (dengan konfirmasi 2x)

---

## 5. Resume Capability

Kalau user tutup browser di tengah wizard:

**Skenario:** User selesai Step 4, tutup browser.

**Saat login lagi:**

```
┌─────────────────────────────────────────────────────┐
│                                                       │
│   👋 Halo Rama!                                      │
│                                                       │
│   Setup Tetra Ops belum selesai.                     │
│   Mau lanjut dari Step 5: Inventory Awal?            │
│                                                       │
│   Progress: [■■■■□□□□□] 4 of 9 selesai              │
│                                                       │
│   [▶ Lanjutkan Setup]    [Mulai Ulang dari Awal]    │
│                                                       │
└─────────────────────────────────────────────────────┘
```

**Auto-save mechanism:**
- Setiap "Lanjut" simpan draft state ke `system_config` dengan key `onboarding_draft`
- Format: `{ current_step: 5, completed_steps: [1,2,3,4], draft_data: { step_3: {...}, step_4: {...} } }`
- Step 5 akan di-prefill kalau ada draft

---

## 6. Edge Cases

### 6.1 Email duplicate di Step 4

**Skenario:** User input email yang sama 2x.

**Behavior:** Validasi inline → "Email ini udah dipakai oleh anggota lain."

### 6.2 Saldo bank negatif

**Skenario:** User input saldo negatif (misal Rp -500.000).

**Behavior:** Validasi inline → "Saldo ngga boleh minus. Kalau ada utang/overdraft, catat di Liabilities setelah onboarding."

### 6.3 Tanggal event di masa lalu (Step 8)

**Skenario:** User input event tanggal kemarin.

**Behavior:** Warning, bukan blocker. "Tanggal event di masa lalu — yakin? Kalau event udah selesai, lebih baik input setelah onboarding via menu Operations."

Boleh tetap save dengan konfirmasi.

### 6.4 Tidak ada paket aktif di Step 3

**Skenario:** User disable semua paket.

**Behavior:** Validasi → "Minimal 1 paket harus aktif untuk bisa terima booking."

### 6.5 User skip Step 4 (Tim Kamu)

**Skenario:** User berusaha skip step ini (tidak bisa, Step 4 mandatory).

**Behavior:** Tombol "Skip" tidak muncul di Step 4.

---

## 7. Implementasi Catatan untuk Developer

### 7.1 Atomic Save di Step 9

Saat user klik "Mulai Pakai Tetra Ops" di Step 9, semua data dari draft di-commit dalam **1 transaksi atomic**:

```ts
'use server';

export async function completeOnboarding() {
  const supabase = await createClient();
  
  // Begin transaction (via Supabase RPC function)
  const { data, error } = await supabase.rpc('complete_onboarding', {
    business_profile: draftData.step_2,
    master_data_overrides: draftData.step_3,
    team_members: draftData.step_4,
    inventory: draftData.step_5,
    bank_balances: draftData.step_6,
    clients: draftData.step_7,
    active_events: draftData.step_8,
  });
  
  if (error) {
    // Rollback handled by Postgres
    return { success: false, error };
  }
  
  // Set is_initialized = true
  await supabase.from('system_config').update({ value: 'true' }).eq('key', 'is_initialized');
  
  // Cleanup draft
  await supabase.from('system_config').delete().eq('key', 'onboarding_draft');
  
  // Trigger welcome notifications
  await sendWelcomeNotifications();
  
  revalidatePath('/');
  return { success: true };
}
```

### 7.2 Draft State Storage

Draft data disimpan di `system_config` dengan key `onboarding_draft`:

```json
{
  "current_step": 5,
  "completed_steps": [1, 2, 3, 4],
  "started_at": "2026-05-06T09:00:00Z",
  "last_updated_at": "2026-05-06T09:30:00Z",
  "draft_data": {
    "step_2": { "business_name": "Tetra Photobooth", ... },
    "step_3": { "disabled_packages": [], "custom_packages": [] },
    "step_4": { "team_members": [...] },
    "step_5": { "inventory": {...} }
  }
}
```

### 7.3 Step Validation Per Step

Setiap step punya Zod schema sendiri di `lib/validations/onboarding.ts`:

```ts
export const Step2Schema = z.object({
  businessName: z.string().min(1),
  businessTagline: z.string().optional(),
  businessAddress: z.string().min(5),
  businessEmail: z.string().email(),
  businessPhone: z.string().regex(/^(\+62|0)[0-9]{9,12}$/),
  businessLogo: z.instanceof(File).optional(),
});

// dan seterusnya untuk Step3Schema, Step4Schema, dll.
```

### 7.4 Reset Wizard (Danger Zone)

Super admin bisa reset wizard via Settings → Danger Zone:

```
⚠️ DANGER ZONE

Reset Onboarding Wizard
Ini akan menghapus SEMUA data dan menjalankan ulang setup wizard.
Tindakan ini TIDAK BISA dibatalkan.

Ketik "RESET TETRA OPS" untuk konfirmasi:
[__________________]

[⚠️ Reset Sekarang]
```

Reset behavior:
- Truncate semua tabel kecuali `users` dan `system_config`
- Set `system_config.is_initialized = false`
- Wizard muncul lagi saat next login

---

## 8. Skenario Pengguna

### 8.1 First-Time User (Rama)

**Konteks:** Rama baru deploy Tetra Ops, login pertama kali.

**Flow:**
1. Login via Google → langsung ke Wizard Step 1
2. Lewatin 9 step dengan input data
3. Selesai dalam ~45 menit
4. Mendarat di Dashboard yang sudah ada data realistis
5. Bisa langsung buat booking baru

### 8.2 Restart di Tengah Jalan

**Konteks:** Rama mulai onboarding, baterai laptop habis di Step 5.

**Flow:**
1. Buka laptop lagi, login ulang
2. Lihat banner "Lanjutkan setup di Step 5?"
3. Klik "Lanjutkan" → langsung ke Step 5 dengan draft data dari Step 1-4 sudah tersimpan
4. Lanjut sampai Step 9

### 8.3 Salah Input di Onboarding

**Konteks:** Rama selesai onboarding tapi sadar ada saldo bank yang salah.

**Flow:**
1. Onboarding udah selesai, ngga bisa balik ke wizard
2. Buka Settings → Bank Accounts → edit saldo (tapi ini akan butuh adjustment journal entry, bukan langsung edit)
3. Atau: bikin manual journal entry di Omni Finance untuk koreksi

**Tip untuk user:** Hati-hati saat input saldo awal — kesalahan di sini perlu manual correction.

---

## 9. Testing Checklist

Sebelum onboarding wizard dilaunch ke production, test skenario-skenario ini:

- [ ] Happy path: input data lengkap, semua valid → sukses
- [ ] Resume: tutup browser di Step 4, login lagi → resume di Step 4
- [ ] Validasi: email duplicate, phone format salah, saldo negatif → error inline
- [ ] Skip: Step 7 dan 8 bisa di-skip
- [ ] Atomic save: kalau error di Step 9, semua rollback (data sebelumnya tidak ter-create)
- [ ] Re-trigger: setelah onboarding selesai, ngga bisa muncul lagi
- [ ] Master data toggle: disable beberapa paket, di-respect saat booking nanti
- [ ] Initial inventory: stock_movements ke-create dengan benar
- [ ] Initial bank balance: journal entries ke-create dengan benar (Bank Dr, Modal Cr)
- [ ] Active events: kalau DP > 0, payment + journal entry ke-create

---

**End of Onboarding Wizard Doc**

*Next document: [14_CSV_TEMPLATES.md](./14_CSV_TEMPLATES.md)*
