-- ============================================================================
-- 20260811e_crew_payment_admin_fee.sql
--
-- Biaya admin bank PER CREW, bukan satu angka untuk semua transfer.
--
-- Tiap crew punya rekening tujuan berbeda, jadi ongkos transfernya juga beda:
-- ke GoPay Rp1.000, BCA→BRI Rp2.500, sesama BCA Rp0. Satu angka "per transfer"
-- memaksa owner memakai angka rata-rata yang pasti salah di salah satu sisi.
--
-- Nilainya dipakai dua jalur pembayaran yang sudah ada:
--   • rencana bayar saat settle (event_settle_queue kind='crew_fee')
--   • tombol Bayar fee per crew (post-settle)
-- Keduanya meneruskannya ke payCrewFee → Dr 5-600 Biaya Admin Bank.
-- ============================================================================

ALTER TABLE crew_assignments
  ADD COLUMN IF NOT EXISTS payment_admin_fee BIGINT NOT NULL DEFAULT 0;

ALTER TABLE crew_assignments DROP CONSTRAINT IF EXISTS crew_payment_admin_fee_nonneg;
ALTER TABLE crew_assignments ADD CONSTRAINT crew_payment_admin_fee_nonneg
  CHECK (payment_admin_fee >= 0 AND payment_admin_fee <= 1000000);

COMMENT ON COLUMN crew_assignments.payment_admin_fee IS
  'Biaya admin bank untuk transfer fee ke crew ini (beda rekening tujuan = beda ongkos). Dibukukan ke 5-600 saat fee dibayar.';
