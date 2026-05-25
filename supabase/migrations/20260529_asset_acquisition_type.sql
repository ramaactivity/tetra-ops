-- 20260529_asset_acquisition_type.sql
-- ============================================================================
-- Asset acquisition type — beli baru vs second vs setoran modal owner
-- ============================================================================
--
-- WHY:
--   Aset di industri kreatif tidak selalu beli baru gres dari toko. Tiga
--   sumber utama:
--     1. Beli Baru Komersial (kas keluar → CapEx normal)
--     2. Beli Bekas / Second Komersial (kas keluar → CapEx + sisa masa
--        pakai biasanya lebih pendek)
--     3. Setoran Modal Owner — owner masukkan alat pribadi sebagai aset
--        perusahaan. BUKAN cash outflow → jurnal Dr 1-400 / Cr 3-100
--        Modal Owner.
--
--   Membedakan ini di sistem mencegah laporan keuangan salah tafsir (mis.
--   tidak terdeteksi sebagai "uang keluar" padahal cuma transfer kepemilikan).
--
-- ADDITIVE, IDEMPOTENT — safe re-run.

ALTER TABLE items_fixed_asset_config
  ADD COLUMN IF NOT EXISTS acquisition_type TEXT NOT NULL DEFAULT 'new_commercial'
    CHECK (acquisition_type IN ('new_commercial', 'used_commercial', 'owner_contribution')),
  ADD COLUMN IF NOT EXISTS acquisition_journal_entry_id UUID NULL
    REFERENCES journal_entries(id) ON DELETE SET NULL;

COMMENT ON COLUMN items_fixed_asset_config.acquisition_type IS
  'Asal-usul aset: new_commercial (beli baru kas), used_commercial (beli bekas kas), owner_contribution (setoran modal owner, non-cash).';

COMMENT ON COLUMN items_fixed_asset_config.acquisition_journal_entry_id IS
  'Link ke journal_entry yang dibuat saat aset di-register. Hanya terisi untuk owner_contribution (auto-jurnal Dr 1-400 / Cr 3-100). new/used_commercial pakai journal dari purchases.ts saat catat Pembelian.';

CREATE INDEX IF NOT EXISTS idx_items_fixed_asset_acq_type
  ON items_fixed_asset_config(acquisition_type);
