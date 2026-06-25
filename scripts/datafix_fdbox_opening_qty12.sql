-- datafix_fdbox_opening_qty12.sql
-- ============================================================================
-- Koreksi saldo awal Box Custom Flashdisk: 2 → 12 pcs (opname pembuka cutoff).
-- ============================================================================
-- Owner menegaskan stok awal FD-BOX sebenarnya 12 (saat cutoff salah ketik 2,
-- lalu dikoreksi +10 via Adjust Stok). Set jangkar STOK AWAL (counted_qty pada
-- baris opname pembuka is_opening) jadi 12 → laporan Persediaan & COGS:
-- Stok Awal 12 = Stok Akhir 12, Selisih 0.
--
-- TIDAK menyentuh:
--   • stock_movements  → stok fisik Warehouse tetap 12 (opening +2, adjust +10).
--   • journal_lines    → GL Persediaan 1-202 sudah benar Rp 970.000 & seimbang
--     (nilai +10 sudah masuk via backfill JE + reklas ke Modal Awal).
-- Murni mengoreksi jangkar pelaporan roll-forward. Idempotent.
DO $$
DECLARE
  v_item uuid;
  v_rows int;
BEGIN
  SELECT id INTO v_item FROM inventory_items WHERE sku = 'FD-BOX';
  IF v_item IS NULL THEN
    RAISE NOTICE 'FD-BOX tidak ditemukan — skip.';
    RETURN;
  END IF;

  UPDATE stock_take_lines l
  SET counted_qty = 12,
      system_qty  = 12,
      notes       = 'Saldo awal cutoff (dikoreksi 2 → 12)'
  FROM stock_takes t
  WHERE l.stock_take_id = t.id
    AND t.is_opening = true
    AND l.item_id = v_item;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RAISE NOTICE 'Opening FD-BOX di-set ke 12 (% baris).', v_rows;
END $$;
