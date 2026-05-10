-- 20260511_rekap_item_mapping.sql
-- Maps each crew_rekap field (cetak_total, media_set_used, etc.) to an
-- inventory_items.id so reviewRekap can auto-deduct stock on approval
-- and settlement form can auto-prefill HPP from rekap × purchase_price_avg.
-- Idempotent — safe to re-run.

-- ============================================================================
-- TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS rekap_field_mapping (
	rekap_field TEXT PRIMARY KEY,
	item_id UUID REFERENCES inventory_items(id) ON DELETE RESTRICT,
	qty_per_unit INTEGER NOT NULL DEFAULT 1 CHECK (qty_per_unit >= 1),
	is_active BOOLEAN NOT NULL DEFAULT true,
	updated_by UUID REFERENCES users(id),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE rekap_field_mapping IS
	'Maps crew_rekap consumable fields to inventory_items SKUs. Used by reviewRekap (auto-deduct stock) and settlement form (auto-prefill HPP). qty_per_unit lets one rekap unit consume N inventory units (e.g., 1 media_set = 2 prints).';

-- Seed the 7 default rekap fields. item_id NULL means "not yet mapped" —
-- owner fills them in via /settings/items/mapping UI before auto-deduct works.
INSERT INTO rekap_field_mapping (rekap_field, qty_per_unit, is_active)
VALUES
	('cetak_total', 1, true),
	('media_set_used', 1, true),
	('sleeve_used', 1, true),
	('flashdisk_used', 1, true),
	('pouch_used', 1, true),
	('photomagnet_used', 1, true),
	('keychain_used', 1, true)
ON CONFLICT (rekap_field) DO NOTHING;

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_rekap_field_mapping_item ON rekap_field_mapping(item_id)
	WHERE item_id IS NOT NULL;

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE rekap_field_mapping ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rekap_field_mapping_read_authenticated" ON rekap_field_mapping;
CREATE POLICY "rekap_field_mapping_read_authenticated"
	ON rekap_field_mapping
	FOR SELECT
	TO authenticated
	USING (true);

DROP POLICY IF EXISTS "rekap_field_mapping_write_owner" ON rekap_field_mapping;
CREATE POLICY "rekap_field_mapping_write_owner"
	ON rekap_field_mapping
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
