-- 20260527_depreciation_disposal.sql
-- ============================================================================
-- Phase D — Depreciation accrual + Asset disposal workflow
-- ============================================================================
--
-- WHY:
--   Phase A bikin asset register. Phase B+C bikin wastage + UI. Phase D
--   melengkapi siklus aktiva tetap: depresiasi bulanan otomatis + disposal
--   (write-off / sold / scrapped) yang reverse asset dari book + log gain/loss.
--
-- WHAT:
--   1. COA accounts: 4-901 Gain on Disposal, 5-901 Loss on Disposal.
--   2. `depreciation_postings` — tracking idempotency posting per asset × bulan.
--      Pakai UNIQUE (item_id, period_ym) supaya re-run RPC tidak duplikat.
--   3. Disposal columns di items_fixed_asset_config: disposed_at, method,
--      sale_price, notes.
--   4. RPC `accrue_monthly_depreciation(p_period_ym, p_actor)` — post journal
--      Dr 5-500 / Cr 1-401 per asset belum-posted di bulan tsb, idempotent.
--
-- IDEMPOTENT — safe re-run.

-- ============================================================================
-- 1. COA accounts (gain/loss on disposal)
-- ============================================================================

INSERT INTO chart_of_accounts (code, name, account_type, parent_code, is_active, description)
VALUES
  ('4-901', 'Pendapatan Penjualan Aktiva',
   'revenue', '4-000', true,
   'Gain on disposal — selisih lebih saat jual aktiva tetap di atas nilai buku.'),
  ('5-901', 'Kerugian Penjualan Aktiva',
   'expense', '5-000', true,
   'Loss on disposal — selisih kurang saat jual/scrap aktiva tetap di bawah nilai buku.')
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 2. Depreciation postings tracking table
-- ============================================================================

CREATE TABLE IF NOT EXISTS depreciation_postings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  period_ym TEXT NOT NULL CHECK (period_ym ~ '^[0-9]{4}-[0-9]{2}$'),
  monthly_amount BIGINT NOT NULL CHECK (monthly_amount >= 0),
  journal_entry_id UUID NULL REFERENCES journal_entries(id) ON DELETE SET NULL,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  posted_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (item_id, period_ym)
);

CREATE INDEX IF NOT EXISTS idx_depr_postings_period ON depreciation_postings(period_ym);
CREATE INDEX IF NOT EXISTS idx_depr_postings_item ON depreciation_postings(item_id);

COMMENT ON TABLE depreciation_postings IS
  'Audit + idempotency log untuk depresiasi bulanan per aktiva. UNIQUE (item_id, period_ym) mencegah double-posting saat RPC di-rerun.';

ALTER TABLE depreciation_postings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "depreciation_postings_owner_all" ON depreciation_postings
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('super_admin','owner') AND is_active = true))
    WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('super_admin','owner') AND is_active = true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- 3. Disposal columns on items_fixed_asset_config
-- ============================================================================

ALTER TABLE items_fixed_asset_config
  ADD COLUMN IF NOT EXISTS disposed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS disposal_method TEXT NULL
    CHECK (disposal_method IS NULL OR disposal_method IN ('sold','scrapped','lost','donated','transferred')),
  ADD COLUMN IF NOT EXISTS disposal_sale_price BIGINT NOT NULL DEFAULT 0
    CHECK (disposal_sale_price >= 0),
  ADD COLUMN IF NOT EXISTS disposal_notes TEXT NULL,
  ADD COLUMN IF NOT EXISTS disposal_journal_entry_id UUID NULL REFERENCES journal_entries(id) ON DELETE SET NULL;

COMMENT ON COLUMN items_fixed_asset_config.disposed_at IS
  'Set saat asset di-write-off / dijual / scrap. NULL = masih aktif.';

CREATE INDEX IF NOT EXISTS idx_items_fixed_asset_disposed
  ON items_fixed_asset_config(disposed_at) WHERE disposed_at IS NOT NULL;

-- ============================================================================
-- 4. RPC accrue_monthly_depreciation(p_period_ym, p_actor)
-- ============================================================================
-- Idempotent: re-run untuk period sama akan SKIP asset yang sudah ada di
-- depreciation_postings. Insert ke depreciation_postings dulu (UNIQUE
-- constraint guard); kalau insert sukses baru post journal_entry.

