-- 20260612_drop_legacy_settlement_rpcs.sql
-- Cleanup: drop RPC settlement legacy yang sudah MATI total (Phase 4 hapus
-- semua caller: tutupBuku, closeSettlement, settlements.reopenSettlement).
-- Verified: tidak ada referensi di code maupun di body function DB lain.
--
-- Live path tetap: settle_event + reopen_settlement (NB beda nama dgn yg
-- di-drop di sini). YANG di-drop:
--   - close_event_settlement (semua overload v3/v4)
--   - reopen_event_settlement (legacy; bukan reopen_settlement yg live)
--
-- TIDAK di-drop (masih dipakai): rekap_field_mapping (dibaca form rekap),
-- calculate_recap_hpp (fallback di settle_event). Atomik — drop per overload
-- via pg_proc; tanpa CASCADE supaya gagal aman kalau ada dependent tak terduga.

DO $$
DECLARE
	r RECORD;
BEGIN
	FOR r IN
		SELECT oid::regprocedure AS sig
		FROM pg_proc
		WHERE proname IN ('close_event_settlement', 'reopen_event_settlement')
	LOOP
		EXECUTE 'DROP FUNCTION ' || r.sig::text;
		RAISE NOTICE 'Dropped %', r.sig;
	END LOOP;
END $$;
