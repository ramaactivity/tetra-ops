# Kontrak Integrasi Tetra Ops ↔ Tetra Booth

Versi: **0.4 (draf, disepakati teknis oleh sesi Booth 2026-10-06; menunggu persetujuan owner dan jadwal)**.
Pemilik dokumen: repo `tetra-ops`. Setiap perubahan dicatat juga di `TETRA BOOTH APP/handoff/OPS-BOOTH-SYNC.md` **sebelum** deploy.

## 0. Prinsip

- **Ops** mengurus semua hal sebelum acara: booking, pembayaran, desain frame, crew, dan keuangan. **Booth** mengurus acara dan foto.
- Semua perubahan bersifat aditif. Field lama tidak dihapus atau diganti artinya tanpa kesepakatan tertulis di papan sinkron.
- Data keuangan (harga, pembayaran, komisi) tidak pernah dikirim ke Booth.
- Kalau env integrasi kosong, fitur integrasi mati diam-diam. Tidak ada error ke pengguna.
- Waktu memakai ISO 8601. Tanggal acara berupa `YYYY-MM-DD` waktu WIB. Jam berupa `HH:MM` waktu WIB.

## 1. Env

| Sisi | Nama | Isi |
|---|---|---|
| Ops | `BOOTH_API_TOKEN` | (sudah ada) Bearer yang dipakai Booth untuk membaca `/api/booth/*`. |
| Ops | `TETRA_BOOTH_URL` | Base URL web Booth, mis. `https://booth.tetraphoto.com`. Kalau kosong, webhook dan pembacaan galeri mati. |
| Ops | `TETRA_BOOTH_WEBHOOK_SECRET` | Rahasia HMAC untuk webhook Ops → Booth. |
| Ops | `TETRA_BOOTH_API_TOKEN` | Bearer yang dipakai Ops untuk `GET {TETRA_BOOTH_URL}/api/ops/...`. |
| Booth | `TETRA_OPS_URL`, `TETRA_OPS_TOKEN` | (sudah ada) Pasangan dari `BOOTH_API_TOKEN`. |
| Booth | `TETRA_OPS_WEBHOOK_SECRET` | Nilainya sama dengan `TETRA_BOOTH_WEBHOOK_SECRET`. |
| Booth | `TETRA_OPS_API_TOKEN` | Nilainya sama dengan `TETRA_BOOTH_API_TOKEN`. |

## 2. Booth membaca dari Ops: `GET /api/booth/bookings`

Auth: `Authorization: Bearer <BOOTH_API_TOKEN>`. Query `from`, `to` (`YYYY-MM-DD`). Defaultnya hari ini sampai +60 hari, maksimal 180 hari.

Hanya booking **resmi** yang dikirim, yaitu yang DP-nya sudah diterima. Draf portal yang belum DP tidak pernah muncul. Status event yang ikut: `draft`, `confirmed`, `upcoming`, `in_progress`. Event legacy dan event yang dihapus tidak ikut.

### 2.1 Field yang sudah ada (tetap, tidak berubah)

```
project_id, client_name, event_title, event_category, event_category_label,
event_date, start_time, end_time, venue_name, venue_city, service_type,
frame_size ("2R"|"4R"|"polaroid"|"none"|null), package_name, package_duration_hours
```

### 2.2 Field tambahan (rencana fase 5, aditif)

| Field | Tipe | Arti |
|---|---|---|
| `unit_count` | int 1–3 | Jumlah unit/spot booth. |
| `modules` | string[] | Isi paket: `photobooth`, `photo_stage`, `guest_cam`, `videobooth_360`, `magazine`. Diturunkan dari kategori paket + add-on. |
| `cancelled` | boolean | Di GET nilainya selalu `false`, karena event batal tidak ikut terkirim. Field ini baru bermakna di webhook `booking.cancelled`. Booth tidak menghapus event secara otomatis; event hanya ditandai "dibatalkan di Ops" dan admin Booth yang memutuskan. |
| `design` | object \| null | Lihat di bawah. `null` kalau belum ada data desain. |
| `portal_url` | string \| null | Link halaman booking di portal klien. Panjangnya bisa lebih dari 200 karakter. |

`design`:

```json
{
  "status": "approved",
  "stage": "acc",
  "approved_at": "2026-11-02T09:14:00+07:00",
  "frame_size": "4R",
  "orientation": "portrait",
  "frame_url": "https://<supabase>/storage/v1/object/sign/design-files/...?token=...",
  "frame_url_expires_at": "2026-11-09T09:14:00+07:00",
  "booth_layout_id": null,
  "booth_preset_id": null,
  "spots": [
    { "spot_no": 2, "frame_size": "2R", "orientation": "portrait", "frame_url": "...", "booth_layout_id": null, "booth_preset_id": null }
  ]
}
```

