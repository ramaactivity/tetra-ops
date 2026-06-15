-- 20260615_get_event_crew.sql
--
-- Crew event-detail page wants to show WHO they work with (partner names),
-- not just roles. The embed `crew_assignments → users(full_name)` returns NULL
-- for co-workers because the `users_read_own` RLS policy only allows a user to
-- read their OWN row (auth.uid() = id OR is_owner_level()). Opening `users` to
-- co-assigned peers via RLS would also expose email / phone_wa / bank_account —
-- not acceptable.
--
-- Fix: a SECURITY DEFINER function that returns ONLY safe columns
-- (id, full_name, tier, role_in_event) for the crew of one event, callable
-- only by someone assigned to that event (or owner-level). Bypasses RLS on
-- `users` internally but exposes nothing sensitive.
--
-- Idempotent — CREATE OR REPLACE + explicit GRANT/REVOKE.

CREATE OR REPLACE FUNCTION get_event_crew(p_event_id uuid)
RETURNS TABLE (
  user_id uuid,
  full_name text,
  tier text,
  role_in_event text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT u.id, u.full_name, u.tier::text, ca.role_in_event::text
  FROM crew_assignments ca
  JOIN users u ON u.id = ca.user_id
  WHERE ca.event_id = p_event_id
    AND (
      is_owner_level()
      OR EXISTS (
        SELECT 1 FROM crew_assignments self
        WHERE self.event_id = p_event_id
          AND self.user_id = auth.uid()
      )
    )
  ORDER BY
    CASE ca.role_in_event
      WHEN 'lead' THEN 0
      WHEN 'asisten' THEN 1
      WHEN 'crew_c' THEN 2
      ELSE 3
    END,
    u.full_name;
$$;

REVOKE ALL ON FUNCTION get_event_crew(uuid) FROM public;
GRANT EXECUTE ON FUNCTION get_event_crew(uuid) TO authenticated;

COMMENT ON FUNCTION get_event_crew(uuid) IS
  'Returns safe crew roster (id, full_name, tier, role_in_event) for one event. '
  'Callable only by assigned crew or owner-level. SECURITY DEFINER so peers see '
  'each other''s names without opening the users table (email/phone) via RLS.';
