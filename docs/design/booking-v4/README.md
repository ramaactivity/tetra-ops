# Handoff: Booking Online Tetra Photobooth (v4, MVP)

## Ringkasan
Alur booking publik `booking.tetraphoto.com`: dari layar pembuka sampai booking terkirim (draf/lead), lalu halaman booking klien untuk melengkapi data dan bayar DP. Mobile-first (390 × 844), dengan versi desktop (1440 × 900). Klien mayoritas membuka link dari WhatsApp.

Target repo: **Tetra Ops** (Next.js + React, Supabase). Lihat `00-META-PROMPT.md` untuk prompt siap tempel.

## Tentang file desain
File di `reference/` adalah **prototipe HTML sebagai acuan desain**, bukan kode produksi. Tugasnya: **membangun ulang** desain ini di Tetra Ops memakai pola, komponen, dan library yang sudah ada di repo itu. Jangan menyalin HTML/JS-nya mentah.

- `reference/Booking Tetra v4.dc.html`: file utama (state, logika, frame HP + desktop, layar pembuka, sukses, halaman booking).
- `reference/Langkah Booking.dc.html`: isi setiap langkah wizard (dipakai HP dan desktop).
- `reference/Print Preview.dc.html`: komponen contoh cetakan (strip/4R/polaroid + tema warna).
- Buka `Booking Tetra v4.dc.html` di browser (butuh `support.js` di folder yang sama). Panel "Cek status" di atas untuk melihat semua status.
- Data acuan: `data/booking-data.json`.

## Fidelity
**High-fidelity.** Warna, tipografi, radius, border, shadow, copy, dan urutan alur sudah final untuk MVP. Bangun ulang sedekat mungkin, lalu bandingkan berdampingan dengan prototipe.

Pengecualian (data contoh, bukan final): ketersediaan tanggal/jam (pakai `api/availability`), hasil OTP (kode `123456`), katalog template di layar "intip desain", kode warna backdrop, DP flat Rp500.000.

---

## Aturan gaya (sama dengan Tetra Booth v2)
Token sama persis dengan `tetra-booth/packages/ui/src/tokens.css`. Jika Tetra Ops belum punya, salin tokennya (lihat bagian Token). Tanpa serif, gradient, glassmorphism, emoji, atau shadow blur.

Ciri visual utama:
- **Border tinta 1.5px** `#1D1D1B` di semua kartu, tombol, input.
- **Shadow berlapis (layered)**, tanpa blur: `Xpx Xpx 0 -1.5px <warna-latar>, Xpx Xpx 0 0 #1D1D1B`. X = 4px (kartu kecil/terpilih), 5–6px (CTA besar, kartu desktop).
- **Efek tekan**: `:active` → `transform: translate(Xpx, Xpx)` + shadow `0 0 0 0`. Durasi 100ms.
- **Ikon dalam "chip ikon"**: kotak 38–46px, radius 11–13px, border **1.5px dashed** tinta, isi pastel. Ikon Lucide 18–22px.
- **Pemisah baris**: `1.5px dashed #D6D3CC`.
- Teks di atas pastel selalu tinta.

## Token

### Warna
| Token | Hex | Pakai |
|---|---|---|
| ink | `#1D1D1B` | teks, border, garis |
| paper | `#F8F7F4` | latar halaman |
| white | `#FFFFFF` | kartu, input |
| butter | `#F8D98B` | aksi utama (CTA), header tiket |
| mint | `#8EDCCB` | tanggal terpilih, focus ring, chip terpilih, layer shadow terpilih |
| mint-soft | `#D6F1EA` | latar kartu terpilih, sukses |
| lavender | `#CEC8F6` | fase Acaramu, aksen |
| peach | `#FCE3C6` | fase Paket, halaman booking |
| sky | `#D6EEF8` | fase Tambahan, info/offline |
| coral | `#F7D5CC` | latar error/kedaluwarsa, tanggal penuh terpilih |
| coral-strong | `#E8836F` | border & titik error |
| green | `#5DB978` | lingkaran centang (✓ putih di atasnya) |
| text-2 | `#5F5E5A` | label sekunder, "Opsional" |
| text-3 | `#3A3936` | teks bantu/keterangan |
| muted | `#9A9892` | placeholder, tanggal penuh |
| past | `#C9C6BF` | tanggal lewat |
| line-soft | `#D6D3CC` | garis putus-putus, ring belum aktif |
| canvas (desain saja) | `#EDECE8` | latar kanvas prototipe, bukan produk |

