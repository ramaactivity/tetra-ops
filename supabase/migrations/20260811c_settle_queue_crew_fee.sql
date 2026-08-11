-- ============================================================================
-- 20260811c_settle_queue_crew_fee.sql
--
-- Rencana bayar fee crew ikut masuk antrian settle (kind='crew_fee').
--
-- Sebelumnya rekening + biaya admin bank untuk fee crew cuma bisa diisi di
-- dialog Konfirmasi settle, sementara komisi sales sudah diatur dari kartunya
-- sendiri di halaman rekap. Beda perlakuan untuk dua hal yang sama-sama
-- "transfer keluar saat settle" bikin owner harus ingat dua tempat.
--
-- amount = total fee crew yang akan ditransfer saat rencana dibuat (snapshot
-- untuk ditampilkan); yang benar-benar dibayar tetap dihitung ulang saat settle
-- dari crew_assignments yang belum lunas.
-- admin_fee = biaya admin PER TRANSFER (tiap crew = satu transfer).
-- ============================================================================

ALTER TABLE event_settle_queue DROP CONSTRAINT IF EXISTS event_settle_queue_kind_check;
ALTER TABLE event_settle_queue ADD CONSTRAINT event_settle_queue_kind_check
  CHECK (kind IN ('expense', 'commission_sales', 'crew_fee'));

CREATE UNIQUE INDEX IF NOT EXISTS ux_settle_queue_crew_fee
  ON event_settle_queue(event_id)
  WHERE kind = 'crew_fee' AND posted_at IS NULL;

COMMENT ON COLUMN event_settle_queue.admin_fee IS
  'Biaya admin bank. Untuk kind=crew_fee ini PER TRANSFER (tiap crew satu transfer), untuk kind lain sekali transfer.';
