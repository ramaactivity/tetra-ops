-- 20260511_rekap_consumption_link.sql
-- Adds the columns + enum value needed for Phase B of the integrity plan:
-- auto-create stock_movements when crew_rekap is approved.
-- Idempotent.

-- ============================================================================
-- ENUM: add 'rekap_consumption' source
-- (PostgreSQL: ALTER TYPE ... ADD VALUE IF NOT EXISTS works on modern PG.
--  Cannot run inside a transaction block — run as standalone in SQL editor.)
-- ============================================================================

ALTER TYPE movement_source ADD VALUE IF NOT EXISTS 'rekap_consumption';

-- ============================================================================
-- crew_rekap: track when stock movements were emitted
-- ============================================================================

ALTER TABLE crew_rekap
	ADD COLUMN IF NOT EXISTS stock_committed_at TIMESTAMPTZ NULL;

ALTER TABLE crew_rekap
	ADD COLUMN IF NOT EXISTS stock_movement_batch_id UUID NULL;

COMMENT ON COLUMN crew_rekap.stock_committed_at IS
	'Set when reviewRekap auto-emitted out-movements on approval. Null = pre-system rekap (manual stock adjustment) or not yet approved.';

-- ============================================================================
-- INDEX on stock_movements(source, source_id)
-- (used by reversal lookup when rekap is rejected after a prior approval)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_stock_movements_source_pair
	ON stock_movements(source, source_id)
	WHERE source_id IS NOT NULL;
