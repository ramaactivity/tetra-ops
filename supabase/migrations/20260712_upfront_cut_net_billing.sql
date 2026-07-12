-- ============================================================================
-- 20260712_upfront_cut_net_billing.sql
--
-- FIX: event vendor "Potongan Langsung" (vendor_commission_mode='upfront_cut')
-- tidak pernah bisa lunas. Vendor memotong fee-nya dari payment flow, jadi kas
-- yang masuk ke Tetra maksimal = grand_total − vendor_commission_amount
-- ("Tetra terima" di form booking). Tapi recalculate_event_payment_status
-- menghitung remaining_balance & payment_status terhadap grand_total penuh →
-- setelah vendor transfer bagiannya, event nyangkut di 'partial' dengan
-- outstanding fiktif sebesar potongan vendor.
--
-- Perubahan: tagihan efektif (billable) = grand_total dikurangi potongan
-- upfront_cut. Mode 'commission' TIDAK berubah (klien bayar full ke Tetra,
-- komisi dibayar keluar setelah event). Accounting settle_event juga tidak
-- berubah (revenue = grand_total, komisi = OpEx) — ini murni sisi piutang/kas.
-- ============================================================================

CREATE OR REPLACE FUNCTION recalculate_event_payment_status(p_event_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grand_total BIGINT;
  v_billable BIGINT;
  v_total_paid BIGINT;
  v_event_date DATE;
  v_due_date DATE;
  v_new_status payment_status;
BEGIN
  -- Tagihan efektif: potongan langsung vendor dipotong di muka dari payment
  -- flow, jadi kas yang ditunggu memang cuma sisanya ("Tetra terima").
  SELECT
    grand_total,
    grand_total - CASE
      WHEN vendor_commission_mode = 'upfront_cut'
      THEN COALESCE(vendor_commission_amount, 0)
      ELSE 0
    END,
    event_date, due_date
    INTO v_grand_total, v_billable, v_event_date, v_due_date
  FROM events WHERE id = p_event_id;

  v_billable := GREATEST(0, COALESCE(v_billable, 0));

  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
  FROM payments
  WHERE event_id = p_event_id AND is_reversed = false;

  IF v_total_paid = 0 AND v_billable > 0 THEN
    IF v_due_date IS NOT NULL AND v_due_date < CURRENT_DATE THEN
      v_new_status := 'overdue';
    ELSE
      v_new_status := 'unpaid';
    END IF;
  ELSIF v_total_paid >= v_billable THEN
    v_new_status := 'paid';
  ELSE
    IF v_due_date IS NOT NULL AND v_due_date < CURRENT_DATE THEN
      v_new_status := 'overdue';
    ELSE
      v_new_status := 'partial';
    END IF;
  END IF;

  UPDATE events
  SET total_paid = v_total_paid,
      remaining_balance = v_billable - v_total_paid,
      payment_status = v_new_status
  WHERE id = p_event_id;
END;
$$;

COMMENT ON FUNCTION recalculate_event_payment_status(UUID) IS
  'Recalc total_paid/remaining_balance/payment_status. Tagihan efektif = grand_total − potongan vendor upfront_cut (kas yang masuk memang net).';

-- Resync event upfront_cut yang sudah ada (remaining_balance-nya masih
-- terhadap grand_total penuh).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id FROM events
    WHERE vendor_commission_mode = 'upfront_cut'
      AND COALESCE(vendor_commission_amount, 0) > 0
  LOOP
    PERFORM recalculate_event_payment_status(r.id);
  END LOOP;
END $$;
