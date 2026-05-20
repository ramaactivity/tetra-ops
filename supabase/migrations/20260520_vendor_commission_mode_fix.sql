-- Follow-up: recreate vendor_summary_v to include new commission_mode
-- fields. CREATE OR REPLACE failed because adding columns in the middle
-- of the SELECT list is not allowed — must DROP + CREATE.

DROP VIEW IF EXISTS vendor_summary_v;

CREATE VIEW vendor_summary_v AS
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

ALTER VIEW vendor_summary_v SET (security_invoker = true);
GRANT SELECT ON vendor_summary_v TO authenticated;
GRANT SELECT ON vendor_summary_v TO anon;
