-- Kembalikan sisa uang jalan dari sisi crew (owner 24 Nov 2026): crew mengisi
-- ke owner siapa, jumlah, tanggal (cara & bukti sudah ada), lalu langsung
-- dibukukan sebagai uang_jalan kind 'kembali' (dari_laporan = true).
ALTER TABLE crew_rekap
	ADD COLUMN IF NOT EXISTS uj_kembali_owner uuid REFERENCES users(id),
	ADD COLUMN IF NOT EXISTS uj_kembali_jumlah numeric(14,2),
	ADD COLUMN IF NOT EXISTS uj_kembali_tanggal date;