- `status`: `belum | proses | approved`. Sama dengan `events.design_status`.
- `stage`: `brief | dikerjakan | menunggu_review | revisi | acc`.
- `frame_url` hanya terisi saat `status = approved`. Nilainya signed URL yang berlaku 7 hari dan diperbarui setiap kali GET dipanggil. **Booth wajib mengunduh file ke R2, jangan hotlink.**
- `spots` hanya ada untuk event multi-unit dengan spot ke-2 dan seterusnya. Spot 1 memakai field di level atas.
- Booth membuat **satu event Booth per spot**, karena satu event Booth hanya bisa memakai satu kertas dan satu template. Pasangan `project_id` + `spot_no` dipakai sebagai kunci idempotensi, jadi Ops **wajib menjaga `spot_no` tetap stabil** (tidak boleh dinomori ulang).
- Kalau `orientation` kosong, Booth membaca orientasi dari rasio PNG.
- Kalau unduhan `frame_url` gagal atau URL-nya sudah kedaluwarsa, Booth memanggil GET lagi untuk mendapat URL baru.

**Urutan pemakaian desain di Booth** (disepakati 2026-10-06):
1. Kalau `booth_layout_id` terisi (uuid `layouts` di Booth), pakai template itu.
2. Kalau kosong dan `frame_url` terisi, impor PNG sebagai overlay. Ini **jalur utama**, karena designer biasanya bekerja di Canva/Photoshop. Untuk versi pertama impornya semi-otomatis: Booth mengunduh PNG, lalu admin menekan "Pasang desain dari Ops".
3. Kalau keduanya kosong dan `booth_preset_id` terisi, pakai `PresetId` dari `LAYOUT_PRESETS`.
4. Kalau `booth_layout_id` ternyata sudah diarsip, Booth jatuh ke langkah 2 atau 3 dan menandai event "perlu cek desain".

### 2.3 Aturan file desain (disepakati 2026-10-06, divalidasi Ops saat designer upload)

