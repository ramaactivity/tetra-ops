-- ============================================================================
-- Bank admin fee expense account (Beban Administrasi Bank).
--
-- Saat membeli / membayar / transfer fee ke crew lewat bank, sering ada biaya
-- admin: antar bank ~Rp2.500, VA/topup GoPay ~Rp1.000. Biaya ini DITANGGUNG
-- perusahaan dan dicatat sebagai beban tersendiri — TIDAK boleh menambah harga
-- persediaan (HPP) atau nilai fee crew, supaya akun-akun itu tetap akurat.
--
-- Jurnalnya jadi satu baris debit tambahan, mis. pembelian cash + admin:
--   Dr 1-2xx Persediaan        100.000
--   Dr 5-600 Beban Admin Bank    2.500
--      Cr 1-100 Kas Tunai            102.500
--
-- Total biaya admin per periode = SUM debit akun 5-600.
--
-- Catatan: 5-250 SUDAH dipakai (Beban Perlengkapan & Peralatan Kecil), jadi
-- biaya admin bank diberi kode 5-600 yang masih kosong.
-- ============================================================================

INSERT INTO chart_of_accounts (code, name, account_type, parent_code, is_active, description)
VALUES (
  '5-600',
  'Beban Administrasi Bank',
  'expense',
  '5-000',
  true,
  'Biaya admin/transfer bank yang ditanggung perusahaan (antar bank ~Rp2.500, VA/topup e-wallet ~Rp1.000). Dicatat terpisah agar tidak menggelembungkan HPP/persediaan maupun fee crew.'
)
ON CONFLICT (code) DO NOTHING;