CREATE OR REPLACE FUNCTION accrue_monthly_depreciation(
  p_period_ym TEXT,
  p_actor UUID
) RETURNS TABLE(posted_count INTEGER, skipped_count INTEGER, total_amount BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_end DATE;
  v_asset RECORD;
  v_posted_count INTEGER := 0;
  v_skipped_count INTEGER := 0;
  v_total_amount BIGINT := 0;
  v_monthly_raw BIGINT;
  v_depreciable BIGINT;
  v_already_posted BIGINT;
  v_actual_monthly BIGINT;
  v_journal_ref TEXT;
  v_journal_id UUID;
  v_acct_expense TEXT;
  v_acct_accum TEXT;
BEGIN
  -- Validate period format YYYY-MM
  IF p_period_ym !~ '^[0-9]{4}-[0-9]{2}$' THEN
    RAISE EXCEPTION 'Invalid period_ym format (expected YYYY-MM): %', p_period_ym;
  END IF;

  -- End-of-month date for "is asset eligible" check (start_date <= period_end)
  v_period_end := (p_period_ym || '-01')::DATE + INTERVAL '1 month' - INTERVAL '1 day';

  -- Iterate eligible assets
  FOR v_asset IN
    SELECT
      i.id AS item_id,
      i.sku,
      i.name,
      c.purchase_price,
      c.salvage_value,
      c.useful_life_months,
      c.depreciation_start_date,
      c.coa_account_accum_depr,
      c.coa_account_depr_expense
    FROM inventory_items i
    JOIN items_fixed_asset_config c ON c.item_id = i.id
    WHERE i.category = 'fixed_asset'
      AND i.is_active = true
      AND i.deleted_at IS NULL
      AND c.disposed_at IS NULL
      AND c.depreciation_method = 'straight_line'
      AND c.useful_life_months IS NOT NULL
      AND c.useful_life_months > 0
      AND c.purchase_price > 0
      AND c.depreciation_start_date IS NOT NULL
      AND c.depreciation_start_date <= v_period_end
  LOOP
    -- Skip if sudah ada posting untuk period ini (UNIQUE constraint guard
    -- akan tetap protect — ini optimization untuk skip cepat)
    IF EXISTS (
      SELECT 1 FROM depreciation_postings
      WHERE item_id = v_asset.item_id AND period_ym = p_period_ym
    ) THEN
      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;

    v_depreciable := GREATEST(0, v_asset.purchase_price - v_asset.salvage_value);
    v_monthly_raw := ROUND(v_depreciable::NUMERIC / v_asset.useful_life_months);

    -- Cap: cumulative posted (in monthly_amount) must not exceed depreciable base
    SELECT COALESCE(SUM(monthly_amount), 0) INTO v_already_posted
    FROM depreciation_postings
    WHERE item_id = v_asset.item_id;

    IF v_already_posted >= v_depreciable THEN
      -- Sudah fully depreciated — skip
      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;

    v_actual_monthly := LEAST(v_monthly_raw, v_depreciable - v_already_posted);
    IF v_actual_monthly <= 0 THEN
      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;

    v_acct_expense := COALESCE(v_asset.coa_account_depr_expense, '5-500');
    v_acct_accum := COALESCE(v_asset.coa_account_accum_depr, '1-401');

    -- Insert tracking row first (UNIQUE constraint mencegah race condition)
    BEGIN
      INSERT INTO depreciation_postings (
        item_id, period_ym, monthly_amount, posted_by
      ) VALUES (
        v_asset.item_id, p_period_ym, v_actual_monthly, p_actor
      );
    EXCEPTION WHEN unique_violation THEN
      -- Race: another worker just posted this. Skip.
      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END;

    -- Journal entry
    v_journal_ref := 'JE-DEPR-' || REPLACE(p_period_ym, '-', '') || '-' ||
                     LPAD((random() * 99999)::INTEGER::TEXT, 5, '0');

    INSERT INTO journal_entries (
      ref_id, entry_date, entry_type, description,
      source_type, source_id, total_amount, created_by
    ) VALUES (
      v_journal_ref,
      v_period_end,
      'adjustment',
      'Depresiasi ' || p_period_ym || ' — ' || v_asset.sku || ' (' || v_asset.name || ')',
      'depreciation',
      v_asset.item_id,
      v_actual_monthly,
      p_actor
    ) RETURNING id INTO v_journal_id;

    INSERT INTO journal_lines (entry_id, account_code, debit_amount, credit_amount, description, line_order)
    VALUES
      (v_journal_id, v_acct_expense, v_actual_monthly, 0,
       'Beban penyusutan ' || v_asset.name, 1),
      (v_journal_id, v_acct_accum, 0, v_actual_monthly,
       'Akum. penyusutan ' || v_asset.name, 2);

    -- Link journal back to posting row
    UPDATE depreciation_postings
    SET journal_entry_id = v_journal_id
    WHERE item_id = v_asset.item_id AND period_ym = p_period_ym;

    v_posted_count := v_posted_count + 1;
    v_total_amount := v_total_amount + v_actual_monthly;
  END LOOP;

  RETURN QUERY SELECT v_posted_count, v_skipped_count, v_total_amount;
END;
$$;

GRANT EXECUTE ON FUNCTION accrue_monthly_depreciation(TEXT, UUID) TO authenticated;

-- ============================================================================
-- 5. Verification queries (run post-apply)
-- ============================================================================
-- SELECT code, name FROM chart_of_accounts WHERE code IN ('4-901','5-901');
-- SELECT * FROM depreciation_postings LIMIT 5;
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name='items_fixed_asset_config'
--     AND column_name IN ('disposed_at','disposal_method','disposal_sale_price','disposal_notes');
-- SELECT proname FROM pg_proc WHERE proname = 'accrue_monthly_depreciation';
