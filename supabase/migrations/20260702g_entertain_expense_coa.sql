-- ============================================================================
-- Akun beban baru: 5-285 Beban Entertain & Representasi
-- Untuk pengeluaran entertain/jamuan klien/relasi (beda dari konsumsi rapat).
-- Dipakai kategori quick-record "Entertain" + shortcut "Patungan entertain".
-- Idempotent.
-- ============================================================================

INSERT INTO chart_of_accounts (code, name, account_type, parent_code, is_active, description)
VALUES
  (
    '5-285',
    'Beban Entertain & Representasi',
    'expense',
    '5-000',
    true,
    'Entertain/jamuan klien & relasi bisnis (mis. traktir klien, representasi).'
  )
ON CONFLICT (code) DO NOTHING;
