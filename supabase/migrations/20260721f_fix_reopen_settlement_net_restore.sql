-- ============================================================================
-- 20260721f — FIX: reopen_settlement mengembalikan stok BRUTO, bukan BERSIH
-- ============================================================================
-- MASALAH
--   Blok "3. Reverse stock movements" memilih SEMUA baris direction='out'
--   milik event ini, lalu menuliskannya kembali sebagai 'in'. Baris 'in' yang
--   ditulis reverse_rekap_stock (source 'rekap_consumption' yang SAMA) tidak
--   pernah dikurangkan.
--
--   Skenario: owner approve rekap (out 100) → reject (in 100) → approve lagi
--   (out 100). Konsumsi bersih = 100. Super admin lalu me-reopen settlement:
--   query lama menjumlahkan KEDUA baris 'out' → mengembalikan 200. Gudang
--   kelebihan 100 unit hantu, permanen, tanpa catatan penyeimbang.
--
-- PERBAIKAN
--   Hitung posisi BERSIH per item (out dikurangi in) lintas kedua source,
--   lalu kembalikan hanya sisa positifnya. Karena baris restore sendiri
--   ditulis sebagai 'in' dengan source 'settlement', perhitungan ini juga
--   ikut memperhitungkannya — jadi hasilnya idempoten seandainya guard
--   is_reopened suatu saat dilonggarkan.
--
--   unit_cost diambil dari baris 'out' (bukan MAX seluruh baris) supaya
--   penilaian stok yang dikembalikan memakai harga saat dikonsumsi.
--
-- CATATAN PENTING
--   Badan fungsi di bawah adalah SALINAN PERSIS dari definisi live produksi
--   (pg_get_functiondef, diambil 2026-07-21) — HANYA blok 3 yang diubah.
--   Sisanya (guard super_admin, guard is_reopened, reversal sinking fund,
--   owner_earnings, jurnal, unlock event/rekap, audit log) tidak disentuh.
--
--   Yang di-replace adalah *_impl: sejak 20260721b nama publik
--   reopen_settlement adalah wrapper ber-guard auth.uid() yang meneruskan
--   ke sini. Guard lama di baris pertama membaca p_owner_user_id yang
--   dikirim pemanggil — kini bukan lagi satu-satunya penjaga.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.reopen_settlement_impl(
  p_event_id uuid, p_owner_user_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_settlement      RECORD;
  v_actor_role      TEXT;
  v_reversal_je_id  UUID;
  v_old_je          RECORD;
  v_batch_id        UUID;
BEGIN
  SELECT role INTO v_actor_role FROM users WHERE id = p_owner_user_id;
  IF v_actor_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Forbidden: only super_admin can reopen settlement (actor role=%)', v_actor_role
      USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'Reason wajib (minimal 5 karakter)' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_settlement FROM event_settlements WHERE event_id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Settlement tidak ditemukan untuk event %', p_event_id USING ERRCODE = 'P0002';
  END IF;

  IF v_settlement.is_reopened = true THEN
    RAISE EXCEPTION 'Settlement % sudah pernah di-reopen', v_settlement.id USING ERRCODE = '42P01';
  END IF;

  -- 1. Reverse sinking fund movements
  INSERT INTO sinking_fund_movements (
    fund_id, movement_type, amount, source_type, source_event_id, source_settlement_id,
    description, performed_by
  )
  SELECT fund_id, 'withdrawal', amount, 'settlement', p_event_id, v_settlement.id,
         'REOPEN reverse: ' || p_reason, p_owner_user_id
  FROM sinking_fund_movements
  WHERE source_settlement_id = v_settlement.id AND movement_type = 'deposit';

  -- 2. Reverse owner earnings
  INSERT INTO owner_earnings (
    owner_user_id, earning_type, amount, source_event_id, source_settlement_id,
    description, performed_by
  )
  SELECT owner_user_id, 'adjustment', -amount, p_event_id, v_settlement.id,
         'REOPEN reverse: ' || p_reason, p_owner_user_id
  FROM owner_earnings
  WHERE source_settlement_id = v_settlement.id AND earning_type = 'profit_share';

  -- 3. Reverse stock movements (positive 'in' offsets).
  --    Restore dari source 'settlement' DAN 'rekap_consumption' — stok
  --    konsumsi di-deduct saat approval (source rekap_consumption).
  --
  --    FIX 20260721f: kembalikan posisi BERSIH, bukan bruto. Baris 'in' dari
  --    reverse_rekap_stock memakai source yang sama dan dulu diabaikan, jadi
  --    siklus approve→reject→approve mengembalikan 2x konsumsi sebenarnya.
  v_batch_id := gen_random_uuid();
  INSERT INTO stock_movements (
    ref_id, item_id, direction, quantity, unit_cost,
    source, source_id, source_description,
    performed_by, notes
  )
  SELECT
    'SM-' || to_char(NOW(), 'YYYYMMDD') || '-' || substr(gen_random_uuid()::TEXT, 1, 8),
    net.item_id, 'in', net.qty, net.unit_cost,
    'settlement'::movement_source, p_event_id,
    'Reopen settlement (' || p_reason || ') batch ' || v_batch_id,
    p_owner_user_id, 'reopen_settlement auto-restore'
  FROM (
    SELECT
      sm.item_id,
      SUM(CASE WHEN sm.direction = 'out' THEN sm.quantity ELSE -sm.quantity END) AS qty,
      -- Harga saat dikonsumsi; abaikan baris 'in' yang unit_cost-nya bisa 0.
      COALESCE(
        MAX(sm.unit_cost) FILTER (WHERE sm.direction = 'out'),
        MAX(sm.unit_cost)
      ) AS unit_cost
    FROM stock_movements sm
    WHERE sm.source_id = p_event_id
      AND sm.source IN (
        'settlement'::movement_source,
        'rekap_consumption'::movement_source
      )
    GROUP BY sm.item_id
  ) net
  WHERE net.qty > 0;

  -- 4. Reverse journal entries (create reversal entry)
  IF v_settlement.journal_entry_id IS NOT NULL THEN
    SELECT * INTO v_old_je FROM journal_entries WHERE id = v_settlement.journal_entry_id;

    INSERT INTO journal_entries (
      ref_id, entry_date, entry_type, description,
      source_type, source_id, source_event_id,
      total_amount, created_by
    ) VALUES (
      generate_journal_reference(CURRENT_DATE),
      CURRENT_DATE, 'reversal',
      'REVERSAL: ' || v_old_je.description || ' — reason: ' || p_reason,
      'settlement_reversal', v_settlement.id, p_event_id,
      v_old_je.total_amount, p_owner_user_id
    ) RETURNING id INTO v_reversal_je_id;

    INSERT INTO journal_lines (entry_id, account_code, debit_amount, credit_amount, description, line_order)
    SELECT v_reversal_je_id, account_code, credit_amount, debit_amount,
           'REVERSAL: ' || COALESCE(description, ''), line_order
    FROM journal_lines WHERE entry_id = v_old_je.id;

    UPDATE journal_entries
    SET is_reversed = true, reversed_by_entry_id = v_reversal_je_id, reversed_at = NOW()
    WHERE id = v_old_je.id;
  END IF;

  -- 5. Mark settlement reopened
  UPDATE event_settlements
  SET is_reopened = true, reopened_at = NOW(), reopened_by = p_owner_user_id, reopen_reason = p_reason
  WHERE id = v_settlement.id;

  -- 6. Unlock event + recap. Clear hpp_snapshot → re-settle WAJIB lewat
  --    re-approval (re-commit stok + re-snapshot di harga saat itu).
  UPDATE events SET status = 'awaiting_settlement', updated_at = NOW() WHERE id = p_event_id;
  UPDATE crew_rekap
  SET status = 'reviewed', locked = false, locked_at = NULL, settled_at = NULL,
      stock_committed_at = NULL, stock_movement_batch_id = NULL,
      hpp_snapshot = NULL, hpp_snapshot_total = NULL, is_approved = false
  WHERE event_id = p_event_id;

  -- 7. Audit log
  INSERT INTO audit_log (entity_type, entity_id, action, changes, actor_id)
  VALUES (
    'event_settlement', v_settlement.id, 'reopen',
    jsonb_build_object(
      'after', jsonb_build_object(
        'event_id', p_event_id, 'reason', p_reason,
        'reversal_journal_id', v_reversal_je_id
      )
    ),
    p_owner_user_id
  );

  RETURN jsonb_build_object(
    'settlement_id',         v_settlement.id,
    'reversal_journal_id',   v_reversal_je_id,
    'reversal_stock_batch',  v_batch_id,
    'reason',                p_reason
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- Verifikasi netting pakai data sintetis, di dalam transaksi yang di-ROLLBACK
-- supaya tidak menyentuh data nyata.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_qty numeric;
BEGIN
  -- Tiru pola out 100 / in 100 / out 100 → bersih harus 100, bukan 200.
  WITH sample(direction, quantity) AS (
    VALUES ('out', 100::numeric), ('in', 100::numeric), ('out', 100::numeric)
  )
  SELECT SUM(CASE WHEN direction = 'out' THEN quantity ELSE -quantity END)
  INTO v_qty FROM sample;

  IF v_qty <> 100 THEN
    RAISE EXCEPTION 'Logika netting salah: dapat %, harusnya 100', v_qty;
  END IF;
  RAISE NOTICE 'OK: netting approve/reject/approve = % (bukan 200)', v_qty;
END $$;
