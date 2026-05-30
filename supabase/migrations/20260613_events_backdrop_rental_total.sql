-- 20260613_events_backdrop_rental_total.sql
-- Pisahkan biaya backdrop (rental_owned price / vendor_decor markup) ke kolom
-- sendiri supaya laporan bisa pecah add-on vs backdrop.
--
-- addons_total TETAP = add-on + backdrop (komponen revenue yg dipakai
-- settle_event & grand_total — sengaja tidak diubah agar mesin settlement
-- stabil). Dengan kolom ini, add-on murni = addons_total − backdrop_rental_total.
--
-- Default 0. Booking baru mengisi nilainya; event lama biarkan 0 (akan jadi
-- legacy di cutover 1 Juni).

ALTER TABLE events
	ADD COLUMN IF NOT EXISTS backdrop_rental_total BIGINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN events.backdrop_rental_total IS
	'Biaya backdrop (rental_owned price / vendor_decor markup) — bagian dari addons_total. add-on murni = addons_total − backdrop_rental_total.';
