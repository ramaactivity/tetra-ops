# API Ketersediaan Unit — SIAP DIPAKAI (Tetra Ops → WA Bot)

Endpoint cek ketersediaan unit photobooth **sudah jadi & live**. Dokumen ini kontrak
final + contoh nyata untuk tim bot. 4 keputusan kemarin sudah kami terapkan semua.

Status: ✅ deployed. Tinggal token dipasang (lihat §2).
Disiapkan dari sisi Tetra Ops, 2026-06-26.

---

## 1. Endpoint

```
GET https://tetra-ops-lac.vercel.app/api/availability
```

Query params:

| Param | Wajib | Format | Keterangan |
|---|---|---|---|
| `date` | ya | `YYYY-MM-DD` | Tanggal acara |
| `start` | ya | `HH:mm` | Jam mulai photobooth |
| `end` | ya | `HH:mm` | Jam selesai photobooth (= start + durasi paket; default 2 jam kalau paket belum dipilih) |
| `city` | opsional | teks | Kota/venue acara — dipakai hitung buffer. **Sangat disarankan diisi** (lihat §6) |

Header wajib:
```
Authorization: Bearer <AVAILABILITY_API_TOKEN>
```

---

## 2. Token

- Token kami **generate dari sisi Tetra Ops** dan kirim ke kalian **lewat channel aman**
  (WhatsApp/PM langsung — **bukan** di dokumen/repo ini).
- Simpan di **env VPS bot** sebagai `AVAILABILITY_API_TOKEN`, kirim di header tiap request.
- Token salah / tidak ada → `401`.

> Catatan keamanan: kalau token belum kami set di server, endpoint **menolak semua**
> (401) di production — jadi tidak ada data bocor saat masa transisi.

---

## 3. Response sukses (200)

```json
{
  "date": "2026-06-28",
  "window": "11:00-13:00",
  "units_total": 3,
  "units_free": 2,
  "available": true,
  "conflicts": [
    { "project": "Farah & Ryan", "time": "11:00-13:00", "city": "Bogor", "buffer_min": 180 }
  ],
  "buffer_applied_minutes": 180,
  "assumptions": []
}
```

| Field | Tipe | Arti |
|---|---|---|
| `date` | string | echo dari request |
| `window` | string | jam yang diminta, dinormalisasi `HH:mm-HH:mm` |
| `units_total` | int | selalu `3` |
| `units_free` | int | unit yang masih bebas di window itu (`3 − max overlap`) |
| `available` | bool | `units_free > 0` |
| `conflicts[]` | array | booking existing yang bentrok (sesudah buffer) |
| `conflicts[].project` | string | nama klien (mis. pasangan) |
| `conflicts[].time` | string | jam pakai photobooth booking itu, atau `"tanpa jam (ditahan seharian)"` |
| `conflicts[].city` | string\|null | kota booking itu (bisa null kalau belum diisi) |
| `conflicts[].buffer_min` | int | buffer (menit) yang dipakai untuk booking itu |
| `buffer_applied_minutes` | int | buffer terbesar yang benar-benar diterapkan; `0` kalau tak ada bentrok |
| `assumptions[]` | string[] | catatan asumsi/default — **pakai ini buat disclaimer ke customer** |

### Contoh: hari kosong (semua unit bebas)
```json
{ "date": "2027-01-15", "window": "10:00-12:00", "units_total": 3, "units_free": 3,
  "available": true, "conflicts": [], "buffer_applied_minutes": 0, "assumptions": [] }
```

### Contoh: tanpa `city` → ada disclaimer
```json
{
  "date": "2026-06-28", "window": "11:00-13:00",
  "units_total": 3, "units_free": 2, "available": true,
  "conflicts": [ { "project": "Farah & Ryan", "time": "11:00-13:00", "city": "Bogor", "buffer_min": 180 } ],
  "buffer_applied_minutes": 180,
  "assumptions": [ "Kota acara tidak diberikan → buffer default 3 jam dipakai untuk semua perhitungan." ]
}
```
> Saran kalimat bot saat `assumptions` tidak kosong:
> *"Perkiraan ya kak 🙏 nanti tim kami konfirmasi final."*

---

## 4. Response error

| Kode | Kapan | Body |
|---|---|---|
| `400` | `date` bukan `YYYY-MM-DD` | `{"error":"Param \`date\` wajib, format YYYY-MM-DD."}` |
| `400` | `start`/`end` bukan `HH:mm` | `{"error":"Param \`start\` & \`end\` wajib, format HH:mm."}` |
| `400` | `end` ≤ `start` | `{"error":"\`end\` harus setelah \`start\`."}` |
| `401` | token salah/kosong | `{"error":"Unauthorized"}` |
| `500` | error internal | `{"error":"<pesan>"}` |

---

## 5. Cara hitung (ringkas, biar paham angkanya)

1. Ambil semua booking di `date` (status batal/arsip dibuang; **draft tetap dihitung**).
2. Window tiap booking = jam pakai photobooth-nya.
3. Lebarkan jadi `[mulai − buffer, selesai + buffer]`. Buffer dari jarak kota booking itu
   vs `city` yang diminta: **kota sama / sama-sama Jabodetabek = 3 jam**, **luar kota = 4 jam**,
   **kota tak diketahui = 3 jam (default)**.
4. `units_free = 3 − (jumlah unit terpakai berbarengan)` di dalam window yang diminta.
5. `available = units_free > 0`.

Keputusan konservatif yang dipakai (sesuai jawaban kalian):
- **Draft/tentatif mengunci unit** (biar tak over-promise).
- **Buffer default 3 jam** saat kota tak diketahui.
- **Booking tanpa jam → tahan 1 unit seharian** (saat ini cuma 2 kasus di data).

---

## 6. Yang perlu kalian tahu (penting)

- **Akurasi buffer bergantung data kota.** Saat ini `venue_city` baru terisi di ~16% booking,
  jadi mayoritas perhitungan pakai buffer default 3 jam. Selama venue masih seputar
  Bogor/Jabodetabek ini aman. Pengisian `venue_city` rutin = pekerjaan sisi Tetra Ops.
- **Selaras dengan alur admin-confirm kalian:** endpoint ini sengaja konservatif. Aman dipakai
  buat "aku cekin slotnya ya kak", lalu admin finalisasi. Auto-answer ke customer silakan
  dinyalakan setelah kalian yakin stabil.
- **Read-only.** Belum ada create booking dari bot — itu fase berikutnya, diskusi terpisah.

---

## 7. Contoh panggilan

```bash
curl -H "Authorization: Bearer $AVAILABILITY_API_TOKEN" \
  "https://tetra-ops-lac.vercel.app/api/availability?date=2026-07-11&start=11:00&end=13:00&city=Bogor"
```

Ada yang kurang jelas atau butuh field tambahan di response, kabari ya.

— Tetra Ops
