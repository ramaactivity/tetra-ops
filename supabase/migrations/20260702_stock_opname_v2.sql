-- 20260702_stock_opname_v2.sql
-- ============================================================================
-- Stock Opname v2 — engine correctness overhaul
-- ============================================================================
--
-- Masalah yang diperbaiki (audit 2026-07-02):
--
-- A. STALE SNAPSHOT (bug paling serius): system_qty di-freeze saat draft
--    dibuat, dan commit menghitung variance dari snapshot itu. Kalau ada
--    event/pembelian yang menggerakkan stok selama draft terbuka, adjustment
--    yang dihasilkan SALAH (fisik yang sebenarnya cocok malah di-adjust).
--    → commit sekarang me-refresh system_qty dari stok LIVE dulu, baru
--      menghitung variance.
--
-- B. JURNAL NON-ATOMIK: sebelumnya jurnal GL diposting dari JS loop setelah
--    RPC selesai (best-effort, bisa mati di tengah → GL drift dari fisik).
--    → wastage_logs + journal_entries/lines sekarang dibuat DI DALAM RPC,
--      satu transaksi dengan movements.
--
-- C. FIXED ASSET NOISE: opname men-seed semua item aktif termasuk fixed
--    asset (selalu system_qty=0 → badge "HABIS" palsu, 50 baris kerja
--    fiktif). Commit pun membuat movement untuk aset tanpa jurnal (data
--    setengah jadi). → commit hanya memproses category='inventory'; baris
--    fixed asset di draft yang ada dibersihkan; seeding baru difilter di
--    app layer.
--
-- D. SEMANTIK "MATCH" JUJUR: kolom is_match menandai baris yang owner
--    "anggap sesuai sistem" (bukan dihitung manual). Saat commit, baris
--    is_match mengikuti stok live (variance selalu 0) — bukan membeku di
--    snapshot basi yang justru menciptakan adjustment palsu.
--
-- E. REF-ID COLLISION: ref_id movement memakai random() 8 digit (ruang 10^8,
--    tabrakan realistis setelah belasan ribu movement → commit gagal total).
--    → suffix dari gen_random_uuid() (ruang 16^12).
--
-- F. COST SNAPSHOT: kolom unit_cost menyimpan avg cost saat commit supaya
--    "Dampak Nilai" di riwayat tidak berubah retroaktif ketika avg cost
--    item berubah.
--
-- G. inventory_coa_for_sku(): mirror SQL dari src/lib/inventory/cogs-buckets.ts
--    (bucket 1-200..1-205, fallback 1-209) supaya jurnal opname memakai akun
--    persediaan kanonik yang sama dengan purchase/COGS/wastage.
--
-- Idempotent.

-- ============================================================================
-- 1. Schema: is_match + unit_cost
-- ============================================================================

ALTER TABLE stock_take_lines
  ADD COLUMN IF NOT EXISTS is_match BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE stock_take_lines
  ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(14, 2);

COMMENT ON COLUMN stock_take_lines.is_match IS
  'true = owner memilih "anggap sesuai sistem" (tidak menghitung manual). Saat commit, baris ini mengikuti stok live → variance 0. false = counted_qty hasil hitung fisik manual.';
COMMENT ON COLUMN stock_take_lines.unit_cost IS
  'Snapshot purchase_price_avg per base unit saat commit — supaya nilai selisih di riwayat tidak berubah retroaktif.';

-- ============================================================================
-- 2. Bersihkan baris fixed-asset dari draft yang masih terbuka
-- ============================================================================

DELETE FROM stock_take_lines stl
USING stock_takes st, inventory_items i
WHERE st.id = stl.stock_take_id
  AND st.status = 'draft'
  AND i.id = stl.item_id
  AND i.category <> 'inventory';

-- ============================================================================
-- 3. inventory_coa_for_sku — mirror SQL dari cogs-buckets.ts (bucket → COA)
-- ============================================================================

