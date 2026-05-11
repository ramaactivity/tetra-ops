-- 20260517_event_settlements_hpp_bonus.sql
-- Tambah kolom hpp_bonus ke event_settlements buat track cost item
-- gratis yang kita kasih ke klien (event_bonuses). Cost = qty × avg
-- purchase price item inventory yang di-link via addons.inventory_item_id.
--
-- Sebelum migration ini, kalau owner mau track freebie cost, harus
-- masukkan manual ke hpp_other — hilang traceability. Sekarang
-- punya kolom sendiri yang surface di P&L sebagai "Freebie Cost" line.
--
-- Idempotent.

ALTER TABLE event_settlements
    ADD COLUMN IF NOT EXISTS hpp_bonus BIGINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN event_settlements.hpp_bonus IS
    'Cost item gratis yang kita kasih klien (event_bonuses × purchase_price_avg). Internal-only HPP component — masuk hpp_total tapi separate line di P&L.';
