-- Migration: Add foreign key constraint events.event_category → event_types.code
-- Date: 2026-05-07
-- Purpose:
--   The original schema declared events.event_category as TEXT NOT NULL with
--   no FK to event_types. Supabase PostgREST resolves nested selects via
--   foreign keys, so queries like `event_type:event_types(label)` were
--   failing with "Could not find a relationship between events and event_types
--   in the schema cache".
--
--   This migration:
--   1) Backfills any orphan event.event_category values (set to 'event' fallback)
--   2) Adds the FK constraint so future PostgREST joins work
--
--   App code already has a fallback (Map-based lookup in JS), so this
--   migration is OPTIONAL — apply it for cleaner Supabase queries, but
--   the app works without it.
--
-- Idempotent: safe to re-run.

-- 1) Repair: set any event.event_category that doesn't match an event_types
--    row to 'event' (the catch-all generic type that's always seeded).
UPDATE events
SET event_category = 'event'
WHERE event_category NOT IN (SELECT code FROM event_types);

-- 2) Add FK only if it doesn't already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'events_event_category_fkey'
      AND conrelid = 'events'::regclass
  ) THEN
    ALTER TABLE events
      ADD CONSTRAINT events_event_category_fkey
      FOREIGN KEY (event_category) REFERENCES event_types(code) ON UPDATE CASCADE;
  END IF;
END$$;

COMMENT ON CONSTRAINT events_event_category_fkey ON events IS
  'Resolves the events.event_category text column to event_types.code so PostgREST nested selects work.';
