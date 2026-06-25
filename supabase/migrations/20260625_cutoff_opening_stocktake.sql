-- 20260625_cutoff_opening_stocktake.sql
-- ============================================================================
-- Fix: opname pembuka cutoff harus jadi STOK AWAL, bukan STOK AKHIR.
-- ============================================================================
-- Masalah: execute_finance_cutoff membuat stock_take "committed" bertanggal DI
-- DALAM bulan cutoff (mis. 23 Juni untuk cutoff 24 Juni). RPC laporan
-- get_inventory_rollforward memperlakukan opname committed di dalam periode
-- sebagai foto PENUTUP (op_this) → Stok Akhir dipaku ke angka pembuka cutoff &
-- mengabaikan SEMUA gerakan stok sesudahnya. Akibatnya laporan Biaya Bahan
-- (Persediaan & COGS) tidak sinkron dengan Warehouse, yang menampilkan stok
-- hidup = SUM seluruh gerakan (get_stock_levels). Contoh nyata: Box Custom
-- Flashdisk — cutoff 2 pcs, lalu +10 pcs (25 Juni) → Warehouse 12, laporan 2.
--
-- Perbaikan:
--   1. Tandai stock_take pembuka dengan kolom is_opening.
--   2. Rollforward: opname pembuka = jangkar STOK AWAL (op_prior), tidak pernah
--      jadi penutup (op_this dikecualikan untuk is_opening) → Stok Akhir kembali
--      memakai stok sistem hidup (= Warehouse). Selisih (gerakan tak ber-biaya
--      pasca-cutoff) muncul sebagai variance — justru fungsi kolom itu.
--
-- Bulan SETELAH cutoff sudah benar sebelumnya (committed_at < awal periode →
-- terbaca sebagai op_prior). Hanya BULAN cutoff yang rusak; fix ini menutupnya.
-- Idempotent. Apply via scripts/apply-migration.ts.

-- ============================================================================
-- 1. Kolom penanda opname pembuka
-- ============================================================================
ALTER TABLE stock_takes
  ADD COLUMN IF NOT EXISTS is_opening boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN stock_takes.is_opening IS
  'true = opname saldo awal yang dibuat finance cutoff. Di rollforward dipakai sebagai jangkar STOK AWAL (op_prior), bukan STOK AKHIR (op_this).';

-- ============================================================================
-- 2. Backfill opname pembuka yang sudah terlanjur dibuat cutoff
-- ============================================================================
UPDATE stock_takes
SET is_opening = true
WHERE is_opening = false
  AND status = 'committed'
  AND notes LIKE 'Saldo awal stok%';

