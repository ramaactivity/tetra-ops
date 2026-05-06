# 14 — CSV Templates (Panduan Import Massal)

**Project:** Tetra Ops
**Bahasa:** Indonesia
**Tujuan:** Dokumentasi format CSV untuk bulk import data ke Tetra Ops, terutama saat onboarding atau update massal.

---

## 1. Daftar Template

Semua file template CSV ada di folder `csv-templates/`:

| File | Untuk | Gunakan saat |
|------|-------|--------------|
| `template_packages.csv` | Master Paket | Onboarding atau tambah paket baru |
| `template_addons.csv` | Master Add-on | Onboarding atau tambah add-on baru |
| `template_inventory_consumables.csv` | Stok konsumabel awal | Onboarding Step 5 |
| `template_inventory_equipment.csv` | Daftar alat & gear | Onboarding Step 5 |
| `template_master_crew.csv` | Anggota tim | Onboarding Step 4 (alternatif manual) |
| `template_active_events.csv` | Event aktif yang sudah di-booking | Onboarding Step 8 |

---

## 2. Aturan Umum CSV

### 2.1 Format File

- **Encoding:** UTF-8 (penting agar karakter Indonesia tidak rusak)
- **Delimiter:** Koma (`,`)
- **Text qualifier:** Tanda kutip ganda (`"`) untuk text yang mengandung koma
- **Header row:** WAJIB ada di baris pertama
- **Tanggal:** Format `YYYY-MM-DD` (e.g., `2026-05-06`)
- **Waktu:** Format `HH:MM` 24 jam (e.g., `13:30`, `19:00`)
- **Angka uang (IDR):** Hanya angka, tanpa titik/koma/Rp (e.g., `2500000` untuk Rp 2.500.000)
- **Boolean:** `true` atau `false` (lowercase)

### 2.2 Cara Edit di Excel/Google Sheets

**Excel:**
1. Buka template CSV
2. Excel mungkin convert tanggal otomatis — **format kolom tanggal sebagai Text** sebelum input
3. Save As → CSV UTF-8 (Comma delimited)

**Google Sheets:**
1. File → Import → Upload CSV
2. Edit data
3. File → Download → CSV (.csv)
4. Lebih aman daripada Excel (less auto-formatting issues)

### 2.3 Contoh CSV yang Benar

```csv
name,unit,price,is_active
"Voucher Photobooth",100 pcs,25000,true
"Photomagnet, 50 cetak",50 cetak,350000,true
```

Note: nama dengan koma harus di-quote (`"Photomagnet, 50 cetak"`).

### 2.4 Validasi saat Import

Sistem akan validasi:
- Header sesuai template
- Tipe data per kolom benar
- Field required tidak kosong
- Foreign key valid (e.g., paket yang direferensikan ada)

Kalau ada error, sistem tampilkan **row-by-row error report**, bisa fix di Excel terus re-upload.

---

## 3. Detail Per Template

### 3.1 `template_packages.csv` — Master Paket

**Header:**
```csv
name,category,frame_size,duration_hours,base_price,description,is_active
```

**Kolom:**

| Kolom | Tipe | Required | Contoh | Catatan |
|-------|------|----------|--------|---------|
| `name` | Text | ✅ | "2R Unlimited 3 Jam" | Nama paket lengkap |
| `category` | Enum | ✅ | `photobooth_classic` | Lihat tabel di bawah |
| `frame_size` | Enum | ✅ | `2R` | `2R`, `4R`, `polaroid`, atau `none` |
| `duration_hours` | Integer | ✅ | `3` | Durasi paket dalam jam |
| `base_price` | Integer | ✅ | `2500000` | Harga dalam IDR (tanpa titik) |
| `description` | Text | ❌ | "Photobooth dengan unlimited cetak" | Deskripsi marketing |
| `is_active` | Boolean | ❌ | `true` | Default: `true` |

**Nilai enum `category` yang valid:**

| Value | Untuk |
|-------|-------|
| `photobooth_classic` | Photobooth Classic (2R/4R/Polaroid) |
| `videobooth_360` | Videobooth 360 spin |
| `magazine_combo` | Magazine Box + Photobooth |
| `magazine_box_only` | Magazine Box saja |
| `photostage_only` | Photo Stage saja |
| `photostage_combo` | Photo Stage + Photobooth |

**Sample data (sudah pre-filled di template):**

