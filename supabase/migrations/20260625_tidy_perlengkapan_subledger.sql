-- 20260625_tidy_perlengkapan_subledger.sql
-- ============================================================================
-- Rapikan subledger persediaan: Lakban Kain + Kartu Nama Tetra
-- ============================================================================
-- Konteks (audit 2026-06-25):
--   Kedua item ini PERLENGKAPAN (bukan barang jual). Sudah direklas dari
--   persediaan → beban via JE-EXPENSE-PERLENGKAPAN (2026-06-25), jadi saldo GL
--   1-209 untuk keduanya = 0. Tapi stock_movement PEMBUKA cutoff (MOV-OPEN-*,
--   source=stock_take, direction=adjustment) masih membuat valuasi subledger
--   Rp195.000 (Lakban 3×10rb + Kartu Nama 11×15rb) → subledger ≠ GL.
--   Item sudah inactive (reconciliation mengabaikannya), tapi biar bersih kita
--   hapus opening movement + stock_take_line-nya supaya subledger = GL = 0.
--
--   HANYA menyentuh subledger stok. TIDAK mengubah GL/jurnal apa pun (GL sudah
--   benar). Idempotent: match ketat ke opening movement (ref MOV-OPEN-%) milik
--   2 SKU ini saja; aman dijalankan ulang (DELETE 0 baris bila sudah bersih).
-- ============================================================================
DO $$
DECLARE
  v_ids uuid[];
  v_mv  int;
  v_stl int;
BEGIN
  SELECT array_agg(id) INTO v_ids
  FROM inventory_items
  WHERE sku IN ('ITM-AUT-72822', 'ITM-BUSINESS-CARD');

  IF v_ids IS NULL THEN
    RAISE NOTICE 'Item perlengkapan (Lakban/Kartu Nama) tidak ditemukan — tidak ada yang dihapus.';
    RETURN;
  END IF;

  -- Baris opname pembuka (audit, tak pengaruh valuasi tapi ikut dibersihkan).
  DELETE FROM stock_take_lines
  WHERE item_id = ANY(v_ids)
    AND notes = 'Saldo awal cutoff';
  GET DIAGNOSTICS v_stl = ROW_COUNT;

  -- Movement pembuka cutoff → ini yang bikin valuasi subledger 195rb.
  DELETE FROM stock_movements
  WHERE item_id = ANY(v_ids)
    AND source = 'stock_take'
    AND direction = 'adjustment'
    AND ref_id LIKE 'MOV-OPEN-%';
  GET DIAGNOSTICS v_mv = ROW_COUNT;

  RAISE NOTICE 'Subledger perlengkapan dirapikan: % opening movement + % stock_take_line dihapus (Lakban + Kartu Nama).', v_mv, v_stl;
END $$;
