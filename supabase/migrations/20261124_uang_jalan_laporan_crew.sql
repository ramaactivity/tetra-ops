-- Uang jalan dari laporan crew (owner 24 Nov 2026): crew melapor per pemberi
-- (owner, jumlah, cara, tanggal, bukti) dan laporannya langsung dicatat ke buku
-- uang jalan. Owner cukup melengkapi bukti / mencatat manual kalau crew lupa.
ALTER TABLE crew_rekap
	ADD COLUMN IF NOT EXISTS uj_rincian jsonb;

COMMENT ON COLUMN crew_rekap.uj_rincian IS
	'[{owner_id, amount, method tunai|transfer, tanggal YYYY-MM-DD, bukti_url}] — rincian uang jalan diterima per pemberi; uj_terima = jumlahnya.';

ALTER TABLE uang_jalan
	ADD COLUMN IF NOT EXISTS dari_laporan boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN uang_jalan.dari_laporan IS
	'true = dicatat otomatis dari laporan crew di rekap (bukan input owner).';
