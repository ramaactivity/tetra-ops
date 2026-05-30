-- 20260614_resync_remaining_balance.sql
-- One-time fix: resync events.remaining_balance = grand_total − total_paid.
--
-- Bug: updateBooking dulu nge-reset remaining_balance ke grand_total saat edit,
-- membuang progres DP. total_paid & payment_status tetap benar (dijaga trigger),
-- tapi remaining_balance jadi basi (mis. lunas tapi tampil sisa penuh). Kode
-- buildEventPayload sudah diperbaiki (remaining = grand_total − total_paid).
-- Migration ini membereskan baris yang terlanjur basi.
--
-- Aman: remaining_balance kolom display. get_outstanding_total memfilter
-- payment_status<>'paid', jadi total Outstanding tidak berubah utk yg sudah
-- 'paid'; ini hanya menyelaraskan angka per-event (PDF/WA/billing/anomaly).

UPDATE events
SET remaining_balance = GREATEST(COALESCE(grand_total, 0) - COALESCE(total_paid, 0), 0)
WHERE deleted_at IS NULL
  AND remaining_balance IS DISTINCT FROM
      GREATEST(COALESCE(grand_total, 0) - COALESCE(total_paid, 0), 0);
