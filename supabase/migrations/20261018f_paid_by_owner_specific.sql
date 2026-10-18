-- 20261018f_paid_by_owner_specific.sql — pembayar "owner tertentu" (owner 2026-10-18).
-- expense_paid_by / lainnya_items[].paid_by kini juga boleh 'owner:<users.id>':
-- biaya ditransfer / dibayar owner itu. Diperlakukan sama dengan 'owner'
-- (dikeluarkan dari OpEx settlement — bukan talangan crew); pembukuannya lewat
-- antrean settle (sumber "Hutang ke <owner>") → Dr beban / Cr 2-310 + catatan
-- hutang-piutang owner. Hanya kondisi pembayar yang berubah; isi lain identik
-- dengan 20260824b.
CREATE OR REPLACE FUNCTION public.calculate_recap_opex(p_recap_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_owner_paid     BIGINT := 0;

  v_paid_by        JSONB;
  v_amt            BIGINT;
  v_item           JSONB;

  -- Peta {kode COA: nominal} untuk biaya yang dibayar dari rekening sendiri.
  v_acct           JSONB := '{}'::jsonb;
  v_acct_total     BIGINT := 0;
  v_pb             TEXT;
  v_coa            TEXT;
BEGIN
  SELECT * INTO v_recap FROM crew_rekap WHERE id = p_recap_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recap not found: %', p_recap_id USING ERRCODE = 'P0002';
  END IF;
  v_event_id := v_recap.event_id;
  v_paid_by  := COALESCE(v_recap.expense_paid_by, '{}'::jsonb);

  -- Transport
  v_amt := ROUND(COALESCE(v_recap.transport_cost, 0))::BIGINT;
  v_pb  := COALESCE(v_paid_by->>'transport', 'crew');
  IF v_pb = 'owner' OR v_pb LIKE 'owner:%' THEN
    v_owner_paid := v_owner_paid + v_amt;
  ELSE
    v_transport := v_amt;
    v_coa := paid_from_account_coa(v_pb);
    IF v_coa IS NOT NULL AND v_amt > 0 THEN
      v_acct := jsonb_set(v_acct, ARRAY[v_coa],
        to_jsonb(COALESCE((v_acct->>v_coa)::BIGINT, 0) + v_amt));
    END IF;
  END IF;

  -- Bensin
  v_amt := ROUND(COALESCE(v_recap.bensin_cost, 0))::BIGINT;
  v_pb  := COALESCE(v_paid_by->>'bensin', 'crew');
  IF v_pb = 'owner' OR v_pb LIKE 'owner:%' THEN
    v_owner_paid := v_owner_paid + v_amt;
  ELSE
    v_bensin := v_amt;
    v_coa := paid_from_account_coa(v_pb);
    IF v_coa IS NOT NULL AND v_amt > 0 THEN
      v_acct := jsonb_set(v_acct, ARRAY[v_coa],
        to_jsonb(COALESCE((v_acct->>v_coa)::BIGINT, 0) + v_amt));
    END IF;
  END IF;

  -- Toll / e-toll
  v_amt := ROUND(COALESCE(v_recap.toll_cost, 0))::BIGINT;
  v_pb  := COALESCE(v_paid_by->>'toll', 'crew');
  IF v_pb = 'owner' OR v_pb LIKE 'owner:%' THEN
    v_owner_paid := v_owner_paid + v_amt;
  ELSE
    v_toll := v_amt;
    v_coa := paid_from_account_coa(v_pb);
    IF v_coa IS NOT NULL AND v_amt > 0 THEN
      v_acct := jsonb_set(v_acct, ARRAY[v_coa],
        to_jsonb(COALESCE((v_acct->>v_coa)::BIGINT, 0) + v_amt));
    END IF;
  END IF;

  -- Parkir
  v_amt := ROUND(COALESCE(v_recap.parking_cost, 0))::BIGINT;
  v_pb  := COALESCE(v_paid_by->>'parking', 'crew');
  IF v_pb = 'owner' OR v_pb LIKE 'owner:%' THEN
    v_owner_paid := v_owner_paid + v_amt;
  ELSE
    v_parking := v_amt;
    v_coa := paid_from_account_coa(v_pb);
    IF v_coa IS NOT NULL AND v_amt > 0 THEN
      v_acct := jsonb_set(v_acct, ARRAY[v_coa],
        to_jsonb(COALESCE((v_acct->>v_coa)::BIGINT, 0) + v_amt));
    END IF;
  END IF;

  -- Konsumsi
  v_amt := ROUND(COALESCE(v_recap.konsumsi_cost, 0))::BIGINT;
  v_pb  := COALESCE(v_paid_by->>'konsumsi', 'crew');
  IF v_pb = 'owner' OR v_pb LIKE 'owner:%' THEN
    v_owner_paid := v_owner_paid + v_amt;
  ELSE
    v_konsumsi := v_amt;
    v_coa := paid_from_account_coa(v_pb);
    IF v_coa IS NOT NULL AND v_amt > 0 THEN
      v_acct := jsonb_set(v_acct, ARRAY[v_coa],
        to_jsonb(COALESCE((v_acct->>v_coa)::BIGINT, 0) + v_amt));
    END IF;
  END IF;

  -- Lain-lain — dari crew_rekap.lainnya_items (JSONB), per item punya
  -- paid_by opsional. (Dulu baca event_recap_misc_expenses yang orphan.)
  IF v_recap.lainnya_items IS NOT NULL
     AND jsonb_typeof(v_recap.lainnya_items) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_recap.lainnya_items)
    LOOP
      v_amt := ROUND(COALESCE((v_item->>'amount')::NUMERIC, 0))::BIGINT;
      IF v_amt <= 0 THEN CONTINUE; END IF;
      v_pb := COALESCE(v_item->>'paid_by', 'crew');
      IF v_pb = 'owner' OR v_pb LIKE 'owner:%' THEN
        v_owner_paid := v_owner_paid + v_amt;
      ELSE
        v_misc := v_misc + v_amt;
        v_coa := paid_from_account_coa(v_pb);
        IF v_coa IS NOT NULL THEN
          v_acct := jsonb_set(v_acct, ARRAY[v_coa],
            to_jsonb(COALESCE((v_acct->>v_coa)::BIGINT, 0) + v_amt));
        END IF;
      END IF;
    END LOOP;
  END IF;

  SELECT COALESCE(SUM(value::TEXT::BIGINT), 0) INTO v_acct_total
  FROM jsonb_each(v_acct);

  -- Crew fees per role + bonus (from crew_assignments). reimbursement_amount
  -- tetap TIDAK dibaca ke OpEx (payout pelunasan talangan, bukan beban kedua
  -- — lihat 20260624_opex_exclude_reimbursement).
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
    'reimbursement',  0,
    'transport',      v_transport,
    'bensin',         v_bensin,
    'toll',           v_toll,
    'parking',        v_parking,
    'konsumsi',       v_konsumsi,
    'misc',           v_misc,
    -- Info: biaya event yang dibayar langsung owner (tercatat via Catat
    -- transaksi, BUKAN bagian total OpEx settlement). settle_event tidak
    -- membaca key ini.
    'owner_paid_total', v_owner_paid,
    -- Peta {kode COA: nominal} biaya yang dibayar dari rekening perusahaan.
    -- Nominalnya SUDAH termasuk di bucket masing-masing di atas — ini cuma
    -- memberi tahu settle_event ke mana kreditnya harus jatuh.
    'account_paid',       v_acct,
    'account_paid_total', v_acct_total,
    'total',          v_fee_lead + v_fee_asisten + v_fee_crew_c + v_fee_extra
                    + v_transport + v_bensin + v_toll
                    + v_parking + v_konsumsi + v_misc
  );
END;
$function$;

