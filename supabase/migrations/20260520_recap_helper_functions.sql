-- 20260520_recap_helper_functions.sql
-- Helper PostgreSQL functions:
--   • generate_journal_reference(p_date)
--       → Generate format JE-YYYYMMDD-NNN dengan sequential per-day counter.
--   • calculate_recap_hpp(recap_id)
--       → Return JSONB breakdown HPP per bucket dari crew_rekap × rekap_field_mapping × inventory_items.
--   • calculate_recap_opex(recap_id)
--       → Return JSONB breakdown OpEx dari crew_rekap field-expense columns + event_recap_misc_expenses + crew_assignments fees.
--
-- Read-only (no side effects). Caller pakai untuk display & validation.

-- ----------------------------------------------------------------------------
-- 1. generate_journal_reference(p_date DATE) → TEXT
--    Format: JE-YYYYMMDD-NNN dimana NNN adalah counter per-day (zero-padded 3 digit).
--    Pakai journal_entries.ref_id untuk hitung NNN berikutnya.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION generate_journal_reference(p_date DATE DEFAULT CURRENT_DATE)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date_str   TEXT;
  v_next_num   INTEGER;
  v_ref_id     TEXT;
BEGIN
  v_date_str := to_char(p_date, 'YYYYMMDD');

  -- Hitung next counter dari ref_id existing pada tanggal yang sama.
  -- Pattern: JE-YYYYMMDD-NNN
  SELECT COALESCE(
    MAX(
      CAST(
        SUBSTRING(ref_id FROM '^JE-' || v_date_str || '-([0-9]+)$') AS INTEGER
      )
    ), 0
  ) + 1
  INTO v_next_num
  FROM journal_entries
  WHERE ref_id LIKE 'JE-' || v_date_str || '-%';

  v_ref_id := 'JE-' || v_date_str || '-' || LPAD(v_next_num::TEXT, 3, '0');

  RETURN v_ref_id;
END;
$$;

COMMENT ON FUNCTION generate_journal_reference IS
  'Generate next journal reference ID untuk tanggal tertentu. Format: JE-YYYYMMDD-NNN. Default tanggal = CURRENT_DATE.';

