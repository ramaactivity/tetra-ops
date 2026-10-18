-- 20261018e_talangan_owner_piutang.sql — modul hutang-piutang owner (owner 2026-10-18).
-- Selain talangan dari acara, owner bisa mencatat langsung:
--   Owner bayarin biaya Tetra  : Dr beban / Cr 2-310 → 'talangan' (+)
--   Owner pinjamkan uang       : Dr kas-bank / Cr 2-310 → 'talangan' (+)
--   Owner pinjam/pakai uang Tetra: Dr 2-310 / Cr kas-bank → 'piutang' (−)
-- Aditif & idempotent.
ALTER TABLE talangan_owner_bayar DROP CONSTRAINT IF EXISTS talangan_owner_bayar_direction_check;
ALTER TABLE talangan_owner_bayar ADD CONSTRAINT talangan_owner_bayar_direction_check
	CHECK (direction IN ('bayar', 'terima', 'talangan', 'piutang'));
