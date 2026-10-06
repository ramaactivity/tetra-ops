# Rencana: Booking Engine, Portal Klien, dan Modul Desain Frame

Status: **disetujui owner (Rama) 2026-10-06.** Fase 1 sedang dikerjakan.
Tanggal: 2026-10-06. Keputusan resmi dicatat di `docs/12_DECISION_LOG.md` (DR-026 dst.).
Kontrak dengan Tetra Booth: `docs/INTEGRASI-TETRA-BOOTH.md`.

## 1. Tujuan

Klien memesan, membayar, melengkapi detail acara, dan menyetujui desain frame sendiri di portal. Semua datanya masuk otomatis ke Tetra Ops. Owner dan admin memantau semuanya dari satu pipeline.

## 2. Kondisi sekarang (hasil pemetaan)

| Area | Yang sudah ada | Catatan untuk fitur baru |
|---|---|---|
| Status event | 5 status berbasis tanggal (`upcoming → in_progress → awaiting_settlement → completed`, `cancelled`). `design_status` = `belum / proses / approved`. | Status lama `draft / confirmed / design_*` sudah mati. Jangan dihidupkan lagi. |
| Paket & add-on | `packages.category` sudah mencakup classic, 360, magazine, photo stage. Harga, durasi, `unit_count`. | Belum ada `is_public`. |
| Ketersediaan | `src/lib/availability.ts` (engine murni) + `/api/availability`. Sudah menghitung `booking_inbox`. | Tambah sumber: booking portal yang punya pembayaran menunggu. |
| Pembuatan event | `createBooking` di `src/lib/actions/bookings.ts` (server action, butuh sesi owner). | Pecah jadi `createBookingCore` tanpa cookie, pola sama dengan `recordQuickTransactionCore`. |
| Pembayaran | `logPaymentCore` → RPC `record_payment_je` (wajib actor owner), jurnal, trigger status bayar, dokumen otomatis. | Klien tidak mencatat langsung. Klien mengajukan, lalu admin (atau sistem) mencatat. |
| Bukti bayar | Google Drive. | Portal pakai Supabase Storage privat, arsip ke Drive. |
| Dokumen | Quotation, invoice, kuitansi, nota lunas, BAST + link PDF bertanda tangan HMAC. | Dipakai ulang untuk unduhan di portal. |
| Notifikasi | Telegram grup owner, notifikasi in-app per penerima, push. | Dipakai ulang. |
| WA bot | Baileys di VPS, perintah lewat tabel `bot_commands`, batas `send-text` 15/hari. | Butuh dua kemampuan baru di repo `TETRA WA BOT`: menerima pesan verifikasi dan jalur kirim pesan portal di luar batas 15/hari. |
| Designer | Iqbal = owner. Tidak ada role designer. | Tambah penanda designer. |
| Rate limit, validasi upload bersama, Midtrans | Belum ada. | Dibuat baru. |

## 3. Alur klien (final)

1. **Pilih.** Klien membuka `tetraphoto.com/booking`, lalu memilih paket, add-on, tanggal, jam, dan jumlah unit. Ketersediaan dicek langsung, tetapi slot **belum** dikunci.
2. **Verifikasi nomor WA.** Klien mengisi nama dan nomor WA, lalu mencentang persetujuan data pribadi (UU PDP) dan syarat booking. Setelah itu klien menekan "Verifikasi lewat WhatsApp". WA terbuka dengan pesan siap kirim berisi kode. Bot menerima pesan itu, Ops menandai nomor terverifikasi, dan tab browser otomatis masuk ke portal. Kalau WA tidak bisa dipakai, ada cadangan kode lewat email.
3. **Portal.** Booking tersimpan sebagai draf. Detail acara diisi bertahap dan tersimpan otomatis. Pemesan dan pemilik acara dipisah.
4. **Bayar DP** (minimal Rp500rb):
   - Transfer: klien memilih rekening tujuan dan mengunggah bukti. Slot ditahan, admin dan owner mendapat notifikasi, lalu admin menerima atau menolak dengan alasan.
   - Midtrans Snap (fase belakangan): terkonfirmasi otomatis.
   - Setelah DP diterima, event resmi dibuat di Ops, pembayaran dan jurnal dicatat, dan kuitansi terbit.
5. **Desain frame.** Klien memilih dari katalog atau mengisi brief custom (dengan upload referensi dan logo). Designer mengunggah versi draf. Klien meminta revisi dengan komentar, atau ACC.
6. **Lengkapi info.** Klien mengisi rundown, PIC hari H, dan info lainnya. WO bisa ikut mengisi.
7. **Pelunasan** dengan cara bayar yang sama.
8. **Acara & Galeri.** Data diambil dari Tetra Booth. Untuk sekarang hanya placeholder di balik feature flag.

Lead tanpa DP kedaluwarsa otomatis setelah 30 hari.

