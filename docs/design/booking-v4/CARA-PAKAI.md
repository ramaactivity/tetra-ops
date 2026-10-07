# Cara pakai paket handoff ini

## Isi folder
| File | Fungsi |
|---|---|
| `00-META-PROMPT.md` | Prompt yang ditempel ke Claude Code di repo **tetra-ops** |
| `README.md` | Spesifikasi lengkap: token, layout, alur, copy, status, kriteria selesai |
| `CARA-PAKAI.md` | Dokumen ini |
| `data/booking-data.json` | Teks paket, add-on, format cetak, backdrop + warna, jam, kota |
| `reference/` | Prototipe HTML v4 (acuan visual & perilaku) + logo |

## Langkah
1. **Salin folder** ke repo Tetra Ops:
   `~/Desktop/tetra-ops/docs/design/booking-v4/`
   (simpan juga salinannya di `TETRA BOOTH APP/handoff/` sebagai arsip).
2. **Cek prototipe** di komputer: buka terminal di folder `reference/`, jalankan `npx serve .`, buka `Booking Tetra v4.dc.html`. Klik kotak alur dan tombol "Cek status" untuk melihat semua layar dan status. File perlu dibuka lewat server lokal (bukan klik dua kali) supaya komponen anak ikut termuat.
3. **Buka Claude Code** di `~/Desktop/tetra-ops`, tempel isi `00-META-PROMPT.md` (bagian di bawah garis).
4. Claude akan membaca dokumen dan mengirim **rencana + pertanyaan**. Jawab pertanyaan placeholder (DP, katalog template, warna kain, refund). Setujui rencana.
5. Minta Claude mengerjakan **per bagian** dan berhenti untuk review di tiap titik:
   1. Token + primitif (tombol, kartu pilihan, input, kalender, chip jam, OTP, bar bawah, preview cetakan)
   2. Fase 1 Acaramu (jenis → tanggal + jam → lokasi)
   3. Fase 2 Paket (paket → durasi → format + backdrop)
   4. Fase 3 Tambahan
   5. Fase 4 Data kamu (nama cetakan → intip desain → kontak + WO → OTP → intip dashboard)
   6. Cek & kirim, Sukses
   7. Halaman booking (lengkapi data + bukti DP)
   8. Desktop (panel kiri kontekstual) dan status (offline, skeleton, draf kembali)
6. **Review tiap bagian** dengan membandingkan screenshot HP & desktop dari Claude terhadap prototipe. Minta perbaikan spesifik, misalnya: "jarak antar chip jam harus 8px", "label tombol nonaktif harus 'Pilih jam mulai'".

## Tips agar hasilnya konsisten dan presisi
- Selalu rujuk **nama layar dan nilai** dari README ("layar 1b, chip jam 48px, grid 4 kolom"), jangan deskripsi umum seperti "rapikan".
- Kalau Claude menambah elemen yang tidak ada di desain (ikon, statistik, kalimat), minta dihapus. README adalah batasnya.
- Minta Claude menyimpan screenshot perbandingan di `docs/design/booking-v4/compare/` per layar.
- Perubahan desain berikutnya: ubah prototipe dulu di Claude Design, ekspor ulang handoff, lalu minta Claude Code menyinkronkan hanya bagian yang berubah.
- Jangan pakai foto klien di alur booking sebelum ada data consent dari form baru.

## Yang masih perlu diputuskan owner
- Besaran DP final dan link kebijakan refund
- Katalog template frame asli (nama, gambar, kategori)
- Kode warna atau foto kain backdrop Basic
- Kapan galeri foto bisa diakses klien
- Perlu pencarian venue otomatis (Google Places API, berbayar) atau cukup tempel link Maps (MVP)
