-- 20260929c_addon_extra_hour.sql
-- "Free 1 jam" untuk bonus klien (Rama, 29 Sep 2026). Bonus di form booking
-- memilih dari master add-on, jadi durasi tambahan dibuat sebagai add-on
-- Time Extras. Sebagai bonus = gratis (tidak masuk grand total); sebagai
-- add-on berbayar = tarif extend Rp 500.000/jam. Idempotent.
INSERT INTO addons (name, unit, price, category, requires_extra_crew, is_active)
SELECT 'Tambahan Durasi 1 Jam', '1 Jam', 500000, 'time_extras', false, true
WHERE NOT EXISTS (
	SELECT 1 FROM addons WHERE name = 'Tambahan Durasi 1 Jam' AND deleted_at IS NULL
);
