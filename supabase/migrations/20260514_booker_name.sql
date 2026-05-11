-- 20260514_booker_name.sql
-- Add booker_name to events. Separate from client_name (which is the
-- event subject — e.g. bride+groom, celebrant, company event). Booker
-- adalah orang yang booking — bisa sama dengan klien (pengantin
-- langsung) atau berbeda (kakak pengantin, EO, panitia, dll).
-- Idempotent.

ALTER TABLE events
	ADD COLUMN IF NOT EXISTS booker_name TEXT;

COMMENT ON COLUMN events.booker_name IS
	'Nama orang yang booking (separate dari client_name yang merupakan event subject). Bisa sama dengan client_name, bisa berbeda — biasanya beda ketika kakak pengantin / EO yang booking. WA-nya tetap di client_wa (primary contact).';
