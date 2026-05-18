-- 20260520_frame_size_mapping.sql
-- Frame size → material recipe lookup.
-- Berbeda dari rekap_field_mapping (yang map rekap_field+frame_size → inventory_item).
-- Ini map frame_size → per-print consumption (untuk rate calculation).
--
-- Contoh: 1 print 4R butuh 1 mediaset basic + 1 sleeve.
--         1 print 2R butuh 0.5 mediaset basic + 1 sleeve.
--         1 print Polaroid butuh 1 mediaset perforated + 1 sleeve.
--
-- Pakai untuk:
--   • Validate crew rekap consumption: cetak_total × ratio = expected mediaset_used
--   • Calculate HPP per-print untuk pricing analysis
--   • Anomaly detection: kalau actual usage >> expected, flag untuk review

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mediaset_type') THEN
    CREATE TYPE mediaset_type AS ENUM ('basic', 'perforated');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS frame_size_mapping (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  frame_size frame_size NOT NULL UNIQUE,    -- pakai enum existing dari base schema
  mediaset_type mediaset_type NOT NULL,
  mediaset_per_print NUMERIC(6, 3) NOT NULL, -- e.g., 1.000 atau 0.500
  sleeve_per_print NUMERIC(6, 3) NOT NULL,
  prints_per_mediaset INTEGER NOT NULL,      -- e.g., 700 untuk 4R, 1400 untuk 2R
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT mediaset_ratio_positive CHECK (mediaset_per_print > 0),
  CONSTRAINT sleeve_ratio_positive CHECK (sleeve_per_print > 0),
  CONSTRAINT prints_capacity_positive CHECK (prints_per_mediaset > 0)
);

COMMENT ON TABLE frame_size_mapping IS
  'Frame size → per-print material recipe. 1 row per frame_size enum value.';
COMMENT ON COLUMN frame_size_mapping.mediaset_per_print IS
  'Berapa mediaset di-consume per 1 print. 2R = 0.5 (1 mediaset cetak 2 prints).';
COMMENT ON COLUMN frame_size_mapping.prints_per_mediaset IS
  'Kapasitas total print dari 1 mediaset. 4R = 700, 2R/Polaroid = 1400.';

-- ----------------------------------------------------------------------------
-- Seed data sesuai spec user
-- ----------------------------------------------------------------------------
INSERT INTO frame_size_mapping (frame_size, mediaset_type, mediaset_per_print, sleeve_per_print, prints_per_mediaset, notes) VALUES
  ('4R',       'basic',      1.000, 1.000, 700,  '1 mediaset basic 4R = 700 prints'),
  ('2R',       'basic',      0.500, 1.000, 1400, '1 mediaset basic 2R = 1400 prints (half-cut)'),
  ('polaroid', 'perforated', 1.000, 1.000, 1400, '1 mediaset perforated Polaroid = 1400 prints')
ON CONFLICT (frame_size) DO NOTHING;

-- Frame size 'none' (untuk Videobooth 360 / Magazine Box) deliberate tidak di-seed
-- karena tidak ada cetak fisik.

CREATE TRIGGER trg_frame_size_mapping_updated_at
  BEFORE UPDATE ON frame_size_mapping
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Verification:
--   SELECT frame_size, mediaset_type, mediaset_per_print, sleeve_per_print, prints_per_mediaset
--   FROM frame_size_mapping ORDER BY frame_size;
