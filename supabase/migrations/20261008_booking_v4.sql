-- Booking v4 (docs/design/booking-v4): data yang dibutuhkan desain baru.
-- Aditif & idempoten.

-- 1. Jenis acara "Engagement" (kartu baru di langkah Acaramu).
INSERT INTO event_types (code, label, is_active, display_order)
VALUES ('engagement', 'Engagement', true, 2)
ON CONFLICT (code) DO NOTHING;

-- 2. Paket combo boleh pilih format cetak Strip 2R / Polaroid, harga sama
--    dengan 4R ("Harga tidak berubah" di desain). Disalin dari baris 4R.
INSERT INTO packages (
	name, category, frame_size, duration_hours, base_price, description,
	default_consumables_estimate, is_active, bundle_id, quotation_includes,
	is_public, public_description, public_sort
)
SELECT
	replace(p.name, ' - ', CASE f.frame WHEN '2R' THEN ' (Strip 2R) - ' ELSE ' (Polaroid) - ' END),
	p.category, f.frame::frame_size, p.duration_hours, p.base_price, p.description,
	p.default_consumables_estimate, p.is_active, p.bundle_id, p.quotation_includes,
	p.is_public, p.public_description, p.public_sort
FROM packages p
CROSS JOIN (VALUES ('2R'), ('polaroid')) AS f(frame)
WHERE p.category IN ('photostage_combo', 'magazine_combo')
	AND p.frame_size = '4R'
	AND p.deleted_at IS NULL
	AND NOT EXISTS (
		SELECT 1 FROM packages q
		WHERE q.category = p.category
			AND q.duration_hours = p.duration_hours
			AND q.frame_size = f.frame::frame_size
			AND q.deleted_at IS NULL
	);