```csv
name,category,frame_size,duration_hours,base_price,description,is_active
"2R Unlimited 2 Jam",photobooth_classic,2R,2,2000000,"Photobooth classic dengan cetak 2R unlimited 2 jam",true
"2R Unlimited 3 Jam",photobooth_classic,2R,3,2500000,"Photobooth classic dengan cetak 2R unlimited 3 jam",true
"4R Unlimited 3 Jam",photobooth_classic,4R,3,2500000,"Photobooth classic dengan cetak 4R unlimited 3 jam",true
"Videobooth 360 - 3 Jam",videobooth_360,none,3,3000000,"360 Spin Videobooth 3 jam",true
```

---

### 3.2 `template_addons.csv` — Master Add-on

**Header:**
```csv
name,unit,price,category,requires_extra_crew,is_active
```

**Kolom:**

| Kolom | Tipe | Required | Contoh | Catatan |
|-------|------|----------|--------|---------|
| `name` | Text | ✅ | "Voucher Photobooth" | |
| `unit` | Text | ✅ | "100 pcs" | Satuan jual (e.g., "100 pcs", "1 jam") |
| `price` | Integer | ✅ | `25000` | Harga per unit dalam IDR |
| `category` | Enum | ✅ | `voucher` | Lihat di bawah |
| `requires_extra_crew` | Boolean | ❌ | `false` | Apakah butuh crew tambahan |
| `is_active` | Boolean | ❌ | `true` | Default: `true` |

**Nilai enum `category` yang valid:**

| Value | Untuk |
|-------|-------|
| `voucher` | Voucher photobooth |
| `print_extras` | Cetak tambahan (photomagnet, etc.) |
| `time_extras` | Tambahan waktu (break time, extend) |
| `experience` | Pengalaman tambahan (guest book, album) |
| `costume` | Properti kostum |

**Sample data (sudah pre-filled):**

```csv
name,unit,price,category,requires_extra_crew,is_active
"Voucher Photobooth","100 pcs",25000,voucher,false,true
"Guest Books Photo","25 lembar",200000,experience,false,true
"Photomagnet","50 cetak",350000,print_extras,false,true
"Break Time / 1 Jam","1 Jam",150000,time_extras,false,true
"Album Photostripe","20 halaman",100000,experience,false,true
"Costume Sleeve","1000 lembar",1500000,costume,false,true
"Keychain Photobooth Station","pcs",10000,experience,true,true
```

---

### 3.3 `template_inventory_consumables.csv` — Stok Konsumabel

**Header:**
```csv
sku,name,unit,unit_conversion,coa_account,min_stock_alert,purchase_price_avg,initial_stock,selling_price,notes
```

**Kolom:**

| Kolom | Tipe | Required | Contoh | Catatan |
|-------|------|----------|--------|---------|
| `sku` | Text | ✅ | `ITM-SLEEVE-2R` | Unique identifier |
| `name` | Text | ✅ | "Sleeve 2R" | Nama display |
| `unit` | Text | ✅ | `pcs` | Satuan dasar |
| `unit_conversion` | JSON | ❌ | `{"box":1400,"pcs":1}` | Konversi satuan |
| `coa_account` | Text | ✅ | `1-201` | Kode COA dari Chart of Accounts |
| `min_stock_alert` | Integer | ✅ | `100` | Threshold alert stok kritis |
| `purchase_price_avg` | Integer | ✅ | `500` | Harga beli rata-rata per unit |
| `initial_stock` | Integer | ✅ | `1500` | Stok awal saat onboarding |
| `selling_price` | Integer | ❌ | (kosong) | Hanya untuk item yang dijual terpisah |
| `notes` | Text | ❌ | "Beli dari supplier X" | Catatan internal |

**Sample data:**

```csv
sku,name,unit,unit_conversion,coa_account,min_stock_alert,purchase_price_avg,initial_stock,selling_price,notes
ITM-SLEEVE-2R,"Sleeve 2R",pcs,"{}",1-201,100,500,1500,,"Sleeve untuk frame 2R"
ITM-SLEEVE-4R,"Sleeve 4R",pcs,"{}",1-201,100,800,800,,"Sleeve untuk frame 4R"
ITM-MEDIA-4R,"Media Set 4R",pcs,"{""box"":1400}",1-200,200,1200,2800,,"1 box = 1400 pcs"
ITM-MEDIA-2R,"Media Set 2R",pcs,"{""box"":1400}",1-200,200,1200,5600,,"Per sheet di-cut 4 strip 2R"
ITM-FD,"Flashdisk 8GB",pcs,"{}",1-202,5,40000,30,,"Untuk delivery softcopy"
ITM-POUCH,"Pouch Flashdisk",pcs,"{}",1-203,5,15000,30,,"Pouch fabric Tetra branded"
ITM-PHOTOMAGNET,"Photomagnet Sheet",pcs,"{}",1-204,20,7000,100,,"Per sheet 1 cetak"
ITM-KEYCHAIN-FRAME,"Acrylic Keychain Frame Bulat",pcs,"{}",1-205,30,3000,50,10000,"Dijual Rp 10k/pcs ke klien"
```

