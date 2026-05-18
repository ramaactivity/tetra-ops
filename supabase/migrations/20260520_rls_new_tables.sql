-- 20260520_rls_new_tables.sql
-- RLS policies untuk tabel baru di refactor pass.
-- Pakai helper existing: is_owner_level(), is_super_admin(), current_user_role().
--
-- Pattern (sama dengan tabel existing):
--   • Owner-level (super_admin + owner) bisa read all + write all.
--   • Crew bisa read only data terkait event mereka.
--   • Anon TIDAK bisa apa-apa.
--
-- Idempotent — DROP POLICY IF EXISTS lalu CREATE.

-- ============================================================================
-- 1. event_recap_proofs
-- ============================================================================

ALTER TABLE event_recap_proofs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_recap_proofs_read" ON event_recap_proofs;
CREATE POLICY "event_recap_proofs_read" ON event_recap_proofs
  FOR SELECT
  USING (
    is_owner_level()
    OR uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM crew_assignments ca
      JOIN crew_rekap cr ON cr.id = event_recap_proofs.recap_id
      WHERE ca.event_id = cr.event_id AND ca.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "event_recap_proofs_write_crew" ON event_recap_proofs;
CREATE POLICY "event_recap_proofs_write_crew" ON event_recap_proofs
  FOR INSERT
  WITH CHECK (
    is_owner_level()
    OR EXISTS (
      SELECT 1 FROM crew_assignments ca
      JOIN crew_rekap cr ON cr.id = event_recap_proofs.recap_id
      WHERE ca.event_id = cr.event_id AND ca.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "event_recap_proofs_update_own" ON event_recap_proofs;
CREATE POLICY "event_recap_proofs_update_own" ON event_recap_proofs
  FOR UPDATE
  USING (is_owner_level() OR uploaded_by = auth.uid());

DROP POLICY IF EXISTS "event_recap_proofs_delete_owner" ON event_recap_proofs;
CREATE POLICY "event_recap_proofs_delete_owner" ON event_recap_proofs
  FOR DELETE
  USING (is_owner_level());

-- ============================================================================
-- 2. event_recap_misc_expenses
-- ============================================================================

ALTER TABLE event_recap_misc_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_recap_misc_read" ON event_recap_misc_expenses;
CREATE POLICY "event_recap_misc_read" ON event_recap_misc_expenses
  FOR SELECT
  USING (
    is_owner_level()
    OR EXISTS (
      SELECT 1 FROM crew_assignments ca
      JOIN crew_rekap cr ON cr.id = event_recap_misc_expenses.recap_id
      WHERE ca.event_id = cr.event_id AND ca.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "event_recap_misc_write_crew" ON event_recap_misc_expenses;
CREATE POLICY "event_recap_misc_write_crew" ON event_recap_misc_expenses
  FOR INSERT
  WITH CHECK (
    is_owner_level()
    OR EXISTS (
      SELECT 1 FROM crew_assignments ca
      JOIN crew_rekap cr ON cr.id = event_recap_misc_expenses.recap_id
      WHERE ca.event_id = cr.event_id AND ca.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "event_recap_misc_update_owner" ON event_recap_misc_expenses;
CREATE POLICY "event_recap_misc_update_owner" ON event_recap_misc_expenses
  FOR UPDATE
  USING (is_owner_level());

DROP POLICY IF EXISTS "event_recap_misc_delete_owner" ON event_recap_misc_expenses;
CREATE POLICY "event_recap_misc_delete_owner" ON event_recap_misc_expenses
  FOR DELETE
  USING (is_owner_level());

-- ============================================================================
-- 3. frame_size_mapping (config; owner read, super_admin write)
-- ============================================================================

ALTER TABLE frame_size_mapping ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "frame_size_mapping_read" ON frame_size_mapping;
CREATE POLICY "frame_size_mapping_read" ON frame_size_mapping
  FOR SELECT
  USING (auth.uid() IS NOT NULL);  -- semua authenticated bisa read (untuk reference)

DROP POLICY IF EXISTS "frame_size_mapping_write_super_admin" ON frame_size_mapping;
CREATE POLICY "frame_size_mapping_write_super_admin" ON frame_size_mapping
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- ============================================================================
-- 4. package_items_mapping (config; owner read+write, super_admin full)
-- ============================================================================

ALTER TABLE package_items_mapping ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "package_items_mapping_read" ON package_items_mapping;
CREATE POLICY "package_items_mapping_read" ON package_items_mapping
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "package_items_mapping_write_owner" ON package_items_mapping;
CREATE POLICY "package_items_mapping_write_owner" ON package_items_mapping
  FOR ALL
  USING (is_owner_level())
  WITH CHECK (is_owner_level());

-- ============================================================================
-- 5. Verification
-- ============================================================================
-- Query: list policies pada tabel-tabel baru.
--   SELECT tablename, policyname, cmd, qual
--   FROM pg_policies
--   WHERE tablename IN ('event_recap_proofs', 'event_recap_misc_expenses',
--                       'frame_size_mapping', 'package_items_mapping')
--   ORDER BY tablename, policyname;
--
-- Sanity-check RLS on:
--   SELECT relname, relrowsecurity FROM pg_class
--   WHERE relname IN ('event_recap_proofs', 'event_recap_misc_expenses',
--                     'frame_size_mapping', 'package_items_mapping');
--   -- relrowsecurity should be 't' for all.