Booth mencetak di 1200×1800 @300 dpi (DNP). Booth memperkecil file yang lebih besar sendiri (#161).

| Format | Rasio | Minimal (1×) | Contoh ukuran pricelist (valid) |
|---|---|---|---|
| 4R portrait / landscape | 2:3 / 3:2 | 1200×1800 / 1800×1200 | 2400×3600 |
| 2R strip (satu strip saja) | 1:3 | 600×1800 | 1200×3600 |
| Polaroid | 3:4 atau 4:3 | 900×1200 / 1200×900 | 2400×1800 |

- Toleransi rasio di bawah 1%.
- Format PNG. Upload ke Ops maksimal 25 MB. Batas 4 MB di Booth berlaku untuk hasil setelah diperkecil.
- Kotak foto sebaiknya transparan (alpha < 128). Kalau tidak ada area transparan, Ops hanya memberi **peringatan**, tidak menolak, karena Booth mendukung kotak foto berwarna polos lewat chroma key (#163).

## 3. `GET /api/booth/packages` (tidak berubah)

`{ packages: [{ name, category, frame_size, duration_hours }] }`, hanya paket aktif, tanpa harga.

## 4. Webhook Ops → Booth

Aktif hanya kalau `TETRA_BOOTH_URL` dan `TETRA_BOOTH_WEBHOOK_SECRET` keduanya terisi. **Biarkan kosong sampai Booth selesai membangun penerimanya.**

```
POST {TETRA_BOOTH_URL}/api/webhooks/tetra-ops
Content-Type: application/json
X-Tetra-Event: booking.confirmed
X-Tetra-Delivery: 7b0d3c1e-1c3a-4f7e-9a51-2a8f0e6d4b11
X-Tetra-Signature: t=1793865600,v1=5f2c...e9
```

### 4.1 Tanda tangan

```
signed_payload = "<t>.<raw body>"
v1 = hex( HMAC_SHA256(TETRA_OPS_WEBHOOK_SECRET, signed_payload) )
```

Booth wajib memverifikasi:
1. Bandingkan `v1` dengan perbandingan waktu-konstan (`timingSafeEqual`).
2. Tolak kalau `|now − t| > 300` detik.
3. Simpan `X-Tetra-Delivery`. Kalau delivery yang sama datang lagi, balas 200 tanpa memproses ulang.

### 4.2 Event

| Event | Kapan |
|---|---|
| `booking.confirmed` | DP diterima dan event Ops dibuat. |
| `booking.updated` | Ada perubahan field di §2 (tanggal, jam, venue, paket, unit, frame). |
| `booking.cancelled` | Event dibatalkan. |
| `design.approved` | Desain di-ACC klien atau owner. Dikirim per spot kalau multi-unit. |

### 4.3 Body

```json
{
  "event": "design.approved",
  "delivery_id": "7b0d3c1e-1c3a-4f7e-9a51-2a8f0e6d4b11",
  "occurred_at": "2026-11-02T09:14:05+07:00",
  "booking": { "project_id": "PRJ-20261212-0003", "...": "bentuknya sama dengan 1 item GET /api/booth/bookings (§2.1 + §2.2)" }
}
```

Booth boleh langsung memakai `booking`, atau menarik ulang lewat GET.

### 4.4 Pengiriman ulang

- Respons 2xx dianggap terkirim. Selain itu (termasuk timeout 10 detik) dianggap gagal.
- Ops mencoba langsung 3 kali, dengan jeda ±1 detik, 5 detik, dan 30 detik.
- Kalau masih gagal, pengiriman disimpan di `booth_webhook_outbox` dan dicoba lagi oleh cron harian Ops selama 7 hari. Jadwal ini menjadi tiap 15 menit kalau Vercel sudah Pro.
- Semua percobaan dicatat (status, error terakhir).
- Urutan kiriman tidak dijamin. Booth sebaiknya mengandalkan `occurred_at` dan data terbaru.

## 5. Ops membaca dari Booth: `GET /api/ops/events/{ops_project_id}`

Endpoint ini dibangun Booth nanti. Bentuknya usulan Booth dan final setelah dibangun.

```
Authorization: Bearer <TETRA_OPS_API_TOKEN>
```

```json
{
  "ops_project_id": "PRJ-20261212-0003",
  "events": [
    {
      "id": "uuid",
      "name": "Wedding Rina & Dimas",
      "event_date": "2026-12-12",
      "status": "ready",
      "phase": "done",
      "modules": ["photobooth"],
      "gallery_url": "https://booth.tetraphoto.com/g/rina-dimas",
      "client_expires_at": "2027-03-12T00:00:00+07:00",
      "purge_at": "2027-03-12T00:00:00+07:00",
      "session_count": 214,
      "photo_count": 640
    }
  ]
}
```

- Nilainya array, karena satu booking bisa menjadi lebih dari satu event di Booth.
- `status` = status event Booth apa adanya: `draft | ready | live | completed | archived`.
- `phase` = `upcoming | live | done` (Booth DECISIONS #174). **Portal Ops memakai `phase`** untuk menentukan acara sudah selesai, karena `status` Booth tidak otomatis pindah ke `completed` (acara yang sudah lewat tetap `ready`).
- Sudah live di `https://booth.tetraphoto.com` (Booth commit 00e2fa6). Endpoint menjawab 503 sampai env Booth terisi.
- Guest Cam dan grup Photo Stage akan menyusul sebagai field tambahan.
- Portal Ops menampilkan bagian "Acara & Galeri" hanya kalau `system_config.portal.gallery_enabled = true` dan `TETRA_BOOTH_URL` terisi. Kalau Booth tidak bisa dihubungi, portal menampilkan "Galeri belum bisa dibuka, coba lagi nanti."

## 6. Midtrans (akun merchant dipakai bersama)

| | Booth | Ops |
|---|---|---|
| API | Core API, QRIS | Snap |
| `order_id` | UUID tanpa awalan | `OPS-<public_code>-<n>`, mis. `OPS-8F3K2-1` |
| Tujuan notifikasi | URL di dashboard Midtrans | Header `X-Override-Notification: https://<ops>/api/webhooks/midtrans` di setiap transaksi |

- Webhook Booth mengabaikan `order_id` yang bukan UUID, jadi notifikasi Ops yang nyasar tetap aman.
- Ops memverifikasi `signature_key` = SHA-512(`order_id` + `status_code` + `gross_amount` + server key), lalu menanyakan ulang status ke API Midtrans sebelum mencatat apa pun.
- Status saat ini: akun produksi belum aktif, jadi Ops memakai sandbox.

## 7. Riwayat versi

| Versi | Tanggal | Isi |
|---|---|---|
| 0.1 | 2026-10-06 | Draf awal: field tambahan, aturan file desain, webhook, API galeri, pembagian Midtrans. |
| 0.4 | 2026-10-07 | §5: field `phase` (upcoming/live/done) jadi acuan acara selesai. |
| 0.3 | 2026-10-07 | §5: daftar status Booth (`completed`, bukan `done`); endpoint Booth sudah live. |
| 0.2 | 2026-10-06 | Catatan review Booth: satu event Booth per spot (`spot_no` harus stabil), fallback orientasi, refresh `frame_url`, arti `cancelled`. |