**Catatan penting:**
- `unit_conversion` adalah JSON string. Kalau di Excel, bungkus dengan double quote dan escape internal quote dengan `""`. Contoh: `"{""box"":1400}"`.
- Kalau item tidak punya konversi unit, isi dengan `{}`.
- `coa_account` harus match dengan Chart of Accounts yang udah ada di seed data (1-200 sampai 1-209 untuk persediaan).

---

### 3.4 `template_inventory_equipment.csv` — Alat & Gear

**Header:**
```csv
sku,name,category,purchase_date,purchase_price,useful_life_months,coa_account,condition,current_location,notes
```

**Kolom:**

| Kolom | Tipe | Required | Contoh | Catatan |
|-------|------|----------|--------|---------|
| `sku` | Text | ✅ | `ITM-CAM-SONY-A7-01` | Unique per unit |
| `name` | Text | ✅ | "Camera Sony A7" | |
| `category` | Text | ❌ | "Camera" | Kategori grouping (camera, printer, lighting, etc.) |
| `purchase_date` | Date | ✅ | `2024-06-15` | Format YYYY-MM-DD |
| `purchase_price` | Integer | ✅ | `15000000` | Harga beli original |
| `useful_life_months` | Integer | ✅ | `60` | Untuk hitung depresiasi |
| `coa_account` | Text | ✅ | `1-400` | Default `1-400` untuk Equipment |
| `condition` | Enum | ✅ | `normal` | `normal`, `service`, `damaged`, `lost` |
| `current_location` | Enum | ✅ | `gudang_pusat` | Lokasi saat ini |
| `notes` | Text | ❌ | "Beli baru, masih garansi" | |

**Nilai enum `condition`:**
- `normal` — bagus, siap pakai
- `service` — sedang di-service
- `damaged` — rusak, butuh perbaikan
- `lost` — hilang

**Nilai enum `current_location`:**
- `gudang_pusat` — di gudang Tetra
- `event` — sedang di event (perlu juga current_event_id, tapi di onboarding biasanya `gudang_pusat`)
- `service_center` — di tukang servis
- `crew_carry` — dibawa crew (perlu current_crew_id)

**Sample data:**

```csv
sku,name,category,purchase_date,purchase_price,useful_life_months,coa_account,condition,current_location,notes
ITM-CAM-SONY-A7-01,"Camera Sony A7 Unit 1",camera,2023-06-15,15000000,60,1-400,normal,gudang_pusat,"Beli baru tahun 2023"
ITM-CAM-SONY-A7-02,"Camera Sony A7 Unit 2",camera,2024-01-20,16000000,60,1-400,normal,gudang_pusat,""
ITM-PRINTER-DNP-01,"Printer DNP DS620A Unit 1",printer,2023-03-10,18000000,48,1-400,normal,gudang_pusat,""
ITM-LIGHT-GODOX-01,"Lighting Godox AD200",lighting,2024-08-05,4500000,36,1-400,normal,gudang_pusat,""
ITM-LAPTOP-MBP-01,"Macbook Pro M2",laptop,2023-09-12,28000000,48,1-400,normal,gudang_pusat,"Untuk operasional booth"
ITM-FRAME-2R-01,"Frame 2R Set",props,2023-05-01,500000,24,1-400,normal,gudang_pusat,""
ITM-FRAME-4R-01,"Frame 4R Set",props,2023-05-01,750000,24,1-400,normal,gudang_pusat,""
ITM-BACKDROP-MERAH,"Backdrop Kain Merah",props,2024-02-15,800000,36,1-400,normal,gudang_pusat,""
ITM-BACKDROP-GOLD,"Backdrop Kain Gold",props,2024-02-15,800000,36,1-400,normal,gudang_pusat,""
ITM-BACKDROP-PUTIH,"Backdrop Kain Putih",props,2024-02-15,800000,36,1-400,normal,gudang_pusat,""
ITM-BACKDROP-SILVER,"Backdrop Kain Silver",props,2024-02-15,800000,36,1-400,normal,gudang_pusat,""
ITM-STAND-BOOTH-01,"Stand Booth Lengkap Set 1",stand,2023-04-20,3500000,60,1-400,normal,gudang_pusat,""
```

