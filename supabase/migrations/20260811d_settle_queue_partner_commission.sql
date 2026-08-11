-- ============================================================================
-- 20260811d_settle_queue_partner_commission.sql
--
-- Rencana bayar komisi MITRA (vendor/relasi) ikut masuk antrian settle.
--
-- Melengkapi pola yang sudah dipakai fee crew & komisi sales: rekening, biaya
-- admin bank, dan bukti transfer diisi dari kartunya sendiri di halaman rekap;
-- uangnya baru keluar saat Konfirmasi settle. Sebelum ini komisi mitra adalah
-- satu-satunya yang masih diatur dari dalam dialog settle.
--
-- category_id dipakai ulang untuk menyimpan jenis komisinya ('vendor'|'relasi')
-- supaya posting tidak perlu menebak ulang dari channel event.
-- ============================================================================

ALTER TABLE event_settle_queue DROP CONSTRAINT IF EXISTS event_settle_queue_kind_check;
ALTER TABLE event_settle_queue ADD CONSTRAINT event_settle_queue_kind_check
  CHECK (kind IN ('expense', 'commission_sales', 'crew_fee', 'commission_partner'));

CREATE UNIQUE INDEX IF NOT EXISTS ux_settle_queue_partner_commission
  ON event_settle_queue(event_id)
  WHERE kind = 'commission_partner' AND posted_at IS NULL;

COMMENT ON COLUMN event_settle_queue.category_id IS
  'kind=expense: kategori Catat transaksi. kind=commission_partner: jenis komisi (vendor|relasi).';
