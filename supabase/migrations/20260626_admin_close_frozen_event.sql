-- admin_close_frozen_event — administratively close a PRE-CUTOFF (frozen) event
-- that is stuck in awaiting_settlement. Money was already moved in real life; the
-- event's financial position is already captured in the cutoff opening balance, so
-- it must NOT post anything to the new books. This flips status only — it writes
-- NOTHING to journal_entries / journal_lines / event_settlements / stock_movements.
--
-- Hard-guarded: only fires on events that are BOTH frozen (finance_frozen_at set)
-- AND awaiting_settlement AND not already settled. Live events are rejected — use
-- the normal settle_event() for those.

CREATE OR REPLACE FUNCTION admin_close_frozen_event(
  p_event_id uuid,
  p_actor_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status  text;
  v_frozen  timestamptz;
  v_rekap   uuid;
  v_locked  boolean := false;
BEGIN
  SELECT status, finance_frozen_at INTO v_status, v_frozen
  FROM events WHERE id = p_event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event % tidak ditemukan', p_event_id;
  END IF;
  IF v_frozen IS NULL THEN
    RAISE EXCEPTION 'Event % tidak beku (bukan pre-cutoff) — pakai settle_event biasa', p_event_id
      USING ERRCODE = '42P01';
  END IF;
  IF v_status <> 'awaiting_settlement' THEN
    RAISE EXCEPTION 'Event % status=% (bukan awaiting_settlement) — tidak ditutup', p_event_id, v_status
      USING ERRCODE = '42P01';
  END IF;
  IF EXISTS (SELECT 1 FROM event_settlements WHERE event_id = p_event_id) THEN
    RAISE EXCEPTION 'Event % sudah punya settlement — jangan ditutup ganda', p_event_id
      USING ERRCODE = '42P01';
  END IF;

  -- Status only. No GL, no inventory, no settlement record.
  UPDATE events
  SET status = 'completed', updated_at = now()
  WHERE id = p_event_id;

  -- Lock the rekap closed (terminal). is_approved reflects the owner's sign-off;
  -- stock_committed_at / hpp_snapshot are LEFT UNTOUCHED so no inventory/COGS moves.
  UPDATE crew_rekap
  SET status      = 'settled',
      is_approved = true,
      reviewed_by = COALESCE(reviewed_by, p_actor_id),
      reviewed_at = COALESCE(reviewed_at, now()),
      locked      = true,
      locked_at   = now(),
      settled_at  = now(),
      updated_at  = now()
  WHERE event_id = p_event_id
  RETURNING id INTO v_rekap;
  v_locked := v_rekap IS NOT NULL;

  RETURN jsonb_build_object(
    'event_id', p_event_id,
    'status', 'completed',
    'rekap_locked', v_locked,
    'journal_posted', false,
    'note', 'Pre-cutoff frozen event ditutup administratif — tidak ada posting ke buku.'
  );
END;
$$;
