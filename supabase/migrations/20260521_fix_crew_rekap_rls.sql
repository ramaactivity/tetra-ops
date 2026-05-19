-- 20260521_fix_crew_rekap_rls.sql
--
-- Fix: "new row violates row-level security policy for table 'crew_rekap'"
-- saat owner (role='owner' / 'super_admin') submit rekap retroaktif untuk event
-- yang crew belum submit.
--
-- Akar masalah:
--   Policy lama `crew_rekap_write_crew` (FOR INSERT) di base schema (docs/05_DATABASE_SCHEMA.sql
--   line 1390-1395) HANYA allow user yang ada di crew_assignments untuk event tersebut.
--   Owner BUKAN crew, jadi `auth.uid() IN (SELECT user_id FROM crew_assignments WHERE ...)`
--   selalu false untuk owner → INSERT denied.
--
--   Inkonsistensi: SELECT (`crew_rekap_read`) dan UPDATE (`crew_rekap_update_owner`)
--   keduanya include `is_owner_level()` OR clause. Tapi INSERT TIDAK. Itu celahnya.
--
-- Fix:
--   1. DROP policy lama yang restrictive (write_crew + update_owner)
--   2. CREATE INSERT policy baru: owner-level OR assigned crew
--   3. CREATE UPDATE policy baru: (owner OR submitter) AND NOT locked
--      → adds defense-in-depth lock guard. App-code sudah check, RLS jadi
--        layer kedua. settle_event/reopen_settlement RPC pakai SECURITY DEFINER
--        jadi bypass RLS (tidak terimpacted).
--   4. CREATE DELETE policy: owner-level AND NOT locked (sebelumnya tidak ada
--      explicit DELETE policy — default deny tapi explicit lebih jelas).
--
-- Idempotent — DROP POLICY IF EXISTS lalu CREATE.
-- Backward compatible — crew flow tidak berubah, hanya owner path ditambah.

-- ============================================================================
-- crew_rekap
-- ============================================================================

DROP POLICY IF EXISTS "crew_rekap_write_crew" ON crew_rekap;
DROP POLICY IF EXISTS "crew_rekap_update_owner" ON crew_rekap;
-- Defensive: drop new names too in case of re-run
DROP POLICY IF EXISTS "crew_rekap_insert" ON crew_rekap;
DROP POLICY IF EXISTS "crew_rekap_update" ON crew_rekap;
DROP POLICY IF EXISTS "crew_rekap_delete" ON crew_rekap;

-- INSERT — owner-level OR assigned crew (FIXES THE BUG)
CREATE POLICY "crew_rekap_insert" ON crew_rekap FOR INSERT
  WITH CHECK (
    is_owner_level()
    OR auth.uid() IN (
      SELECT user_id FROM crew_assignments WHERE event_id = crew_rekap.event_id
    )
  );

-- UPDATE — owner OR submitter, BUT not if locked (defense-in-depth)
-- App code di crew-fees.ts:118-122 sudah check locked; this is RLS-level guard.
-- settle_event / reopen_settlement RPC pakai SECURITY DEFINER → bypass RLS.
CREATE POLICY "crew_rekap_update" ON crew_rekap FOR UPDATE
  USING (
    (is_owner_level() OR submitted_by = auth.uid())
    AND COALESCE(locked, false) = false
  )
  WITH CHECK (
    (is_owner_level() OR submitted_by = auth.uid())
    AND COALESCE(locked, false) = false
  );

-- DELETE — owner-level only, AND not locked
CREATE POLICY "crew_rekap_delete" ON crew_rekap FOR DELETE
  USING (
    is_owner_level()
    AND COALESCE(locked, false) = false
  );

-- SELECT — keep existing (already includes is_owner_level)
-- crew_rekap_read tidak di-drop karena sudah benar dari base schema.

COMMENT ON POLICY "crew_rekap_insert" ON crew_rekap IS
  'Owner-level can insert retroactively; assigned crew can submit normally.';
COMMENT ON POLICY "crew_rekap_update" ON crew_rekap IS
  'Owner or original submitter can update WHILE NOT locked. Settled rekaps require reopen_settlement first.';
COMMENT ON POLICY "crew_rekap_delete" ON crew_rekap IS
  'Owner-level can delete WHILE NOT locked.';

-- ============================================================================
-- Verification queries (post-apply, untuk reference manual via SQL Editor)
-- ============================================================================
-- SELECT policyname, cmd, qual::text AS using_expr, with_check::text AS check_expr
-- FROM pg_policies WHERE schemaname='public' AND tablename='crew_rekap'
-- ORDER BY policyname;
--
-- Expected 4 policies post-migration:
--   crew_rekap_read    | SELECT | (existing)
--   crew_rekap_insert  | INSERT | NEW
--   crew_rekap_update  | UPDATE | NEW
--   crew_rekap_delete  | DELETE | NEW