**Warna per fase** (latar header HP & panel kiri desktop): Acaramu `#CEC8F6` · Paket `#FCE3C6` · Tambahan `#D6EEF8` · Data kamu `#D6F1EA`. Pembuka `#F8F7F4`, sukses `#D6F1EA`, halaman booking `#FCE3C6`. Transisi `background 300ms`.

### Tipografi
- Teks: **Plus Jakarta Sans** 400/500/600/700/800.
- Angka (harga, tanggal, jam, kode, hitungan): **Geist Mono** 400/500/600.
- `line-height: normal` kecuali disebut lain. `-webkit-font-smoothing: antialiased`.

| Peran | Ukuran / weight / tracking |
|---|---|
| Judul pembuka desktop | 76px / 800 / -0.05em / lh .98 |
| Judul pembuka HP | 34px / 800 / -0.045em / lh 1.04 |
| Judul langkah desktop | ±44px / 800 / -0.035em |
| Judul langkah HP | 25px / 800 / -0.035em / lh 1.12, `text-wrap: balance` |
| Judul sukses | 28px / 800 / -0.035em |
| Label fase (mis. "PAKET") | 12px / 800 / 0.04em, uppercase |
| Label isian | 15px / 800 |
| Sub-judul blok (mis. "Jam mulai") | 17px / 800 |
| Isi input | 17px / 700 (input utama), 16px (sekunder). Minimal 16px agar iOS tidak zoom |
| Body / keterangan | 13–15px / 400–500 / lh 1.4–1.45, warna text-3 |
| CTA | 16–17px / 800 (desktop 19px) |
| Chip | 13–15px / 700 |
| Badge | 11–12px / 800, pill |
| Harga/total | Geist Mono 600 |

### Ukuran & radius
- Target sentuh minimal **44px**. Input 52–60px. CTA bar bawah 56–58px. Chip jam 48px. Chip kota 36–42px.
- Radius: 10–12 (kecil/ikon), 14 (input, tombol sekunder), 16 (kartu, CTA HP), 18 (kartu pilihan besar, CTA desktop), 20–22 (kartu besar / tiket / preview), 999 (pill/chip), 44 (frame HP, hanya mockup).
- Spasi: kelipatan 2px. Gap umum 6/8/10/12/14/16/18/22. Padding konten HP `16px` samping; padding bawah konten **140px** (ruang bar aksi).

### Motion
| Hal | Nilai |
|---|---|
| Ganti langkah | fade + translateX(±16px), 240ms, `cubic-bezier(.2,.8,.2,1)`; arah ikut maju/mundur |
| Pop (konfirmasi muncul) | scale .92 → 1.02 → 1, 240ms |
| Bump preview saat data berubah | scale 1 → 1.08 rotate(-2deg) → 1, 260ms |
| Total harga | angka di-tween 280ms ease-out cubic |
| Pembuka | 3 cetakan naik (translateY 40px → 0), 560ms, stagger 90ms |
| Sukses | cetakan keluar dari slot printer (translateY -102% → 0), 600ms, delay 120ms; centang pop 320ms delay 500ms |
| Format cetak | 3 contoh jatuh masuk, 420ms, stagger 120ms |
| Tekan tombol | 100ms |
| Kalender menyusut setelah pilih tanggal | 500ms setelah tap |

`prefers-reduced-motion: reduce` → matikan semua animasi di atas, total langsung tampil.

---

## Layout

### HP (390 × 844, utama)
Struktur tetap untuk semua langkah wizard:
1. **Header berwarna fase** (border-bottom 1.5px tinta):
   - Baris 48px: grid `48px | 1fr | 48px` → tombol ← (44×44) · indikator 4 fase (pill 8px tinggi; fase aktif lebar 34px, lainnya 8px; selesai = isi tinta) · teks `n/4` Geist Mono 12px.
   - Blok pertanyaan (min-height 122px): label fase + judul + bantuan (opsional) di kiri; **mini preview cetakan** 100px di kanan (rotate 4deg) yang otomatis memuat nama acara/tanggal/format/tema terbaru.
