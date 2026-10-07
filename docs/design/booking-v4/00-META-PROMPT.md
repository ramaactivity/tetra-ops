# Meta prompt — Implementasi UI Booking v4 di Tetra Ops

> Salin seluruh isi di bawah garis ke sesi Claude Code yang dibuka di repo **tetra-ops**. Letakkan folder `design_handoff_booking_v4/` di `docs/design/booking-v4/` repo itu lebih dulu.

---

Kamu akan membangun **UI booking publik Tetra Photobooth** (mobile-first + desktop) di repo ini, persis mengikuti desain v4 yang sudah disetujui owner. Desain ada di `docs/design/booking-v4/`.

Prompt ini melengkapi `prompt-tetra-ops-booking-portal.md` (booking engine, portal, pembayaran, modul desain). Di sana yang diatur **data & backend**, di sini yang diatur **tampilan & alur**. Kalau keduanya bertentangan soal tampilan/alur, ikuti dokumen ini dan catat di dokumen keputusan.

## Wajib dibaca sebelum menulis kode
1. `docs/design/booking-v4/README.md`: spesifikasi lengkap (token, layout, alur, copy, status, kriteria selesai). Ini sumber kebenaran.
2. `docs/design/booking-v4/reference/Booking Tetra v4.dc.html`, `Langkah Booking.dc.html`, `Print Preview.dc.html`: prototipe HTML. Buka `Booking Tetra v4.dc.html` di browser (`npx serve docs/design/booking-v4/reference`) dan klik semua alur + tombol "Cek status". **Ini acuan, jangan disalin mentah**; semua style inline di sana adalah nilai yang harus kamu tiru, bukan struktur kode.
3. `docs/design/booking-v4/data/booking-data.json`: teks paket/add-on/format/backdrop. Di produksi data paket & add-on dibaca dari tabel `packages`/`addons`; tambahkan kolom yang belum ada (deskripsi, "cocok untuk", poin, ikon, tint, punya format cetak) lewat migrasi aditif.
4. Token visual: `~/Desktop/TETRA BOOTH APP/tetra-booth/packages/ui/src/tokens.css` (sama dengan tabel token di README). Halaman klien Tetra Ops memakai token ini, bukan design system dashboard admin.

## Cara kerja
1. **Petakan dulu**: komponen/route/hook yang sudah ada di repo (layout publik, font, Tailwind, form, availability API, bot WA, autosave) vs yang harus dibuat. Tulis rencana singkat: daftar komponen, route, file yang disentuh, dan urutan. **Tunggu persetujuan** sebelum coding.
2. **Bangun primitif dulu**, satu per satu, dan bandingkan dengan prototipe:
   `Button` (primary butter berlapis, secondary, disabled-dengan-alasan) · `ChoiceCard` (default / terpilih mint-soft + layer mint) · `IconChip` (dashed) · `Chip` · `Stepper (− n +)` · `TextField` (label, keterangan, opsional, error saat blur, prefix +62) · `NumberedFieldGroup` (isian bernomor bertahap) · `Calendar` · `TimePicker` (chip + jam manual) · `OtpInput` · `BottomActionBar` · `PhaseHeader` (HP) · `PhaseStepper` (desktop) · `PrintPreview` (strip/4R/polaroid + tema) · `SummaryRow` · `Skeleton` · `OfflineBanner`.
3. **Lalu layar**, urut sesuai alur di README. Satu state machine/reducer eksplisit untuk wizard (bukan banyak `useState` terpisah), termasuk mode edit dari "Cek & kirim" dan aturan lewati layar (OTP, format cetak).
4. **Desktop**: layout `600px | 1fr` dengan panel kontekstual kiri per langkah (tabel di README). Komponen langkah dipakai bersama HP dan desktop.
5. Setiap layar selesai: screenshot di 390×844 dan 1440×900 (Playwright), letakkan berdampingan dengan prototipe, perbaiki selisih (spacing, ukuran huruf, radius, warna, copy) sampai sama. Laporkan selisih yang sengaja dibiarkan.
6. Jalankan lint, typecheck, test. Tambahkan Playwright e2e untuk alur utama: pembuka → kirim booking, serta status tanggal penuh, jam bentrok, OTP salah, offline, lanjutkan draf.

## Aturan yang tidak boleh dilanggar
- **Copy persis** seperti di README/prototipe. Kumpulkan di satu file copy. Jangan menambah kalimat, ikon, statistik, atau section baru tanpa izin owner.
- **Tanpa** serif, gradient, glassmorphism, emoji, shadow blur, outline tebal di semua elemen, deretan kartu ikon-judul-subjudul generik. Shadow hanya pola berlapis tanpa blur.
- **Tanpa** `<select>`, `<input type="date|time|color">`, atau dropdown bawaan browser. Semua pilihan memakai komponen custom.
- **Tanpa foto klien** di alur booking (alasan consent). Contoh cetakan memakai komponen `PrintPreview` berisi ikon.
- Target sentuh ≥44px; font input ≥16px; `inputmode`/`type`/`autocomplete` sesuai README.
- Tombol nonaktif selalu menampilkan **alasan** di labelnya.
- Validasi saat blur, bukan saat mengetik; pesan ramah, persis copy README.
- Harga, total, dan DP **dihitung server**; UI hanya menampilkan. DP dari `system_config`.
- Autosave draf; buka ulang link → kartu "Lanjutkan draf booking kamu?".
- `prefers-reduced-motion` mematikan semua animasi. Durasi motion sesuai tabel README (150–250ms umumnya; pembuka/sukses ≤600ms).
- Aman di browser bawaan WhatsApp (iOS & Android): `100dvh`, safe-area inset, bar bawah tidak tertutup keyboard.

## Yang masih placeholder (tanyakan ke owner, jangan dikarang)
- Katalog template asli (layar "Intip desain" memakai 6 tema contoh).
- Kode warna/foto kain backdrop Basic (Red, White, Gold, Silver, Emerald Green, Blue).
- Besaran DP final, link kebijakan refund.
- Kapan galeri foto tersedia (di desain: "Setelah acara").
- Integrasi pencarian venue (MVP: tombol buka Google Maps + tempel link; tanpa Places API).

## Definisi selesai
Semua checklist "Kriteria selesai" di README tercentang, screenshot berdampingan HP + desktop tiap layar dilampirkan, test hijau.