-- ============================================================================
-- 3. execute_finance_cutoff — set is_opening = true pada opname pembuka (5.6)
-- ============================================================================
-- (Re-definisi penuh; CREATE OR REPLACE. Hanya 5.6 yang berubah dari
--  20260624_finance_cutoff.sql — menambah kolom is_opening pada INSERT.)
CREATE OR REPLACE FUNCTION execute_finance_cutoff(
  p_actor       uuid,
  p_cutoff_date date,
  p_cash        bigint,
  p_banks       jsonb,
  p_items       jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role        text;
  v_existing    jsonb;
  v_ts          timestamptz := (p_cutoff_date::timestamptz - interval '1 second');
  v_take_id     uuid;
  v_je_id       uuid;
  v_ref         text;
  v_total       bigint := 0;
  v_order       int := 0;
  v_frozen      int := 0;
  r             record;
BEGIN
  -- 5.1 Guard: hanya owner/super_admin
  SELECT role INTO v_role FROM users WHERE id = p_actor;
  IF v_role IS NULL OR v_role NOT IN ('owner', 'super_admin') THEN
    RAISE EXCEPTION 'Forbidden: actor % bukan owner/super_admin (role=%)', p_actor, v_role
      USING ERRCODE = '42501';
  END IF;

  -- 5.2 Guard single-run
  SELECT value INTO v_existing FROM system_config WHERE key = 'finance_cutoff_date';
  IF v_existing IS NOT NULL AND jsonb_typeof(v_existing) <> 'null' THEN
    RAISE EXCEPTION 'Cutoff keuangan sudah pernah dijalankan (%). Tidak bisa diulang.', v_existing
      USING ERRCODE = '42P01';
  END IF;

  -- 5.3 Sanity tanggal (paling lambat 1 Juli 2026)
  IF p_cutoff_date IS NULL OR p_cutoff_date > DATE '2026-07-01' THEN
    RAISE EXCEPTION 'Tanggal cutoff wajib & maksimal 1 Juli 2026 (got %)', p_cutoff_date
      USING ERRCODE = '22023';
  END IF;

  -- 5.4 HARD DELETE ledger keuangan (urut FK-safe: child → parent).
  --     WHERE true = wipe-all yang disengaja (lolos pg_safeupdate guard).
  DELETE FROM payable_payments WHERE true;
  DELETE FROM payables WHERE true;
  DELETE FROM depreciation_postings WHERE true;
  DELETE FROM owner_earnings WHERE true;
  DELETE FROM sinking_fund_movements WHERE true;
  DELETE FROM event_settlements WHERE true;
  DELETE FROM wastage_logs WHERE true;
  DELETE FROM stock_take_lines WHERE true;
  DELETE FROM stock_takes WHERE true;
  DELETE FROM stock_movements WHERE true;
  DELETE FROM journal_lines WHERE true;
  DELETE FROM journal_entries WHERE true;

  -- 5.5 Reset WAC semua item (akan di-reseed dari input)
  UPDATE inventory_items SET purchase_price_avg = 0 WHERE true;
  UPDATE items_inventory_config SET purchase_price_avg = 0 WHERE true;

  -- 5.6 Opname pembuka (committed, is_opening) sebagai jangkar STOK AWAL
  INSERT INTO stock_takes (taken_at, taken_by, notes, status, committed_at, committed_by, is_opening)
  VALUES (v_ts, p_actor, 'Saldo awal stok — cutoff keuangan ' || p_cutoff_date,
          'committed', v_ts, p_actor, true)
  RETURNING id INTO v_take_id;

  -- 5.7 Per item: movement pembuka + reseed WAC + baris opname (variance 0)
  FOR r IN
    SELECT x.item_id, x.qty_base, COALESCE(x.wac, 0) AS wac
    FROM jsonb_to_recordset(COALESCE(p_items, '[]'::jsonb))
      AS x(item_id uuid, qty_base numeric, wac bigint)
    WHERE x.item_id IS NOT NULL
  LOOP
    UPDATE inventory_items SET purchase_price_avg = r.wac WHERE id = r.item_id;
    UPDATE items_inventory_config SET purchase_price_avg = r.wac WHERE item_id = r.item_id;

    IF r.qty_base IS NOT NULL AND r.qty_base > 0 THEN
      INSERT INTO stock_movements (
        ref_id, item_id, direction, quantity, unit_cost,
        source, source_id, source_description, notes, performed_by, created_at
      ) VALUES (
        'MOV-OPEN-' || LPAD((random() * 99999999)::int::text, 8, '0'),
        r.item_id, 'adjustment'::movement_direction, r.qty_base, NULLIF(r.wac, 0),
        'stock_take'::movement_source, v_take_id,
        'Saldo awal cutoff ' || p_cutoff_date, 'Opening balance (finance cutoff)',
        p_actor, v_ts
      );

      INSERT INTO stock_take_lines (stock_take_id, item_id, system_qty, counted_qty, notes)
      VALUES (v_take_id, r.item_id, r.qty_base, r.qty_base, 'Saldo awal cutoff');
    END IF;
  END LOOP;

  -- 5.8 Jurnal pembuka (Dr aset, Cr Modal Awal)
  v_ref := generate_journal_reference(p_cutoff_date);
  INSERT INTO journal_entries (
    ref_id, entry_date, entry_type, description,
    source_type, source_id, total_amount, created_by, created_at
  ) VALUES (
    v_ref, p_cutoff_date, 'adjustment'::journal_entry_type,
    'Saldo Awal — cutoff keuangan ' || p_cutoff_date,
    'manual', NULL, 0, p_actor, v_ts
  ) RETURNING id INTO v_je_id;

  -- Dr Kas Tunai (1-100)
  IF COALESCE(p_cash, 0) > 0 THEN
    v_order := v_order + 1;
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, credit_amount, description, line_order)
    VALUES (v_je_id, '1-100', p_cash, 0, 'Saldo awal Kas Tunai', v_order);
    v_total := v_total + p_cash;
  END IF;

  -- Dr tiap Bank
  FOR r IN
    SELECT x.coa_code, COALESCE(x.amount, 0) AS amount
    FROM jsonb_to_recordset(COALESCE(p_banks, '[]'::jsonb)) AS x(coa_code text, amount bigint)
    WHERE x.coa_code IS NOT NULL AND COALESCE(x.amount, 0) > 0
  LOOP
    v_order := v_order + 1;
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, credit_amount, description, line_order)
    VALUES (v_je_id, r.coa_code, r.amount, 0, 'Saldo awal ' || r.coa_code, v_order);
    v_total := v_total + r.amount;
  END LOOP;

  -- Dr Persediaan (di-group per COA item, fallback 1-209)
  FOR r IN
    SELECT COALESCE(ii.coa_account, '1-209') AS coa,
           SUM(x.qty_base * COALESCE(x.wac, 0))::bigint AS val
    FROM jsonb_to_recordset(COALESCE(p_items, '[]'::jsonb))
      AS x(item_id uuid, qty_base numeric, wac bigint)
    JOIN inventory_items ii ON ii.id = x.item_id
    WHERE x.qty_base IS NOT NULL AND x.qty_base > 0
    GROUP BY COALESCE(ii.coa_account, '1-209')
    HAVING SUM(x.qty_base * COALESCE(x.wac, 0)) > 0
  LOOP
    v_order := v_order + 1;
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, credit_amount, description, line_order)
    VALUES (v_je_id, r.coa, r.val, 0, 'Saldo awal persediaan', v_order);
    v_total := v_total + r.val;
  END LOOP;

  -- Cr Modal Awal (penyeimbang). Jika tak ada aset, buang JE kosong.
  IF v_total > 0 THEN
    v_order := v_order + 1;
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, credit_amount, description, line_order)
    VALUES (v_je_id, '3-101', 0, v_total, 'Modal awal (penyeimbang saldo awal)', v_order);
    UPDATE journal_entries SET total_amount = v_total WHERE id = v_je_id;
  ELSE
    DELETE FROM journal_entries WHERE id = v_je_id;
    v_je_id := NULL;
  END IF;

  -- 5.9 Bekukan event sebelum cutoff
  UPDATE events SET finance_frozen_at = now()
  WHERE event_date < p_cutoff_date AND finance_frozen_at IS NULL;
  GET DIAGNOSTICS v_frozen = ROW_COUNT;

  -- 5.10 Tandai cutoff selesai
  UPDATE system_config
  SET value = to_jsonb(p_cutoff_date::text), updated_by = p_actor, updated_at = now()
  WHERE key = 'finance_cutoff_date';

  -- 5.11 Audit
  INSERT INTO audit_log (entity_type, entity_id, action, changes, actor_id)
  VALUES ('finance_cutoff', v_je_id, 'execute',
          jsonb_build_object(
            'cutoff_date', p_cutoff_date,
            'opening_total', v_total,
            'events_frozen', v_frozen,
            'journal_entry_id', v_je_id,
            'stock_take_id', v_take_id
          ),
          p_actor);

  RETURN jsonb_build_object(
    'cutoff_date',      p_cutoff_date,
    'opening_total',    v_total,
    'events_frozen',    v_frozen,
    'journal_entry_id', v_je_id,
    'journal_ref',      v_ref,
    'stock_take_id',    v_take_id
  );