2. **Konten** scroll vertikal, padding `20px 16px 140px`.
3. **Bar aksi tetap di bawah**: tombol lebar 56–58px, butter + shadow berlapis saat aktif. Saat nonaktif: latar `#F8F7F4`/putih, border tinta, label menjelaskan apa yang kurang (mis. "Pilih jam mulai"). Tidak ada garis putus-putus untuk nonaktif. Aman dari safe-area bawah dan keyboard.
4. Banner offline (jika tanpa koneksi) di bawah status bar: latar sky, border dashed, "Koneksi terputus. Isianmu tersimpan, lanjutkan saat sinyal kembali." Tombol aksi jadi "Menunggu koneksi…" (nonaktif).

### Desktop (1440 × 900)
- Pembuka: header 72px (logo kiri, "Sudah pernah booking? Masuk" kanan), grid 2 kolom `1fr 1fr`, padding `0 48px 0 120px`. Kiri judul + kalimat + CTA; kanan tumpukan 3 cetakan miring (strip −9°, polaroid 2°, 4R 8°). Lingkaran dekoratif pastel berborder (mint kanan atas 520px, peach kiri bawah 380px, lavender 60px).
- Wizard: grid **`600px | 1fr`**.
  - **Kiri (600px, warna fase)**: logo + "Chat admin"; stepper 4 fase horizontal (lingkaran 22px: selesai = hijau ✓, aktif = tinta, belum = putih; penghubung solid/dashed); "← Kembali"; judul langkah besar + bantuan; **panel kontekstual** (lihat tabel); kartu total + "DP minimal" di bawah (putih, border tinta, shadow berlapis).
  - **Kanan (paper)**: isi langkah (komponen yang sama dengan HP), lebar konten ±430px di tengah; bar aksi di bawah kolom kanan.

**Panel kontekstual kiri desktop per langkah:**
| Langkah | Isi panel kiri |
|---|---|
| Acaramu, Tanggal+Jam, Lokasi | Preview cetakan besar (format sesuai paket) |
| Paket, Durasi | Kartu paket terfokus: ikon, nama, "mulai Rp…", deskripsi, "Cocok untuk…", poin isi. Label "REKOMENDASI" (belum pilih) / "PAKET PILIHANMU" |
| Format + Backdrop | Perbandingan ukuran asli 3 format berdampingan dengan penggaris 15 cm + deskripsi tiap format |
| Tambahan | Penjelasan add-on yang sedang di-hover/fokus (ikon, nama, harga/unit, deskripsi) |
| Nama di cetakan | Preview besar + tab Strip / 4R / Polaroid (hanya mengganti preview, bukan pilihan) |
| Intip desain | Grid 3×2 contoh template; klik = ganti tema preview. Catatan 🔒 "Contoh katalog. Pilihan final setelah DP." (ikon lock Lucide, bukan emoji) |
| Kontak (+WO), Kode WA | **Tiket booking** draf: header butter "TIKET BOOKING" + badge "DRAF"; baris Acara/Tanggal/Paket; perforasi dashed dengan 2 lubang setengah lingkaran; blok "PEMESAN" (Nama, WhatsApp, Email, Lewat WO) yang terisi live, titik ✓ hijau per baris valid |
| Intip dashboard | Mockup dashboard booking: header peach (judul acara + "N hari lagi"), 4 tile 2×2, status "Draf · tanggal terkunci setelah DP" |

---

## Alur (14 layar wizard + pembuka, sukses, halaman booking)
Fase di indikator: **1 Acaramu · 2 Paket · 3 Tambahan · 4 Data kamu**.

```
Pembuka
 └ 1 Acaramu : Jenis acara → Tanggal + Jam → Lokasi
 └ 2 Paket   : Paket → Durasi + Unit → Format cetak + Backdrop  (paket tanpa cetak: layar Backdrop saja)
 └ 3 Tambahan: Add-on (boleh lewati)
 └ 4 Data    : Nama di cetakan → Intip desain → Kontak + WO → Kode WA (hanya jika nomor belum terverifikasi) → Intip dashboard
 └ Cek & kirim → Sukses → Halaman booking (lengkapi data → bayar DP)
```

