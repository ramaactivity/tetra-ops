-- Migration: Phase-2 → Phase-3 legacy import support
-- Date: 2026-05-07
-- Purpose:
--   Add columns to events table that flag rows imported from the old
--   Apps Script v1 system (DB_PROJECTS sheet). is_migrated_legacy=true
--   means past archived event with NO payments/settlement/journal rows;
--   legacy_invoice_number preserves the old invoice id for back-reference.
--
-- Idempotent: safe to re-run.

-- 1) Columns
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS is_migrated_legacy BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS legacy_invoice_number TEXT;

-- 2) Partial indices (most queries filter is_migrated_legacy=false for live KPIs;
--    legacy_invoice_number is sparse, used for back-reference lookups only)
CREATE INDEX IF NOT EXISTS idx_events_live_only
  ON events (is_migrated_legacy)
  WHERE is_migrated_legacy = false;

CREATE INDEX IF NOT EXISTS idx_events_legacy_invoice_number
  ON events (legacy_invoice_number)
  WHERE legacy_invoice_number IS NOT NULL;

-- 3) Documentation
COMMENT ON COLUMN events.is_migrated_legacy IS
  'TRUE = past event imported from Phase-2 (Apps Script v1), archived read-only. Excluded from live KPI (revenue/profit/outstanding). NO related payments / event_settlements / journal_entries / owner_earnings rows exist for these.';

COMMENT ON COLUMN events.legacy_invoice_number IS
  'Original invoice number from Phase-2 (DB_PROJECTS.Invoice_Number). Set for both archived (is_migrated_legacy=true) and imported-live (is_migrated_legacy=false) events. Not unique — rely on project_id UNIQUE for de-dup.';
