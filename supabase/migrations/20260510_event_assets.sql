-- 20260510_event_assets.sql
-- Visual Asset Hub for events: per-event link bucket grouped by type
-- (design frame / footage crew / softfile photo / softfile video).
-- Idempotent — safe to re-run.

-- ============================================================================
-- TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS event_assets (
	id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
	asset_type TEXT NOT NULL CHECK (
		asset_type IN ('design_frame', 'footage_crew', 'softfile_photo', 'softfile_video')
	),
	label TEXT NOT NULL,
	url TEXT NOT NULL,
	notes TEXT,
	uploaded_by UUID REFERENCES users(id),
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_assets_event ON event_assets(event_id);
CREATE INDEX IF NOT EXISTS idx_event_assets_type ON event_assets(asset_type);
CREATE INDEX IF NOT EXISTS idx_event_assets_event_type ON event_assets(event_id, asset_type);

COMMENT ON TABLE event_assets IS
	'Per-event visual asset links: design frames, raw footage, softfile output. Replaces ad-hoc "drive_folder_url" with structured, type-bucketed entries.';

-- ============================================================================
-- TRIGGER: updated_at
-- ============================================================================

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_trigger WHERE tgname = 'event_assets_updated_at'
	) THEN
		CREATE TRIGGER event_assets_updated_at
			BEFORE UPDATE ON event_assets
			FOR EACH ROW
			EXECUTE FUNCTION update_updated_at();
	END IF;
EXCEPTION
	WHEN undefined_function THEN
		-- update_updated_at function may not exist in older schemas; skip
		NULL;
END;
$$;

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE event_assets ENABLE ROW LEVEL SECURITY;

-- super_admin / owner: full read
DROP POLICY IF EXISTS "event_assets_read_owner" ON event_assets;
CREATE POLICY "event_assets_read_owner"
	ON event_assets
	FOR SELECT
	TO authenticated
	USING (
		EXISTS (
			SELECT 1 FROM users u
			WHERE u.id = auth.uid()
				AND u.role IN ('super_admin', 'owner')
		)
	);

-- crew: read assets for events they're assigned to
DROP POLICY IF EXISTS "event_assets_read_crew_assigned" ON event_assets;
CREATE POLICY "event_assets_read_crew_assigned"
	ON event_assets
	FOR SELECT
	TO authenticated
	USING (
		EXISTS (
			SELECT 1 FROM crew_assignments ca
			JOIN users u ON u.id = auth.uid()
			WHERE ca.event_id = event_assets.event_id
				AND ca.user_id = auth.uid()
				AND u.role = 'crew'
		)
	);

-- super_admin / owner: full write (insert / update / delete)
DROP POLICY IF EXISTS "event_assets_write_owner" ON event_assets;
CREATE POLICY "event_assets_write_owner"
	ON event_assets
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

-- crew: can insert footage_crew on events they're assigned to (own contributions)
DROP POLICY IF EXISTS "event_assets_insert_crew_footage" ON event_assets;
CREATE POLICY "event_assets_insert_crew_footage"
	ON event_assets
	FOR INSERT
	TO authenticated
	WITH CHECK (
		asset_type = 'footage_crew'
		AND uploaded_by = auth.uid()
		AND EXISTS (
			SELECT 1 FROM crew_assignments ca
			JOIN users u ON u.id = auth.uid()
			WHERE ca.event_id = event_assets.event_id
				AND ca.user_id = auth.uid()
				AND u.role = 'crew'
		)
	);

-- crew: can delete only their own footage_crew uploads
DROP POLICY IF EXISTS "event_assets_delete_crew_own" ON event_assets;
CREATE POLICY "event_assets_delete_crew_own"
	ON event_assets
	FOR DELETE
	TO authenticated
	USING (
		asset_type = 'footage_crew'
		AND uploaded_by = auth.uid()
	);
