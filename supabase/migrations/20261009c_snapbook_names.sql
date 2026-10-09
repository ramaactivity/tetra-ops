-- Migration: Guest Cam tampil ke klien sebagai "Snapbook" (keputusan owner 9 Okt, Booth #228).
-- Hanya nama yang terlihat (add-on → invoice/quotation, paket). Kode/addon_group/kontrak tetap guest_cam.
-- Dokumen yang sudah terbit tetap memakai nama lama (snapshot). Idempotent.
UPDATE addons SET name = 'Snapbook (Guest Cam) · ' || CASE WHEN max_guests IS NULL THEN 'tamu tak terbatas' ELSE max_guests || ' tamu' END
WHERE addon_group = 'guest_cam' AND deleted_at IS NULL AND name NOT LIKE 'Snapbook%';
UPDATE addons SET name = 'Snapbook: simpan 1 tahun' WHERE name = 'Guest Cam: simpan 1 tahun' AND deleted_at IS NULL;
UPDATE addons SET name = 'Snapbook: kartu QR tambahan' WHERE name = 'Guest Cam: kartu QR tambahan' AND deleted_at IS NULL;
UPDATE packages SET name = 'Snapbook (tanpa booth)',
	public_description = 'Buku tamu versi kekinian: tamu memotret dari HP lewat QR, foto + voice note + photo frame masuk satu album. Tanpa booth.'
WHERE category = 'guest_cam' AND deleted_at IS NULL;
