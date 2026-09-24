-- ============================================================================
-- 20260924_due_date_and_standalone_invoice.sql
--
-- 1. events.due_date = satu sumber tenggat pelunasan (Billing, invoice, agent
--    pengingat). Form booking kini mengisinya (chip H-1/H-3/H-7, default H-1);
--    event lama yang masih kosong diisi H-1 dari tanggal acara.
-- 2. Invoice boleh berdiri sendiri (invoice DP dibuat sebelum event diinput).
--    Saat DP masuk dan event dibuat, invoice yang sama ditautkan ke event.
--
-- Idempotent — aman dijalankan ulang.
-- ============================================================================

UPDATE events
SET due_date = event_date - INTERVAL '1 day'
WHERE due_date IS NULL
  AND event_date IS NOT NULL;

ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_invoice_needs_event;

COMMENT ON COLUMN events.due_date IS
	'Tenggat pelunasan. Diisi form booking (H-n dari tanggal acara, default H-1) dan disinkron dengan jatuh tempo invoice yang tertaut.';