## 4. Identitas dan hak akses klien

- **Satu orang = satu nomor WA** (tabel `portal_people`). Email boleh ditambahkan sebagai cadangan.
- **Sesi portal dibuat sendiri, bukan Supabase Auth**, supaya klien tidak bercampur dengan owner dan crew:
  - Disimpan sebagai cookie httpOnly. Token disimpan dalam bentuk hash dan bisa dicabut.
  - Semua data portal dibaca di server dan dibatasi ke booking milik orang itu.
- **Peran per booking** (`booking_members`):

| Peran | Tagihan & bayar | Detail acara | Desain | Undang orang |
|---|---|---|---|---|
| Pemesan | ya | ya | lihat | ya |
| Pemilik acara | lihat total saja | ya | ya (ACC) | tidak |
| WO | ya, kalau WO yang memesan | ya | ya | ya |

- **`managed_by`** menentukan siapa yang memegang booking: klien, WO, atau tim Tetra. Admin Tetra selalu bisa mengisi.
- **Dasbor WO** menampilkan semua booking di mana orang itu berperan sebagai WO. WO boleh booking langsung. Channel dicatat sebagai `vendor`, dan komisi memakai tarif default WO di kontak.

## 5. Perubahan data (semua aditif, semua tabel baru ber-RLS)

RLS tabel baru: hanya owner yang bisa membaca dan menulis langsung. Akses anon ditolak. Portal dan bot memakai server (admin client) dengan pengecekan keanggotaan di kode.

**Tabel baru:**
- `portal_people`: `phone` (unik, ternormalisasi), `email`, `name`, `wa_verified_at`, `email_verified_at`, `contact_id` (opsional, ke `contacts`).
- `portal_sessions`: `person_id`, `token_hash`, `expires_at`, `revoked_at`, `last_seen_at`.
- `portal_verifications`: `channel` (wa|email), `target`, `code_hash`, `browser_nonce_hash`, `expires_at` (10 menit), `attempts`, `consumed_at`.
- `client_bookings`:
  - Identitas: `public_code` (pendek, acak, untuk ditampilkan), `status` (`draft | menunggu_konfirmasi | resmi | kedaluwarsa | batal`), `managed_by`, `channel`, `vendor_contact_id`.
  - Isi pesanan: `package_id`, `addons` (jsonb snapshot), `unit_count`, `event_date`, `start_time`, `end_time`, `venue_city`, `detail` (jsonb, autosave).
  - Persetujuan: `pdp_consent_at`, `terms_version`.
  - Lainnya: `expires_at`, `event_id` (terisi saat resmi), `created_by_person`.
- `booking_members`: `booking_id`, `person_id`, `role` (pemesan|pemilik|wo), `invited_by`, `accepted_at`.
- `payment_submissions`:
  - Pembayaran: `booking_id`, `kind` (dp|pelunasan), `method` (transfer|midtrans), `amount`, `bank_account_id`, `proof_path`.
  - Status: `status` (`menunggu | diterima | ditolak | pending | kedaluwarsa`), `reject_reason`.
  - Rujukan: `midtrans_order_id`, `payment_id` (FK ke `payments` setelah dicatat), `reviewed_by`, `reviewed_at`.
- `design_templates`: `name`, `category`, `frame_size`, `orientation`, `preview_path`, `booth_layout_id`, `booth_preset_id`, `is_active`, `sort`.
- `design_requests` (per event per spot):
  - `booking_id`, `event_id`, `spot_no`, `mode` (template|custom), `template_id`, `brief` (jsonb: warna, teks, nama, tanggal).
  - `stage` (`brief | dikerjakan | menunggu_review | revisi | acc`), `designer_user_id`, `revision_count`, `approved_version_id`.
- `design_files`: referensi dan logo dari klien.
- `design_versions`: `version_no`, `file_path`, `frame_size`, `orientation`, `width`, `height`, `has_transparency`, `booth_layout_id`, `uploaded_by`.
- `design_comments`: per versi, dengan penulis berupa orang portal atau user Ops.
- `booth_webhook_outbox`: `event`, `delivery_id`, `payload`, `attempts`, `next_attempt_at`, `last_error`, `delivered_at`.
- `rate_limits` + RPC `hit_rate_limit(key, limit, window_sec)`.

**Kolom tambahan di tabel yang sudah ada:**
- `packages.is_public`, `public_description`, `public_sort`.
- `addons.is_public`.
- `users.is_designer`.

**Kunci `system_config` baru:**
- `booking.dp_minimum` = 500000
- `booking.lead_expiry_days` = 30
- `design.revision_limit` = 3, `booking.cancellation_fee` = 500000
- `booking.terms_version`
- `portal.gallery_enabled` = false

**Pemetaan ke yang sudah ada:**
- `design_requests.stage` diringkas ke `events.design_status`: `brief` = belum; `dikerjakan`, `menunggu_review`, dan `revisi` = proses; `acc` = approved.
- ACC oleh klien tetap melewati gate ukuran frame di `approveDesign`.

