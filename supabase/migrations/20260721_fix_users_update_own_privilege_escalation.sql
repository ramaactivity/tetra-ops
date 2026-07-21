-- ============================================================================
-- 20260721 — FIX: privilege escalation lewat policy users_update_own
-- ============================================================================
-- MASALAH
--   docs/05_DATABASE_SCHEMA.sql:1304
--     CREATE POLICY "users_update_own" ON users FOR UPDATE
--       USING (auth.uid() = id);
--
--   Tanpa WITH CHECK, Postgres memakai ulang ekspresi USING sebagai WITH CHECK.
--   USING hanya mengunci `id` — BUKAN `role`. Karena `authenticated` memegang
--   privilege UPDATE di kolom role/tier/is_active/share_pct dan tidak ada
--   trigger penjaga, siapa pun yang login bisa menjalankan ini dari devtools:
--
--     supabase.from('users').update({ role: 'super_admin' }).eq('id', <id sendiri>)
--
--   Setelah itu is_owner_level()/is_super_admin() bernilai true untuk dia, jadi
--   SELURUH policy owner-only terbuka secara sah — payments, journal_entries,
--   event_settlements, owner_earnings, bank_accounts, audit_log.
--
--   src/lib/actions/crew.ts:43 sudah memblokir ubah-role-sendiri di level app
--   ("Lu gak bisa ubah role lu sendiri"), tapi DB tidak menegakkannya.
--
-- KENAPA BUKAN REVOKE UPDATE (role, ...) FROM authenticated
--   Privilege kolom melekat pada ROLE database, dan super_admin pun login
--   sebagai `authenticated`. REVOKE akan ikut mematahkan
--   setCrewRole/setCrewActive (crew.ts:52,160) yang sah. Jadi penegakannya
--   dilakukan di policy, bukan di grant kolom.
--
-- CARA KERJA PERBAIKAN
--   Policy permissive di-OR-kan. Untuk UPDATE, baris hasil harus lolos WITH
--   CHECK dari minimal satu policy permissive yang berlaku:
--     • super_admin  → lolos lewat "users_super_admin_all" (WITH CHECK
--                      mewarisi USING = is_super_admin() = true), sehingga
--                      setCrewRole/setCrewActive tetap jalan.
--     • user biasa   → hanya punya "users_update_own", jadi wajib lolos
--                      pengecekan kolom-terproteksi di bawah.
--
--   Perbandingan nilai lama dilakukan lewat helper SECURITY DEFINER. Subquery
--   ke `users` langsung di dalam badan policy `users` akan memicu rekursi RLS;
--   helper SECURITY DEFINER memutus rekursi itu (pola yang sama dipakai
--   current_user_role()).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Helper: apakah kolom terproteksi pada baris BARU masih sama dengan
--    nilai tersimpan? Dipanggil dari WITH CHECK, argumennya adalah nilai BARU.
--    IS NOT DISTINCT FROM dipakai supaya NULL == NULL bernilai true
--    (tier/share_pct/default_fee_override memang nullable).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION users_privileged_cols_unchanged(
  p_id           uuid,
  p_role         user_role,
  p_tier         crew_tier,
  p_is_active    boolean,
  p_share_pct    numeric,
  p_capital      bigint,
  p_fee_override integer
)
RETURNS boolean AS $$
DECLARE
  v_ok boolean;
BEGIN
  SELECT (
        u.role                 IS NOT DISTINCT FROM p_role
    AND u.tier                 IS NOT DISTINCT FROM p_tier
    AND u.is_active            IS NOT DISTINCT FROM p_is_active
    AND u.share_pct            IS NOT DISTINCT FROM p_share_pct
    AND u.capital_contributed  IS NOT DISTINCT FROM p_capital
    AND u.default_fee_override IS NOT DISTINCT FROM p_fee_override
  )
  INTO v_ok
  FROM users u
  WHERE u.id = p_id;

  -- Baris tidak ada → tolak (fail closed).
  RETURN COALESCE(v_ok, false);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION users_privileged_cols_unchanged IS
  'Penjaga WITH CHECK untuk users_update_own: memastikan user biasa tidak bisa '
  'mengubah role/tier/is_active/share_pct/capital/fee_override pada barisnya '
  'sendiri. super_admin melewati jalur policy users_super_admin_all.';

-- ---------------------------------------------------------------------------
-- 2. Ganti policy yang bocor
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "users_update_own" ON users;

CREATE POLICY "users_update_own" ON users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND users_privileged_cols_unchanged(
          id, role, tier, is_active, share_pct,
          capital_contributed, default_fee_override
        )
  );

-- ---------------------------------------------------------------------------
-- 3. Verifikasi — gagalkan migrasi kalau policy tidak terpasang benar
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_check text;
BEGIN
  SELECT with_check INTO v_check
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'users' AND policyname = 'users_update_own';

  IF v_check IS NULL THEN
    RAISE EXCEPTION 'users_update_own masih tanpa WITH CHECK — perbaikan tidak terpasang';
  END IF;

  IF v_check NOT LIKE '%users_privileged_cols_unchanged%' THEN
    RAISE EXCEPTION 'WITH CHECK users_update_own tidak memanggil helper penjaga: %', v_check;
  END IF;

  RAISE NOTICE 'OK: users_update_own kini ber-WITH CHECK → %', v_check;
END $$;
