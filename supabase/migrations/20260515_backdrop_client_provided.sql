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
-- ⚠️ INSTRUKSI EKSEKUSI:
-- PostgreSQL TIDAK MENGIZINKAN nilai enum baru dipakai di query yang
-- sama (transaction yang sama). Jalankan SETIAP BLOCK secara terpisah
-- di Supabase SQL Editor — kosongkan editor antar block.
-- =========================================================================

-- === BLOCK 1: Tambah nilai enum baru. Run ini sendirian. ===
-- ALTER TYPE backdrop_type ADD VALUE IF NOT EXISTS 'client_provided';

-- === BLOCK 2 (verify): cek apakah enum value sudah masuk. ===
-- SELECT enumlabel FROM pg_enum
-- WHERE enumtypid = 'backdrop_type'::regtype
-- ORDER BY enumsortorder;
-- ↑ Harus include 'client_provided' di list. Kalau tidak ada,
--   ulang block 1.

-- === BLOCK 3: Seed sentinel backdrop entry. Run ini setelah block 1 sukses. ===
-- INSERT INTO backdrops (code, name, type, rental_price, is_active, display_order, description)
-- SELECT
--     'CLIENT-PROVIDED',
--     'Klien Bawa Vendor Decor Sendiri',
--     'client_provided',
--     0,
--     true,
--     999,
--     'Klien sudah hire vendor dekorasi mereka sendiri — Tetra cuma execute photobooth tanpa markup vendor decor.'
-- WHERE NOT EXISTS (SELECT 1 FROM backdrops WHERE code = 'CLIENT-PROVIDED');

-- =========================================================================
-- Untuk fresh schema setup (CI / new env), urutan tetap sama tapi
-- bisa di-run bareng karena enum value bukan dari script ini sendiri:
ALTER TYPE backdrop_type ADD VALUE IF NOT EXISTS 'client_provided';
