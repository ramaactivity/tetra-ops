-- 20260607_crew_rekap_hpp_snapshot.sql
-- Phase 0 (additive, zero behavior change) dari rencana "One Canonical
-- Consumption Engine".
--
-- Tambah kolom snapshot HPP di crew_rekap. Diisi oleh reviewRekap saat
-- approval (bucketHpp dari plan konsumsi yang sama yang nge-deduct stok),
-- jadi HPP = nilai stok yang benar-benar keluar.
--
-- Belum ada yang BACA kolom ini di fase ini (settle_event masih pakai
-- calculate_recap_hpp) — murni additive. Phase 2 baru switch settle_event
-- baca hpp_snapshot.
--
-- hpp_snapshot shape (JSONB): { mediaset, sleeve, flashdisk, pouch,
--   photomagnet, keychain, bonus, other, total } — semua integer Rupiah.
--   Sama persis dengan output calculate_recap_hpp lama → drop-in nanti.

ALTER TABLE crew_rekap
	ADD COLUMN IF NOT EXISTS hpp_snapshot JSONB,
	ADD COLUMN IF NOT EXISTS hpp_snapshot_total BIGINT;

COMMENT ON COLUMN crew_rekap.hpp_snapshot IS
	'Per-bucket HPP snapshot (JSONB) di-set saat rekap approval dari plan konsumsi kanonik. Sumber tunggal HPP — dibaca settle_event mulai Phase 2.';
COMMENT ON COLUMN crew_rekap.hpp_snapshot_total IS
	'Total HPP (Rupiah) = jumlah semua bucket di hpp_snapshot. Cache untuk query cepat.';