**Catatan:** Kalau punya banyak unit identik (e.g., 2 camera Sony A7 yang sama), kasih SKU berbeda dengan suffix unit (`-01`, `-02`).

---

### 3.5 `template_master_crew.csv` — Anggota Tim

**Header:**
```csv
full_name,nickname,email,phone_wa,role,tier,default_fee_override,bank_account,joined_date,is_active,notes
```

**Kolom:**

| Kolom | Tipe | Required | Contoh | Catatan |
|-------|------|----------|--------|---------|
| `full_name` | Text | ✅ | "Muhamad Mou" | Nama lengkap |
| `nickname` | Text | ❌ | "Mou" | Nama panggilan, untuk UI compact |
| `email` | Email | ✅ | `mou@gmail.com` | WAJIB Gmail untuk OAuth |
| `phone_wa` | Text | ✅ | `+6281234567890` | Format internasional |
| `role` | Enum | ✅ | `crew` | `super_admin`, `owner`, `crew` |
| `tier` | Enum | ❌ | `senior` | WAJIB jika role=crew. `senior` atau `junior` |
| `default_fee_override` | Integer | ❌ | (kosong) | Override fee default |
| `bank_account` | Text | ❌ | "BCA 1234567890" | Untuk reference disbursement |
| `joined_date` | Date | ❌ | `2024-01-15` | Default: hari import |
| `is_active` | Boolean | ❌ | `true` | Default: `true` |
| `notes` | Text | ❌ | "Senior crew, lead operator" | |

**Sample data:**

```csv
full_name,nickname,email,phone_wa,role,tier,default_fee_override,bank_account,joined_date,is_active,notes
"Muhamad Ramadan Saputra","Rama",rama@gmail.com,+6281234567890,super_admin,,,"BCA 0954965224",2023-01-01,true,"Owner & founder"
"Fahmi","Fahmi",fahmi@gmail.com,+6281234567891,owner,,,,2023-01-01,true,"Co-owner"
"Acuy","Acuy",acuy@gmail.com,+6281234567892,owner,,,,2023-01-01,true,"Co-owner"
"Iqbal","Iqbal",iqbal@gmail.com,+6281234567893,owner,,,,2023-01-01,true,"Co-owner"
"Mou","Mou",mou.crew@gmail.com,+6281234567894,crew,senior,,,2023-03-15,true,"Senior crew, lead operator"
"Ceca","Ceca",ceca.crew@gmail.com,+6281234567895,crew,senior,,,2023-04-01,true,"Senior crew"
"Crew 3","Crew3",crew3@gmail.com,+6281234567896,crew,junior,,,2024-01-10,true,""
"Crew 4","Crew4",crew4@gmail.com,+6281234567897,crew,junior,,,2024-02-15,true,""
```

**Catatan penting:**
- Email harus unik
- Email harus format Gmail (untuk Google OAuth)
- Minimal 1 super_admin (biasanya Rama)
- Crew tanpa tier akan ditolak validasi

---

### 3.6 `template_active_events.csv` — Event Aktif

**Header:**
```csv
project_id,channel,client_name,client_wa,client_email,event_category,event_date,start_time,setup_time,end_time,venue_name,venue_address,package_name,addons,grand_total,dp_received,bank_account_default,backdrop_color,crew_lead_email,crew_asisten_email,notes
```

**Kolom (banyak — paling kompleks):**

