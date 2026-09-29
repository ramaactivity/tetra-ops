-- 20260930b_event_crew_spot.sql
-- Roster crew per event + spot_no (event multi-unit: crew tahu rekan satu
-- spot). Sama dengan 20260617 kecuali kolom spot_no. Idempotent.
DROP FUNCTION IF EXISTS get_event_crew(uuid);
CREATE OR REPLACE FUNCTION get_event_crew(p_event_id uuid)
RETURNS TABLE (
  user_id uuid,
  full_name text,
  avatar_url text,
  tier text,
  role_in_event text,
  spot_no integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT u.id, u.full_name, u.avatar_url, u.tier::text, ca.role_in_event::text, ca.spot_no
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
    ca.spot_no,
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
