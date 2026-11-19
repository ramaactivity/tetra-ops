-- Backdrop "Cetak Banner": banner dicetak Tetra dari desain klien, dipasang di
-- stand tripod Tetra. Rama 19 Nov (kasus Yessi): jangan jatuh ke "Dari Klien".
-- Harga lewat add-on "Cetak Backdrop Banner"; dicetak per acara → tidak
-- dibatasi stok pcs. Aditif.
ALTER TYPE backdrop_type ADD VALUE IF NOT EXISTS 'cetak_banner';
INSERT INTO backdrops (code, name, type, rental_price, is_active, display_order, description)
SELECT 'BG-CETAK-BANNER', 'Cetak Banner (desain klien)', 'cetak_banner', 0, true, 90,
	'Banner dicetak Tetra dari desain klien, dipasang di stand tripod Tetra. Harga lewat add-on Cetak Backdrop Banner.'
WHERE NOT EXISTS (SELECT 1 FROM backdrops WHERE code = 'BG-CETAK-BANNER');
