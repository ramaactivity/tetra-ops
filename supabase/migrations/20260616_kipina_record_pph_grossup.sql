-- 20260616_kipina_record_pph_grossup.sql
-- Data fix (1 baris): event "Kipina Kids Bogor School Performance".
--
-- grand_total = Rp 2.564.103 = 2.500.000 / 0.975 → sudah mengandung gross-up
-- PPh 2,5% (klien institusi/sekolah), TAPI kolom gross_up_pph_amount = 0 →
-- breakdown tidak konsisten dgn grand_total. Owner konfirmasi gross-up memang
-- disengaja, jadi kita REKAM angkanya (grand_total & remaining_balance TIDAK
-- berubah — klien tetap ditagih Rp 2.564.103).
--
-- Idempotent + ber-guard: hanya event ini, hanya jika kolomnya masih 0 dan
-- memang ada selisih grand_total vs (paket + add-on − diskon).

UPDATE events
SET
	gross_up_pph_amount =
		grand_total
		- (COALESCE(custom_package_price, base_price)
		   + COALESCE(addons_total, 0)
		   - COALESCE(discount_amount, 0)),
	updated_at = NOW()
WHERE id = '399e73b4-cee9-4e37-867e-1c31cbc4178a'
  AND COALESCE(gross_up_pph_amount, 0) = 0
  AND grand_total <> (
		COALESCE(custom_package_price, base_price)
		+ COALESCE(addons_total, 0)
		- COALESCE(discount_amount, 0)
  );