## 6. Halaman dan endpoint

**Publik dan portal** (masuk ke `PUBLIC_PATHS` di proxy, gaya visual Booth v2):
- `/booking` (wizard)
- `/akun` (masuk / verifikasi)
- `/akun/booking/[code]` (timeline, tagihan, detail, desain, dokumen, galeri)
- `/akun/wo` (dasbor WO)

**Endpoint:**
- `POST /api/bot/portal-verify`: bot meneruskan pesan verifikasi. Auth: Bearer token bot yang sudah ada.
- `POST /api/webhooks/midtrans`: notifikasi Midtrans untuk transaksi `OPS-`.
- Upload portal: route handler dengan validasi tipe, ukuran, dan rasio gambar, lalu disimpan ke Storage privat.
- `GET /api/booth/bookings`: diperluas secara aditif (lihat kontrak).

**Admin** (desain Tetra Ops):
- `/operations/pipeline`: lead → DP → desain → siap → hari H → selesai, plus lead yang hampir kedaluwarsa.
- Antrean "Pembayaran menunggu konfirmasi".
- Antrean desain per designer (perluasan Design Hub).
- Kelola katalog template.
- Tanda publik di halaman paket dan add-on.

## 7. Fase

Setiap fase bisa dipakai sendiri.

| Fase | Isi | Butuh pihak lain |
|---|---|---|
| **0** | Rencana ini, kontrak Booth, catatan keputusan. | — |
| **1. Booking + DP transfer** | Paket publik, wizard `/booking`, verifikasi WA + email, draf + autosave, persetujuan PDP dan syarat, portal minimal (status, upload bukti DP, unduh dokumen), antrean konfirmasi admin, konfirmasi DP membuat event + mencatat bayar, notifikasi Telegram/in-app, lead kedaluwarsa (cron harian), rate limit. | Repo bot WA: penerima pesan verifikasi + jalur kirim pesan portal. Resend: verifikasi DNS tetraphoto.com. |
| **2. Portal lengkap** | Undang anggota + peran, dasbor WO, detail acara bertahap, rundown, PIC hari H, pelunasan transfer, ajukan pindah tanggal / batal. | — |
| **3. Desain frame** | Katalog template, brief custom + upload, versi draf (PNG divalidasi atau uuid layout Booth), komentar, revisi/ACC, batas revisi, antrean designer, arsip final ke Drive. | — |
| **4. Midtrans Snap** | Order `OPS-…`, header override, webhook dengan cek tanda tangan + tanya ulang status, akun kliring "Saldo Midtrans", actor sistem. | Akun Midtrans produksi (belum aktif). Sandbox dulu. |
| **5. Integrasi Booth** | Field tambahan di `/api/booth/bookings` (bisa lebih awal karena murah), webhook keluar + outbox, placeholder Acara & Galeri. | Booth membangun penerima webhook + `GET /api/ops/events/…` (prioritas Booth setelah Jan 2027). |
| **6. Domain** | Multi-Zones: website tetraphoto.com me-rewrite `/booking` dan `/akun` ke Ops. Ops memakai `assetPrefix` dan `serverActions.allowedOrigins`. | Repo website. |

Pipeline admin dibangun bertahap: kolom lead dan DP di fase 1, kolom desain di fase 3.

Fase 1 bisa diuji di domain Vercel Ops sebelum fase 6 selesai.

## 8. Risiko dan batasan

- **Vercel Hobby:**
  - Cron hanya sekali sehari.
  - Syarat penggunaannya non-komersial, sedangkan booking dengan pembayaran itu komersial.
  - Naik ke Pro sebelum dibuka ke publik luas.
- **Supabase Storage:**
  - Paket gratis hanya 1 GB. File desain bisa cepat memenuhi kuota.
  - Mitigasi: gambar dikompres di browser, versi draf lama dihapus setelah acara selesai, dan file final diarsip ke Drive.
- **Bot WA tidak resmi (Baileys):**
  - Verifikasi memakai pesan masuk dari klien, jadi risiko blokir kecil.
  - Email jadi cadangan kalau bot mati.
  - Kalau agen Hermes ikut membaca nomor yang sama, pesan verifikasi harus diproses bot lebih dulu.
- **Uang:**
  - Klien tidak pernah memanggil RPC pembayaran langsung. Pencatatan selalu lewat `logPaymentCore`, oleh admin yang mengonfirmasi atau oleh actor sistem untuk Midtrans.
  - Biaya Midtrans ditanggung Tetra dan dicatat sebagai beban saat pencairan.

## 9. Status

Disetujui owner 2026-10-06, termasuk revisi maksimal 3 kali dan kebijakan pembatalan DR-034. Fase 1 mulai dikerjakan.
