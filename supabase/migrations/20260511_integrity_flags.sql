-- 20260511_integrity_flags.sql
-- system_config seeds for the rekap → settlement integrity chain.
-- Idempotent (ON CONFLICT DO NOTHING).

INSERT INTO system_config (key, value, description, category)
VALUES
	(
		'rekap.auto_deduct_stock',
		'true'::jsonb,
		'Saat owner approve crew_rekap, otomatis emit stock_movements out untuk tiap mapped consumable. Reject setelah approval emit reversal in-movements. Set ke false buat disable behavior.',
		'integrity'
	),
	(
		'settlement.require_approved_rekap',
		'true'::jsonb,
		'Kalau true, close_event_settlement reject closure dengan exception kalau crew_rekap.is_approved bukan true. Kalau false, settlement bisa close dengan rekap pending (soft warning UI saja).',
		'integrity'
	),
	(
		'settlement.owner_pool_distribution_mode',
		'"equal"'::jsonb,
		'Mode distribusi owner pool saat settle. "equal" = sama rata per orang. "proportional" = pakai users.share_pct (fallback ke equal kalau SUM share_pct ≠ 100 atau ada owner tanpa share_pct).',
		'integrity'
	)
ON CONFLICT (key) DO NOTHING;
