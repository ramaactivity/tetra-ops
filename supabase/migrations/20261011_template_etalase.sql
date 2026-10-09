-- 20261011_template_etalase.sql
-- Template frame: Booth = studio, Ops = etalase (keputusan owner 2026-10-09,
-- papan OPS-BOOTH-SYNC). Template dari Booth ditarik lewat GET /api/ops/templates;
-- template manual (PNG dengan teks bawaan) tetap didukung. Klien boleh unggah
-- desainnya sendiri (mode 'upload'). Idempotent & aditif.

ALTER TABLE design_templates
	ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
	ADD COLUMN IF NOT EXISTS booth_layout_version int,
	ADD COLUMN IF NOT EXISTS text_mode text NOT NULL DEFAULT 'baked',
	ADD COLUMN IF NOT EXISTS text_fields text[] NOT NULL DEFAULT '{}',
	ADD COLUMN IF NOT EXISTS preview_url text,
	ADD COLUMN IF NOT EXISTS slot_count int,
	ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false,
	ADD COLUMN IF NOT EXISTS booth_archived boolean NOT NULL DEFAULT false,
	ADD COLUMN IF NOT EXISTS synced_at timestamptz,
	ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE design_templates ALTER COLUMN preview_path DROP NOT NULL;

DO $$ BEGIN
	ALTER TABLE design_templates ADD CONSTRAINT design_templates_source_check
		CHECK (source IN ('manual', 'booth'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
	ALTER TABLE design_templates ADD CONSTRAINT design_templates_text_mode_check
		CHECK (text_mode IN ('native', 'baked'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
	ALTER TABLE design_templates ADD CONSTRAINT design_templates_preview_check
		CHECK (preview_path IS NOT NULL OR preview_url IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS design_templates_booth_layout_uidx
	ON design_templates (booth_layout_id) WHERE source = 'booth';

-- Mode desain: template | custom (dibuatkan designer) | upload (desain klien sendiri).
ALTER TABLE design_requests DROP CONSTRAINT IF EXISTS design_requests_mode_check;
ALTER TABLE design_requests ADD CONSTRAINT design_requests_mode_check
	CHECK (mode IN ('template', 'custom', 'upload'));

-- Versi yang diunggah klien sendiri.
ALTER TABLE design_versions
	ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'designer',
	ADD COLUMN IF NOT EXISTS uploaded_by_person uuid REFERENCES portal_people(id),
	ADD COLUMN IF NOT EXISTS slot_count int;
DO $$ BEGIN
	ALTER TABLE design_versions ADD CONSTRAINT design_versions_source_check
		CHECK (source IN ('designer', 'klien'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
