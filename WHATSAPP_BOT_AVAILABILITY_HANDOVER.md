# Handover BALIK — Endpoint Ketersediaan (Tetra Ops → WA Bot)

Balasan untuk spec *"Endpoint Ketersediaan — Tetra Ops → WA Bot"*.
Tujuan dokumen ini: **menyamakan pemahaman dulu** sebelum endpoint dibangun, karena
beberapa asumsi di spec ternyata beda dengan kondisi data Tetra Ops yang sebenarnya.
Ada **4 keputusan** yang kami butuhkan dari tim bot di bagian akhir.

Disiapkan dari sisi Tetra Ops, 2026-06-26.

---

## 0. Tetra Ops itu apa (biar satu frame dulu)

**Tetra Ops = sistem internal operasional + keuangan + CRM Tetra Photobooth.**
Dia bukan sekadar database; ini *source of truth* (sumber kebenaran) untuk:

- **Event / booking** — siapa, kapan, di mana, paket apa, jam pakai photobooth, status, pembayaran.
- **Operasional** — jadwal crew, setup, BAST, dll.
- **Keuangan** — invoice, HPP, jurnal, persediaan.
- **CRM & Leads** — termasuk yang sudah dikerjakan bot WA (leads, segmentasi).

WA Bot **berdiri terpisah** dari Tetra Ops. Untuk fitur ini, bot cuma jadi **konsumen
read-only**: nanya "tanggal X jam Y–Z masih ada unit kosong?" dan Tetra Ops yang
jawab, karena Tetra Ops yang pegang seluruh data event.

Jadi posisinya benar: **logika hitung availability di sisi Tetra Ops**, bot tinggal panggil. ✅

---

## 1. Di mana data event tinggal

Semua booking ada di tabel **`events`** (Postgres/Supabase). Kolom yang relevan buat fitur ini:

| Kolom (Tetra Ops) | Tipe | Arti | Padanan di spec kamu |
|---|---|---|---|
| `event_date` | `date` | Tanggal acara | `date` |
| `start_time` | `time` | **Jam mulai photobooth** | `start` |
| `end_time` | `time` | **Jam selesai photobooth** | `end` |
| `setup_time` | `time` | Jam crew mulai setup (sebelum `start_time`) | — (bisa dipakai buat buffer, lihat §3) |
| `venue_name` | `text` | Nama venue | venue (buat buffer) |
| `venue_city` | `text` | Kota/kabupaten | `city` (buat buffer) |
| `client_name` | `text` | Nama klien (mis. "Bramastha & Adindya") | `project` di response |
| `status` | enum | Status booking | dipakai buat filter (lihat §4) |
| `package_id` → `packages.duration_hours` | `int` | Durasi paket (jam) | durasi paket |

**Catatan penting #1:** `start_time` dan `end_time` di Tetra Ops **memang sudah = jam pakai
photobooth**, BUKAN jam acara keseluruhan. Persis seperti yang kamu minta. Jadi kita
**tidak perlu menebak** window dari paket — kalau jamnya terisi, kita pakai langsung.

---

## 2. Kabar baik — 3 asumsi spec yang ternyata SUDAH pas

1. **Window photobooth sudah tersimpan eksplisit.** Tidak perlu hitung `start + durasi`;
   `start_time`/`end_time` sudah ada. Dari 135 event aktif, **cuma 2 yang jamnya kosong** —
   praktis selalu terisi.

2. **"Unlimited" itu unlimited CETAK, bukan unlimited WAKTU.** Ini sumber salah paham yang
   umum. Contoh nama paket: *"4R Unlimited 2 Jam"* = cetak sepuasnya, **durasi tetap 2 jam**.
   Semua paket punya durasi pasti (2/3/4/5/6/8, paling panjang 13 jam). Jadi **tidak ada kasus
   "durasi tak hingga"** yang bikin overlap susah dihitung. Aman. ✅

3. **Model "max unit kepakai bersamaan" = jumlah unit terpakai** itu benar.
   3 unit, jadi `units_free = 3 − max_overlap`. Ini kami implementasikan apa adanya.

---

## 3. Kabar yang perlu diluruskan — soal BUFFER

Ini bagian paling rapuh dari spec, dan wajib kamu tahu sebelum percaya angka buffer.

### 3a. Kolom kota hampir selalu KOSONG
Dari 135 event aktif, **`venue_city` kosong di 113 (≈84%)**. Yang terisi cuma 22 event,
dan kotanya cuma 4 macam: **Depok, Bogor, Rumpin, Babakan Madang** (semua sekitar Bogor).

Artinya: tabel buffer kamu (venue sama 2 jam / beda kota 3 jam / luar kota 4 jam) **tidak
bisa dihitung akurat** untuk mayoritas event, karena kotanya tidak diketahui. Heuristik
"berbasis field kota/venue" itu **bagus di atas kertas, tapi datanya belum ada**.

### 3b. Buffer itu PAIRWISE, bukan properti 1 event
Spec langkah 2 bilang "perluas tiap event jadi `[start−buffer, end+buffer]`". Tapi besar
buffer **tergantung jarak antara DUA acara** (acara existing vs acara baru yang ditanya bot).
Jadi buffer bukan angka tetap milik satu event — dia dihitung **relatif terhadap kota acara
yang sedang ditanyakan** (param `city`). Implementasi kami:
> untuk tiap event existing → `buffer = f(jarak(kota_existing, kota_yang_ditanya))` →
> lebarkan window existing jadi `[start−buffer, end+buffer]` → cek overlap dengan `[start,end]`.

