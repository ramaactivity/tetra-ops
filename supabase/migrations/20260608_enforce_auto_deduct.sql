-- 20260608_enforce_auto_deduct.sql
-- Phase 1 dari "One Canonical Consumption Engine".
--
-- Mulai Phase 1, deduksi stok + snapshot HPP SELALU jalan saat rekap approval
-- (reviewRekap tidak lagi baca flag ini). Flag dijadikan true + deskripsi
-- diperjelas supaya tidak ada toggle 'mati' yang menyesatkan di Settings.
-- (Kode tidak lagi bergantung ke nilai ini; ini murni biar UI config konsisten.)

UPDATE system_config
SET
	value = 'true'::jsonb,
	description = 'Saat owner approve crew_rekap: SELALU emit stock_movements out + tulis hpp_snapshot (single canonical engine). Reject emit reversal. Tidak bisa dimatikan — flag dipertahankan untuk kompatibilitas.'
WHERE key = 'rekap.auto_deduct_stock';
