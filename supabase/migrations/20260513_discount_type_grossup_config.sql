-- 20260513_discount_type_grossup_config.sql
-- 1) Categorize event discounts (events.discount_type) so reports + journals
--    can split "diskon promo" vs "diskon owner override" vs "diskon relasi".
-- 2) Make gross-up PPh rate configurable via system_config — Indonesia's
--    PPh 23 (jasa) is 2% by default; some clients/contracts negotiate
--    different rates.
-- Idempotent.

ALTER TABLE events
	ADD COLUMN IF NOT EXISTS discount_type TEXT
		CHECK (
			discount_type IN (
				'promo',
				'loyalty',
				'relasi',
				'owner_override',
				'package_deal',
				'other'
			)
		);

COMMENT ON COLUMN events.discount_type IS
	'Optional categorization for discount_amount. Used by reports to slice "diskon per kategori" and by journal flagging. NULL = uncategorized (legacy / no discount).';

CREATE INDEX IF NOT EXISTS idx_events_discount_type ON events(discount_type)
	WHERE discount_type IS NOT NULL;

-- Seed default gross-up rate. 2% matches PPh 23 standar untuk jasa.
INSERT INTO system_config (key, value, description, category)
VALUES (
	'tax.default_grossup_rate_pct',
	'2'::jsonb,
	'Default rate (%) untuk auto-calculate gross-up PPh saat booking. Indonesia standar PPh 23 jasa = 2%. Per-booking override tetap manual lewat form.',
	'financial'
)
ON CONFLICT (key) DO NOTHING;
