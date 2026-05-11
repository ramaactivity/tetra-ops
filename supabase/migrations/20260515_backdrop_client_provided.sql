-- 20260515_backdrop_client_provided.sql
-- Tambah type 'client_provided' ke backdrop_type enum + seed satu
-- entry "Klien Bawa Vendor Decor Sendiri" sebagai opsi dropdown.
--
-- Konteks backdrop sekarang punya 4 skema:
--   1. basic_included  → Backdrop standar Tetra (gratis)
--   2. rental_owned    → Backdrop rental Tetra (bayar fixed)
--   3. vendor_decor    → Klien request konsep custom → Tetra cariin
--                        vendor rekanan + markup
--   4. client_provided → Klien sudah hire vendor sendiri (no markup,
--                        Tetra cuma execute photobooth)
--
-- Idempotent. ALTER TYPE ADD VALUE harus standalone (di luar
-- transaction block) — run as separate query di Supabase SQL Editor.

ALTER TYPE backdrop_type ADD VALUE IF NOT EXISTS 'client_provided';

-- Seed sentinel backdrop entry (idempotent via NOT EXISTS)
INSERT INTO backdrops (code, name, type, rental_price, is_active, display_order, description)
SELECT
	'CLIENT-PROVIDED',
	'Klien Bawa Vendor Decor Sendiri',
	'client_provided',
	0,
	true,
	999,
	'Klien sudah hire vendor dekorasi mereka sendiri — Tetra cuma execute photobooth tanpa markup vendor decor.'
WHERE NOT EXISTS (SELECT 1 FROM backdrops WHERE code = 'CLIENT-PROVIDED');
