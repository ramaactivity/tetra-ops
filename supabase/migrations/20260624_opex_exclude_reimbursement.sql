-- ============================================================================
-- Fix double-count: crew reimbursement was being added to OpEx ON TOP of the
-- rekap field expenses (transport/bensin/toll/parking/konsumsi) it pays back.
--
-- A field expense is ONE cost. When crew front it out of pocket, the business
-- owes them — "reimbursement" is the PAYOUT that settles that debt, not a second
-- expense. Counting both inflated OpEx (and understated net profit) by the full
-- reimbursement amount in BOTH the profit preview and the settle_event ledger.
--
-- Fix (minimal + safe): calculate_recap_opex() now EXCLUDES reimbursement from
-- the OpEx total and reports it as 0 in the breakdown. Because settle_event()
-- builds its OpEx by reading this function's JSON keys (fee_extra += reimbursement),
-- returning 0 here also corrects the ledger with no change to the large
-- settle_event body. reimbursement_amount stays a per-crew PAYOUT figure
-- (crew_assignments) surfaced in the crew fee form — it is not P&L OpEx.
--
-- Forward-only: already-settled events keep their stored numbers (reopen + settle
-- again to recompute if ever needed).
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_recap_opex(p_recap_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id   UUID;
  v_recap      RECORD;

  v_fee_lead       BIGINT := 0;
  v_fee_asisten    BIGINT := 0;
  v_fee_crew_c     BIGINT := 0;
  v_fee_extra      BIGINT := 0;
  v_transport      BIGINT := 0;
  v_bensin         BIGINT := 0;
  v_toll           BIGINT := 0;
  v_parking        BIGINT := 0;
  v_konsumsi       BIGINT := 0;
  v_misc           BIGINT := 0;
BEGIN
  SELECT * INTO v_recap FROM crew_rekap WHERE id = p_recap_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recap not found: %', p_recap_id USING ERRCODE = 'P0002';
  END IF;
  v_event_id := v_recap.event_id;

  -- Field expenses (NUMERIC → BIGINT via ROUND). These ARE the costs, counted once.
  v_transport := ROUND(COALESCE(v_recap.transport_cost, 0))::BIGINT;
  v_bensin    := ROUND(COALESCE(v_recap.bensin_cost, 0))::BIGINT;
  v_toll      := ROUND(COALESCE(v_recap.toll_cost, 0))::BIGINT;
  v_parking   := ROUND(COALESCE(v_recap.parking_cost, 0))::BIGINT;
  v_konsumsi  := ROUND(COALESCE(v_recap.konsumsi_cost, 0))::BIGINT;

  -- Misc expenses (dedicated table)
  SELECT COALESCE(SUM(ROUND(amount)), 0)::BIGINT
  INTO v_misc
  FROM event_recap_misc_expenses
  WHERE recap_id = p_recap_id;

  -- Crew fees per role + bonus (from crew_assignments). reimbursement_amount is
  -- deliberately NOT read into OpEx — see header note.
  SELECT
    COALESCE(SUM(CASE WHEN role_in_event = 'lead'    THEN fee_amount END), 0),
    COALESCE(SUM(CASE WHEN role_in_event = 'asisten' THEN fee_amount END), 0),
    COALESCE(SUM(CASE WHEN role_in_event = 'crew_c'  THEN fee_amount END), 0),
    COALESCE(SUM(bonus_amount), 0)
  INTO v_fee_lead, v_fee_asisten, v_fee_crew_c, v_fee_extra
  FROM crew_assignments
  WHERE event_id = v_event_id;

  RETURN jsonb_build_object(
    'fee_lead',       v_fee_lead,
    'fee_asisten',    v_fee_asisten,
    'fee_crew_c',     v_fee_crew_c,
    'fee_extra',      v_fee_extra,
    -- reimbursement is a crew PAYOUT (settles the debt for fronted field
    -- expenses), not a separate OpEx cost → always 0 here to avoid double-count.
    'reimbursement',  0,
    'transport',      v_transport,
    'bensin',         v_bensin,
    'toll',           v_toll,
    'parking',        v_parking,
    'konsumsi',       v_konsumsi,
    'misc',           v_misc,
    'total',          v_fee_lead + v_fee_asisten + v_fee_crew_c + v_fee_extra
                    + v_transport + v_bensin + v_toll
                    + v_parking + v_konsumsi + v_misc
  );
END;
$$;

COMMENT ON FUNCTION calculate_recap_opex IS
  'Return OpEx breakdown (JSONB) untuk crew_rekap: crew fees per role + bonus + field expenses + misc. Reimbursement crew TIDAK dihitung di OpEx (itu payout pelunasan biaya lapangan yang sudah dihitung sekali via transport/bensin/toll/parking/konsumsi).';
