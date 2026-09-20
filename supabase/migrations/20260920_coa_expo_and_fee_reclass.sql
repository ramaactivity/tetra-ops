-- ============================================================================
-- 20260920_coa_expo_and_fee_reclass.sql
--
-- 1) Akun baru 5-412 Beban Pameran & Expo.
-- 2) Koreksi Rp750.000 fee crew jaga booth expo yang salah masuk Hutang Crew.
-- 3) Reklas 2 biaya expo lain dari Marketing ke akun barunya.
--
-- Duduk perkaranya: fee crew EVENT di-akrual ke 2-100 Hutang Crew saat
-- settlement, jadi kategori "Bayar fee crew" di Catat Transaksi memang
-- mendebit 2-100 (melunasi hutang, bukan beban baru). Tapi crew yang jaga
-- booth di wedding expo TIDAK lewat event/settlement — tidak pernah ada
-- hutangnya. Dua pembayaran 2026-09-07 (Rp250.000 + Rp500.000) memakai
-- kategori itu, jadi: uangnya benar keluar dari bank, tapi bebannya tidak
-- pernah masuk laba-rugi dan Hutang Crew jadi MINUS Rp750.000.
--
-- Expo adalah kegiatan marketing berbiaya banyak-pos (sewa booth, brosur, fee
-- crew jaga, konsumsi). Dikumpulkan di satu akun supaya ongkos ikut pameran
-- bisa dinilai utuh, bukan tercecer di Marketing bersama iklan.
-- ============================================================================

INSERT INTO chart_of_accounts (code, name, account_type, parent_code, is_active, description)
VALUES ('5-412', 'Beban Pameran & Expo', 'expense', '5-000', true,
        'Biaya ikut pameran/expo: sewa booth, cetak brosur, fee crew jaga booth, konsumsi selama expo')
ON CONFLICT (code) DO NOTHING;

DO $$
DECLARE
  v_entry UUID;
  v_actor UUID;
BEGIN
  -- Idempotent: kalau koreksi ini sudah pernah dijalankan, berhenti.
  IF EXISTS (SELECT 1 FROM journal_entries WHERE ref_id = 'JE-20260920-EXPOFIX') THEN
    RAISE NOTICE 'Koreksi expo sudah pernah diterapkan — dilewati.';
    RETURN;
  END IF;

  SELECT created_by INTO v_actor FROM journal_entries
  WHERE description = 'Expo Weni' LIMIT 1;

  -- ── (a) Fee crew jaga booth expo: pindah dari Hutang Crew ke beban expo ──
  INSERT INTO journal_entries (ref_id, entry_date, entry_type, description,
                               source_type, total_amount, created_by)
  VALUES ('JE-20260920-EXPOFIX', '2026-09-07', 'adjustment',
          'Koreksi: fee crew jaga booth wedding expo — dari Hutang Crew ke Beban Pameran & Expo',
          'manual', 750000, v_actor)
  RETURNING id INTO v_entry;

  INSERT INTO journal_lines (entry_id, account_code, debit_amount, credit_amount, description, line_order)
  VALUES
    (v_entry, '5-412', 750000, 0, 'Fee crew jaga booth wedding expo (Rp250.000 + Rp500.000, 7 Sep 2026)', 1),
    (v_entry, '2-100', 0, 750000, 'Batalkan pendebitan Hutang Crew — tidak pernah ada akrual fee-nya', 2);

  -- ── (b) Biaya expo lain yang telanjur di Marketing ──
  INSERT INTO journal_entries (ref_id, entry_date, entry_type, description,
                               source_type, total_amount, created_by)
  VALUES ('JE-20260920-EXPORECLASS', '2026-09-20', 'adjustment',
          'Reklas biaya expo dari Beban Marketing ke Beban Pameran & Expo',
          'manual', 1950000, v_actor)
  RETURNING id INTO v_entry;

  INSERT INTO journal_lines (entry_id, account_code, debit_amount, credit_amount, description, line_order)
  VALUES
    (v_entry, '5-412', 1950000, 0, 'Patungan ikut expo bareng partner (13 Agu) + cetak brosur expo (3 Sep)', 1),
    (v_entry, '5-410', 0, 1950000, 'Keluarkan dari Beban Marketing', 2);
END $$;
