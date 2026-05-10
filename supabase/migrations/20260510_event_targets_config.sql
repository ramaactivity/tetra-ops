-- 20260510_event_targets_config.sql
-- Seed system_config keys for event throughput targets (monthly + yearly).
-- Idempotent — safe to re-run.

INSERT INTO system_config (key, value, description, category)
VALUES
	(
		'event_target_monthly',
		'10'::jsonb,
		'Target jumlah event per bulan. Dipakai dashboard / operations untuk progress card.',
		'targets'
	),
	(
		'event_target_yearly',
		'100'::jsonb,
		'Target jumlah event per tahun. Dipakai dashboard untuk progress card tahunan.',
		'targets'
	)
ON CONFLICT (key) DO NOTHING;
