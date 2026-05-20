-- 20260521_inventory_v2_stock_opname.sql
-- ============================================================================
-- Inventory v2 — STEP 5: Stock Opname (a.k.a. Stock Take) overhaul
-- ============================================================================
--
-- Three things in one migration (atomic):
--
-- A. BUG: commit_stock_take RPC was inserting text 'in'/'out' into the
--    stock_movements.direction column, which is a movement_direction enum.
--    Postgres 8.3+ doesn't implicitly cast text → enum, so every commit
--    failed with "expression is of type text". Adds explicit
--    ::movement_direction cast. Also casts source to movement_source for
--    consistency.
--
-- B. SCHEMA (Inventory v2 alignment): system_qty, counted_qty, variance
--    were INTEGER. After M1 (stock_movements.quantity → NUMERIC(12,4)),
--    fractional rolls (e.g. 2.5 roll Mediaset) cannot be counted because
--    truncation would silently destroy data. Converts all three to
--    NUMERIC(12,4).
--
-- C. UX REDESIGN: counted_qty becomes NULLABLE. NULL = "not audited yet".
--    Previously, every row was pre-filled with system_qty (variance = 0),
--    which made "uncounted" and "confirmed-no-variance" indistinguishable.
--    With NULL, owner can see progress (X of Y audited) and the commit
--    skips NULL rows entirely (no spurious zero-variance movements).
--
-- D. HYGIENE: auto-cancel drafts that reference items archived in M1-M4
--    (Inventory v2 cleanup). Those drafts show huge variances because
--    archived items have 0 system stock — committing would generate
--    nonsense adjustments against soft-deleted SKUs.
--
-- Idempotent.

-- ============================================================================
-- 1. Schema conversion: NUMERIC + NULLABLE counted_qty
-- ============================================================================

-- variance is a GENERATED column referencing counted_qty - system_qty.
-- Postgres can't change the type of a generated column, so drop + recreate.
ALTER TABLE stock_take_lines DROP COLUMN IF EXISTS variance;

-- Convert qty columns to NUMERIC(12,4)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stock_take_lines'
      AND column_name = 'system_qty'
      AND data_type = 'integer'
  ) THEN
    ALTER TABLE stock_take_lines ALTER COLUMN system_qty TYPE NUMERIC(12, 4);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stock_take_lines'
      AND column_name = 'counted_qty'
      AND data_type = 'integer'
  ) THEN
    ALTER TABLE stock_take_lines ALTER COLUMN counted_qty TYPE NUMERIC(12, 4);
  END IF;
END $$;

-- counted_qty NULL = not audited yet
ALTER TABLE stock_take_lines ALTER COLUMN counted_qty DROP NOT NULL;

-- Recreate variance: NULL when counted_qty is NULL (= row not audited)
ALTER TABLE stock_take_lines ADD COLUMN variance NUMERIC(12, 4)
  GENERATED ALWAYS AS (
    CASE WHEN counted_qty IS NULL THEN NULL ELSE counted_qty - system_qty END
  ) STORED;

-- ============================================================================
-- 2. Cancel stale drafts that reference archived items
-- ============================================================================

UPDATE stock_takes
SET
  status = 'cancelled',
  updated_at = NOW(),
  notes = COALESCE(notes, '') ||
          E'\n[INVV2 auto-cancelled 2026-05-21] Contained pre-cleanup archived SKUs (ITM-PCS-*, ITM-SLEEVE-*, KEYCHAIN, etc). Mulai stock opname baru dengan canonical SKUs.'
WHERE status = 'draft'
  AND id IN (
    SELECT DISTINCT stl.stock_take_id
    FROM stock_take_lines stl
    JOIN inventory_items i ON i.id = stl.item_id
    WHERE i.deleted_at IS NOT NULL OR i.is_active = false
  );

-- ============================================================================
-- 3. Fix commit_stock_take RPC: enum casts + skip archived/unaudited lines
-- ============================================================================

DROP FUNCTION IF EXISTS commit_stock_take(UUID, UUID);

CREATE FUNCTION commit_stock_take(
  p_stock_take_id UUID,
  p_actor UUID
) RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  v_status TEXT;
  v_line RECORD;
  v_movements_created INTEGER := 0;
  v_ref_id TEXT;
BEGIN
  SELECT status INTO v_status FROM stock_takes WHERE id = p_stock_take_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Stock take % not found', p_stock_take_id USING ERRCODE = 'P0002';
  END IF;
  IF v_status != 'draft' THEN
    RAISE EXCEPTION 'Stock take % is not draft (status=%)', p_stock_take_id, v_status USING ERRCODE = 'P0001';
  END IF;

  -- Generate one adjustment movement per audited non-zero-variance line.
  -- Skips:
  --   - counted_qty IS NULL  → row never audited, no opinion on stock
  --   - variance = 0         → audited, but matches system, no movement needed
  --   - archived item        → defensive, drafts with archived items should
  --                            already be cancelled by step 2, but if a SKU
  --                            gets archived between create and commit, skip
  FOR v_line IN
    SELECT stl.item_id, stl.variance, stl.notes
    FROM stock_take_lines stl
    JOIN inventory_items i ON i.id = stl.item_id
    WHERE stl.stock_take_id = p_stock_take_id
      AND stl.counted_qty IS NOT NULL
      AND stl.variance != 0
      AND i.deleted_at IS NULL
      AND i.is_active = true
  LOOP
    v_ref_id := 'MOV-A-' || LPAD((random() * 99999999)::INTEGER::TEXT, 8, '0');
    INSERT INTO stock_movements (
      ref_id, item_id, direction, quantity, source, source_id,
      source_description, notes, performed_by
    ) VALUES (
      v_ref_id,
      v_line.item_id,
      (CASE WHEN v_line.variance > 0 THEN 'in' ELSE 'out' END)::movement_direction,
      ABS(v_line.variance),
      'stock_take'::movement_source,
      p_stock_take_id,
      'Stock opname adjustment',
      v_line.notes,
      p_actor
    );
    v_movements_created := v_movements_created + 1;
  END LOOP;

  UPDATE stock_takes
  SET status = 'committed',
      committed_at = NOW(),
      committed_by = p_actor,
      updated_at = NOW()
  WHERE id = p_stock_take_id;

  RETURN v_movements_created;
END;
$$;

GRANT EXECUTE ON FUNCTION commit_stock_take(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION commit_stock_take(UUID, UUID) IS
  'Commit a draft stock opname → generate one adjustment stock_movement per audited line with non-zero variance against an active item. Skips NULL counted_qty (unaudited), zero-variance, and archived/inactive items. Returns count of movements created. Idempotent: rejects non-draft takes.';
