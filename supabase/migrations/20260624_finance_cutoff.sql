-- 20260624_finance_cutoff.sql
-- ============================================================================
-- Finance Cutoff + Saldo Awal — "mulai pembukuan dari titik nol".
-- ============================================================================
-- Data keuangan lama error/berantakan karena semua saldo dijumlah dari SELURUH
-- riwayat journal_lines sejak hari pertama (tanpa konsep saldo awal). Migrasi
-- ini memberi mekanisme cutoff: hapus permanen ledger keuangan lama, catat
-- saldo awal (Kas/Bank + Stok/WAC) sebagai satu jurnal pembuka yang seimbang,
-- dan BEKUKAN event sebelum cutoff supaya tidak posting jurnal baru ke buku
-- bersih. Event TIDAK dihapus — tetap riwayat operasional.
--
-- Komponen:
--   1. COA 3-101 "Modal Awal / Saldo Awal" (penyeimbang ekuitas).
--   2. system_config.finance_cutoff_date (penanda setup selesai + guard 1x).
--   3. events.finance_frozen_at (penanda event beku).
--   4. Trigger freeze pada event_settlements + stock_movements(rekap_consumption)
--      — menolak posting dari event beku. (Pakai trigger, bukan patch RPC besar,
--      supaya independen & tahan terhadap perubahan settle_event/commit_rekap.)
--   5. RPC execute_finance_cutoff() — atomik: hapus + reseed + saldo awal + freeze.
--
-- Idempotent. Apply via scripts/apply-migration.ts.

-- ============================================================================
-- 1. Seed COA Modal Awal / Saldo Awal
-- ============================================================================
INSERT INTO chart_of_accounts (code, name, account_type, parent_code, description)
VALUES ('3-101', 'Modal Awal / Saldo Awal', 'equity', '3-000',
        'Penyeimbang saldo awal saat cutoff keuangan (opening balance equity)')
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 2. Seed system_config flag (default JSON null = belum cutoff)
-- ============================================================================
INSERT INTO system_config (key, value, description, category)
VALUES ('finance_cutoff_date', 'null'::jsonb,
        'Tanggal cutoff keuangan (titik nol pembukuan). null = belum dijalankan.',
        'financial')
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- 3. Kolom freeze pada events
-- ============================================================================
ALTER TABLE events ADD COLUMN IF NOT EXISTS finance_frozen_at timestamptz NULL;
COMMENT ON COLUMN events.finance_frozen_at IS
  'Di-stamp saat cutoff untuk event dengan event_date < cutoff. Event beku tidak boleh posting jurnal/stok ke buku baru (lihat trigger freeze).';

-- ============================================================================
-- 4a. Trigger: tolak settlement untuk event beku
-- ============================================================================
CREATE OR REPLACE FUNCTION _assert_settlement_not_frozen()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM events e
    WHERE e.id = NEW.event_id AND e.finance_frozen_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Event dibekukan saat cutoff keuangan — tidak bisa di-settle ke buku baru.'
      USING ERRCODE = '42P01';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_settlement_not_frozen ON event_settlements;
CREATE TRIGGER trg_settlement_not_frozen
  BEFORE INSERT ON event_settlements
  FOR EACH ROW EXECUTE FUNCTION _assert_settlement_not_frozen();

-- ============================================================================
-- 4b. Trigger: tolak konsumsi stok (rekap) untuk event beku
--     source dibandingkan ::text agar aman walau enum bervariasi antar-DB.
-- ============================================================================
CREATE OR REPLACE FUNCTION _assert_consumption_not_frozen()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.source::text = 'rekap_consumption'
     AND NEW.source_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM events e
       WHERE e.id = NEW.source_id AND e.finance_frozen_at IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'Event dibekukan saat cutoff keuangan — stok/HPP tidak bisa di-post ke buku baru.'
      USING ERRCODE = '42P01';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_consumption_not_frozen ON stock_movements;
CREATE TRIGGER trg_consumption_not_frozen
  BEFORE INSERT ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION _assert_consumption_not_frozen();

-- ============================================================================
-- 5. RPC execute_finance_cutoff
-- ============================================================================
-- p_banks: jsonb [{coa_code, amount}]   p_items: jsonb [{item_id, qty_base, wac}]
-- Dijalankan dalam satu transaksi (function body) → all-or-nothing.
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

  -- 5.6 Opname pembuka (committed) sebagai jangkar rollforward
  INSERT INTO stock_takes (taken_at, taken_by, notes, status, committed_at, committed_by)
  VALUES (v_ts, p_actor, 'Saldo awal stok — cutoff keuangan ' || p_cutoff_date,
          'committed', v_ts, p_actor)
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

COMMENT ON FUNCTION execute_finance_cutoff(uuid, date, bigint, jsonb, jsonb) IS
  'Cutoff keuangan atomik (owner-level, single-run): hapus permanen ledger keuangan lama, reseed WAC, catat saldo awal Kas/Bank + Stok sebagai jurnal pembuka seimbang (Cr 3-101 Modal Awal) + opname jangkar, bekukan event < cutoff, set system_config.finance_cutoff_date.';
