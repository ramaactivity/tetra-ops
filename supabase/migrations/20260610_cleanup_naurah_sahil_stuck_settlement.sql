-- 20260610_cleanup_naurah_sahil_stuck_settlement.sql
-- ONE-TIME data fix (Opsi B, owner-authorized) untuk event Naurah & Sahil
-- (PRJ-20260515-36078, event a4d24115-dac6-463b-88ae-578c1dbd8756).
--
-- Kondisi: di-settle 19 Mei lalu di-reopen hari yg sama (is_reopened=true).
-- Settlement b030e3db beserta turunannya SUDAH saling meniadakan (deposit↔
-- withdrawal, journal↔reversal) → net NOL. Tapi row-nya masih ada sehingga
-- settle_event nolak re-settle ("already settled"), plus stock_movements-nya
-- (8 out + 12 in) over-reversed (stok hantu +selisih).
--
-- Fix: hapus TOTAL jejak settlement yg sudah dibatalkan itu (balance-neutral)
-- + reset rekap supaya owner bisa approve-ulang → settle bersih. Atomik (DO
-- block) — kalau ada FK tak terduga, rollback penuh, tidak ada perubahan.

DO $$
DECLARE
  v_event UUID := 'a4d24115-dac6-463b-88ae-578c1dbd8756';
  v_sett  UUID;
BEGIN
  SELECT id INTO v_sett FROM event_settlements WHERE event_id = v_event;
  IF v_sett IS NULL THEN
    RAISE NOTICE 'Tidak ada settlement untuk event %, skip.', v_event;
    RETURN;
  END IF;

  -- 1. Hapus turunan settlement (net-zero: deposit + withdrawal/adjustment)
  DELETE FROM owner_earnings          WHERE source_settlement_id = v_sett;
  DELETE FROM sinking_fund_movements  WHERE source_settlement_id = v_sett;

  -- 2. Hapus stock_movements settlement event ini (8 out + 12 in → balikin
  --    ke kondisi pristine; hilangkan stok hantu dari over-reversal lama).
  DELETE FROM stock_movements
   WHERE source_id = v_event AND source = 'settlement'::movement_source;

  -- 3. Hapus event_settlements row (lepas dulu ref ke journal supaya aman).
  DELETE FROM event_settlements WHERE id = v_sett;

  -- 4. Hapus journal settle + reversal-nya (net-zero). Putus self-ref dulu.
  UPDATE journal_entries SET reversed_by_entry_id = NULL
   WHERE source_event_id = v_event;
  DELETE FROM journal_lines
   WHERE entry_id IN (SELECT id FROM journal_entries WHERE source_event_id = v_event);
  DELETE FROM journal_entries WHERE source_event_id = v_event;

  -- 5. Reset rekap → owner bisa approve-ulang (commit stok + snapshot baru).
  UPDATE crew_rekap
     SET is_approved = false, status = 'reviewed',
         stock_committed_at = NULL, stock_movement_batch_id = NULL,
         hpp_snapshot = NULL, hpp_snapshot_total = NULL,
         locked = false, locked_at = NULL, settled_at = NULL
   WHERE event_id = v_event;

  -- 6. Pastikan event status awaiting_settlement.
  UPDATE events SET status = 'awaiting_settlement', updated_at = NOW()
   WHERE id = v_event AND status <> 'awaiting_settlement';

  RAISE NOTICE 'Cleanup selesai untuk event % (settlement %).', v_event, v_sett;
END $$;
