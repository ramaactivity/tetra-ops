-- 20261022_vendor_signup.sql
-- Rekanan daftar sendiri (/rekanan/daftar) atau diundang bot WA
-- (POST /api/bot/undang-vendor), DR-050. Status calon disimpan di
-- vendor_settings.partner_level = 'calon'; kolom ini hanya menyimpan isian
-- pendaftaran untuk ditinjau owner di Pusat Vendor. Aditif & idempotent.
ALTER TABLE contacts
	ADD COLUMN IF NOT EXISTS vendor_signup jsonb;
COMMENT ON COLUMN contacts.vendor_signup IS
	'Vendor dari pendaftaran mandiri / undangan bot: {jenis, kota, instagram, sumber, wa_jid, at}. NULL = dibuat owner.';