| Kolom | Tipe | Required | Contoh | Catatan |
|-------|------|----------|--------|---------|
| `project_id` | Text | ❌ | (kosong) | Auto-generate kalau kosong |
| `channel` | Enum | ✅ | `direct` | `direct`, `vendor`, `relasi` |
| `client_name` | Text | ✅ | "Afra & Roif" | |
| `client_wa` | Text | ✅ | `+6282210509609` | |
| `client_email` | Email | ❌ | | |
| `event_category` | Text | ✅ | "pernikahan" | Format lowercase |
| `event_date` | Date | ✅ | `2026-05-12` | YYYY-MM-DD |
| `start_time` | Time | ✅ | `19:00` | HH:MM 24h |
| `setup_time` | Time | ❌ | `17:00` | Auto = start - 2h kalau kosong |
| `end_time` | Time | ❌ | `22:00` | Auto-calc dari paket duration kalau kosong |
| `venue_name` | Text | ✅ | "Sasana Kriya TMII" | |
| `venue_address` | Text | ❌ | "Jakarta Timur" | |
| `package_name` | Text | ✅ | "2R Unlimited 3 Jam" | Harus match nama paket yang ada |
| `addons` | Text | ❌ | "Photomagnet:1,Voucher:2" | Format: `nama:qty,nama:qty` |
| `grand_total` | Integer | ✅ | `2500000` | IDR |
| `dp_received` | Integer | ❌ | `500000` | DP yang sudah masuk, kosong = belum DP |
| `bank_account_default` | Text | ❌ | `1-110` | COA bank penerima DP, default BCA |
| `backdrop_color` | Enum | ❌ | `gold` | `merah`, `gold`, `putih`, `silver`, `custom` |
| `crew_lead_email` | Email | ❌ | | Crew lead (akan di-match by email) |
| `crew_asisten_email` | Email | ❌ | | Crew asisten |
| `notes` | Text | ❌ | "Klien minta backdrop emas" | |

**Sample data:**

```csv
project_id,channel,client_name,client_wa,client_email,event_category,event_date,start_time,setup_time,end_time,venue_name,venue_address,package_name,addons,grand_total,dp_received,bank_account_default,backdrop_color,crew_lead_email,crew_asisten_email,notes
,direct,"Afra & Roif",+6282210509609,,pernikahan,2026-05-12,19:00,17:00,22:00,"Sasana Kriya TMII","Jakarta Timur","2R Unlimited 3 Jam","Photomagnet:1",2850000,500000,1-110,gold,mou.crew@gmail.com,ceca.crew@gmail.com,"Klien minta backdrop emas, hadir 200 tamu"
,vendor,"Naura Wedding",+6281122334455,naura@gmail.com,pernikahan,2026-05-25,18:00,16:00,22:00,"The Westin Jakarta","Jakarta Selatan","4R Unlimited 4 Jam","Voucher:1,Photomagnet:1",3550000,1000000,1-110,putih,ceca.crew@gmail.com,,"Vendor: WO Bella Acara"
,direct,"Gabby & Rafael",+6281234567899,,khitanan,2026-06-08,16:00,14:00,19:00,"Hotel Tentrem Yogyakarta","Yogyakarta","Polaroid Unlimited 3 Jam","",2500000,,1-110,silver,,,"Belum DP, follow-up minggu ini"
```

**Catatan:**
- `addons` format: `nama_addon:quantity,nama_addon:quantity`. Contoh: `"Photomagnet:1,Voucher Photobooth:2"`
- Status event akan di-set otomatis: `confirmed` kalau ada DP, `draft` kalau belum
- Crew assignment opsional — bisa di-set nanti via UI
- Kalau `package_name` ngga match, row di-reject dengan error message

---

## 4. Workflow Bulk Import

### 4.1 Onboarding (Step 5)

```
1. User klik "Import via CSV" di Step 5 Inventory
2. Download template_inventory_consumables.csv dan template_inventory_equipment.csv
3. Edit di Excel/Sheets, isi data inventory yang ada
4. Save sebagai CSV UTF-8
5. Upload kembali ke aplikasi
6. Sistem validasi:
   ✓ Header sesuai
   ✓ Tipe data benar
   ✓ Required fields tidak kosong
   ✓ Foreign keys valid (e.g., COA account ada)
7. Preview hasil import (tabel)
8. Konfirmasi → import committed
9. Lanjut ke Step 6
```

### 4.2 Import Setelah Onboarding (Update Massal)

Setelah onboarding selesai, masih bisa bulk import via:
- **Settings → Master Data → Items → Import CSV** (untuk inventory tambahan)
- **Settings → Master Data → Packages → Import CSV** (untuk paket baru)
- **Settings → Master Data → Crew → Import CSV** (untuk crew baru)

Active events biasanya **tidak** di-bulk import setelah go-live (input via UI booking form lebih efisien).

---

## 5. Error Handling

### 5.1 Error Validasi Tingkat File

Kalau header CSV salah:

```
❌ Format file salah

Header yang ditemukan:
  nama, satuan, harga
  
Header yang diharapkan:
  name, unit, price, category, requires_extra_crew, is_active

Pastikan kamu pakai template yang benar.
[Download Template Lagi]
```

