-- ============================================================================
-- 20260824b_emoney_paid_from_settle.sql — biaya lapangan bisa dibayar langsung
-- dari saldo perusahaan (kartu e-toll, kas, bank).
--
-- Sebelum ini crew_rekap.expense_paid_by cuma mengenal dua dunia:
--   'crew'  → ditalangi crew  → settle mengkredit 2-100 Hutang Crew
--   'owner' → dibayar owner   → dikeluarkan dari OpEx (anti dobel dgn Catat)
--
-- Tap e-toll pakai kartu perusahaan tidak muat di keduanya: tidak ada manusia
-- yang menalangi, uangnya sudah keluar waktu topup. Dipaksa ke 'crew', sistem
-- jadi berutang ke crew untuk uang yang tak pernah mereka keluarkan.
--
-- Nilai baru: 'acct:<uuid bank_accounts>' → beban tetap masuk OpEx event
-- (untung per event TIDAK berubah), tapi lawan jurnalnya rekening itu sendiri.
--
-- Tiga fungsi diganti utuh (basis: definisi yang hidup di produksi per
-- 2026-08-24, ditambal seperlunya):
--   calculate_recap_opex      → hitung + kembalikan peta account_paid
--   settle_event_impl         → teruskan peta itu + penjaga saldo rekening
--   _create_settlement_journal → kredit rekening pembayar, bukan 2-100
--
-- Forward-only: event yang sudah settled tetap memakai angka tersimpan.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- calculate_recap_opex — tambah peta account_paid
-- ---------------------------------------------------------------------------
-- Perbedaan penting dengan flag 'owner':
--   'owner'  → biaya DIKELUARKAN dari OpEx (owner mencatatnya sendiri via
--              Catat transaksi; menghitung di sini lagi = beban dobel).
--   'acct:…' → biaya TETAP DIHITUNG di OpEx (ini memang biaya event yang
--              dibayar uang perusahaan), cuma lawan jurnalnya yang berbeda.
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
  IF v_pb = 'owner' THEN
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
  IF v_pb = 'owner' THEN
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
  IF v_pb = 'owner' THEN
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
  IF v_pb = 'owner' THEN
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
  IF v_pb = 'owner' THEN
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
      IF v_pb = 'owner' THEN
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

COMMENT ON FUNCTION calculate_recap_opex IS
  'OpEx breakdown (JSONB) utk crew_rekap: crew fees + field expenses + lain-lain. paid_by=owner dikeluarkan dari total (dilaporkan di owner_paid_total). paid_by=acct:<uuid> TETAP dihitung di total, tapi dilaporkan di account_paid supaya settle mengkredit rekening itu, bukan 2-100.';