### 3c. Konsekuensi praktis
Karena kota sering kosong, kami **harus** pakai **buffer default** kalau salah satu kota tak
diketahui. Ini **Keputusan #2** di bawah. Rekomendasi kami: default **3 jam** (aman, karena
semua lokasi yang terdata selama ini masih sekitar Bogor/Jabodetabek).

> Upgrade ke Google Maps travel-time API memang bisa, tapi **percuma sekarang** selama
> `venue_city`/koordinat belum diisi rutin di Tetra Ops. Solusi jangka pendek yang jujur:
> buffer default tetap, lalu kita perbaiki kualitas data kota dulu.

---

## 4. Status mana yang "mengunci" unit?

Enum `status` di Tetra Ops: `draft, confirmed, design_brief, design_approved, upcoming,
in_progress, awaiting_settlement, completed, cancelled, archived`.

Untuk cek ketersediaan tanggal **masa depan**, yang relevan mengunci unit adalah booking yang
benar-benar jadi. Rekomendasi kami:

- **Mengunci unit (dihitung):** `confirmed, design_brief, design_approved, upcoming, in_progress`
  (+ `awaiting_settlement, completed` otomatis tak relevan karena tanggalnya sudah lewat).
- **TIDAK mengunci:** `cancelled`, `archived`, dan **`draft`** (draft = baru tanya-tanya / belum
  fix). Soft delete (`deleted_at`) selalu dibuang.

Tapi ada pertanyaan bisnis: **apakah booking yang masih "draft"/tentatif harus dianggap
menahan unit?** Kalau bot mau hati-hati (jangan over-promise), draft sebaiknya **ikut menahan**.
Ini **Keputusan #1**.

---

## 5. Algoritma final yang akan kami implementasikan

1. Ambil semua event di `event_date = date`, `deleted_at IS NULL`, status ∈ {daftar yang mengunci}.
2. Window tiap event = `[start_time, end_time]` (kalau salah satu kosong → fallback
   `start_time + packages.duration_hours`; kalau dua-duanya kosong → lihat Keputusan #3).
3. Lebarkan tiap window jadi `[start − buffer, end + buffer]`, `buffer` dihitung dari jarak
   kota event itu vs `city` yang diminta (default kalau tak diketahui).
4. Hitung **max unit terpakai bersamaan** yang overlap dengan `[start, end]` yang diminta.
5. `units_free = 3 − max_overlap`; `available = units_free > 0`.
6. Kembalikan juga daftar `conflicts` (project/jam/kota) yang bener-bener bentrok, buat alasan.

Kontrak request/response **sama persis seperti spec kamu** (kita tidak ubah). Kemungkinan kami
**tambah** field opsional di response buat transparansi, mis. `buffer_applied_minutes` dan
`assumptions` (biar bot bisa kasih disclaimer ke customer kalau hitungannya pakai default).

---

## 6. Auth / token

Pola di Tetra Ops: **Bearer token via env var**, dibandingkan string (sama seperti `CRON_SECRET`
yang sudah ada). Untuk endpoint ini kami siapkan env `AVAILABILITY_API_TOKEN` (atau
`BOT_API_TOKEN` kalau mau dipakai bersama endpoint bot lain nanti).

- **Kami yang generate** tokennya (`openssl rand -base64 32`), pasang di Vercel env Tetra Ops,
  lalu kasih ke kamu lewat channel aman (bukan di repo).
- Bot kirim header: `Authorization: Bearer <token>`.
- Kalau token salah/kosong → `401`.

---

## 7. Yang kami butuh dari tim bot (4 keputusan)

| # | Keputusan | Rekomendasi kami |
|---|---|---|
| **1** | Apakah booking **`draft`/tentatif** ikut menahan unit? | **Ya, tahan** (biar bot tak over-promise) |
| **2** | **Buffer default** saat kota salah satu acara tak diketahui? | **3 jam** |
| **3** | Kalau event existing **jamnya kosong** (`start/end` null, 2 kasus), dianggap apa? | **Tahan 1 unit seharian** (konservatif) |
| **4** | Nama env token & siapa simpan di sisi bot | `AVAILABILITY_API_TOKEN`, kami generate |

Plus, ini bukan blocker tapi penting jangka panjang:
> **Tolong mulai isi `venue_city` (idealnya koordinat) di tiap booking.** Tanpa itu, buffer
> selamanya jalan pakai default dan upgrade Maps API jadi sia-sia.

---

## 8. Status & estimasi

- **Endpoint belum dibuat** — sengaja nunggu 4 keputusan di atas, karena jawabannya
  **mengubah angka** yang keluar ke customer (bukan cuma kosmetik).
- Begitu keputusan masuk, implementasi + test ringan **±0,5 hari**. Sisi data (tabel `events`)
  sudah siap, tidak butuh migration.
- Tahap "create booking dari bot" (write) sengaja **tidak** disentuh dulu — itu fase berikutnya
  dan butuh diskusi tersendiri soal validasi & double-booking.

— Tetra Ops