END;
$$;

REVOKE ALL ON FUNCTION execute_finance_cutoff(uuid, date, bigint, jsonb, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION execute_finance_cutoff(uuid, date, bigint, jsonb, jsonb) TO authenticated;

-- ============================================================================
-- 4. get_inventory_rollforward — opname pembuka = jangkar STOK AWAL
-- ============================================================================
-- Perubahan vs 20260624_inventory_rollforward_rpc.sql:
--   • op_prior: selain opname committed SEBELUM periode, juga terima opname
--     is_opening yang committed di DALAM periode (jangkar saldo awal cutoff).
--   • op_this: KECUALIKAN opname is_opening — supaya opname pembuka tidak pernah
--     dipakai sebagai Stok Akhir (yg kemudian fallback ke stok sistem hidup).
CREATE OR REPLACE FUNCTION get_inventory_rollforward(
  p_start timestamptz,
  p_end timestamptz
)
RETURNS TABLE(
  item_id uuid,
  sku text,
  name text,
  unit text,
  unit_conversion jsonb,
  wac_now bigint,
  purchases_qty numeric,
  purchases_cost numeric,
  usage_qty numeric,
  usage_cost numeric,
  net_move_in_month numeric,
  current_stock numeric,
  opname_prior_qty numeric,
  opname_this_qty numeric
)
LANGUAGE sql
STABLE
AS $$
  WITH items AS (
    SELECT i.id, i.sku, i.name, i.unit, i.unit_conversion,
           COALESCE(i.purchase_price_avg, 0)::bigint AS wac
    FROM inventory_items i
    WHERE i.category = 'inventory'
      AND i.is_active = true
      AND i.deleted_at IS NULL
  ),
  -- Movements within the period, aggregated per item.
  pm AS (
    SELECT sm.item_id,
      COALESCE(SUM(CASE WHEN sm.direction = 'in'
                         AND sm.source::text IN ('purchase','purchase_request')
                        THEN sm.quantity ELSE 0 END), 0) AS purchases_qty,
      COALESCE(SUM(CASE WHEN sm.direction = 'in'
                         AND sm.source::text IN ('purchase','purchase_request')
                        THEN sm.quantity * COALESCE(sm.unit_cost, 0) ELSE 0 END), 0) AS purchases_cost,
      COALESCE(SUM(CASE WHEN sm.direction = 'out'
                         AND sm.source::text = 'rekap_consumption'
                        THEN sm.quantity ELSE 0 END), 0) AS usage_qty,
      -- Exact recorded COGS = qty × the HPP unit_cost at consumption time.
      COALESCE(SUM(CASE WHEN sm.direction = 'out'
                         AND sm.source::text = 'rekap_consumption'
                        THEN sm.quantity * COALESCE(sm.unit_cost, 0) ELSE 0 END), 0) AS usage_cost,
      COALESCE(SUM(CASE sm.direction
                     WHEN 'in' THEN sm.quantity
                     WHEN 'out' THEN -sm.quantity
                     WHEN 'adjustment' THEN sm.quantity
                     ELSE 0 END), 0) AS net_move_in_month
    FROM stock_movements sm
    WHERE sm.created_at >= p_start AND sm.created_at < p_end
    GROUP BY sm.item_id
  ),
  -- All-time net = current on-hand (same sign convention as get_current_stock).
  cs AS (
    SELECT sm.item_id,
      COALESCE(SUM(CASE sm.direction
                     WHEN 'in' THEN sm.quantity
                     WHEN 'out' THEN -sm.quantity
                     WHEN 'adjustment' THEN sm.quantity
                     ELSE 0 END), 0) AS current_stock
    FROM stock_movements sm
    GROUP BY sm.item_id
  ),
  -- Jangkar STOK AWAL: opname committed terbaru yang SEBELUM periode, ATAU
  -- opname pembuka (is_opening) yang committed di DALAM periode (saldo awal
  -- cutoff). Yang committed_at paling akhir menang.
  op_prior AS (
    SELECT DISTINCT ON (l.item_id) l.item_id, l.counted_qty
    FROM stock_take_lines l
    JOIN stock_takes t ON t.id = l.stock_take_id
    WHERE t.status = 'committed'
      AND l.counted_qty IS NOT NULL
      AND (
        t.committed_at < p_start
        OR (t.is_opening AND t.committed_at < p_end)
      )
    ORDER BY l.item_id, t.committed_at DESC
  ),
  -- Jangkar STOK AKHIR: opname FISIK committed di dalam periode. Opname pembuka
  -- (is_opening) DIKECUALIKAN — supaya tidak memaku Stok Akhir ke saldo awal;
  -- tanpa opname fisik, Stok Akhir fallback ke stok sistem hidup (current_stock).
  op_this AS (
    SELECT DISTINCT ON (l.item_id) l.item_id, l.counted_qty
    FROM stock_take_lines l
    JOIN stock_takes t ON t.id = l.stock_take_id
    WHERE t.status = 'committed'
      AND t.is_opening = false
      AND t.committed_at >= p_start AND t.committed_at < p_end
      AND l.counted_qty IS NOT NULL
    ORDER BY l.item_id, t.committed_at DESC
  )
  SELECT
    it.id, it.sku, it.name, it.unit, it.unit_conversion, it.wac,
    COALESCE(pm.purchases_qty, 0),
    COALESCE(pm.purchases_cost, 0),
    COALESCE(pm.usage_qty, 0),
    COALESCE(pm.usage_cost, 0),
    COALESCE(pm.net_move_in_month, 0),
    COALESCE(cs.current_stock, 0),
    op_prior.counted_qty,
    op_this.counted_qty
  FROM items it
  LEFT JOIN pm       ON pm.item_id = it.id
  LEFT JOIN cs       ON cs.item_id = it.id
  LEFT JOIN op_prior ON op_prior.item_id = it.id
  LEFT JOIN op_this  ON op_this.item_id = it.id
  ORDER BY it.sku;
$$;

GRANT EXECUTE ON FUNCTION get_inventory_rollforward(timestamptz, timestamptz)
  TO authenticated, service_role;