Aturan navigasi:
- Pilihan tunggal (jenis acara, backdrop non-Tetra di layar backdrop terpisah) **auto-lanjut 240ms** setelah tap. Layar gabungan **tidak** auto-lanjut; tombol aktif setelah semua isian wajib lengkap.
- ← selalu mundur satu layar (arah animasi kebalikan). Dari layar pertama → pembuka.
- Dari "Cek & kirim", tap baris mana saja → buka layar terkait dalam **mode edit**: label tombol jadi "Simpan", ← dan Simpan kembali ke "Cek & kirim". Mengganti paket dalam mode edit → lanjut ke Durasi (dan Format jika perlu) sebelum kembali.
- Mengganti paket mereset durasi dan format.
- Layar Kode WA dilewati jika nomor sama dengan yang sudah terverifikasi.

### Detail tiap layar

**0. Pembuka**
- Copy: "Amankan tanggalmu. Kenangannya kami yang cetak." · "Sekitar 2 menit. Tanggal terkunci setelah DP." · CTA "Mulai booking →" (lingkaran mint 30/38px berisi →) · link "Sudah pernah booking? Masuk".
- **Tidak ada** foto klien, logo klien, angka "140+", testimoni. Cetakan contoh berisi ikon (komponen Print Preview), bukan foto wajah (alasan consent).
- Klien kembali (ada draf di storage): ganti CTA dengan kartu putih "Lanjutkan draf booking kamu?" + ringkasan (jenis · tanggal · paket) + tombol "Lanjutkan" (butter) + link "Mulai dari awal".

**1a. Jenis acara** — Judul "Hai! Acara apa yang mau kamu rayakan?". 6 kartu pilihan (grid 2 kolom) dengan chip ikon berwarna: Wedding, Engagement, Ulang tahun / Sweet 17, Corporate / Gathering, Wisuda / Kampus, Lainnya. Auto-lanjut.

**1b. Tanggal + Jam** — Judul "`{Jenis}`! Kapan hari H-nya?" · bantuan "Pilih tanggal, lalu jam mulainya."
- Kalender custom (kartu putih radius 20): header bulan + ‹ › (tidak bisa mundur sebelum bulan ini), grid 7 kolom mulai Senin, sel ≥44px. Tanggal lewat abu `#C9C6BF`; **penuh** dicoret (`line-through`, `#9A9892`); terpilih isi mint + border tinta, weight 800 (penuh terpilih: coral).
- Legenda kecil: tersedia / penuh / terpilih.
- Pilih tanggal penuh → kartu coral "Tanggal ini sudah penuh…" (pilih lain). Pilih tanggal tersedia → kartu pop "`{Hari, tgl Bulan}` · Tanggal ini masih tersedia ✓", lalu setelah 500ms kalender **menyusut** jadi satu kartu mint-soft (✓ hijau · tanggal · "Tanggal masih tersedia" · tombol "Ubah").
- **Jam mulai** muncul di bawah: judul 17/800 "Jam mulai" + "Kami cek slot booth-nya". Grid **4 kolom**: 7 chip (09:00, 11:00, 13:00, 15:00, 17:00, 18:00, 19:00) + chip ke-8 dashed **"Jam lain"** (berubah jadi "`HH:MM` ✓" mint-soft bila jam manual dipakai). Di bawahnya tombol "Jam belum pasti" (48px).
- "Jam lain" membuka panel: stepper Jam (−/+, langkah 1) dan Menit (−/+, langkah 15), angka Geist Mono 22px, tombol "Pakai jam `HH:MM`" (mint-soft). Tanpa `<input type=time>` / dropdown bawaan.
- Jam bentrok → kartu coral di layar yang sama; tombol "Jam ini penuh, pilih yang lain".
- Tombol: "Pilih tanggal dulu" → "Pilih jam mulai" → "Lanjut".
- Target: semua muat **tanpa scroll** di 390×844 setelah kalender menyusut.

**1c. Lokasi** — Judul "Di mana acaranya?" · "Kota wajib. Venue dan link Maps boleh menyusul." Tiga isian bernomor vertikal (lingkaran 30px: nomor putih di atas tinta; jadi ✓ hijau saat terisi; penghubung dashed):
1. **Kota** (wajib, min 3 huruf): input + chip cepat Bogor/Jakarta/Depok/Tangerang/Bekasi.
2. **Nama venue** ("Boleh menyusul"): nama yang biasa disebut, placeholder "Nama gedung, hotel, atau rumah".
3. **Lokasi di Google Maps** ("Boleh menyusul"), keterangan "Nama di Maps kadang beda. Link ini membantu tim kami menemukan lokasinya."
   - Tombol mint-soft `Cari "{venue}, {kota}" di Maps` (buka `https://www.google.com/maps/search/?api=1&query=…` di tab baru).
   - Input dashed "Tempel link dari tombol Bagikan" (`type=url`). Link valid (`maps.app.goo.gl`, `goo.gl/maps`, `google.*/maps`) → otomatis jadi kartu "✓ Link Maps tersimpan" + URL (mono 11px, ellipsis) + "Ganti". Teks bukan link Maps → error "Itu bukan link Google Maps. Salin dari tombol Bagikan di Maps."
   - Nama venue dan link Maps disimpan **terpisah** (2 data untuk saling validasi).
