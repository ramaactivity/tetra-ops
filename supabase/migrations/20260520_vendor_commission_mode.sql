-- Migration: Vendor commission mode (direct commission vs upfront cut)
-- Date: 2026-05-20
-- Purpose: Owner runs two distinct vendor arrangements:
--   1. COMMISSION (existing): Client pays Tetra full grand_total. Tetra
--      transfers commission to vendor after settlement. Commission can
--      be percentage of grand_total OR a flat rupiah amount.
--   2. UPFRONT_CUT (new): Client pays vendor directly. Vendor transfers
--      a pre-arranged flat fee to Tetra (= what Tetra's grand_total is
--      from Tetra's POV). Tetra doesn't see client's payment, doesn't
--      pay commission downstream. Vendor's actual margin is invisible
--      to Tetra.
--
-- Schema design — additive only:
--   - contacts (vendor master) gets defaults: commission_mode +
--     commission_value_type + commission_value_default.
--   - events (per-booking snapshot) gets: vendor_commission_mode +
--     vendor_commission_value_type + vendor_commission_value.
--   - Existing columns (commission_rate_default on contacts,
--     vendor_commission_rate + vendor_commission_amount on events) are
--     retained for back-compat. New bookings populate both old and new.
--
-- Computed vendor_commission_amount logic (app-side, written at save):
--   - commission + percent: grand_total × value / 100
--   - commission + flat:    value (literal)
--   - upfront_cut:          0 (no commission paid downstream)
--
-- Settlement impact: settle_event RPC uses p_opex.komisi_vendor JSONB
-- value passed by app code at settlement time — already decoupled from
-- events.vendor_commission_amount. No RPC change needed.
--
-- Idempotent.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) Vendor master (contacts) — commission defaults
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE contacts
	ADD COLUMN IF NOT EXISTS commission_mode TEXT
		CHECK (commission_mode IS NULL OR commission_mode IN ('commission', 'upfront_cut'));

ALTER TABLE contacts
	ADD COLUMN IF NOT EXISTS commission_value_type TEXT
		CHECK (commission_value_type IS NULL OR commission_value_type IN ('percent', 'flat'));

ALTER TABLE contacts
	ADD COLUMN IF NOT EXISTS commission_value_default NUMERIC(12, 2);

COMMENT ON COLUMN contacts.commission_mode IS
	'Vendor master default commission mode. ''commission'' = Tetra receives full from client + pays commission to vendor. ''upfront_cut'' = vendor receives client payment + pays Tetra a flat cut. Only meaningful when type=''vendor''.';
COMMENT ON COLUMN contacts.commission_value_type IS
	'For mode=commission only: ''percent'' (value is %) or ''flat'' (value is rupiah). Ignored when mode=upfront_cut (always flat rupiah).';
COMMENT ON COLUMN contacts.commission_value_default IS
	'Default commission value. Interpretation depends on mode + type:\n  - commission+percent: percentage applied to grand_total\n  - commission+flat: flat rupiah Tetra pays vendor per event\n  - upfront_cut: flat rupiah Tetra receives from vendor per event (used as default base_price suggestion).';

-- ─────────────────────────────────────────────────────────────────────────
-- 2) Events — per-booking commission snapshot
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE events
	ADD COLUMN IF NOT EXISTS vendor_commission_mode TEXT
		CHECK (vendor_commission_mode IS NULL OR vendor_commission_mode IN ('commission', 'upfront_cut'));

ALTER TABLE events
	ADD COLUMN IF NOT EXISTS vendor_commission_value_type TEXT
		CHECK (vendor_commission_value_type IS NULL OR vendor_commission_value_type IN ('percent', 'flat'));

ALTER TABLE events
	ADD COLUMN IF NOT EXISTS vendor_commission_value NUMERIC(12, 2);

COMMENT ON COLUMN events.vendor_commission_mode IS
	'Snapshot of vendor commission mode at booking time. Snapshot (not FK to vendor master) so historical accuracy preserved even if vendor master default changes later.';
COMMENT ON COLUMN events.vendor_commission_value_type IS
	'Snapshot of commission value type (percent | flat). Only meaningful when mode=commission.';
COMMENT ON COLUMN events.vendor_commission_value IS
	'Snapshot of commission value. Interpretation: see vendor_commission_mode + vendor_commission_value_type. vendor_commission_amount (existing column) holds the COMPUTED rupiah amount derived from these fields + grand_total.';

-- ─────────────────────────────────────────────────────────────────────────
-- 3) Backfill — existing contacts + events keep current semantics
-- ─────────────────────────────────────────────────────────────────────────

-- Contacts: existing vendors with commission_rate_default → mode=commission, type=percent
UPDATE contacts
SET
	commission_mode = 'commission',
	commission_value_type = 'percent',
	commission_value_default = commission_rate_default
WHERE type = 'vendor'
	AND commission_rate_default IS NOT NULL
	AND commission_mode IS NULL;

-- Contacts: vendors WITHOUT commission_rate_default → default to commission/percent
-- (legacy back-compat; owner can change later in vendor edit form)
UPDATE contacts
SET
	commission_mode = 'commission',
	commission_value_type = 'percent'
WHERE type = 'vendor'
	AND commission_mode IS NULL;

-- Events: existing vendor bookings → snapshot from old rate
UPDATE events
SET
	vendor_commission_mode = 'commission',
	vendor_commission_value_type = 'percent',
	vendor_commission_value = vendor_commission_rate
WHERE channel = 'vendor'
	AND vendor_commission_rate IS NOT NULL
	AND vendor_commission_mode IS NULL;

-- Events: vendor bookings without rate → default snapshot
UPDATE events
SET
	vendor_commission_mode = 'commission',
	vendor_commission_value_type = 'percent',
	vendor_commission_value = COALESCE(vendor_commission_rate, 0)
WHERE channel = 'vendor'
	AND vendor_commission_mode IS NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- 4) Refresh vendor_summary_v to expose new mode field
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW vendor_summary_v AS
SELECT
	c.id AS vendor_id,
	c.name,
	c.phone,
	c.default_pic_name,
	c.default_pic_contact,
	c.commission_rate_default,
	c.commission_mode,
	c.commission_value_type,
	c.commission_value_default,
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

-- Maintain security_invoker + grants from previous migration
ALTER VIEW vendor_summary_v SET (security_invoker = true);
GRANT SELECT ON vendor_summary_v TO authenticated;
GRANT SELECT ON vendor_summary_v TO anon;
