-- Piutang tidak boleh menghitung acara yang dibatalkan.
--
-- Bug 2026-11-16: "Captain Barbershop Outing 2026" (PRJ-20260914-8027) batal,
-- tapi remaining_balance-nya tetap Rp2.250.000 → Piutang di Keuangan,
-- Dashboard, dan Billing kelebihan Rp2,25jt dan acara itu muncul sebagai
-- "lewat jatuh tempo" berbulan-bulan. Predikat di TS (billing, bot Telegram,
-- tool AI, anomaly scanner) ikut ditambah status <> 'cancelled'.
CREATE OR REPLACE FUNCTION get_outstanding_total()
RETURNS BIGINT
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(SUM(remaining_balance), 0)::BIGINT
  FROM events
  WHERE deleted_at IS NULL
    AND is_migrated_legacy = false
    AND status <> 'cancelled'
    AND payment_status <> 'paid'
    AND remaining_balance > 0;
$$;
