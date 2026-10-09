-- Migration: Pusat Vendor (owner 9 Okt 2026). Pengaturan fitur rekanan per vendor.
-- contacts.vendor_settings (vendor saja), semua opsional — kosong = bawaan:
--   portal_enabled (true)              : dasbor rekanan & akses WO portal aktif
--   show_commission (true)             : rekap komisi tampil di dasbor rekanan
--   can_invite_clients (true)          : vendor boleh mengundang kliennya ke dashboard acara
--   client_price_visible_default (false): booking baru vendor ini — klien undangan melihat harga
--   partner_level ("reguler")          : reguler | prioritas | nonaktif-sementara (label internal)
-- Idempotent.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS vendor_settings jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN contacts.vendor_settings IS
	'Vendor saja: pengaturan fitur rekanan (lihat src/lib/vendor-settings.ts). Kosong = bawaan.';
