-- 20261011b_crew_briefings.sql
-- Briefing crew otomatis ke grup WA "Tetra Crew" (send-grup-crew). Satu baris
-- per (event, jenis) = kunci idempoten: cron jalan dua kali tidak mengirim dobel.
-- Owner-only baca; tulis lewat server. Idempotent.
CREATE TABLE IF NOT EXISTS crew_briefings (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
	kind text NOT NULL CHECK (kind IN ('h1', 'hari_h')),
	command_id uuid,
	sent_at timestamptz NOT NULL DEFAULT now(),
	UNIQUE (event_id, kind)
);
ALTER TABLE crew_briefings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crew_briefings_owner_select ON crew_briefings;
CREATE POLICY crew_briefings_owner_select ON crew_briefings FOR SELECT USING (is_owner_level());
