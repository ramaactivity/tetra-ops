-- 20260521_install_admin_exec_sql.sql
-- ============================================================================
-- BOOTSTRAP MIGRATION — Install admin_exec_sql() RPC untuk programmatic DDL
-- ============================================================================
--
-- Tujuan:
--   Beri kemampuan Claude / dev tooling untuk apply migration via supabase-js
--   tanpa harus copy-paste manual ke SQL editor.
--
-- Cara kerja:
--   • Function admin_exec_sql(p_sql TEXT) accept arbitrary SQL statement
--   • SECURITY DEFINER → run as postgres superuser → bisa execute DDL apa pun
--   • Restricted to service_role only (via GRANT/REVOKE)
--   • Every call audit-logged ke audit_log table
--   • Returns JSONB: {ok: boolean, duration_ms?, error?, sqlstate?}
--
-- Keamanan:
--   • Function HANYA bisa di-call lewat service_role key (NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY)
--   • anon dan authenticated role TIDAK punya EXECUTE permission
--   • Service role key sudah di-treat sensitive di .env.local (gitignored)
--   • Setiap call di-record di audit_log dengan timestamp + SQL preview (500 char)
--   • Kalau service role key bocor: attacker bisa run DDL apa pun (sama dampaknya
--     dengan kalau Supabase Studio password bocor). Mitigasi: jaga key, rotate
--     periodik di Supabase Dashboard → Settings → API.
--
-- Setelah install:
--   Future migration apply via:
--     npx tsx --env-file=.env.local --no-warnings scripts/apply-migration.ts <file.sql>
--
-- Idempotent — CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION admin_exec_sql(p_sql TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_started TIMESTAMPTZ := NOW();
  v_duration_ms NUMERIC;
BEGIN
  -- Audit log: every exec_sql call (truncated SQL preview)
  -- Note: actor_id NULL karena dipanggil via service_role (bukan user session)
  INSERT INTO audit_log (entity_type, entity_id, action, changes, actor_id)
  VALUES (
    'admin_exec_sql',
    NULL,
    'execute',
    jsonb_build_object(
      'sql_preview', LEFT(p_sql, 500),
      'sql_length', length(p_sql),
      'started_at', v_started
    ),
    NULL
  );

  -- Execute the DDL/DML
  EXECUTE p_sql;

  v_duration_ms := EXTRACT(EPOCH FROM (NOW() - v_started)) * 1000;

  RETURN jsonb_build_object(
    'ok', true,
    'duration_ms', v_duration_ms
  );
EXCEPTION WHEN OTHERS THEN
  -- Audit log: failure
  INSERT INTO audit_log (entity_type, entity_id, action, changes, actor_id)
  VALUES (
    'admin_exec_sql',
    NULL,
    'execute_failed',
    jsonb_build_object(
      'sql_preview', LEFT(p_sql, 500),
      'error', SQLERRM,
      'sqlstate', SQLSTATE
    ),
    NULL
  );
  RETURN jsonb_build_object(
    'ok', false,
    'error', SQLERRM,
    'sqlstate', SQLSTATE
  );
END;
$$;

-- Restrict permission: ONLY service role can execute
REVOKE EXECUTE ON FUNCTION admin_exec_sql(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin_exec_sql(TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_exec_sql(TEXT) TO service_role;

COMMENT ON FUNCTION admin_exec_sql(TEXT) IS
  'Service-role-only DDL/DML execution gateway. Used by scripts/apply-migration.ts. Every call audit-logged.';

-- ============================================================================
-- Verification (run manually setelah apply):
-- ============================================================================
-- SELECT proname, prosecdef, proacl
-- FROM pg_proc WHERE proname = 'admin_exec_sql';
-- Expected: prosecdef=true, proacl includes service_role=X