- Tombol: "Isi kota dulu" → "Lanjut".

**2a. Paket** — "Mau booth yang mana?" · "Ketuk paket untuk lihat penjelasannya." Daftar kartu: paket rekomendasi (sesuai jenis acara, lihat `recommendation`) di urutan pertama dengan badge. Tiap kartu: chip ikon, nama, "mulai Rp… · 2–8 jam". Tap = pilih + **expand** penjelasan (deskripsi, "Cocok untuk…", poin isi dengan ✓). Bundling Photo Stage + Photobooth ditonjolkan. Status memuat: skeleton kartu 600ms (pertama kali). Tombol "Lanjut pilih durasi".

**2b. Durasi + unit** — "Berapa jam `{paket}`?". Chip durasi sesuai paket (label "N jam" + harga Geist Mono) yang langsung berubah dengan unit. Stepper jumlah booth 1–3. Tombol "Lanjut · Rp…".

**2c. Format cetak + Backdrop** (paket dengan cetak) — "Hasil cetak & backdrop" · "Bandingkan ukurannya. Harga tidak berubah."
- Kartu "Bandingkan ukuran asli": 3 contoh skala sebenarnya berdampingan + penggaris 15 cm + ukuran (5 × 15 cm, 10 × 15 cm, bingkai polaroid). Animasi jatuh masuk.
- 3 kartu pilihan format (Strip 2R / 4R / Polaroid) + "Belum tahu, nanti saja". Deskripsi format terpilih muncul di bawah.
- Pemisah dashed, judul "Backdrop" · "Latar di belakang booth. Pakai punya siapa?" → 3 kartu: **Backdrop kain Tetra** ("Gratis. Pilih 1 dari 6 warna, tim kami yang pasang."), Dari klien / dekorasi venue, Belum tahu.
- Pilih kain Tetra → panel "Warna kain" (nama terpilih di kanan): grid 3×2 swatch 64px radius 12 dengan tekstur lipatan kain (stripe vertikal transparan), ✓ di tengah (tinta untuk White/Silver/Gold, putih untuk lainnya), ring terpilih `0 0 0 3px paper, 0 0 0 4.5px ink`. Warna: Red, White, Gold, Silver, Emerald Green, Blue. Catatan "Warna di layar bisa sedikit berbeda dengan kain aslinya."
- Tombol: "Pilih format cetak" → "Pilih backdrop" → "Pilih warna backdrop" → "Lanjut".
- Paket tanpa cetak (Video 360°, Magazine Box, Photo Stage): hanya layar Backdrop "Backdrop-nya pakai punya siapa?" (auto-lanjut kecuali pilih kain Tetra).

**3. Tambahan** — "Mau tambah sesuatu?" · "Opsional, boleh dilewati." Kartu kecil per add-on: chip ikon, nama, satu kalimat manfaat, "Rp… / unit" (mono), link "Apa ini?" (expand deskripsi), stepper − n + (atau tombol + saat 0). Kartu dengan qty>0: mint-soft + shadow terpilih. Tombol "Lewati" / "Lanjut · +Rp…".

**4a. Nama di cetakan** — "Nama apa yang tercetak di frame?" Input 60px dengan penghitung `n/40`, chip contoh dashed sesuai jenis acara (mis. "Rina & Dimas", "The Wedding of R & D"). HP: preview besar (kartu peach, 350px) + tab Strip/4R/Polaroid. Kartu "Yang tercetak di frame": 1 Nama acara, 2 Tanggal (otomatis), 3 Desain frame (dibuat tim Tetra). Min 2 karakter; error saat blur "Isi nama yang mau tercetak, ya."

