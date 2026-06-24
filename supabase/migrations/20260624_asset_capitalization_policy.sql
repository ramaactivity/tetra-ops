-- ============================================================================
-- Asset capitalization policy.
--
-- Owner policy: an item is a DEPRECIATED fixed asset only when
--   purchase_price > Rp 1,500,000  AND  useful_life_months >= 24.
-- Anything below that is NOT capitalized — it's expensed (langsung habis,
-- tanpa penyusutan). The item record stays for physical tracking; only the
-- accounting treatment changes.
--
-- This migration:
--   1) adds `is_capitalized` to items_fixed_asset_config,
--   2) adds an expense account for sub-threshold equipment/supplies,
--   3) reclassifies EXISTING sub-threshold assets → non-capitalized + stops
--      their depreciation,
--   4) gates the depreciation engine on `is_capitalized`.
--
-- No reversal journals are posted for the existing reclassified items: they
-- have NO acquisition journal and negligible accumulated depreciation (they
-- were imported as master data, never capitalized to the asset account), so
-- there is no capitalized balance to move to expense. Already-posted
-- depreciation in closed periods is left untouched.
-- ============================================================================

-- 1) Capitalization flag (default true; existing real assets stay capitalized).
ALTER TABLE items_fixed_asset_config
  ADD COLUMN IF NOT EXISTS is_capitalized BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN items_fixed_asset_config.is_capitalized IS
  'true = capitalized fixed asset (depreciated). false = below policy (harga <= Rp1,5jt ATAU umur < 24 bln) → dibebankan, tidak disusutkan. Item tetap dilacak fisik.';

-- 2) Expense account for small equipment/supplies (below capitalization policy).
INSERT INTO chart_of_accounts (code, name, account_type, parent_code, is_active, description)
VALUES (
  '5-250',
  'Beban Perlengkapan & Peralatan Kecil',
  'expense',
  '5-000',
  true,
  'Peralatan/perlengkapan di bawah kriteria aset tetap (harga <= Rp1,5jt atau umur < 2 th) — langsung dibebankan, tidak disusutkan.'
)
ON CONFLICT (code) DO NOTHING;

-- 3) Reclassify existing sub-threshold fixed assets → non-capitalized + stop depr.
UPDATE items_fixed_asset_config
SET is_capitalized = false,
    depreciation_method = 'none'
WHERE disposed_at IS NULL
  AND (
    purchase_price <= 1500000
    OR useful_life_months IS NULL
    OR useful_life_months < 24
  );

-- 4) Gate the depreciation engine: only capitalized assets accrue depreciation.
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
  IF p_period_ym !~ '^[0-9]{4}-[0-9]{2}$' THEN
    RAISE EXCEPTION 'Invalid period_ym format (expected YYYY-MM): %', p_period_ym;
  END IF;

  v_period_end := (p_period_ym || '-01')::DATE + INTERVAL '1 month' - INTERVAL '1 day';

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
      AND c.is_capitalized = true
      AND c.depreciation_method = 'straight_line'
      AND c.useful_life_months IS NOT NULL
      AND c.useful_life_months > 0
      AND c.purchase_price > 0
      AND c.depreciation_start_date IS NOT NULL
      AND c.depreciation_start_date <= v_period_end
  LOOP
    IF EXISTS (
      SELECT 1 FROM depreciation_postings
      WHERE item_id = v_asset.item_id AND period_ym = p_period_ym
    ) THEN
      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;

    v_depreciable := GREATEST(0, v_asset.purchase_price - v_asset.salvage_value);
    v_monthly_raw := ROUND(v_depreciable::NUMERIC / v_asset.useful_life_months);

    SELECT COALESCE(SUM(monthly_amount), 0) INTO v_already_posted
    FROM depreciation_postings
    WHERE item_id = v_asset.item_id;

    IF v_already_posted >= v_depreciable THEN
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

    BEGIN
      INSERT INTO depreciation_postings (
        item_id, period_ym, monthly_amount, posted_by
      ) VALUES (
        v_asset.item_id, p_period_ym, v_actual_monthly, p_actor
      );
    EXCEPTION WHEN unique_violation THEN
      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END;

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

    UPDATE depreciation_postings
    SET journal_entry_id = v_journal_id
    WHERE item_id = v_asset.item_id AND period_ym = p_period_ym;

    v_posted_count := v_posted_count + 1;
    v_total_amount := v_total_amount + v_actual_monthly;
  END LOOP;

  RETURN QUERY SELECT v_posted_count, v_skipped_count, v_total_amount;
END;
$$;
