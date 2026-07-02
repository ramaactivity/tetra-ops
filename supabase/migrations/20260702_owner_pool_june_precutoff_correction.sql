-- 20260702_owner_pool_june_precutoff_correction.sql
-- ============================================================================
-- Koreksi bagi hasil owner untuk 9 event Juni 2026 yang terhapus saat cutoff.
-- ============================================================================
--
-- Konteks:
--   • execute_finance_cutoff (24 Jun 2026) menghapus SEMUA owner_earnings +
--     journal_lines dan membekukan event pra-cutoff. Akibatnya 9 event Juni
--     yang di-settle sebelum 24 Jun kehilangan catatan bagi hasil ownernya
--     (9 × Rp50.000 = Rp450.000 per owner) — event beku tak bisa di-settle
--     ulang ke buku baru.
--   • Uangnya SUDAH ADA di bank (masuk ke saldo awal 3-101 saat cutoff). Yang
--     hilang hanya CATATAN klaim owner, bukan kasnya.
--   • Sekarang tombol Withdrawal cuma menunjukkan Rp50.000/owner (dari 1 event
--     pasca-cutoff: Farah & Ryan). Seharusnya Rp500.000/owner (10 event × 50rb).
--
-- Yang dilakukan (TANPA menyentuh kas sama sekali):
--   1. Jurnal reklas ekuitas → utang: Dr 3-101 (Saldo Awal) / Cr 2-300 (Hutang
--      Bagi Hasil Owner) sebesar Rp1.800.000 (450rb × 4 owner). Mengakui bahwa
--      sebagian saldo awal sebenarnya utang bagi hasil ke owner. Tidak ada baris
--      kas → saldo bank/kas & laba/rugi tidak berubah, neraca tetap balance.
--   2. Sub-ledger owner_earnings: +Rp450.000 per owner aktif (earning_type
--      'adjustment') → tiap owner jadi Rp500.000, siap ditarik.
--
-- Hasil: 2-300 GL == SUM(owner_earnings) == Rp2.000.000 → drift rekonsiliasi 0.
--
-- Idempotent + self-guard: kalau marker koreksi sudah ada, RAISE & rollback
-- (mencegah dobel). Seluruh blok atomik (DO block).

DO $$
DECLARE
  v_actor       uuid;
  v_per_owner   bigint := 450000;   -- 9 event Juni pra-cutoff × Rp50.000
  v_owner       record;
  v_owner_count int := 0;
  v_total       bigint;
  v_ref         text;
  v_entry_id    uuid;
  v_marker      text := 'Koreksi bagi hasil 9 event Juni pra-cutoff (cutoff 24 Jun 2026)';
BEGIN
  -- Guard dobel-jalan
  IF EXISTS (
    SELECT 1 FROM owner_earnings
    WHERE earning_type = 'adjustment' AND description = v_marker
  ) THEN
    RAISE EXCEPTION 'DIBATALKAN: koreksi owner pool Juni sudah pernah dijalankan (marker ada).';
  END IF;

  -- Actor = super_admin
  SELECT id INTO v_actor
  FROM users WHERE role = 'super_admin' AND is_active = true
  ORDER BY created_at LIMIT 1;
  IF v_actor IS NULL THEN RAISE EXCEPTION 'super_admin aktif tidak ditemukan'; END IF;

  SELECT count(*) INTO v_owner_count FROM users WHERE role = 'owner' AND is_active = true;
  IF v_owner_count = 0 THEN RAISE EXCEPTION 'Tidak ada owner aktif'; END IF;
  v_total := v_per_owner * v_owner_count;

  -- 1. Jurnal reklas: Dr 3-101 / Cr 2-300
  v_ref := generate_journal_reference(DATE '2026-06-30');
  INSERT INTO journal_entries (
    ref_id, entry_date, entry_type, description, source_type, total_amount, created_by
  ) VALUES (
    v_ref, DATE '2026-06-30', 'adjustment',
    'Koreksi bagi hasil owner — 9 event Juni yang terhapus saat cutoff (uang sudah ada di saldo awal)',
    'owner_pool_correction', v_total, v_actor
  ) RETURNING id INTO v_entry_id;

  INSERT INTO journal_lines (entry_id, account_code, debit_amount, credit_amount, description, line_order)
  VALUES
    (v_entry_id, '3-101', v_total, 0, 'Ambil dari saldo awal (laba Juni pra-cutoff)', 1),
    (v_entry_id, '2-300', 0, v_total, 'Tambah utang bagi hasil ke owner (9 event Juni)', 2);

  -- 2. Sub-ledger owner_earnings: +Rp450.000 per owner aktif
  FOR v_owner IN SELECT id FROM users WHERE role = 'owner' AND is_active = true LOOP
    INSERT INTO owner_earnings (owner_user_id, earning_type, amount, description, performed_by)
    VALUES (v_owner.id, 'adjustment', v_per_owner, v_marker, v_actor);
  END LOOP;

  RAISE NOTICE 'Koreksi selesai: % owner × Rp% = Rp% (JE %).',
    v_owner_count, v_per_owner, v_total, v_ref;
END $$;
