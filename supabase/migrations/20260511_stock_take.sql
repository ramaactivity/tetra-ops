-- 20260511_stock_take.sql
-- Stock-take (physical inventory audit) workflow:
-- 1. Owner creates a stock-take (status='draft').
-- 2. Owner walks the warehouse, fills counted_qty per item.
-- 3. On commit, RPC generates one adjustment stock_movement per non-zero
--    variance row. Status flips to 'committed'.
-- Idempotent.

-- ============================================================================
-- TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS stock_takes (
	id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	taken_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	taken_by UUID REFERENCES users(id),
	notes TEXT,
	status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'committed', 'cancelled')),
	committed_at TIMESTAMPTZ,
	committed_by UUID REFERENCES users(id),
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_take_lines (
	stock_take_id UUID NOT NULL REFERENCES stock_takes(id) ON DELETE CASCADE,
	item_id UUID NOT NULL REFERENCES inventory_items(id),
	system_qty INTEGER NOT NULL,
	counted_qty INTEGER NOT NULL,
	variance INTEGER GENERATED ALWAYS AS (counted_qty - system_qty) STORED,
	notes TEXT,
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	PRIMARY KEY (stock_take_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_stock_takes_status ON stock_takes(status);
CREATE INDEX IF NOT EXISTS idx_stock_takes_taken_at ON stock_takes(taken_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_take_lines_item ON stock_take_lines(item_id);

COMMENT ON TABLE stock_takes IS
	'Physical inventory audit sessions. On commit, generates adjustment stock_movements per non-zero variance.';

-- ============================================================================
-- COMMIT RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION commit_stock_take(
	p_stock_take_id UUID,
	p_actor UUID
) RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
	v_status TEXT;
	v_line RECORD;
	v_movements_created INTEGER := 0;
	v_ref_id TEXT;
BEGIN
	-- Validate take is draft
	SELECT status INTO v_status FROM stock_takes WHERE id = p_stock_take_id;
	IF v_status IS NULL THEN
		RAISE EXCEPTION 'Stock take % not found', p_stock_take_id USING ERRCODE = 'P0002';
	END IF;
	IF v_status != 'draft' THEN
		RAISE EXCEPTION 'Stock take % is not draft (status=%)', p_stock_take_id, v_status USING ERRCODE = 'P0001';
	END IF;

	-- Generate one adjustment movement per non-zero variance line
	FOR v_line IN
		SELECT item_id, variance, notes
		FROM stock_take_lines
		WHERE stock_take_id = p_stock_take_id AND variance != 0
	LOOP
		v_ref_id := 'MOV-A-' || LPAD((random() * 99999999)::INTEGER::TEXT, 8, '0');
		INSERT INTO stock_movements (
			ref_id, item_id, direction, quantity, source, source_id,
			source_description, notes, performed_by
		) VALUES (
			v_ref_id,
			v_line.item_id,
			CASE WHEN v_line.variance > 0 THEN 'in' ELSE 'out' END,
			ABS(v_line.variance),
			'stock_take',
			p_stock_take_id,
			'Stock take adjustment',
			v_line.notes,
			p_actor
		);
		v_movements_created := v_movements_created + 1;
	END LOOP;

	-- Mark committed
	UPDATE stock_takes
	SET status = 'committed',
	    committed_at = NOW(),
	    committed_by = p_actor,
	    updated_at = NOW()
	WHERE id = p_stock_take_id;

	RETURN v_movements_created;
END;
$$;

GRANT EXECUTE ON FUNCTION commit_stock_take(UUID, UUID) TO authenticated;

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE stock_takes ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_take_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stock_takes_owner" ON stock_takes;
CREATE POLICY "stock_takes_owner"
	ON stock_takes
	FOR ALL
	TO authenticated
	USING (
		EXISTS (
			SELECT 1 FROM users u
			WHERE u.id = auth.uid()
				AND u.role IN ('super_admin', 'owner')
		)
	)
	WITH CHECK (
		EXISTS (
			SELECT 1 FROM users u
			WHERE u.id = auth.uid()
				AND u.role IN ('super_admin', 'owner')
		)
	);

DROP POLICY IF EXISTS "stock_take_lines_owner" ON stock_take_lines;
CREATE POLICY "stock_take_lines_owner"
	ON stock_take_lines
	FOR ALL
	TO authenticated
	USING (
		EXISTS (
			SELECT 1 FROM users u
			WHERE u.id = auth.uid()
				AND u.role IN ('super_admin', 'owner')
		)
	)
	WITH CHECK (
		EXISTS (
			SELECT 1 FROM users u
			WHERE u.id = auth.uid()
				AND u.role IN ('super_admin', 'owner')
		)
	);
