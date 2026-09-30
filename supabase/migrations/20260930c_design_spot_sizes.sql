-- Event multi-unit: ACC desain per spot.
-- design_frame_size tetap = ukuran file desain spot 1. Spot ≥2 yang ukurannya
-- beda dari spot 1 butuh file desain sendiri; ukurannya dinyatakan desainer
-- saat ACC dan disimpan di sini: {"2": "2R", "3": "polaroid"}.
-- Dicabut (NULL) bersama design_frame_size saat status desain turun dari approved.
ALTER TABLE events ADD COLUMN IF NOT EXISTS design_spot_sizes jsonb;

COMMENT ON COLUMN events.design_spot_sizes IS
  'Ukuran file desain per spot ≥2 yang beda ukuran dari spot 1, dinyatakan saat ACC. {"2":"2R"}';
