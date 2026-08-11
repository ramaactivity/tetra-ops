-- ============================================================================
-- 20260811b_event_settle_queue.sql
--
-- Antrian transaksi event yang BARU dibukukan saat settle.
--
-- Alur yang benar menurut owner: kartu-kartu di halaman rekap (fee crew, komisi
-- sales, pemasukan/pengeluaran lain) itu tempat MENGISI data — bukan tempat
-- memposting jurnal. Semua uang baru masuk buku sekali jalan saat "Konfirmasi
-- settle", supaya satu event = satu momen pembukuan dan tidak ada jurnal
-- setengah jadi kalau ternyata settle-nya batal/diulang.
--
-- Fee crew sudah begitu (angkanya di crew_assignments, jurnalnya lahir saat
-- settle). Tabel ini menyamakan perlakuan untuk dua sisanya:
--
--   kind='expense'          → pemasukan/pengeluaran lain di luar form rekap.
--                             Saat settle diposting lewat jalur Catat transaksi
--                             (jurnal kas 2 baris + source_event_id).
--   kind='commission_sales' → rencana bayar komisi sales Tetra. Saat settle
--                             diposting lewat payCommission(kind='sales').
--
-- Baris yang sudah diposting TIDAK dihapus — posted_at + posted_ref jadi jejak
-- audit, dan mencegah dobel-posting kalau settle diulang setelah reopen.
-- ============================================================================

CREATE TABLE IF NOT EXISTS event_settle_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,

  kind TEXT NOT NULL CHECK (kind IN ('expense', 'commission_sales')),

  -- expense saja
  direction TEXT CHECK (direction IN ('masuk', 'keluar')),
  category_id TEXT,
  note TEXT,

  -- dipakai kedua kind
  amount BIGINT NOT NULL CHECK (amount > 0),
  account_code TEXT NOT NULL,
  admin_fee BIGINT NOT NULL DEFAULT 0 CHECK (admin_fee >= 0),
  proof_url TEXT,

  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Terisi saat settle memposting baris ini.
  posted_at TIMESTAMPTZ,
  posted_ref TEXT,
  post_error TEXT,

  CONSTRAINT expense_needs_direction CHECK (
    kind <> 'expense' OR (direction IS NOT NULL AND category_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS ix_settle_queue_event
  ON event_settle_queue(event_id) WHERE posted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_settle_queue_event_all
  ON event_settle_queue(event_id, created_at DESC);

-- Satu rencana bayar komisi sales per event (yang belum diposting).
CREATE UNIQUE INDEX IF NOT EXISTS ux_settle_queue_sales_commission
  ON event_settle_queue(event_id)
  WHERE kind = 'commission_sales' AND posted_at IS NULL;

COMMENT ON TABLE event_settle_queue IS
  'Transaksi event yang menunggu di-posting saat settle (pengeluaran/pemasukan lain & rencana bayar komisi sales). Diisi dari kartu di halaman rekap; jurnalnya baru lahir saat Konfirmasi settle.';
COMMENT ON COLUMN event_settle_queue.posted_at IS
  'Terisi saat settle memposting baris ini. Baris terposting tidak dihapus — jejak audit + guard dobel-posting.';

ALTER TABLE event_settle_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "settle_queue_owner_all" ON event_settle_queue;
CREATE POLICY "settle_queue_owner_all" ON event_settle_queue
  FOR ALL USING (is_owner_level()) WITH CHECK (is_owner_level());
