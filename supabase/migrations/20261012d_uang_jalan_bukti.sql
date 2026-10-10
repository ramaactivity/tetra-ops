-- 20261012d_uang_jalan_bukti.sql — bukti uang jalan (DR-049 lanjutan, owner 2026-10-10).
-- Owner: bukti saat memberi / menerima sisa. Crew: bukti terima + bukti
-- pengembalian sisa (WAJIB kalau dikembalikan lewat transfer). Aditif.
ALTER TABLE uang_jalan ADD COLUMN IF NOT EXISTS proof_url text;
ALTER TABLE crew_rekap
	ADD COLUMN IF NOT EXISTS uj_bukti_url text,
	ADD COLUMN IF NOT EXISTS uj_kembali_metode text,
	ADD COLUMN IF NOT EXISTS uj_kembali_bukti_url text;
DO $$ BEGIN
	ALTER TABLE crew_rekap ADD CONSTRAINT crew_rekap_uj_kembali_metode_check
		CHECK (uj_kembali_metode IS NULL OR uj_kembali_metode IN ('tunai', 'transfer'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
