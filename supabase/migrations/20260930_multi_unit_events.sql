-- 20260930_multi_unit_events.sql
-- Event multi-unit (Rama, 30 Sep 2026): satu event bisa memakai 2–3 unit
-- photobooth sekaligus = 2–3 SPOT di lokasi yang sama.
--   events.unit_count      jumlah unit/spot (1 = normal). base_price = TOTAL
--                          semua unit (harga paket × unit), jadi grand total,
--                          billing & settle tidak perlu berubah.
--   events.spots           override per spot ≥2: [{spot, frame_size, backdrop_id}]
--                          (spot 1 = kolom event biasa). Ukuran & backdrop
--                          boleh beda per spot.
--   crew_assignments.spot_no  crew bertugas di spot mana (default 1).
--   backdrops.stock_qty    jumlah pcs fisik tiap backdrop (atur di master
--                          backdrop) — 2 spot boleh warna sama kalau pcs ≥ 2.
--   crew_rekap.spot_cetak  rincian opsional cetak per spot {"1": n, "2": m}.
-- Idempotent.
ALTER TABLE events
	ADD COLUMN IF NOT EXISTS unit_count integer NOT NULL DEFAULT 1,
	ADD COLUMN IF NOT EXISTS spots jsonb NOT NULL DEFAULT '[]'::jsonb;
DO $$ BEGIN
	ALTER TABLE events ADD CONSTRAINT events_unit_count_check CHECK (unit_count BETWEEN 1 AND 3);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE crew_assignments
	ADD COLUMN IF NOT EXISTS spot_no integer NOT NULL DEFAULT 1;

ALTER TABLE backdrops
	ADD COLUMN IF NOT EXISTS stock_qty integer NOT NULL DEFAULT 1;

ALTER TABLE crew_rekap
	ADD COLUMN IF NOT EXISTS spot_cetak jsonb;