**4b. Intip desain** (informasi, tidak ada pilihan wajib) — "Desain frame-nya kamu pilih nanti". HP: carousel horizontal 6 contoh template (tap = ganti tema preview). Dua kartu penjelasan: **Pilih dari katalog** (template siap pakai, nama & tanggal otomatis masuk) dan **Desain custom** (ceritakan tema/warna/referensi, tim desain Tetra yang membuat). Kartu butter 🔒(ikon lock) "**Terbuka setelah DP.** Diatur dari dashboard booking kamu." Tombol "Oke, lanjut".

**4c. Kontak + WO** — "Hai `{nama}`! Tinggal data kontak" / "Kenalan dulu, ya". Isian bertahap bernomor (sama dengan Lokasi). Isian berikutnya redup (opacity .4, disabled) sampai sebelumnya valid. Enter = pindah ke isian berikutnya.
1. **Nama kamu**: "Pemesan sekaligus pemilik acara." `autocomplete=name`.
2. **Nomor WhatsApp**: "Kode verifikasi dan semua kabar booking dikirim ke sini." Prefix tetap `+62` (kotak 62px, garis pemisah) di dalam input; `type=tel inputmode=tel`; menerima `08…`, `8…`, `62…`, `+62…` → dinormalisasi; format tampil `812 3456 7890`. Valid: `^8\d{8,11}$`. Badge "✓ Terverifikasi" bila sudah. Error: "Nomor WhatsApp belum valid. Contoh: 812 3456 7890".
3. **Email** ("Opsional"): "Untuk kirim invoice dan kuitansi." `type=email inputmode=email`. Error: "Format email belum benar. Contoh: nama@email.com".
- Blok "Kamu memesan sebagai…" ("Opsional"): 2 kartu toggle — Pemilik acara / keluarga · WO / vendor. Pilih WO → isian nama WO + WA klien.
- Kartu sky dengan ikon shield: "Datamu hanya dipakai untuk booking ini. Tidak ada spam."
- Validasi saat field ditinggalkan (blur), bukan saat mengetik. Error = border coral-strong + titik 8px coral + teks 13–14/600.
- Tombol: "Isi nama kamu dulu" → "Isi nomor WhatsApp dulu" → ("Cek lagi format email" / "Lengkapi data WO dulu") → **"Kirim kode verifikasi"** (atau "Lanjut" jika sudah terverifikasi).

**4d. Kode WA** — "Cek WhatsApp kamu" · "Kode 6 digit dikirim ke +62 …". 6 kotak 60px (mono 24px), satu input tersembunyi `inputmode=numeric autocomplete=one-time-code maxlength=6`; kotak aktif ber-ring mint. Benar → kartu mint-soft "✓ Nomor terverifikasi", auto-lanjut 600ms. Salah → border coral + "Kodenya belum cocok. Cek lagi pesan WhatsApp-nya." Kedaluwarsa → kartu coral + "Kirim kode baru". Hitung mundur "Kirim ulang dalam 00:45" → link "Kirim ulang kode". Link "Ganti nomor". Kartu petunjuk: "Buka WhatsApp, cari pesan dari **Tetra Photobooth**, lalu ketik 6 angka di atas."

**4e. Intip dashboard** (informasi) — "`{nama}`, ini dashboard kamu nanti" · "Setelah kirim booking, semua diatur dari sini." HP: mockup dashboard kecil + daftar 4 fitur dengan badge kapan tersedia: Desain frame (Setelah DP), Lengkapi data acara (Langsung), DP & pelunasan (Langsung), Galeri foto acara (Setelah acara). Tombol "Lanjut ke ringkasan".

**5. Cek & kirim** — "Ini booking kamu, `{nama}`" · "Ketuk baris mana saja untuk mengubah." Baris ringkasan (ikon, label, nilai, "Ubah"): Acara, Tanggal & jam, Lokasi (venue · kota · Maps ✓), Paket (nama · jam · unit · format), Backdrop ("Kain Tetra · `{warna}`"), Tambahan, Nama di cetakan, Pemesan (+62 … ✓), Email, Lewat WO. Total (tween) + **DP minimal**, link kebijakan refund, checkbox persetujuan pengolahan data (UU PDP) wajib. Tombol **"Kirim booking"** → "Mengirim…".