-- ----------------------------------------------------------------------------
-- 2. calculate_recap_hpp(p_recap_id UUID) → JSONB
--    Breakdown HPP per bucket: {mediaset, sleeve, flashdisk, pouch, photomagnet, keychain, bonus, other, total}
--    Resolve rekap_field_mapping (frame-size-aware) × inventory_items.purchase_price_avg.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION calculate_recap_hpp(p_recap_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recap        RECORD;
  v_frame_size   frame_size;
  v_event_id     UUID;

  v_mediaset    BIGINT := 0;
  v_sleeve      BIGINT := 0;
  v_flashdisk   BIGINT := 0;
  v_pouch       BIGINT := 0;
  v_photomagnet BIGINT := 0;
  v_keychain    BIGINT := 0;
  v_bonus       BIGINT := 0;
  v_other       BIGINT := 0;

  v_row         RECORD;
BEGIN
  -- Load rekap + frame_size (prefer snapshot, fallback ke events.frame_size)
  SELECT cr.*, e.frame_size AS event_frame_size, e.id AS ev_id
  INTO v_recap
  FROM crew_rekap cr
  JOIN events e ON e.id = cr.event_id
  WHERE cr.id = p_recap_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recap not found: %', p_recap_id USING ERRCODE = 'P0002';
  END IF;

  v_frame_size := COALESCE(v_recap.frame_size_snapshot, v_recap.event_frame_size);
  v_event_id := v_recap.ev_id;

  -- Helper: untuk tiap rekap_field, resolve mapping (exact frame_size match, fallback '')
  -- lalu compute qty × qty_per_unit × purchase_price_avg.
  -- Loop semua 7 field dengan inline mapping resolution.

  FOR v_row IN
    SELECT rfm.rekap_field, rfm.qty_per_unit, i.purchase_price_avg,
      CASE v_recap.cetak_total
        WHEN NULL THEN 0
        ELSE COALESCE(
          CASE rfm.rekap_field
            WHEN 'cetak_total'      THEN v_recap.cetak_total
            WHEN 'media_set_used'   THEN v_recap.media_set_used
            WHEN 'sleeve_used'      THEN v_recap.sleeve_used
            WHEN 'flashdisk_used'   THEN v_recap.flashdisk_used
            WHEN 'pouch_used'       THEN v_recap.pouch_used
            WHEN 'photomagnet_used' THEN v_recap.photomagnet_used
            WHEN 'keychain_used'    THEN v_recap.keychain_used
          END, 0)
      END AS qty_consumed
    FROM rekap_field_mapping rfm
    JOIN inventory_items i ON i.id = rfm.item_id
    WHERE rfm.is_active = true
      AND (
        rfm.frame_size = v_frame_size::TEXT
        OR (rfm.frame_size = '' AND NOT EXISTS (
              SELECT 1 FROM rekap_field_mapping rfm2
              WHERE rfm2.rekap_field = rfm.rekap_field
                AND rfm2.frame_size = v_frame_size::TEXT
                AND rfm2.is_active = true))
      )
  LOOP
    -- Map rekap_field → HPP bucket
    CASE v_row.rekap_field
      WHEN 'media_set_used'   THEN v_mediaset    := v_mediaset    + ROUND(v_row.qty_consumed * v_row.qty_per_unit * v_row.purchase_price_avg)::BIGINT;
      WHEN 'sleeve_used'      THEN v_sleeve      := v_sleeve      + ROUND(v_row.qty_consumed * v_row.qty_per_unit * v_row.purchase_price_avg)::BIGINT;
      WHEN 'flashdisk_used'   THEN v_flashdisk   := v_flashdisk   + ROUND(v_row.qty_consumed * v_row.qty_per_unit * v_row.purchase_price_avg)::BIGINT;
      WHEN 'pouch_used'       THEN v_pouch       := v_pouch       + ROUND(v_row.qty_consumed * v_row.qty_per_unit * v_row.purchase_price_avg)::BIGINT;
      WHEN 'photomagnet_used' THEN v_photomagnet := v_photomagnet + ROUND(v_row.qty_consumed * v_row.qty_per_unit * v_row.purchase_price_avg)::BIGINT;
      WHEN 'keychain_used'    THEN v_keychain    := v_keychain    + ROUND(v_row.qty_consumed * v_row.qty_per_unit * v_row.purchase_price_avg)::BIGINT;
      ELSE NULL;  -- cetak_total tidak punya HPP bucket sendiri
    END CASE;
  END LOOP;

  -- Custom materials → bucket "other"
  IF v_recap.custom_materials IS NOT NULL AND jsonb_typeof(v_recap.custom_materials) = 'object' THEN
    FOR v_row IN
      SELECT i.purchase_price_avg, (kv.value)::TEXT::NUMERIC AS qty
      FROM jsonb_each(v_recap.custom_materials) kv
      JOIN inventory_items i ON i.sku = kv.key
    LOOP
      v_other := v_other + ROUND(COALESCE(v_row.qty, 0) * COALESCE(v_row.purchase_price_avg, 0))::BIGINT;
    END LOOP;
  END IF;

  -- Bonus: event_bonuses × addon.inventory_item × purchase_price_avg
  SELECT COALESCE(SUM(ROUND(eb.quantity * COALESCE(i.purchase_price_avg, 0))), 0)::BIGINT
  INTO v_bonus
  FROM event_bonuses eb
  LEFT JOIN addons a ON a.id = eb.addon_id
  LEFT JOIN inventory_items i ON i.id = a.inventory_item_id
  WHERE eb.event_id = v_event_id;

  RETURN jsonb_build_object(
    'mediaset',    v_mediaset,
    'sleeve',      v_sleeve,
    'flashdisk',   v_flashdisk,
    'pouch',       v_pouch,
    'photomagnet', v_photomagnet,
    'keychain',    v_keychain,
    'bonus',       v_bonus,
    'other',       v_other,
    'total',       v_mediaset + v_sleeve + v_flashdisk + v_pouch + v_photomagnet + v_keychain + v_bonus + v_other
  );
END;
$$;

COMMENT ON FUNCTION calculate_recap_hpp IS
  'Return HPP breakdown (JSONB) untuk crew_rekap. Frame-size-aware via rekap_field_mapping. Includes event_bonuses cost in bucket "bonus".';

-- ----------------------------------------------------------------------------
-- 3. calculate_recap_opex(p_recap_id UUID) → JSONB
--    Breakdown OpEx dari:
--      • crew_rekap field expense (transport_cost, bensin, toll, parking, konsumsi)
--      • event_recap_misc_expenses (sum)
--      • crew_assignments (fee_amount + bonus_amount + reimbursement_amount) per event
-- ----------------------------------------------------------------------------

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
  v_reimburse      BIGINT := 0;
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

  -- Field expenses (NUMERIC → BIGINT via ROUND)
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

  -- Crew fees per role (from crew_assignments)
  SELECT
    COALESCE(SUM(CASE WHEN role_in_event = 'lead'    THEN fee_amount END), 0),
    COALESCE(SUM(CASE WHEN role_in_event = 'asisten' THEN fee_amount END), 0),
    COALESCE(SUM(CASE WHEN role_in_event = 'crew_c'  THEN fee_amount END), 0),
    COALESCE(SUM(bonus_amount), 0),
    COALESCE(SUM(reimbursement_amount), 0)
  INTO v_fee_lead, v_fee_asisten, v_fee_crew_c, v_fee_extra, v_reimburse
  FROM crew_assignments
  WHERE event_id = v_event_id;

  RETURN jsonb_build_object(
    'fee_lead',       v_fee_lead,
    'fee_asisten',    v_fee_asisten,
    'fee_crew_c',     v_fee_crew_c,
    'fee_extra',      v_fee_extra,
    'reimbursement',  v_reimburse,
    'transport',      v_transport,
    'bensin',         v_bensin,
    'toll',           v_toll,
    'parking',        v_parking,
    'konsumsi',       v_konsumsi,
    'misc',           v_misc,
    'total',          v_fee_lead + v_fee_asisten + v_fee_crew_c + v_fee_extra
                    + v_reimburse + v_transport + v_bensin + v_toll
                    + v_parking + v_konsumsi + v_misc
  );
END;
$$;

COMMENT ON FUNCTION calculate_recap_opex IS
  'Return OpEx breakdown (JSONB) untuk crew_rekap: crew fees per role + field expenses + misc.';

-- Verification:
--   SELECT calculate_recap_hpp(id), calculate_recap_opex(id) FROM crew_rekap LIMIT 1;