### 5.2 Error Validasi Per Row

Kalau ada row yang gagal validasi:

```
⚠️ 47 dari 50 row berhasil. 3 row gagal.

Detail error:
  Row 12: "ITM-SLEEVE-2R" — SKU sudah ada (duplicate)
  Row 28: "Lighting" — coa_account "1-999" tidak ditemukan
  Row 45: "Camera X" — purchase_date format salah ("15/06/2024" → harus "2024-06-15")

[Download Error Report] [Edit & Re-upload]
```

User pilihan:
- Download error report (CSV dengan error per row)
- Fix di Excel/Sheets
- Re-upload (sistem detect mana yang udah pernah berhasil, skip duplicate)

---

## 6. Tips Praktis

### 6.1 Copy-Paste dari Sistem Lama

Kalau punya data di Apps Script v1 atau di Excel sebelumnya:

1. Buka Sheets/Excel sumber
2. Buka template Tetra Ops
3. Copy data per kolom (jangan sekaligus semua kolom — mapping kolom mungkin beda)
4. Paste ke template
5. Save & upload

### 6.2 Handle Special Characters

- Karakter `"` di dalam text: escape dengan `""` (double quote)
- Karakter `,` di dalam text: bungkus seluruh field dengan `"..."`

Contoh:
```
"Sleeve 2R, Premium"      ✓ Field dengan koma di-quote
"Klien bilang ""bagus""" ✓ Quote internal di-escape
```

### 6.3 Tanggal di Excel

Excel sering convert tanggal otomatis. Solusi:
1. Format kolom tanggal sebagai **Text** dulu sebelum input
2. Atau pakai prefix `'` di sel: `'2026-05-12` (Excel akan treat as text)
3. Saat save CSV, pastikan format tanggal masih benar (buka file CSV di text editor untuk verify)

### 6.4 Bulk Generate SKU

Kalau punya banyak inventory, generate SKU pakai formula Sheets:

```
=CONCATENATE("ITM-",UPPER(SUBSTITUTE(B2," ","-")))
```

Contoh: nama "Sleeve 2R" → SKU "ITM-SLEEVE-2R"

---

## 7. Update Template

Kalau di masa depan ada perubahan schema (kolom baru, dll.), template di-update.

**Versioning:**
- Template selalu memberikan kolom baru di akhir, dengan default value
- Old CSV tetap bisa di-import (kolom baru auto-fill default)
- Notif kalau template usang: "Template kamu versi lama. [Download Versi Terbaru]"

---

## 8. FAQ

**Q: Saya import 100 item, tapi ada 5 yang gagal. Apakah 95 lainnya sudah masuk?**
A: Tergantung mode. Default Tetra Ops pakai **transactional mode** — kalau ada error, ngga ada yang masuk (rollback). Bisa pilih **partial mode** (import yang berhasil, skip yang error) di import dialog.

**Q: Saya udah import, tapi datanya salah. Bisa rollback?**
A: Tidak ada one-click rollback. Tapi bisa:
1. Filter di UI (e.g., Inventory Items) → pilih yang baru di-import → bulk delete
2. Atau pakai SQL Editor di Supabase Dashboard kalau perlu rollback technical

**Q: Bisa import data yang sama 2x?**
A: Sistem detect duplicate by unique field (SKU untuk inventory, email untuk crew, project_id untuk events). Kalau duplicate, default behavior: skip dengan warning.

**Q: Harus pake CSV semua, atau bisa Excel/Sheets juga?**
A: Wajib CSV. Tapi bisa edit di Excel/Sheets dulu, terus save as CSV. Penting: encoding UTF-8.

**Q: Kalau saya pengen test dulu sebelum live?**
A: Onboarding wizard adalah environment "fresh start". Kalau salah, bisa reset via Danger Zone (super admin only) dan jalankan ulang.

---

## 9. File CSV Templates

File aktual ada di folder `csv-templates/` di repo. List file:

- `csv-templates/template_packages.csv`
- `csv-templates/template_addons.csv`
- `csv-templates/template_inventory_consumables.csv`
- `csv-templates/template_inventory_equipment.csv`
- `csv-templates/template_master_crew.csv`
- `csv-templates/template_active_events.csv`

Setiap file sudah ada **sample data** yang siap dipakai sebagai pre-seed atau referensi format.

---

**End of CSV Templates Doc**

*Selanjutnya: file CSV aktual di folder `csv-templates/` — lihat di repo.*
