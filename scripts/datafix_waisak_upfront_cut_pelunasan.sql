-- ============================================================================
-- datafix_waisak_upfront_cut_pelunasan.sql (2026-07-12)
--
-- Waisak Ceremony (PRJ-20260607-3236): skema vendor Potongan Langsung 10%
-- (Rp300.000 dari base 3jt), tapi pelunasan tercatat Rp1.000.000 padahal kas
-- yang masuk setelah potongan vendor = Rp700.000. Total tercatat 3jt vs
-- "Tetra terima" 2,7jt → remaining_balance −300rb (overpaid palsu).
--
-- Aman tanpa menyentuh GL: event ini finance_frozen (pre-cutoff 2026-06-24),
-- pembayarannya TIDAK punya journal_entries — kas sudah terserap di opening
-- JE cutoff yang diambil dari saldo bank riil.
--
-- Setelah update: recalculate_event_payment_status → total_paid 2,7jt =
-- tagihan net → status paid, remaining 0.
-- ============================================================================

UPDATE payments
SET amount = 700000,
    notes = COALESCE(NULLIF(notes, ''), '')
      || 'Koreksi data 2026-07-12: pelunasan riil Rp700.000 — potongan langsung vendor 10% (Rp300.000) dipotong dari payment flow. Semula tercatat Rp1.000.000.'
WHERE id = 'fbc6da7e-b9b3-4e60-b4ef-7857212c2b11'
  AND ref_id = 'PAY-20260604-8782'
  AND amount = 1000000;

SELECT recalculate_event_payment_status('a58b642e-4efa-491a-bdf2-f8071b549acf');

INSERT INTO audit_log (entity_type, entity_id, action, changes)
VALUES (
  'payment',
  'fbc6da7e-b9b3-4e60-b4ef-7857212c2b11',
  'datafix',
  jsonb_build_object(
    'event', 'PRJ-20260607-3236',
    'field', 'amount',
    'from', 1000000,
    'to', 700000,
    'reason', 'Potongan langsung vendor 10% dipotong dari payment flow; pelunasan riil 700rb. Event finance_frozen pre-cutoff — tidak ada jurnal GL yang terdampak.'
  )
);
