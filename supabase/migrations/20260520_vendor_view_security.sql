-- Migration: Fix vendor_summary_v PostgREST exposure
-- Date: 2026-05-20
-- Purpose: The previous migration created the view but didn't set
--   security_invoker = true + grant SELECT to PostgREST roles. In
--   Postgres 15+ views default to running as owner (postgres) which
--   bypasses RLS — fine for direct DB queries via service_role, but
--   PostgREST refuses to expose views without explicit grants to the
--   user-facing roles (authenticated/anon). Result: /settings/vendors
--   page fails with masked "Server Components render" error in prod.
--
-- Fix: set security_invoker so the view respects caller's RLS
-- (contacts already has authenticated-can-read policy from 20260507),
-- then grant SELECT to the PostgREST roles.
--
-- Idempotent.

ALTER VIEW vendor_summary_v SET (security_invoker = true);

GRANT SELECT ON vendor_summary_v TO authenticated;
GRANT SELECT ON vendor_summary_v TO anon;

COMMENT ON VIEW vendor_summary_v IS
	'Per-vendor aggregate: event count YTD, commission YTD, gross revenue. Used by /settings/vendors list page. security_invoker = true so RLS on underlying contacts + events applies to the caller, not the view owner.';
