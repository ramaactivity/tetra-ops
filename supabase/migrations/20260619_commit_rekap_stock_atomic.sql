-- 20260619_commit_rekap_stock_atomic.sql
--
-- C2 fix: approving a rekap did TWO separate writes from app code — insert
-- stock_movements, then UPDATE crew_rekap (snapshot + stock_committed_at). If
-- the second failed, movements existed but stock_committed_at stayed NULL, so a
-- retry re-deducted (double-deduction). This RPC does both in ONE transaction
-- (plpgsql function body = single tx): either all of it lands or none of it.
--
-- Owner-level only (is_owner_level guard) — moves inventory + writes HPP.
-- Idempotent: CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION commit_rekap_stock(
  p_rekap_id uuid,
  p_event_id uuid,
  p_actor uuid,
  p_movements jsonb,        -- [{ref_id,item_id,quantity,unit_cost,source_description,notes}]
  p_hpp_snapshot jsonb,
  p_hpp_total bigint,
  p_batch_id uuid,
  p_is_approved boolean,
  p_status text,
  p_review_notes text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_owner_level() THEN
    RAISE EXCEPTION 'Forbidden: commit_rekap_stock is owner-level only';
  END IF;

  IF p_movements IS NOT NULL
     AND jsonb_typeof(p_movements) = 'array'
     AND jsonb_array_length(p_movements) > 0 THEN
    INSERT INTO stock_movements
      (ref_id, item_id, direction, quantity, unit_cost, source, source_id,
       source_description, notes, performed_by)
    SELECT m.ref_id, m.item_id, 'out'::movement_direction, m.quantity, m.unit_cost,
           'rekap_consumption'::movement_source, p_event_id, m.source_description,
           m.notes, p_actor
    FROM jsonb_to_recordset(p_movements) AS m(
      ref_id text,
      item_id uuid,
      quantity numeric,
      unit_cost numeric,
      source_description text,
      notes text
    );
  END IF;

  UPDATE crew_rekap SET
    hpp_snapshot            = p_hpp_snapshot,
    hpp_snapshot_total      = p_hpp_total,
    stock_committed_at      = now(),
    stock_movement_batch_id = p_batch_id,
    is_approved             = COALESCE(p_is_approved, is_approved),
    reviewed_by             = p_actor,
    reviewed_at             = now(),
    status                  = COALESCE(p_status::crew_rekap_status, status),
    review_notes            = COALESCE(p_review_notes, review_notes)
  WHERE id = p_rekap_id;
END;
$$;

REVOKE ALL ON FUNCTION commit_rekap_stock(uuid, uuid, uuid, jsonb, jsonb, bigint, uuid, boolean, text, text) FROM public;
GRANT EXECUTE ON FUNCTION commit_rekap_stock(uuid, uuid, uuid, jsonb, jsonb, bigint, uuid, boolean, text, text) TO authenticated;

COMMENT ON FUNCTION commit_rekap_stock(uuid, uuid, uuid, jsonb, jsonb, bigint, uuid, boolean, text, text) IS
  'Atomically insert rekap stock_movements + update crew_rekap (snapshot, '
  'stock_committed_at, batch, approval/status). One transaction so a partial '
  'write can never leave movements without stock_committed_at (no double-deduct).';
