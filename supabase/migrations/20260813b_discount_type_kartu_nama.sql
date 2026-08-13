-- ============================================================================
-- 20260813b_discount_type_kartu_nama.sql
--
-- Tipe diskon baru: `kartu_nama`.
--
-- Di kartu nama Tetra tercetak "dapatkan diskon 10%, hubungi admin". Jadi ada
-- klien yang datang karena melihat booth Tetra di acara orang lain, mengambil
-- kartu namanya, lalu menagih diskon itu saat booking. Selama ini owner
-- terpaksa mencatatnya sebagai "promo" atau "relasi" — padahal asal-usulnya
-- beda dan justru yang paling berguna diukur: itu bukti booth kita sendiri
-- menghasilkan booking baru.
--
-- CHECK constraint lama harus dibongkar dulu (Postgres tidak bisa menambah
-- nilai ke CHECK yang sudah ada). Nama constraint bawaan dari migrasi 20260513
-- adalah `events_discount_type_check`.
-- ============================================================================

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_discount_type_check;

ALTER TABLE events ADD CONSTRAINT events_discount_type_check
	CHECK (
		discount_type IS NULL
		OR discount_type IN (
			'promo',
			'loyalty',
			'relasi',
			'kartu_nama',
			'owner_override',
			'package_deal',
			'other'
		)
	);

COMMENT ON COLUMN events.discount_type IS
	'Kategori diskon untuk laporan & jurnal. kartu_nama = klien datang dari kartu nama Tetra yang dibagikan di event lain (diskon 10% tercetak di kartunya). NULL = tanpa kategori (legacy / tanpa diskon).';
