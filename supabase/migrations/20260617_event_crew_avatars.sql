-- 20260617_event_crew_avatars.sql
--
-- Adopt the reference's crew-avatar UI. Two needs:
--   1. get_event_crew(event_id) should also return avatar_url (single event detail).
--   2. A batched get_events_crew(event_ids[]) so list/agenda screens can show a
--      crew AvatarGroup per card in ONE round-trip (instead of N RPC calls).
--
-- Both are SECURITY DEFINER (crew can't read peers' users rows under RLS) and
-- expose ONLY safe columns: id, full_name, avatar_url, tier, role_in_event.
-- Caller must be assigned to the event (or owner-level). Idempotent.

-- Drop first — adding avatar_url changes the return type (CREATE OR REPLACE
-- can't alter an existing function's signature).
DROP FUNCTION IF EXISTS get_event_crew(uuid);
DROP FUNCTION IF EXISTS get_events_crew(uuid[]);

-- 1) Single-event roster + avatar_url
CREATE OR REPLACE FUNCTION get_event_crew(p_event_id uuid)
RETURNS TABLE (
  user_id uuid,
  full_name text,
  avatar_url text,
  tier text,
  role_in_event text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT u.id, u.full_name, u.avatar_url, u.tier::text, ca.role_in_event::text
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

-- 2) Batched roster for a set of events (one call for a whole list/agenda)
CREATE OR REPLACE FUNCTION get_events_crew(p_event_ids uuid[])
RETURNS TABLE (
  event_id uuid,
  user_id uuid,
  full_name text,
  avatar_url text,
  tier text,
  role_in_event text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT ca.event_id, u.id, u.full_name, u.avatar_url, u.tier::text,
         ca.role_in_event::text
  FROM crew_assignments ca
  JOIN users u ON u.id = ca.user_id
  WHERE ca.event_id = ANY(p_event_ids)
    AND (
      is_owner_level()
      OR EXISTS (
        SELECT 1 FROM crew_assignments self
        WHERE self.event_id = ca.event_id
          AND self.user_id = auth.uid()
      )
    )
  ORDER BY
    ca.event_id,
    CASE ca.role_in_event
      WHEN 'lead' THEN 0
      WHEN 'asisten' THEN 1
      WHEN 'crew_c' THEN 2
      ELSE 3
    END,
    u.full_name;
$$;

REVOKE ALL ON FUNCTION get_events_crew(uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION get_events_crew(uuid[]) TO authenticated;

COMMENT ON FUNCTION get_events_crew(uuid[]) IS
  'Batched safe crew roster (event_id, id, full_name, avatar_url, tier, role) '
  'for many events. Each event filtered to assigned crew or owner-level. Lets '
  'list/agenda screens render crew avatars in one round-trip.';
