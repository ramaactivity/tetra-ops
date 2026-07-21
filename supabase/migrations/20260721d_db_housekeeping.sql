-- ============================================================================
-- 20260721d — Housekeeping DB: retensi audit_log + buang index tak terpakai
-- ============================================================================
-- KONTEKS PENGUKURAN (produksi, 2026-07-21, statistik berumur 81,4 hari)
--   Ukuran DB total ........ 23 MB dari kuota 500 MB free tier (4,6%)
--   Schema public .......... 8,8 MB (heap 4,4 MB + index 4,3 MB)
--   Cache hit .............. 100,00% (blks_read hanya 1.779) → DB muat penuh
--                            di RAM, tidak ada tekanan baca disk
--   Tabel terbesar ......... audit_log 3,0 MB
--
-- Kesimpulan: storage BUKAN masalah dan masih sangat jauh dari batas.
-- Yang diperbaiki di sini adalah pertumbuhan tak terbatas + overhead tulis,
-- supaya tetap ramping seiring waktu — bukan pemadam kebakaran.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Retensi audit_log
--    audit_log adalah tabel terbesar DAN yang paling sering ditulis (trigger
--    trg_audit_capture menulis satu baris tiap mutasi). Dari 1.993 baris,
--    875 (44%) adalah entri 'admin_exec_sql' — derau mesin dari skrip
--    migrasi/audit, bukan jejak bisnis.
--
--    Yang dipangkas HANYA derau mesin. Baris audit bisnis (events, payments,
--    users, dst) TIDAK disentuh sama sekali — itu jejak yang justru harus
--    awet.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION prune_audit_log(p_keep_days integer DEFAULT 30)
RETURNS jsonb AS $$
DECLARE
  v_deleted bigint;
BEGIN
  DELETE FROM audit_log
  WHERE entity_type = 'admin_exec_sql'
    AND created_at < now() - make_interval(days => p_keep_days);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object('deleted', v_deleted, 'keep_days', p_keep_days);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION prune_audit_log(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION prune_audit_log(integer) TO service_role;

COMMENT ON FUNCTION prune_audit_log IS
  'Buang derau admin_exec_sql lama dari audit_log. Jejak audit BISNIS tidak '
  'pernah disentuh. Dipanggil dari cron harian.';

-- Jalankan sekali sekarang.
DO $$
DECLARE r jsonb;
BEGIN
  r := prune_audit_log(30);
  RAISE NOTICE 'prune_audit_log: %', r;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Buang index yang TIDAK PERNAH terpakai di tabel paling sering ditulis
--
--    Statistik sudah terkumpul 81 hari (stats_reset 2026-04-30), jadi
--    idx_scan = 0 di sini bermakna: benar-benar tidak terpakai, bukan sekadar
--    "belum sempat".
--
--    SENGAJA hanya audit_log. Tiap mutasi di seluruh aplikasi menulis satu
--    baris ke sini, jadi tiap index yang menganggur ikut dimutakhirkan pada
--    SETIAP penulisan — itu overhead nyata. Index menganggur di tabel lain
--    (asset_check, wastage, depreciation, dsb) SENGAJA DIBIARKAN: modul-modul
--    itu masih baru dan jarang dipakai, jadi idx_scan = 0 belum tentu berarti
--    tidak berguna nanti.
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS idx_audit_log_action;   -- 112 kB, 0 scan / 81 hari
DROP INDEX IF EXISTS idx_audit_log_actor;    -- 104 kB, 0 scan / 81 hari

-- Index yang benar-benar dipakai untuk kueri audit adalah yang berbasis
-- entity + waktu; pastikan ada supaya prune & penelusuran tetap cepat.
CREATE INDEX IF NOT EXISTS idx_audit_log_entity_created
  ON audit_log (entity_type, created_at DESC);

-- ---------------------------------------------------------------------------
-- 3. Rapikan dead tuple hasil pemangkasan di atas
-- ---------------------------------------------------------------------------
ANALYZE audit_log;
