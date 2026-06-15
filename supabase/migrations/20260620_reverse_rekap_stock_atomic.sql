-- 20260620_reverse_rekap_stock_atomic.sql
--
-- Symmetry with commit_rekap_stock (C2): the reversal path (reject-after-approve
-- and owner re-submit) inserted 'in' offset movements then separately updated
-- crew_rekap. A partial failure could leave a contradictory state and, on the
-- reject path, a retry could double-reverse (over-credit stock).
--
-- This RPC inserts the reversal movements AND updates crew_rekap (clear the
-- commit; optionally mark rejected) in ONE transaction. The caller computes the
-- NET reversal per item (Σout − Σin) so re-running after success inserts nothing
-- — atomic AND idempotent. Owner-level only. Idempotent (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION reverse_rekap_stock(
  p_rekap_id uuid,
  p_event_id uuid,
  p_actor uuid,
  p_reversals jsonb,   -- [{ref_id,item_id,quantity,unit_cost,source_description,notes}]
  p_reject boolean,
  p_review_notes text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_owner_level() THEN
    RAISE EXCEPTION 'Forbidden: reverse_rekap_stock is owner-level only';
  END IF;

  IF p_reversals IS NOT NULL
     AND jsonb_typeof(p_reversals) = 'array'
     AND jsonb_array_length(p_reversals) > 0 THEN
    INSERT INTO stock_movements
      (ref_id, item_id, direction, quantity, unit_cost, source, source_id,
       source_description, notes, performed_by)
    SELECT m.ref_id, m.item_id, 'in'::movement_direction, m.quantity, m.unit_cost,
           'rekap_consumption'::movement_source, p_event_id, m.source_description,
           m.notes, p_actor
    FROM jsonb_to_recordset(p_reversals) AS m(
      ref_id text,
      item_id uuid,
      quantity numeric,
      unit_cost numeric,
      source_description text,
      notes text
    );
  END IF;

  UPDATE crew_rekap SET
    stock_committed_at      = NULL,
    stock_movement_batch_id = NULL,
    hpp_snapshot            = NULL,
    hpp_snapshot_total      = NULL,
    is_approved  = CASE WHEN p_reject THEN false ELSE is_approved END,
    status       = CASE WHEN p_reject THEN 'rejected'::crew_rekap_status ELSE status END,
    reviewed_by  = CASE WHEN p_reject THEN p_actor ELSE reviewed_by END,
    reviewed_at  = CASE WHEN p_reject THEN now() ELSE reviewed_at END,
    review_notes = CASE WHEN p_reject THEN p_review_notes ELSE review_notes END
  WHERE id = p_rekap_id;
END;
$$;

REVOKE ALL ON FUNCTION reverse_rekap_stock(uuid, uuid, uuid, jsonb, boolean, text) FROM public;
GRANT EXECUTE ON FUNCTION reverse_rekap_stock(uuid, uuid, uuid, jsonb, boolean, text) TO authenticated;

COMMENT ON FUNCTION reverse_rekap_stock(uuid, uuid, uuid, jsonb, boolean, text) IS
  'Atomically insert rekap stock reversals (in) + clear crew_rekap commit '
  '(optionally mark rejected). Caller passes NET reversals so it is idempotent.';