**6. Sukses** — Latar mint-soft. Slot printer (bar tinta 16px) dengan cetakan contoh keluar ke bawah. ✓ + "Booking terkirim!". Kartu peach: "Status masih **draf**, jadi **tanggalmu belum terkunci**. Tanggal terkunci setelah DP dibayar." Kode booking (mono), ringkasan, langkah berikutnya (1 Lengkapi 3 data · 2 Bayar DP · 3 Tanggal terkunci). Tombol "Buka halaman booking" + "Chat admin di WhatsApp".

**7. Halaman booking (portal, MVP)** — Header peach: judul acara + status ("Draf · tanggal belum terkunci" / "Menunggu verifikasi DP"). Gerbang 3 data wajib sebelum bayar (Nama acara, Nama pemilik acara, Venue; prefilled dari booking). Kartu DP terkunci sampai 3 data lengkap; lalu upload bukti transfer (JPG/PNG/HEIC/PDF, maks 10 MB, error jelas). Data lain bertahap dalam accordion: WA pemilik acara, Alamat venue & Maps, PIC hari H, Jumlah tamu (chip), Rundown (baris jam + acara, maks 30), Catatan.

### Status yang harus ada
Tanggal penuh · jam bentrok · error isian (WA/email/nama) · kode OTP salah · kode kedaluwarsa · memuat paket (skeleton) · tanpa koneksi · klien kembali (lanjutkan draf) · tombol nonaktif dengan alasan · file bukti tidak valid.

## State & data

```ts
type BookingDraft = {
  screen: Step; event: EventId | null;
  date: { y: number; m: number; d: number } | null; time: string | 'unsure' | null; // "HH:MM"
  city: string; venue: string; mapsUrl: string;
  pkg: PackageId | null; dur: number | null; units: 1 | 2 | 3;
  fmt: 'strip' | '4r' | 'polaroid' | 'later' | null;
  backdrop: 'tetra' | 'client' | 'later' | null; bdColor: 'red'|'white'|'gold'|'silver'|'emerald'|'blue' | null;
  adds: Record<AddonId, number>; title: string;
  name: string; wa: string /* digits tanpa 62/0 */; waVerified: string; email: string;
  wo: 'yes' | 'no' | null; woName: string; woWa: string; consent: boolean;
};
```
- **Autosave** setiap perubahan (prototipe: localStorage `tetra-booking-proto-v4`; produksi: localStorage + autosave server ke lead/draf setelah nomor WA terverifikasi). Buka ulang → kartu "Lanjutkan draf".
- **Harga & DP dihitung server.** Total = harga paket[dur] × units + Σ add-on × qty. DP minimal dari `system_config`.
- Ketersediaan tanggal/jam dari `api/availability`. OTP via bot WhatsApp yang ada. Kirim booking → lead/draf (bukan booking resmi; resmi setelah DP terkonfirmasi).
- Pemesan ≠ pemilik acara: simpan terpisah (pemilik acara diisi di halaman booking, default = pemesan).

## Aset
- Logo: `reference/assets/logo/tetra-putih.png` (di prototipe di-`invert` jadi gelap). Pakai logo resmi dari repo bila ada.
- Ikon: **Lucide** (versi 0.460, nama ikon ada di `data/booking-data.json`). Di produksi pakai `lucide-react`.
- Contoh cetakan = komponen ikon (`Print Preview`), bukan foto. Foto asli hanya boleh dipakai setelah ada consent klien.
- Tidak ada foto klien/logo klien di alur ini.

## Kriteria selesai (cek sebelum dianggap beres)
- [ ] Semua layar & status di atas ada, copy sama persis (Bahasa Indonesia, menyapa "kamu").
- [ ] HP 390×844 dibandingkan berdampingan dengan prototipe; layar Tanggal+Jam tanpa scroll.
- [ ] Desktop 1440×900 dua kolom dengan panel kontekstual kiri per langkah.
- [ ] Tidak ada `<select>`, `<input type=date/time>`, dropdown/color picker bawaan.
- [ ] Target sentuh ≥44px, input ≥16px, keyboard sesuai (tel/email/numeric/url).
- [ ] Bar aksi bawah aman dari safe-area & keyboard; label nonaktif menjelaskan alasan.
- [ ] Draf tersimpan; kembali dari WhatsApp tetap di langkah yang sama.
- [ ] `prefers-reduced-motion` dihormati.
- [ ] Tanpa serif, gradient, glassmorphism, emoji, shadow blur.
