-- 20260518_rekap_mapping_frame_size.sql
-- Make rekap_field_mapping frame-size-aware so the same field (e.g.
-- media_set_used) can map to different inventory items + qty_per_unit
-- per frame_size. Required because mediaset basic is shared between 4R
-- and 2R (cut 2× per sheet), and mediaset perforated is polaroid-only.
--
-- Migration steps:
-- 1. Drop existing PK on rekap_field
-- 2. Add new column frame_size TEXT NOT NULL DEFAULT '' (empty = default fallback)
-- 3. Composite PK (rekap_field, frame_size)
-- 4. Change qty_per_unit INTEGER → NUMERIC(10,4) so fractional ratios work
--    (e.g. 0.5 for 2R cut from 1 sheet basic).
--
-- Idempotent — uses guards so safe to re-run.

-- 1. Add frame_size column if not exists
ALTER TABLE rekap_field_mapping
	ADD COLUMN IF NOT EXISTS frame_size TEXT NOT NULL DEFAULT '';

-- 2. Drop old PK and create composite PK (if not already done)
DO $$
BEGIN
	-- Check if the old PK exists by name
	IF EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conrelid = 'rekap_field_mapping'::regclass
			AND contype = 'p'
			AND conname = 'rekap_field_mapping_pkey'
	) THEN
		-- Get the current PK column count to know whether it's already composite
		IF (
			SELECT array_length(conkey, 1) FROM pg_constraint
			WHERE conrelid = 'rekap_field_mapping'::regclass AND contype = 'p'
		) = 1 THEN
			ALTER TABLE rekap_field_mapping DROP CONSTRAINT rekap_field_mapping_pkey;
			ALTER TABLE rekap_field_mapping
				ADD PRIMARY KEY (rekap_field, frame_size);
		END IF;
	END IF;
END $$;

-- 3. Promote qty_per_unit to NUMERIC for fractional ratios
DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_name = 'rekap_field_mapping'
			AND column_name = 'qty_per_unit'
			AND data_type = 'integer'
	) THEN
		-- Drop the integer CHECK constraint first (we re-add a numeric one)
		ALTER TABLE rekap_field_mapping
			DROP CONSTRAINT IF EXISTS rekap_field_mapping_qty_per_unit_check;
		ALTER TABLE rekap_field_mapping
			ALTER COLUMN qty_per_unit TYPE NUMERIC(10,4) USING qty_per_unit::NUMERIC(10,4);
		ALTER TABLE rekap_field_mapping
			ALTER COLUMN qty_per_unit SET DEFAULT 1.0;
		ALTER TABLE rekap_field_mapping
			ADD CONSTRAINT rekap_field_mapping_qty_per_unit_check
			CHECK (qty_per_unit > 0);
	END IF;
END $$;

-- 4. Index for grouped queries by rekap_field
CREATE INDEX IF NOT EXISTS idx_rekap_field_mapping_field
	ON rekap_field_mapping (rekap_field);

COMMENT ON COLUMN rekap_field_mapping.frame_size IS
	'Empty string = default fallback (applies when no size-specific row exists). Specific frame_size (4R/2R/polaroid/none) overrides the default.';
COMMENT ON COLUMN rekap_field_mapping.qty_per_unit IS
	'Fractional ratio. cetak × qty_per_unit = inventory units consumed. E.g. 4R basic = 1.0 sheet/print, 2R basic = 0.5 sheet/print (cut), polaroid perf = 0.5 sheet/print.';
