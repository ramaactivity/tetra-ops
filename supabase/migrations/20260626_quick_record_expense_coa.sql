-- ============================================================================
-- Akun beban baru untuk kategori quick-record ("Catat") yang diminta owner:
--   • Bayar kost           → 5-260 Beban Sewa Tempat & Kost
--   • Bayar internet       → 5-270 Beban Internet & Telekomunikasi
--   • Konsumsi rapat       → 5-280 Beban Rapat & Konsumsi Rapat
--
-- "Beli alat/barang" memakai akun yang sudah ada: 5-250 Beban Perlengkapan &
-- Peralatan Kecil (lihat 20260624_asset_capitalization_policy.sql).
--
-- Akun terpisah supaya tiap pos bisa dipantau totalnya per periode. Idempotent.
-- ============================================================================

INSERT INTO chart_of_accounts (code, name, account_type, parent_code, is_active, description)
VALUES
  (
    '5-260',
    'Beban Sewa Tempat & Kost',
    'expense',
    '5-000',
    true,
    'Sewa tempat / kost (mis. kost crew, tempat penyimpanan/operasional).'
  ),
  (
    '5-270',
    'Beban Internet & Telekomunikasi',
    'expense',
    '5-000',
    true,
    'Internet, pulsa, paket data, dan telekomunikasi.'
  ),
  (
    '5-280',
    'Beban Rapat & Konsumsi Rapat',
    'expense',
    '5-000',
    true,
    'Biaya rapat / meeting termasuk konsumsi saat rapat.'
  )
ON CONFLICT (code) DO NOTHING;
