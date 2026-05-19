-- Migration: Vendor master module
-- Date: 2026-05-19
-- Purpose: Promote vendors from denormalized events.vendor_name strings to
--          proper master entities in the contacts table (type='vendor'),
--          with vendor-specific defaults (commission %, payment terms, PIC).
--
-- Strategy:
--   1. Extend contacts table with vendor-specific columns (NULL when type
--      ≠ 'vendor', populated when type='vendor').
--   2. Add events.vendor_contact_id FK that points at the contacts row.
--   3. Backfill — for every distinct events.vendor_name, ensure a
--      contacts row exists (type='vendor') and link events.vendor_contact_id.
--   4. Keep events.vendor_name etc. for back-compat + historical clarity.
--      New bookings will still write the snapshot strings + the FK.
--
-- Idempotent: safe to re-run via scripts/apply-migration.ts.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) Extend contacts with vendor-specific defaults
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE contacts
	ADD COLUMN IF NOT EXISTS commission_rate_default NUMERIC(5,2);

ALTER TABLE contacts
	ADD COLUMN IF NOT EXISTS payment_terms TEXT;

ALTER TABLE contacts
	ADD COLUMN IF NOT EXISTS default_pic_name TEXT;

ALTER TABLE contacts
	ADD COLUMN IF NOT EXISTS default_pic_contact TEXT;

ALTER TABLE contacts
	ADD COLUMN IF NOT EXISTS company_address TEXT;

COMMENT ON COLUMN contacts.commission_rate_default IS
	'Standard commission % for this vendor. Used as default in new bookings (override per-event allowed). Only meaningful when type=''vendor''.';
COMMENT ON COLUMN contacts.payment_terms IS
	'Free-text payment terms (e.g. "Net 14", "DP 50% / pelunasan H+7"). Vendor-only.';
COMMENT ON COLUMN contacts.default_pic_name IS
	'Default sales/account-manager PIC name. Auto-fills vendor_pic_name when this vendor is picked.';
COMMENT ON COLUMN contacts.default_pic_contact IS
	'Default PIC WA/HP. Auto-fills vendor_contact when this vendor is picked.';
COMMENT ON COLUMN contacts.company_address IS
	'Vendor company address. Optional, for invoice/contract use.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2) Add vendor_contact_id FK on events
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE events
	ADD COLUMN IF NOT EXISTS vendor_contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_events_vendor_contact_id
	ON events(vendor_contact_id) WHERE vendor_contact_id IS NOT NULL;

COMMENT ON COLUMN events.vendor_contact_id IS
	'FK to contacts(id) where type=''vendor''. Replaces denormalized events.vendor_name as source of truth. vendor_name/vendor_pic_name/vendor_contact retained as snapshot fields for back-compat + historical accuracy.';

-- ─────────────────────────────────────────────────────────────────────────
-- 3) Backfill — promote distinct events.vendor_name → contacts (type='vendor')
--    Match strategy: case-insensitive trim. If no contact exists with that
--    name (and type='vendor'), create one. Then link events.vendor_contact_id.
-- ─────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
	r RECORD;
	v_contact_id UUID;
	v_count INTEGER := 0;
BEGIN
	-- For each distinct vendor name in events, upsert a contacts row
	FOR r IN
		SELECT
			TRIM(vendor_name) AS name,
			-- Take the most-recently-event'd row's PIC + contact + commission
			-- as the "default" for this vendor
			(ARRAY_AGG(vendor_pic_name ORDER BY event_date DESC NULLS LAST) FILTER (WHERE vendor_pic_name IS NOT NULL AND TRIM(vendor_pic_name) != ''))[1] AS pic_name,
			(ARRAY_AGG(vendor_contact ORDER BY event_date DESC NULLS LAST) FILTER (WHERE vendor_contact IS NOT NULL AND TRIM(vendor_contact) != ''))[1] AS pic_contact,
			(ARRAY_AGG(vendor_commission_rate ORDER BY event_date DESC NULLS LAST) FILTER (WHERE vendor_commission_rate IS NOT NULL))[1] AS commission_rate
		FROM events
		WHERE vendor_name IS NOT NULL
			AND TRIM(vendor_name) != ''
			AND deleted_at IS NULL
		GROUP BY TRIM(vendor_name)
	LOOP
		-- Try to find existing vendor contact (case-insensitive)
		SELECT id INTO v_contact_id
		FROM contacts
		WHERE type = 'vendor'
			AND LOWER(TRIM(name)) = LOWER(r.name)
			AND is_active = true
		LIMIT 1;

		IF v_contact_id IS NULL THEN
			-- Create new vendor contact
			INSERT INTO contacts (
				type, name, phone, notes,
				default_pic_name, default_pic_contact, commission_rate_default,
				is_active
			)
			VALUES (
				'vendor',
				r.name,
				r.pic_contact,  -- phone column doubles as contact (legacy compat)
				CASE WHEN r.pic_name IS NOT NULL
					THEN 'Auto-created from booking history (' || NOW()::date || ')'
					ELSE NULL
				END,
				r.pic_name,
				r.pic_contact,
				r.commission_rate,
				true
			)
			RETURNING id INTO v_contact_id;
			v_count := v_count + 1;
		END IF;

		-- Link all events with matching vendor_name (case-insensitive trim)
		UPDATE events
		SET vendor_contact_id = v_contact_id
		WHERE LOWER(TRIM(vendor_name)) = LOWER(r.name)
			AND vendor_contact_id IS NULL
			AND deleted_at IS NULL;
	END LOOP;

	RAISE NOTICE 'Vendor master backfill: created % new vendor contacts, linked all events with vendor_name to their vendor_contact_id', v_count;
END$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 4) Verification view (read-only, for auditing the backfill)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW vendor_summary_v AS
SELECT
	c.id AS vendor_id,
	c.name,
	c.phone,
	c.default_pic_name,
	c.default_pic_contact,
	c.commission_rate_default,
	c.payment_terms,
	c.company_address,
	c.is_active,
	c.created_at,
	COUNT(DISTINCT e.id) AS event_count,
	COUNT(DISTINCT e.id) FILTER (WHERE e.event_date >= DATE_TRUNC('year', NOW())) AS event_count_ytd,
	COALESCE(SUM(e.vendor_commission_amount) FILTER (WHERE e.event_date >= DATE_TRUNC('year', NOW())), 0) AS commission_ytd,
	COALESCE(SUM(e.grand_total) FILTER (WHERE e.event_date >= DATE_TRUNC('year', NOW())), 0) AS gross_revenue_ytd,
	MAX(e.event_date) AS last_event_date
FROM contacts c
LEFT JOIN events e
	ON e.vendor_contact_id = c.id
	AND e.deleted_at IS NULL
	AND e.is_migrated_legacy = false
WHERE c.type = 'vendor'
GROUP BY c.id;

COMMENT ON VIEW vendor_summary_v IS
	'Per-vendor aggregate: event count YTD, commission YTD, gross revenue. Used by /settings/vendors list page.';

-- RLS for vendor_summary_v inherits from underlying tables (contacts + events
-- both have authenticated SELECT via existing policies).
