-- 20261007b_portal_design.sql
-- Fase 3 portal: modul desain frame (DR-031, rencana docs/RENCANA-BOOKING-PORTAL.md,
-- kontrak Booth §2.2–2.3). Jalur utama: designer mendesain di Canva/Photoshop,
-- upload PNG overlay ke Ops → klien review (komentar / minta revisi / ACC) →
-- Booth mengimpor PNG yang di-ACC. Tahap rinci di sini diringkas ke
-- events.design_status (belum/proses/approved) supaya Design Hub & bot tetap jalan.
-- File di bucket privat portal-private (DR-030).
-- RLS: owner-only baca lewat app; portal menulis lewat server. Idempotent & aditif.

CREATE TABLE IF NOT EXISTS design_templates (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	name text NOT NULL,
	category text, -- tema bebas, mis. "Wedding", "Minimalis"
	frame_size text NOT NULL CHECK (frame_size IN ('2R', '4R', 'polaroid')),
	orientation text NOT NULL DEFAULT 'portrait' CHECK (orientation IN ('portrait', 'landscape')),
	preview_path text NOT NULL,
	booth_layout_id uuid, -- opsional: template editor Booth (uuid layouts)
	booth_preset_id text, -- opsional: PresetId Booth
	is_active boolean NOT NULL DEFAULT true,
	sort int NOT NULL DEFAULT 0,
	created_at timestamptz NOT NULL DEFAULT now()
);

-- Satu permintaan desain per event per spot. Spot ≥2 hanya kalau ukurannya beda
-- dari spot 1 (spotsNeedingOwnDesign); spot_no tidak pernah dinomori ulang
-- (kunci idempotensi Booth, kontrak §2.2).
CREATE TABLE IF NOT EXISTS design_requests (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	booking_id uuid NOT NULL REFERENCES client_bookings(id) ON DELETE CASCADE,
	event_id uuid NOT NULL REFERENCES events(id),
	spot_no int NOT NULL DEFAULT 1 CHECK (spot_no BETWEEN 1 AND 3),
	mode text CHECK (mode IN ('template', 'custom')),
	template_id uuid REFERENCES design_templates(id),
	brief jsonb NOT NULL DEFAULT '{}'::jsonb,
	stage text NOT NULL DEFAULT 'brief'
		CHECK (stage IN ('brief', 'dikerjakan', 'menunggu_review', 'revisi', 'acc')),
	designer_user_id uuid REFERENCES users(id),
	revision_count int NOT NULL DEFAULT 0,
	approved_version_id uuid,
	brief_submitted_at timestamptz,
	approved_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	UNIQUE (event_id, spot_no)
);
CREATE INDEX IF NOT EXISTS design_requests_stage_idx ON design_requests (stage, updated_at);

CREATE TABLE IF NOT EXISTS design_files (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	request_id uuid NOT NULL REFERENCES design_requests(id) ON DELETE CASCADE,
	kind text NOT NULL CHECK (kind IN ('referensi', 'logo')),
	path text NOT NULL,
	file_name text,
	uploaded_by uuid REFERENCES portal_people(id),
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS design_versions (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	request_id uuid NOT NULL REFERENCES design_requests(id) ON DELETE CASCADE,
	version_no int NOT NULL,
	file_path text NOT NULL,
	frame_size text NOT NULL CHECK (frame_size IN ('2R', '4R', 'polaroid')),
	orientation text NOT NULL CHECK (orientation IN ('portrait', 'landscape')),
	width int NOT NULL,
	height int NOT NULL,
	has_transparency boolean,
	booth_layout_id uuid,
	note text,
	uploaded_by uuid REFERENCES users(id),
	created_at timestamptz NOT NULL DEFAULT now(),
	UNIQUE (request_id, version_no)
);

DO $$ BEGIN
	ALTER TABLE design_requests ADD CONSTRAINT design_requests_approved_version_fkey
		FOREIGN KEY (approved_version_id) REFERENCES design_versions(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS design_comments (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	request_id uuid NOT NULL REFERENCES design_requests(id) ON DELETE CASCADE,
	version_id uuid REFERENCES design_versions(id) ON DELETE CASCADE,
	author_person uuid REFERENCES portal_people(id),
	author_user uuid REFERENCES users(id),
	body text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
	is_revision_request boolean NOT NULL DEFAULT false,
	created_at timestamptz NOT NULL DEFAULT now(),
	CHECK ((author_person IS NULL) <> (author_user IS NULL))
);
CREATE INDEX IF NOT EXISTS design_comments_request_idx ON design_comments (request_id, created_at);

DROP TRIGGER IF EXISTS design_requests_updated_at ON design_requests;
CREATE TRIGGER design_requests_updated_at BEFORE UPDATE ON design_requests
	FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DO $$
DECLARE t text;
BEGIN
	FOREACH t IN ARRAY ARRAY['design_templates', 'design_requests', 'design_files', 'design_versions', 'design_comments'] LOOP
		EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
		EXECUTE format('DROP POLICY IF EXISTS %I_owner_select ON %I', t, t);
		EXECUTE format('CREATE POLICY %I_owner_select ON %I FOR SELECT USING (is_owner_level())', t, t);
	END LOOP;
END $$;
