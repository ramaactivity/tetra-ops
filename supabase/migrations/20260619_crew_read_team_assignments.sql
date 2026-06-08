-- 20260619_crew_read_team_assignments.sql
-- Let crew see their TEAMMATES on an event (not just their own assignment).
--
-- The existing policy `crew_assignments_read` = (is_owner_level() OR
-- user_id = auth.uid()) means a crew member can only read their own row, so the
-- "Crew partner" card on the crew app was always empty. Add a second permissive
-- SELECT policy: read any assignment for an event the current user is also
-- assigned to. A SECURITY DEFINER helper avoids RLS self-recursion on
-- crew_assignments.

CREATE OR REPLACE FUNCTION my_crew_event_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT event_id FROM crew_assignments WHERE user_id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION my_crew_event_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION my_crew_event_ids() TO authenticated;

DROP POLICY IF EXISTS "crew_assignments_read_team" ON crew_assignments;
CREATE POLICY "crew_assignments_read_team" ON crew_assignments FOR SELECT
  USING (event_id IN (SELECT my_crew_event_ids()));
