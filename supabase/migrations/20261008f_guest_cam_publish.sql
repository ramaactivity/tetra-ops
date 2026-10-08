-- Migration: buka katalog Guest Cam ke booking publik. Jalankan SETELAH kode 20261008e ter-deploy
-- (wizard lama tidak mengenal addon_group/kategori guest_cam). Idempotent.
UPDATE addons SET is_public = true
WHERE deleted_at IS NULL AND is_active
  AND addon_group IN ('guest_cam', 'guest_print', 'guest_print_100', 'print_station', 'print_station_extend', 'tv', 'guest_cam_extra');
UPDATE packages SET is_public = true WHERE category = 'guest_cam' AND deleted_at IS NULL;