CREATE OR REPLACE FUNCTION inventory_coa_for_sku(p_sku TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN s LIKE 'MEDIA%'                          THEN '1-200'
    WHEN s LIKE 'SLEEVE%'                         THEN '1-201'
    WHEN s LIKE 'FLASHDISK%' OR s LIKE 'FD%'      THEN '1-202'
    WHEN s LIKE 'POUCH%'                          THEN '1-203'
    WHEN s LIKE 'PHOTOMAGNET%' OR s LIKE 'MAGNET%' THEN '1-204'
    WHEN s LIKE 'KEY%'                            THEN '1-205'
    ELSE '1-209'
  END
  FROM (SELECT upper(trim(p_sku)) AS s) t;
$$;

COMMENT ON FUNCTION inventory_coa_for_sku(TEXT) IS
  'Akun persediaan kanonik (1-2xx) per bucket SKU. HARUS sinkron dengan src/lib/inventory/cogs-buckets.ts (inventoryCoaForSku). Dipakai commit_stock_take supaya opname credit/debit akun yang sama dengan purchase & COGS.';

-- ============================================================================
-- 4. match_all_stock_take_lines — bulk "anggap sesuai" dalam 1 statement
-- ============================================================================

CREATE OR REPLACE FUNCTION match_all_stock_take_lines(p_stock_take_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_status TEXT;
  v_count INTEGER;
BEGIN
  SELECT status INTO v_status FROM stock_takes WHERE id = p_stock_take_id FOR UPDATE;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Stock opname % tidak ditemukan', p_stock_take_id USING ERRCODE = 'P0002';
  END IF;
  IF v_status != 'draft' THEN
    RAISE EXCEPTION 'Stock opname % sudah tidak bisa diedit (status=%)', p_stock_take_id, v_status USING ERRCODE = 'P0001';
  END IF;

  UPDATE stock_take_lines
  SET counted_qty = system_qty,
      is_match = true,
      updated_at = NOW()
  WHERE stock_take_id = p_stock_take_id
    AND counted_qty IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION match_all_stock_take_lines(UUID) TO authenticated;

COMMENT ON FUNCTION match_all_stock_take_lines(UUID) IS
  'Set semua baris yang belum dihitung jadi "anggap sesuai sistem" (is_match=true). Satu statement, menggantikan N update paralel dari app layer.';

-- ============================================================================
-- 5. commit_stock_take v2 — live variance + jurnal atomik
-- ============================================================================

-- Return type berubah INTEGER → JSONB, wajib drop dulu.
DROP FUNCTION IF EXISTS commit_stock_take(UUID, UUID);

CREATE FUNCTION commit_stock_take(
  p_stock_take_id UUID,
  p_actor UUID
) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_status TEXT;
  v_line RECORD;
  v_movements INTEGER := 0;
  v_journals INTEGER := 0;
  v_movement_id UUID;
  v_entry_id UUID;
  v_direction movement_direction;
  v_abs_qty NUMERIC;
  v_cost BIGINT;
  v_inv_coa TEXT;
  v_wst_coa TEXT;
  v_suffix TEXT;
  v_today TEXT := to_char(NOW(), 'YYYYMMDD');
BEGIN
  SELECT status INTO v_status FROM stock_takes WHERE id = p_stock_take_id FOR UPDATE;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Stock opname % tidak ditemukan', p_stock_take_id USING ERRCODE = 'P0002';
  END IF;
  IF v_status != 'draft' THEN
    RAISE EXCEPTION 'Stock opname % sudah pernah diselesaikan (status=%)', p_stock_take_id, v_status USING ERRCODE = 'P0001';
  END IF;

  -- (A) Refresh system_qty dari stok LIVE. Draft bisa terbuka berhari-hari
  -- sementara event/pembelian menggerakkan stok — variance HARUS dihitung
  -- terhadap stok saat commit, bukan snapshot saat draft dibuat.
  UPDATE stock_take_lines stl
  SET system_qty = COALESCE(ls.stock, 0)
  FROM (
    SELECT l.item_id, s.stock
    FROM stock_take_lines l
    LEFT JOIN get_stock_levels(
      (SELECT array_agg(item_id) FROM stock_take_lines WHERE stock_take_id = p_stock_take_id)
    ) s ON s.item_id = l.item_id
    WHERE l.stock_take_id = p_stock_take_id
  ) ls
  WHERE stl.stock_take_id = p_stock_take_id
    AND stl.item_id = ls.item_id;

  -- (D) Baris "anggap sesuai" mengikuti stok live → variance 0, tanpa movement.
  UPDATE stock_take_lines
  SET counted_qty = system_qty, updated_at = NOW()
  WHERE stock_take_id = p_stock_take_id
    AND is_match = true;

  -- (F) Snapshot avg cost untuk semua baris yang dihitung (nilai riwayat stabil).
  UPDATE stock_take_lines stl
  SET unit_cost = COALESCE(i.purchase_price_avg, cfg.purchase_price_avg, 0)
  FROM inventory_items i
  LEFT JOIN items_inventory_config cfg ON cfg.item_id = i.id
  WHERE stl.stock_take_id = p_stock_take_id
    AND stl.item_id = i.id
    AND stl.counted_qty IS NOT NULL;

  -- Satu movement + jurnal per baris selisih. Hanya item inventory aktif —
  -- fixed asset tidak dilacak via stock_movements (system_qty-nya 0 palsu).
  FOR v_line IN
    SELECT stl.item_id, stl.variance, stl.notes,
           i.sku, i.name, i.unit,
           COALESCE(i.purchase_price_avg, cfg.purchase_price_avg, 0) AS avg_cost,
           COALESCE(cfg.coa_account_wastage, '5-510') AS wastage_coa
    FROM stock_take_lines stl
    JOIN inventory_items i ON i.id = stl.item_id
    LEFT JOIN items_inventory_config cfg ON cfg.item_id = i.id
    WHERE stl.stock_take_id = p_stock_take_id
      AND stl.counted_qty IS NOT NULL
      AND stl.variance != 0
      AND i.deleted_at IS NULL
      AND i.is_active = true
      AND i.category = 'inventory'
  LOOP
    v_direction := (CASE WHEN v_line.variance > 0 THEN 'in' ELSE 'out' END)::movement_direction;
    v_abs_qty := ABS(v_line.variance);
    v_cost := ROUND(v_abs_qty * v_line.avg_cost)::BIGINT;
    v_inv_coa := inventory_coa_for_sku(v_line.sku);
    v_wst_coa := v_line.wastage_coa;
    -- (E) Suffix unik dari uuid — bukan random() 8 digit yang bisa tabrakan.
    v_suffix := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

    INSERT INTO stock_movements (
      ref_id, item_id, direction, quantity, source, source_id,
      source_description, notes, performed_by
    ) VALUES (
      'MOV-A-' || v_suffix,
      v_line.item_id,
      v_direction,
      v_abs_qty,
      'stock_take'::movement_source,
      p_stock_take_id,
      CASE WHEN v_line.variance > 0
        THEN 'Stok opname: fisik lebih ' || v_abs_qty || ' ' || v_line.unit
        ELSE 'Stok opname: fisik kurang ' || v_abs_qty || ' ' || v_line.unit
      END,
      v_line.notes,
      p_actor
    )
    RETURNING id INTO v_movement_id;
    v_movements := v_movements + 1;

    -- (B) Jurnal atomik — hanya kalau ada nilai rupiah yang bisa dibukukan.
    IF v_cost > 0 THEN
      IF v_line.variance < 0 THEN
        -- Shortage: catat wastage log + Dr Beban Wastage / Cr Persediaan
        INSERT INTO wastage_logs (
          ref_id, item_id, qty_base, reason, reason_detail,
          cost_at_time, stock_movement_id, reported_by
        ) VALUES (
          'WST-' || v_today || '-' || v_suffix,
          v_line.item_id,
          v_abs_qty,
          'opname_shortage',
          'Otomatis dari Stock Opname ' || p_stock_take_id,
          v_cost,
          v_movement_id,
          p_actor
        );
      END IF;

      INSERT INTO journal_entries (
        ref_id, entry_date, entry_type, description,
        source_type, source_id, total_amount, created_by
      ) VALUES (
        'JE-' || v_today || '-' || v_suffix,
        CURRENT_DATE,
        'adjustment',
        CASE WHEN v_line.variance < 0
          THEN 'Stok kurang saat opname — ' || v_line.name || ' (' || v_abs_qty || ' ' || v_line.unit || ')'
          ELSE 'Stok lebih saat opname — ' || v_line.name || ' (' || v_abs_qty || ' ' || v_line.unit || ')'
        END,
        'wastage',
        v_movement_id,
        v_cost,
        p_actor
      )
      RETURNING id INTO v_entry_id;

      IF v_line.variance < 0 THEN
        INSERT INTO journal_lines (entry_id, account_code, debit_amount, credit_amount, description, line_order) VALUES
          (v_entry_id, v_wst_coa, v_cost, 0, 'Beban selisih opname ' || v_line.name, 1),
          (v_entry_id, v_inv_coa, 0, v_cost, 'Persediaan keluar ' || v_abs_qty || ' ' || v_line.unit, 2);
      ELSE
        INSERT INTO journal_lines (entry_id, account_code, debit_amount, credit_amount, description, line_order) VALUES
          (v_entry_id, v_inv_coa, v_cost, 0, 'Persediaan masuk ' || v_abs_qty || ' ' || v_line.unit, 1),
          (v_entry_id, v_wst_coa, 0, v_cost, 'Koreksi selisih opname (lebih) ' || v_line.name, 2);
      END IF;
      v_journals := v_journals + 1;
    END IF;
  END LOOP;

  UPDATE stock_takes
  SET status = 'committed',
      committed_at = NOW(),
      committed_by = p_actor,
      updated_at = NOW()
  WHERE id = p_stock_take_id;

  RETURN jsonb_build_object('movements', v_movements, 'journals', v_journals);
END;
$$;

GRANT EXECUTE ON FUNCTION commit_stock_take(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION commit_stock_take(UUID, UUID) IS
  'Selesaikan stock opname draft: refresh system_qty dari stok live, baris is_match ikut stok live (variance 0), lalu per baris selisih (inventory aktif saja) buat adjustment movement + wastage_log (shortage) + journal_entries/lines — semua dalam SATU transaksi. Commit tanpa selisih valid (0 movement, tetap tercatat sebagai audit selesai). Returns {movements, journals}.';
