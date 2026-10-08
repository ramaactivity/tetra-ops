-- Migration: katalog Guest Cam final (ACC owner 8 Okt 2026) — menggantikan Guest Cam rata DR-041.
-- Sumber: TETRA BOOTH APP/handoff/REKAP-PRICING-GUEST-CAM-ADDON.md.
-- - Kategori paket baru `guest_cam` (Guest Cam tanpa booth, tidak mengunci unit booth).
-- - addons: hpp (biaya Tetra, owner-only), max_guests (tier), addon_group (aturan pilih-satu),
--   print_size (ukuran cetak foto tamu).
-- - Diskon bundling -15% DITUNDA (owner).
-- Semua baris baru masuk is_public=false; dibuka oleh 20261008f setelah kode baru ter-deploy.
-- Idempotent.

ALTER TYPE service_type ADD VALUE IF NOT EXISTS 'guest_cam';

ALTER TABLE addons ADD COLUMN IF NOT EXISTS hpp bigint;
ALTER TABLE addons ADD COLUMN IF NOT EXISTS max_guests int;
ALTER TABLE addons ADD COLUMN IF NOT EXISTS addon_group text;
ALTER TABLE addons ADD COLUMN IF NOT EXISTS print_size text;
COMMENT ON COLUMN addons.hpp IS 'Biaya Tetra per unit (HPP). Owner-only — jangan pernah dikirim ke crew/klien.';
COMMENT ON COLUMN addons.max_guests IS 'Tier Guest Cam / cetak: maks. tamu; NULL di grup guest_cam = tak terbatas.';
COMMENT ON COLUMN addons.addon_group IS 'guest_cam | guest_print | guest_print_100 | print_station | guest_cam_extra — aturan di src/lib/portal/core.ts';
COMMENT ON COLUMN addons.print_size IS '2R | polaroid | 4R untuk grup guest_print*';

-- Guest Cam rata (DR-041) diganti tier.
UPDATE addons SET is_active = false, is_public = false, deleted_at = now()
WHERE name IN ('Guest Cam Digital', 'Guest Cam + Print', 'Guest Cam: tamu tak terbatas')
  AND deleted_at IS NULL;
UPDATE addons SET hpp = 15000, addon_group = 'guest_cam_extra', unit = 'acara'
WHERE name = 'Guest Cam: simpan 1 tahun' AND deleted_at IS NULL;

INSERT INTO addons (name, unit, price, hpp, category, requires_extra_crew, is_active, is_public, max_guests, addon_group, print_size)
SELECT v.name, v.unit, v.price, v.hpp, v.category::addon_category, false, true, false, v.max_guests, v.grp, v.size
FROM (VALUES
  ('Guest Cam S · 100 tamu', 'acara', 450000, 80000, 'experience', 100, 'guest_cam', NULL),
  ('Guest Cam M · 200 tamu', 'acara', 600000, 85000, 'experience', 200, 'guest_cam', NULL),
  ('Guest Cam L · 300 tamu', 'acara', 750000, 115000, 'experience', 300, 'guest_cam', NULL),
  ('Guest Cam XL · 500 tamu', 'acara', 950000, 125000, 'experience', 500, 'guest_cam', NULL),
  ('Guest Cam tak terbatas', 'acara', 1200000, 170000, 'experience', NULL, 'guest_cam', NULL),
  ('Cetak foto tamu Strip 2R · 100', 'acara', 400000, 135000, 'print_extras', 100, 'guest_print', '2R'),
  ('Cetak foto tamu Strip 2R · 200', 'acara', 750000, 270000, 'print_extras', 200, 'guest_print', '2R'),
  ('Cetak foto tamu Strip 2R · 300', 'acara', 1100000, 405000, 'print_extras', 300, 'guest_print', '2R'),
  ('Cetak foto tamu Strip 2R · 500', 'acara', 1750000, 675000, 'print_extras', 500, 'guest_print', '2R'),
  ('Cetak foto tamu Strip 2R · per 100', '100 tamu', 375000, 135000, 'print_extras', NULL, 'guest_print_100', '2R'),
  ('Cetak foto tamu Polaroid · 100', 'acara', 450000, 152500, 'print_extras', 100, 'guest_print', 'polaroid'),
  ('Cetak foto tamu Polaroid · 200', 'acara', 850000, 305000, 'print_extras', 200, 'guest_print', 'polaroid'),
  ('Cetak foto tamu Polaroid · 300', 'acara', 1250000, 457500, 'print_extras', 300, 'guest_print', 'polaroid'),
  ('Cetak foto tamu Polaroid · 500', 'acara', 2000000, 762500, 'print_extras', 500, 'guest_print', 'polaroid'),
  ('Cetak foto tamu Polaroid · per 100', '100 tamu', 425000, 152500, 'print_extras', NULL, 'guest_print_100', 'polaroid'),
  ('Cetak foto tamu 4R · 100', 'acara', 750000, 255000, 'print_extras', 100, 'guest_print', '4R'),
  ('Cetak foto tamu 4R · 200', 'acara', 1400000, 510000, 'print_extras', 200, 'guest_print', '4R'),
  ('Cetak foto tamu 4R · 300', 'acara', 2100000, 765000, 'print_extras', 300, 'guest_print', '4R'),
  ('Cetak foto tamu 4R · 500', 'acara', 3500000, 1275000, 'print_extras', 500, 'guest_print', '4R'),
  ('Cetak foto tamu 4R · per 100', '100 tamu', 700000, 255000, 'print_extras', NULL, 'guest_print_100', '4R'),
  ('Print Station · Bogor', 'acara', 750000, 480000, 'experience', NULL, 'print_station', NULL),
  ('Print Station · luar Bogor', 'acara', 1200000, 780000, 'experience', NULL, 'print_station', NULL),
  ('Print Station · extend 1 jam', '1 Jam', 150000, 50000, 'time_extras', NULL, 'print_station_extend', NULL),
  ('TV Live Gallery 55"', 'acara', 1500000, 1000000, 'experience', NULL, 'tv', NULL),
  ('Guest Cam: kartu QR tambahan', 'box', 60000, 25000, 'experience', NULL, 'guest_cam_extra', NULL)
) AS v(name, unit, price, hpp, category, max_guests, grp, size)
WHERE NOT EXISTS (SELECT 1 FROM addons a WHERE a.name = v.name AND a.deleted_at IS NULL);

-- Paket guest_cam berharga Rp0: harganya datang dari tier Guest Cam (add-on wajib).
ALTER TABLE packages DROP CONSTRAINT IF EXISTS positive_price;
ALTER TABLE packages ADD CONSTRAINT positive_price CHECK (base_price > 0 OR category = 'guest_cam');

-- Paket "Guest Cam saja" (tanpa booth). Harga = tier Guest Cam (add-on wajib), paket Rp0.
-- 4 jam = jam acara / Print Station (maks 4 jam, extend per jam).
INSERT INTO packages (name, category, frame_size, duration_hours, base_price, is_active, is_public, public_description, public_sort)
SELECT 'Guest Cam (tanpa booth)', 'guest_cam', 'none', 4, 0, true, false,
  'Tamu memotret dari HP sendiri lewat QR, semua masuk satu album. Tanpa booth.', 90
WHERE NOT EXISTS (SELECT 1 FROM packages WHERE category = 'guest_cam' AND deleted_at IS NULL);
