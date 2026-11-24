-- Extend di hari H (owner 24 Nov 2026): crew melaporkan tambahan jam yang
-- terjadi di lokasi lewat rekap; owner menagihkannya ke klien sebagai add-on
-- "Tambahan Durasi 1 Jam" dengan satu tap. Kolom ini hanya laporan crew —
-- tagihan tetap di event_addons.
ALTER TABLE public.crew_rekap
  ADD COLUMN IF NOT EXISTS extend_jam smallint
  CHECK (extend_jam IS NULL OR extend_jam BETWEEN 0 AND 12);

COMMENT ON COLUMN public.crew_rekap.extend_jam IS
  'Tambahan jam di lokasi yang dilaporkan crew (extend hari H). Ditagihkan owner via add-on Tambahan Durasi.';
