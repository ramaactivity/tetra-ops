-- 20260520_event_recap_misc_expenses.sql
-- Pindahkan crew_rekap.lainnya_items (JSONB array) ke dedicated table supaya:
--   • Bisa di-query per-row (SUM, filter, etc) tanpa jsonb_array_elements gymnastics
--   • Tiap misc expense punya receipt URL & ID untuk audit
--   • Foreign key + cascade jelas
--
-- Strategi EXTEND:
--   • crew_rekap.lainnya_items tetap exist (backward compat) — TIDAK di-drop.
--   • Backfill: copy item dari JSONB ke event_recap_misc_expenses.
--   • App code baru pakai dedicated table.
--   • Sync ongoing antara JSONB ↔ table TIDAK dilakukan via trigger; app code harus konsisten.

CREATE TABLE IF NOT EXISTS event_recap_misc_expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recap_id UUID NOT NULL REFERENCES crew_rekap(id) ON DELETE CASCADE,

  description TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  receipt_url TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT misc_expense_amount_nonneg CHECK (amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_event_recap_misc_recap ON event_recap_misc_expenses(recap_id);

COMMENT ON TABLE event_recap_misc_expenses IS
  'Per-item misc expenses untuk crew_rekap (lain-lain). Pindahan dari crew_rekap.lainnya_items JSONB.';

-- ----------------------------------------------------------------------------
-- Backfill dari crew_rekap.lainnya_items JSONB array.
-- Idempotent — hanya jalankan kalau target table kosong.
--
-- Format JSONB existing: [{"note": "string", "amount": number}]
-- Mapping: note → description, amount → amount, receipt_url=NULL
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_inserted INTEGER := 0;
BEGIN
  IF (SELECT COUNT(*) FROM event_recap_misc_expenses) = 0 THEN
    INSERT INTO event_recap_misc_expenses (recap_id, description, amount, receipt_url, created_at)
    SELECT
      cr.id,
      COALESCE(item ->> 'note', '(no description)'),
      COALESCE((item ->> 'amount')::NUMERIC, 0),
      NULL,
      cr.created_at
    FROM crew_rekap cr
    CROSS JOIN LATERAL jsonb_array_elements(cr.lainnya_items) AS item
    WHERE cr.lainnya_items IS NOT NULL
      AND jsonb_typeof(cr.lainnya_items) = 'array'
      AND jsonb_array_length(cr.lainnya_items) > 0;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    RAISE NOTICE '[event_recap_misc_expenses] Backfilled % rows from crew_rekap.lainnya_items', v_inserted;
  ELSE
    RAISE NOTICE '[event_recap_misc_expenses] Table not empty, skipping backfill';
  END IF;
END $$;

-- Verification:
--   SELECT cr.id, SUM(me.amount) AS table_total,
--     (SELECT SUM((item->>'amount')::NUMERIC) FROM jsonb_array_elements(cr.lainnya_items) item) AS json_total
--   FROM crew_rekap cr
--   LEFT JOIN event_recap_misc_expenses me ON me.recap_id = cr.id
--   GROUP BY cr.id, cr.lainnya_items
--   HAVING SUM(me.amount) IS DISTINCT FROM (
--     SELECT SUM((item->>'amount')::NUMERIC) FROM jsonb_array_elements(cr.lainnya_items) item
--   );
--   -- Should return 0 rows (totals match)
