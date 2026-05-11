-- 20260514_vendor_pic.sql
-- Add vendor_pic_name to events. Vendor = company (PT/CV/EO);
-- vendor_pic_name = sales/account-manager dari vendor tersebut yang
-- jadi kontak utama Tetra. Misal: vendor "Partner Organizer", PIC-nya
-- bernama Nisa. WA Nisa tersimpan di vendor_contact (existing column).
-- Idempotent.

ALTER TABLE events
	ADD COLUMN IF NOT EXISTS vendor_pic_name TEXT;

COMMENT ON COLUMN events.vendor_pic_name IS
	'Nama sales / account manager dari vendor yang jadi kontak Tetra. Pair-nya dengan vendor_contact (WA). Misal vendor_name="Partner Organizer", vendor_pic_name="Nisa", vendor_contact="08xxx".';