-- ---------------------------------------------------------------------------
-- settle_event_impl — teruskan account_paid + jaga saldo rekening pembayar
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.settle_event_impl(p_event_id uuid, p_owner_user_id uuid, p_overrides jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_event           RECORD;
  v_recap           RECORD;
  v_settlement_id   UUID;
  v_batch_id        UUID;
  v_journal_id      UUID;

  v_hpp             JSONB;
  v_opex            JSONB;
  v_hpp_auto        JSONB;
  v_opex_auto       JSONB;
  v_guard           RECORD;
  v_guard_balance   BIGINT;
  v_was_override    BOOLEAN := false;

  v_revenue_gross   BIGINT;
  v_discount        BIGINT;
  v_revenue_net     BIGINT;
  v_hpp_total       BIGINT;
  v_opex_total      BIGINT;
  v_total_biaya     BIGINT;
  v_net_profit      BIGINT;
  v_margin          NUMERIC(5,2);
  v_is_loss         BOOLEAN;

  v_addon_total     BIGINT;

  v_stock_check     JSONB;
  v_actor_role      TEXT;
  v_owner_pool_pp   BIGINT;
  v_owner_count     INTEGER;
  v_owner_pool_tot  BIGINT;
  v_owner_id        UUID;
  v_owner_share     NUMERIC;
  v_dist_mode       TEXT;
  v_share_total     NUMERIC;

  v_fund            RECORD;
  v_alloc           BIGINT;
  v_sink_total      BIGINT := 0;
  v_sink_eq         BIGINT := 0;
  v_sink_mt         BIGINT := 0;
  v_sink_cr         BIGINT := 0;
  v_sink_em         BIGINT := 0;
  v_operating_cash  BIGINT;
BEGIN
  -- 1. Validate actor & event
  SELECT role INTO v_actor_role FROM users WHERE id = p_owner_user_id;
  IF v_actor_role NOT IN ('owner', 'super_admin') THEN
    RAISE EXCEPTION 'Forbidden: actor % is not owner/super_admin (role=%)', p_owner_user_id, v_actor_role
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_event FROM events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found: %', p_event_id USING ERRCODE = 'P0002';
  END IF;
  IF v_event.status NOT IN ('in_progress', 'awaiting_settlement') THEN
    RAISE EXCEPTION 'Event status must be in_progress or awaiting_settlement (got %)', v_event.status
      USING ERRCODE = '42P01';
  END IF;
  IF EXISTS (SELECT 1 FROM event_settlements WHERE event_id = p_event_id) THEN
    RAISE EXCEPTION 'Event % already settled', p_event_id USING ERRCODE = '23505';
  END IF;

  -- 2. Validate recap exists & approved
  SELECT * INTO v_recap FROM crew_rekap WHERE event_id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rekap belum di-submit untuk event %', p_event_id USING ERRCODE = 'P0002';
  END IF;
  IF v_recap.status NOT IN ('reviewed', 'settled') AND v_recap.is_approved IS NOT TRUE THEN
    RAISE EXCEPTION 'Rekap belum di-review/approve. Status saat ini: %', v_recap.status USING ERRCODE = '42P01';
  END IF;

  -- 2b. Single-engine invariant: stok WAJIB sudah di-commit saat approval.
  IF v_recap.stock_committed_at IS NULL THEN
    RAISE EXCEPTION 'Rekap belum commit stok. Approve ulang rekap dulu sebelum settle (single engine).'
      USING ERRCODE = '42P01';
  END IF;

  -- 3. Stock sufficiency CHECK — warning only, NOT blocking
  v_stock_check := _validate_recap_stock_sufficient(v_recap.id);
  IF NOT (v_stock_check->>'sufficient')::BOOLEAN THEN
    INSERT INTO audit_log (entity_type, entity_id, action, changes, actor_id)
    VALUES (
      'event_settlement',
      NULL,
      'stock_warning',
      jsonb_build_object(
        'event_id', p_event_id,
        'recap_id', v_recap.id,
        'shortages', v_stock_check->'shortages',
        'note', 'Stock akan minus setelah deduction. Restock untuk recover balance.'
      ),
      p_owner_user_id
    );
  END IF;

  -- 4. HPP & OpEx. HPP dari snapshot kanonik (di-tulis saat approval). Fallback
  --    ke calculate_recap_hpp cuma buat rekap lama tanpa snapshot (transisi).
  v_hpp_auto  := COALESCE(v_recap.hpp_snapshot, calculate_recap_hpp(v_recap.id));
  v_opex_auto := calculate_recap_opex(v_recap.id);

  IF p_overrides IS NOT NULL AND p_overrides ? 'hpp' THEN
    v_hpp := p_overrides->'hpp';
    v_was_override := true;
  ELSE
    v_hpp := v_hpp_auto;
  END IF;

  IF p_overrides IS NOT NULL AND p_overrides ? 'opex' THEN
    v_opex := p_overrides->'opex';
  ELSE
    v_opex := jsonb_build_object(
      'fee_lead',            COALESCE((v_opex_auto->>'fee_lead')::BIGINT, 0),
      'fee_asisten',         COALESCE((v_opex_auto->>'fee_asisten')::BIGINT, 0),
      'fee_crew_c',          COALESCE((v_opex_auto->>'fee_crew_c')::BIGINT, 0),
      'fee_extra',           COALESCE((v_opex_auto->>'fee_extra')::BIGINT, 0)
                              + COALESCE((v_opex_auto->>'reimbursement')::BIGINT, 0),
      'transport_bbm',       COALESCE((v_opex_auto->>'transport')::BIGINT, 0)
                              + COALESCE((v_opex_auto->>'bensin')::BIGINT, 0)
                              + COALESCE((v_opex_auto->>'toll')::BIGINT, 0)
                              + COALESCE((v_opex_auto->>'parking')::BIGINT, 0),
      'sewa_alat',           0,
      'perawatan',           0,
      'konsumsi',            COALESCE((v_opex_auto->>'konsumsi')::BIGINT, 0)
                              + COALESCE((v_opex_auto->>'misc')::BIGINT, 0),
      -- Peta {kode COA: nominal} biaya lapangan yang dibayar dari saldo
      -- perusahaan. Hanya ikut di jalur otomatis: kalau owner meng-override
      -- angka OpEx manual, pembayarnya kembali dianggap talangan crew supaya
      -- jurnal tidak pernah lebih besar dari bebannya.
      'account_paid',        COALESCE(v_opex_auto->'account_paid', '{}'::jsonb),
      -- FIX: komisi dari kolom event (sebelumnya hardcoded 0 → laba lebih-saji).
      'komisi_vendor',       COALESCE(v_event.vendor_commission_amount, 0),
      'komisi_relasi',       COALESCE(v_event.referrer_commission, 0),
      'komisi_sales_direct', COALESCE(v_event.direct_sales_commission, 0),
      'platform_fee',        0,
      'diskon_tambahan',     0
    );
  END IF;

  -- 4b. Penjaga saldo rekening pembayar. Dicek SEBELUM apa pun ditulis supaya
  --     owner dapat pesan yang jelas, bukan jurnal minus yang baru ketahuan
  --     berminggu-minggu kemudian.
  FOR v_guard IN
    SELECT e.key AS coa, e.value::TEXT::BIGINT AS amount
    FROM jsonb_each(COALESCE(v_opex->'account_paid', '{}'::jsonb)) e
  LOOP
    IF v_guard.amount > 0 THEN
      SELECT COALESCE(SUM(debit_amount - credit_amount), 0) INTO v_guard_balance
      FROM journal_lines WHERE account_code = v_guard.coa;
      IF v_guard_balance < v_guard.amount THEN
        RAISE EXCEPTION 'Saldo % menurut catatan cuma %, sedangkan pemakaiannya %. Kalau kartunya sebenarnya masih terisi, pakai Cocokkan saldo dulu — mungkin ada topup yang belum dicatat.',
          COALESCE((SELECT name FROM chart_of_accounts WHERE code = v_guard.coa), v_guard.coa),
          v_guard_balance, v_guard.amount
          USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;

  -- 5. Revenue from grand_total
  v_addon_total := COALESCE(v_event.addons_total, 0)::BIGINT;

  IF p_overrides IS NOT NULL AND p_overrides ? 'revenue_gross' THEN
    v_revenue_gross := (p_overrides->>'revenue_gross')::BIGINT;
  ELSE
    v_revenue_gross :=
      COALESCE(v_event.custom_package_price, v_event.base_price, 0)::BIGINT
      + v_addon_total;
  END IF;

  IF p_overrides IS NOT NULL AND p_overrides ? 'discount_total' THEN
    v_discount := (p_overrides->>'discount_total')::BIGINT;
  ELSE
    v_discount := COALESCE(v_event.discount_amount, 0)::BIGINT;
  END IF;

  v_revenue_net := COALESCE(
    NULLIF(v_event.grand_total, 0)::BIGINT,
    v_revenue_gross - v_discount
  );

  -- 6. Compute totals
  v_hpp_total :=
      COALESCE((v_hpp->>'mediaset')::BIGINT, 0)
    + COALESCE((v_hpp->>'sleeve')::BIGINT, 0)
    + COALESCE((v_hpp->>'flashdisk')::BIGINT, 0)
    + COALESCE((v_hpp->>'pouch')::BIGINT, 0)
    + COALESCE((v_hpp->>'photomagnet')::BIGINT, 0)
    + COALESCE((v_hpp->>'keychain')::BIGINT, 0)
    + COALESCE((v_hpp->>'bonus')::BIGINT, 0)
    + COALESCE((v_hpp->>'other')::BIGINT, 0);

  v_opex_total :=
      COALESCE((v_opex->>'fee_lead')::BIGINT, 0)
    + COALESCE((v_opex->>'fee_asisten')::BIGINT, 0)
    + COALESCE((v_opex->>'fee_crew_c')::BIGINT, 0)
    + COALESCE((v_opex->>'fee_extra')::BIGINT, 0)
    + COALESCE((v_opex->>'transport_bbm')::BIGINT, 0)
    + COALESCE((v_opex->>'sewa_alat')::BIGINT, 0)
    + COALESCE((v_opex->>'perawatan')::BIGINT, 0)
    + COALESCE((v_opex->>'konsumsi')::BIGINT, 0)
    + COALESCE((v_opex->>'komisi_vendor')::BIGINT, 0)
    + COALESCE((v_opex->>'komisi_relasi')::BIGINT, 0)
    + COALESCE((v_opex->>'komisi_sales_direct')::BIGINT, 0)
    + COALESCE((v_opex->>'platform_fee')::BIGINT, 0)
    + COALESCE((v_opex->>'diskon_tambahan')::BIGINT, 0);

  v_total_biaya := v_hpp_total + v_opex_total;
  v_net_profit  := v_revenue_net - v_total_biaya;
  v_is_loss     := v_net_profit <= 0;
  v_margin := CASE WHEN v_revenue_net > 0
    THEN ROUND((v_net_profit::NUMERIC / v_revenue_net::NUMERIC) * 100, 2)
    ELSE 0 END;

  -- 7. Sinking fund allocation
  IF NOT v_is_loss THEN
    FOR v_fund IN SELECT * FROM sinking_funds WHERE is_active = true ORDER BY display_order LOOP
      IF v_fund.allocation_type = 'percentage' THEN
        v_alloc := FLOOR(v_net_profit * v_fund.allocation_value / 100)::BIGINT;
      ELSE
        v_alloc := v_fund.allocation_value::BIGINT;
      END IF;
      IF v_alloc > 0 THEN
        v_sink_total := v_sink_total + v_alloc;
        CASE v_fund.code
          WHEN 'equipment'     THEN v_sink_eq := v_alloc;
          WHEN 'maintenance'   THEN v_sink_mt := v_alloc;
          WHEN 'crew_reserve'  THEN v_sink_cr := v_alloc;
          WHEN 'emergency'     THEN v_sink_em := v_alloc;
          ELSE NULL;
        END CASE;
      END IF;
    END LOOP;
  END IF;

  -- 8. Owner pool
  SELECT COALESCE(value::TEXT::BIGINT, 50000)
  INTO v_owner_pool_pp
  FROM system_config WHERE key = 'settlement.owner_pool_per_person';
  IF v_owner_pool_pp IS NULL THEN v_owner_pool_pp := 50000; END IF;

  SELECT COALESCE(value::TEXT, 'equal')
  INTO v_dist_mode
  FROM system_config WHERE key = 'settlement.owner_pool_distribution_mode';
  v_dist_mode := COALESCE(v_dist_mode, 'equal');

  SELECT COUNT(*) INTO v_owner_count FROM users WHERE role = 'owner' AND is_active = true;
  v_owner_pool_tot := CASE WHEN v_is_loss THEN 0 ELSE v_owner_count * v_owner_pool_pp END;

  -- 9. Operating cash
  v_operating_cash := GREATEST(v_net_profit - v_sink_total - v_owner_pool_tot, 0);

  -- 10. INSERT event_settlements
  INSERT INTO event_settlements (
    event_id, revenue_gross, discount_total, revenue_net,
    hpp_mediaset, hpp_sleeve, hpp_flashdisk, hpp_pouch,
    hpp_photomagnet, hpp_keychain, hpp_bonus, hpp_other, hpp_total,
    fee_lead, fee_asisten, fee_crew_c, fee_extra,
    transport_bbm, sewa_alat, perawatan, konsumsi,
    komisi_vendor, komisi_relasi, komisi_sales_direct,
    platform_fee, diskon_tambahan, opex_total,
    total_biaya, net_profit, margin_percentage, is_loss,
    sinking_equipment, sinking_maintenance, sinking_crew_reserve, sinking_emergency, sinking_total,
    owner_pool_total, owner_pool_per_person, operating_cash_kept,
    hpp_auto_snapshot, hpp_was_overridden,
    closed_by
  ) VALUES (
    p_event_id, v_revenue_gross, v_discount, v_revenue_net,
    COALESCE((v_hpp->>'mediaset')::BIGINT, 0),
    COALESCE((v_hpp->>'sleeve')::BIGINT, 0),
    COALESCE((v_hpp->>'flashdisk')::BIGINT, 0),
    COALESCE((v_hpp->>'pouch')::BIGINT, 0),
    COALESCE((v_hpp->>'photomagnet')::BIGINT, 0),
    COALESCE((v_hpp->>'keychain')::BIGINT, 0),
    COALESCE((v_hpp->>'bonus')::BIGINT, 0),
    COALESCE((v_hpp->>'other')::BIGINT, 0),
    v_hpp_total,
    COALESCE((v_opex->>'fee_lead')::BIGINT, 0),
    COALESCE((v_opex->>'fee_asisten')::BIGINT, 0),
    COALESCE((v_opex->>'fee_crew_c')::BIGINT, 0),
    COALESCE((v_opex->>'fee_extra')::BIGINT, 0),
    COALESCE((v_opex->>'transport_bbm')::BIGINT, 0),
    COALESCE((v_opex->>'sewa_alat')::BIGINT, 0),
    COALESCE((v_opex->>'perawatan')::BIGINT, 0),
    COALESCE((v_opex->>'konsumsi')::BIGINT, 0),
    COALESCE((v_opex->>'komisi_vendor')::BIGINT, 0),
    COALESCE((v_opex->>'komisi_relasi')::BIGINT, 0),
    COALESCE((v_opex->>'komisi_sales_direct')::BIGINT, 0),
    COALESCE((v_opex->>'platform_fee')::BIGINT, 0),
    COALESCE((v_opex->>'diskon_tambahan')::BIGINT, 0),
    v_opex_total,
    v_total_biaya, v_net_profit, v_margin, v_is_loss,
    v_sink_eq, v_sink_mt, v_sink_cr, v_sink_em, v_sink_total,
    v_owner_pool_tot, v_owner_pool_pp, v_operating_cash,
    v_hpp_auto, v_was_override,
    p_owner_user_id
  ) RETURNING id INTO v_settlement_id;

  -- 11. Stok SUDAH di-deduct saat rekap approval (source 'rekap_consumption').
  v_batch_id := v_recap.stock_movement_batch_id;

  -- 12. Sinking fund movements
  IF v_sink_total > 0 THEN
    FOR v_fund IN SELECT * FROM sinking_funds WHERE is_active = true LOOP
      IF v_fund.allocation_type = 'percentage' THEN
        v_alloc := FLOOR(v_net_profit * v_fund.allocation_value / 100)::BIGINT;
      ELSE
        v_alloc := v_fund.allocation_value::BIGINT;
      END IF;
      IF v_alloc > 0 THEN
        INSERT INTO sinking_fund_movements (
          fund_id, movement_type, amount,
          source_type, source_event_id, source_settlement_id,
          description, performed_by
        ) VALUES (
          v_fund.id, 'deposit', v_alloc,
          'settlement', p_event_id, v_settlement_id,
          'Setoran otomatis saat tutup event — ' || COALESCE(NULLIF(TRIM(v_event.client_name), ''), 'tanpa nama klien'), p_owner_user_id
        );
      END IF;
    END LOOP;
  END IF;

  -- 13. Owner pool earnings
  IF v_owner_pool_tot > 0 THEN
    IF v_dist_mode = 'proportional' THEN
      SELECT COALESCE(SUM(share_pct), 0) INTO v_share_total
      FROM users WHERE role = 'owner' AND is_active = true;
      IF ABS(v_share_total - 100) > 0.01 OR EXISTS (
        SELECT 1 FROM users WHERE role = 'owner' AND is_active = true AND share_pct IS NULL
      ) THEN
        v_dist_mode := 'equal';
        INSERT INTO audit_log (entity_type, entity_id, action, changes, actor_id)
        VALUES ('event_settlement', v_settlement_id, 'fallback',
                jsonb_build_object('reason', 'invalid share_pct; fallback to equal distribution'),
                p_owner_user_id);
      END IF;
    END IF;

    FOR v_owner_id, v_owner_share IN
      SELECT id, COALESCE(share_pct, 0) FROM users
      WHERE role = 'owner' AND is_active = true
    LOOP
      INSERT INTO owner_earnings (
        owner_user_id, earning_type, amount,
        source_event_id, source_settlement_id,
        description, performed_by
      ) VALUES (
        v_owner_id, 'profit_share',
        CASE WHEN v_dist_mode = 'proportional'
          THEN FLOOR(v_owner_pool_tot * v_owner_share / 100)::BIGINT
          ELSE v_owner_pool_pp
        END,
        p_event_id, v_settlement_id,
        'Bagi hasil otomatis saat tutup event — ' || COALESCE(NULLIF(TRIM(v_event.client_name), ''), 'tanpa nama klien'), p_owner_user_id
      );
    END LOOP;
  END IF;

  -- 14. Journal entry
  v_journal_id := _create_settlement_journal(
    v_settlement_id, p_event_id, v_hpp, v_opex,
    v_revenue_net, v_sink_total, v_owner_pool_tot, v_operating_cash,
    p_owner_user_id, v_event.event_date
  );

  UPDATE event_settlements SET journal_entry_id = v_journal_id WHERE id = v_settlement_id;

  -- 15. Lock event + recap
  UPDATE events SET status = 'completed', updated_at = NOW() WHERE id = p_event_id;
  UPDATE crew_rekap
  SET status = 'settled', locked = true, locked_at = NOW(), settled_at = NOW()
  WHERE id = v_recap.id;

  -- 16. Audit log
  INSERT INTO audit_log (entity_type, entity_id, action, changes, actor_id)
  VALUES (
    'event_settlement', v_settlement_id, 'settle',
    jsonb_build_object(
      'after', jsonb_build_object(
        'event_id', p_event_id,
        'revenue_net', v_revenue_net,
        'net_profit', v_net_profit,
        'is_loss', v_is_loss,
        'sink_total', v_sink_total,
        'owner_pool_total', v_owner_pool_tot,
        'stock_shortage_warning', NOT (v_stock_check->>'sufficient')::BOOLEAN
      )
    ),
    p_owner_user_id
  );

  RETURN jsonb_build_object(
    'settlement_id',     v_settlement_id,
    'journal_entry_id',  v_journal_id,
    'stock_batch_id',    v_batch_id,
    'revenue_net',       v_revenue_net,
    'hpp_total',         v_hpp_total,
    'opex_total',        v_opex_total,
    'net_profit',        v_net_profit,
    'margin_pct',        v_margin,
    'is_loss',           v_is_loss,
    'sinking_total',     v_sink_total,
    'owner_pool_total',  v_owner_pool_tot,
    'operating_cash',    v_operating_cash,
    'stock_shortages',   v_stock_check->'shortages'
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- _create_settlement_journal — kredit rekening pembayar, bukan Hutang Crew
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._create_settlement_journal(p_settlement_id uuid, p_event_id uuid, p_hpp jsonb, p_opex jsonb, p_revenue_net bigint, p_sinking_total bigint, p_owner_pool_total bigint, p_operating_cash bigint, p_actor_id uuid, p_entry_date date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_entry_id   UUID;
  v_ref_id     TEXT;
  v_total      BIGINT;
  v_line_ord   INTEGER := 0;
  v_hpp_total  BIGINT;
  v_opex_total BIGINT;
  v_fund       RECORD;
  v_client     TEXT;
  v_vendor_mode TEXT;
  -- Pemecahan kredit komisi.
  v_komisi_vendor         BIGINT;
  v_komisi_relasi_all     BIGINT;
  v_komisi_vendor_upfront BIGINT;
  v_komisi_vendor_payable BIGINT;
  v_crew_liab             BIGINT;
  -- Biaya lapangan yang dibayar langsung dari saldo perusahaan (kartu e-toll,
  -- kas, bank). Tetap beban event, tapi lawan jurnalnya rekening itu sendiri —
  -- bukan Hutang Crew: tidak ada manusia yang menalangi.
  v_acct_paid             JSONB;
  v_acct_total            BIGINT;
  v_acct                  RECORD;
  -- Uang muka komisi (dibayar sebelum settle) yang dipakai settlement ini.
  v_prepaid_vendor        BIGINT;
  v_prepaid_relasi        BIGINT;
BEGIN
  v_ref_id := generate_journal_reference(p_entry_date);

  SELECT NULLIF(TRIM(client_name), ''), vendor_commission_mode
    INTO v_client, v_vendor_mode
  FROM events WHERE id = p_event_id;

  v_hpp_total :=
      COALESCE((p_hpp->>'mediaset')::BIGINT, 0)
    + COALESCE((p_hpp->>'sleeve')::BIGINT, 0)
    + COALESCE((p_hpp->>'flashdisk')::BIGINT, 0)
    + COALESCE((p_hpp->>'pouch')::BIGINT, 0)
    + COALESCE((p_hpp->>'photomagnet')::BIGINT, 0)
    + COALESCE((p_hpp->>'keychain')::BIGINT, 0)
    + COALESCE((p_hpp->>'bonus')::BIGINT, 0)
    + COALESCE((p_hpp->>'other')::BIGINT, 0);

  v_opex_total :=
      COALESCE((p_opex->>'fee_lead')::BIGINT, 0)
    + COALESCE((p_opex->>'fee_asisten')::BIGINT, 0)
    + COALESCE((p_opex->>'fee_crew_c')::BIGINT, 0)
    + COALESCE((p_opex->>'fee_extra')::BIGINT, 0)
    + COALESCE((p_opex->>'transport_bbm')::BIGINT, 0)
    + COALESCE((p_opex->>'sewa_alat')::BIGINT, 0)
    + COALESCE((p_opex->>'perawatan')::BIGINT, 0)
    + COALESCE((p_opex->>'konsumsi')::BIGINT, 0)
    + COALESCE((p_opex->>'komisi_vendor')::BIGINT, 0)
    + COALESCE((p_opex->>'komisi_relasi')::BIGINT, 0)
    + COALESCE((p_opex->>'komisi_sales_direct')::BIGINT, 0)
    + COALESCE((p_opex->>'platform_fee')::BIGINT, 0);

  v_total := v_hpp_total + v_opex_total + p_sinking_total + p_owner_pool_total;

  INSERT INTO journal_entries (
    ref_id, entry_date, entry_type, description,
    source_type, source_id, source_event_id, total_amount, created_by
  ) VALUES (
    v_ref_id, p_entry_date, 'expense',
    'Biaya & alokasi event — ' || COALESCE(v_client, 'tanpa nama klien'),
    'settlement', p_settlement_id, p_event_id, v_total, p_actor_id
  ) RETURNING id INTO v_entry_id;

  -- ===== DEBIT: HPP (beban) =====
  IF COALESCE((p_hpp->>'mediaset')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-100', (p_hpp->>'mediaset')::BIGINT, 'Biaya bahan: Mediaset', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'sleeve')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-101', (p_hpp->>'sleeve')::BIGINT, 'Biaya bahan: Sleeve', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'flashdisk')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-102', (p_hpp->>'flashdisk')::BIGINT, 'Biaya bahan: Flashdisk', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'pouch')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-103', (p_hpp->>'pouch')::BIGINT, 'Biaya bahan: Pouch', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'photomagnet')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-104', (p_hpp->>'photomagnet')::BIGINT, 'Biaya bahan: Photomagnet', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'keychain')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-105', (p_hpp->>'keychain')::BIGINT, 'Biaya bahan: Keychain', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'bonus')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-411', (p_hpp->>'bonus')::BIGINT, 'Biaya bonus/gratisan untuk klien', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'other')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-109', (p_hpp->>'other')::BIGINT, 'Biaya bahan: Lainnya', v_line_ord); v_line_ord := v_line_ord+1; END IF;

  -- ===== DEBIT: OpEx (beban) =====
  IF COALESCE((p_opex->>'fee_lead')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-201', (p_opex->>'fee_lead')::BIGINT, 'Fee crew (Lead)', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_opex->>'fee_asisten')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-202', (p_opex->>'fee_asisten')::BIGINT, 'Fee crew (Asisten)', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_opex->>'fee_crew_c')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-203', (p_opex->>'fee_crew_c')::BIGINT, 'Fee crew (Crew)', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_opex->>'fee_extra')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-204', (p_opex->>'fee_extra')::BIGINT, 'Bonus/reimbursement crew', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_opex->>'transport_bbm')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-210', (p_opex->>'transport_bbm')::BIGINT, 'Transport & bensin', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_opex->>'sewa_alat')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-220', (p_opex->>'sewa_alat')::BIGINT, 'Sewa alat', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_opex->>'perawatan')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-230', (p_opex->>'perawatan')::BIGINT, 'Perawatan alat', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_opex->>'konsumsi')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-240', (p_opex->>'konsumsi')::BIGINT, 'Konsumsi event', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_opex->>'komisi_vendor')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-300', (p_opex->>'komisi_vendor')::BIGINT, 'Komisi vendor', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_opex->>'komisi_relasi')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-301', (p_opex->>'komisi_relasi')::BIGINT, 'Komisi relasi/sales', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_opex->>'komisi_sales_direct')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-301', (p_opex->>'komisi_sales_direct')::BIGINT, 'Komisi sales langsung', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_opex->>'platform_fee')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-400', (p_opex->>'platform_fee')::BIGINT, 'Biaya platform', v_line_ord); v_line_ord := v_line_ord+1; END IF;

  -- ===== DEBIT: alokasi laba ditahan =====
  IF p_sinking_total > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '3-200', p_sinking_total, 'Sisihkan laba untuk dana cadangan', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF p_owner_pool_total > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '3-200', p_owner_pool_total, 'Sisihkan laba untuk bagi hasil owner', v_line_ord); v_line_ord := v_line_ord+1; END IF;

  -- ===== CREDIT: persediaan (lawan HPP) =====
  IF COALESCE((p_hpp->>'mediaset')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '1-200', (p_hpp->>'mediaset')::BIGINT, 'Stok berkurang: Media Set', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'sleeve')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '1-201', (p_hpp->>'sleeve')::BIGINT, 'Stok berkurang: Sleeve', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'flashdisk')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '1-202', (p_hpp->>'flashdisk')::BIGINT, 'Stok berkurang: Flashdisk', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'pouch')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '1-203', (p_hpp->>'pouch')::BIGINT, 'Stok berkurang: Pouch', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'photomagnet')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '1-204', (p_hpp->>'photomagnet')::BIGINT, 'Stok berkurang: Photomagnet', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'keychain')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '1-205', (p_hpp->>'keychain')::BIGINT, 'Stok berkurang: Keychain', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'bonus')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '1-209', (p_hpp->>'bonus')::BIGINT, 'Stok berkurang: Bonus', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'other')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '1-209', (p_hpp->>'other')::BIGINT, 'Stok berkurang: Lainnya', v_line_ord); v_line_ord := v_line_ord+1; END IF;

  -- ===== CREDIT: utang OpEx, dipecah per jenis =====
  -- Komisi dipisah dari Hutang Crew (2-100) → utang komisi vendor (2-103) &
  -- relasi/sales (2-102), supaya bisa dilacak & dibayar terpisah.
  -- Vendor "Potongan Langsung" (upfront_cut): komisi BUKAN utang — vendor sudah
  -- potong dari aliran uang → kredit ke Pendapatan 4-100 (gross-up).
  -- Komisi yang sudah DIBAYAR DI MUKA (sebelum settle) juga bukan utang — uang
  -- sudah keluar & tercatat di aset 1-310; settlement tinggal menghabiskannya.
  v_komisi_vendor     := COALESCE((p_opex->>'komisi_vendor')::BIGINT, 0);
  v_komisi_relasi_all := COALESCE((p_opex->>'komisi_relasi')::BIGINT, 0)
                       + COALESCE((p_opex->>'komisi_sales_direct')::BIGINT, 0);
  v_komisi_vendor_upfront := CASE WHEN v_vendor_mode = 'upfront_cut'
                                  THEN v_komisi_vendor ELSE 0 END;
  v_komisi_vendor_payable := v_komisi_vendor - v_komisi_vendor_upfront;
  v_acct_paid := COALESCE(p_opex->'account_paid', '{}'::jsonb);
  SELECT COALESCE(SUM(value::TEXT::BIGINT), 0) INTO v_acct_total
  FROM jsonb_each(v_acct_paid);

  v_crew_liab := v_opex_total - v_komisi_vendor - v_komisi_relasi_all - v_acct_total;

  -- Tidak boleh terjadi (account_paid selalu berasal dari rekap yang sama
  -- dengan angka OpEx-nya), tapi kalau sampai terjadi lebih baik gagal keras
  -- daripada menulis jurnal yang tidak balance diam-diam.
  IF v_crew_liab < 0 THEN
    RAISE EXCEPTION 'Biaya yang dibayar dari rekening perusahaan (%) melebihi biaya operasional event (%). Cek rekap: nominal biaya mungkin diubah setelah pembayar dipilih.',
      v_acct_total, v_opex_total - v_komisi_vendor - v_komisi_relasi_all
      USING ERRCODE = '22023';
  END IF;

  -- Uang muka aktif untuk event ini. LEAST(): kalau nominal komisi diubah
  -- setelah uang muka dibayar, yang di-offset hanya sebesar beban yang diakui —
  -- kelebihannya sengaja ditinggal di 1-310 (kelebihan bayar, kelihatan di buku)
  -- daripada memaksakan jurnal yang tidak balance.
  SELECT COALESCE(SUM(amount), 0) INTO v_prepaid_vendor
  FROM commission_payouts
  WHERE event_id = p_event_id AND kind = 'vendor'
    AND is_advance = true AND is_reversed = false;
  SELECT COALESCE(SUM(amount), 0) INTO v_prepaid_relasi
  FROM commission_payouts
  WHERE event_id = p_event_id AND kind IN ('relasi', 'sales')
    AND is_advance = true AND is_reversed = false;

  v_prepaid_vendor := LEAST(v_prepaid_vendor, v_komisi_vendor_payable);
  v_prepaid_relasi := LEAST(v_prepaid_relasi, v_komisi_relasi_all);

  IF v_crew_liab > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '2-100', v_crew_liab, 'Utang ke crew (fee + reimbursement, dibayar saat transfer)', v_line_ord); v_line_ord := v_line_ord+1; END IF;

  -- Kredit rekening yang benar-benar mengeluarkan uang di lapangan.
  FOR v_acct IN
    SELECT e.key AS coa,
           e.value::TEXT::BIGINT AS amount,
           COALESCE(a.name, e.key) AS coa_name
    FROM jsonb_each(v_acct_paid) e
    LEFT JOIN chart_of_accounts a ON a.code = e.key
    ORDER BY e.key
  LOOP
    IF v_acct.amount > 0 THEN
      INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
      VALUES (v_entry_id, v_acct.coa, v_acct.amount, 'Dibayar langsung dari ' || v_acct.coa_name, v_line_ord);
      v_line_ord := v_line_ord+1;
    END IF;
  END LOOP;
  IF (v_komisi_vendor_payable - v_prepaid_vendor) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '2-103', v_komisi_vendor_payable - v_prepaid_vendor, 'Utang komisi vendor (dibayar setelah event)', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF v_prepaid_vendor > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '1-310', v_prepaid_vendor, 'Pakai uang muka komisi vendor (sudah dibayar sebelum settle)', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF (v_komisi_relasi_all - v_prepaid_relasi) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '2-102', v_komisi_relasi_all - v_prepaid_relasi, 'Utang komisi relasi/sales (dibayar setelah event)', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF v_prepaid_relasi > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '1-310', v_prepaid_relasi, 'Pakai uang muka komisi relasi/sales (sudah dibayar sebelum settle)', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF v_komisi_vendor_upfront > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '4-100', v_komisi_vendor_upfront, 'Komisi vendor dipotong di muka (pendapatan bruto)', v_line_ord); v_line_ord := v_line_ord+1; END IF;

  -- ===== CREDIT: sinking & owner pool =====
  FOR v_fund IN
    SELECT sf.code, sfm.amount
    FROM sinking_fund_movements sfm
    JOIN sinking_funds sf ON sf.id = sfm.fund_id
    WHERE sfm.source_settlement_id = p_settlement_id AND sfm.movement_type = 'deposit'
  LOOP
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id,
      CASE v_fund.code
        WHEN 'equipment' THEN '2-200' WHEN 'maintenance' THEN '2-201'
        WHEN 'crew_reserve' THEN '2-202' WHEN 'emergency' THEN '2-203' ELSE '2-200' END,
      v_fund.amount,
      'Dana cadangan: ' || CASE v_fund.code
        WHEN 'equipment' THEN 'Alat' WHEN 'maintenance' THEN 'Perawatan'
        WHEN 'crew_reserve' THEN 'Cadangan crew' WHEN 'emergency' THEN 'Darurat'
        ELSE v_fund.code END,
      v_line_ord);
    v_line_ord := v_line_ord+1;
  END LOOP;

  IF p_owner_pool_total > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '2-300', p_owner_pool_total, 'Utang bagi hasil ke owner', v_line_ord); v_line_ord := v_line_ord+1; END IF;

  RETURN v_entry_id;
END;
$function$;

COMMENT ON FUNCTION _create_settlement_journal IS
  'Settlement journal cash-basis. HPP→persediaan; OpEx→Hutang Crew(2-100) dikurangi biaya yang dibayar langsung dari rekening perusahaan (p_opex->account_paid, dikredit ke rekening masing-masing); komisi→2-103(vendor)/2-102(relasi), kecuali vendor upfront_cut→Pendapatan 4-100. Pendapatan kas TIDAK dibukukan di sini.';
