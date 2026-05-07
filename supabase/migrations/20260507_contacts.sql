-- Migration: Contacts table + events ↔ contacts links
-- Date: 2026-05-07
-- Purpose:
--   Phase-2 import needs PIC + Booker info preserved (CT-XXX IDs from DB_CONTACTS).
--   This adds a contacts table + foreign keys on events so crew can see
--   nama + WA orang yang harus dihubungi di hari H.
--
-- Note: Addons di DB_PROJECTS legacy semua kosong, jadi belum di-handle di
-- migration ini. Sistem baru sudah punya event_addons table buat addons live.
--
-- Idempotent: safe to re-run.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) Contacts table
-- ─────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contact_type') THEN
    CREATE TYPE contact_type AS ENUM (
      'booker', 'client', 'pic_event', 'vendor', 'other'
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  legacy_contact_id TEXT UNIQUE,
  type contact_type,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contacts_legacy_id
  ON contacts(legacy_contact_id) WHERE legacy_contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_type
  ON contacts(type) WHERE type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_name
  ON contacts(lower(name));

COMMENT ON TABLE contacts IS
  'Master contacts: bookers, clients, PIC event, vendors. legacy_contact_id preserves Phase-2 CT-XXX reference.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2) Events ↔ contacts foreign keys
--    pic_name & pic_wa already exist on events (free-text fallback);
--    we add UUID FKs that resolve via the importer.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS booker_contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS pic_contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_events_booker_contact_id
  ON events(booker_contact_id) WHERE booker_contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_pic_contact_id
  ON events(pic_contact_id) WHERE pic_contact_id IS NOT NULL;

COMMENT ON COLUMN events.booker_contact_id IS
  'FK ke contacts. Booker = orang yang booking event (vendor/WO/klien). Diresolve dari Booker_Contact_ID di DB_PROJECTS legacy import.';

COMMENT ON COLUMN events.pic_contact_id IS
  'FK ke contacts. PIC Event = penanggung jawab di lapangan saat hari H. Crew akan kontak orang ini. Diresolve dari PIC_Contact_ID di DB_PROJECTS legacy import.';

