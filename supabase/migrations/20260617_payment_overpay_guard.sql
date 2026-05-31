-- 20260617_payment_overpay_guard.sql
-- F2: tutup race TOCTOU di logPayment. Guard aplikasi (amount > sisa) bisa
-- ditembus 2 submit barengan. Pindahkan jadi invariant DB: total pembayaran
-- non-reversed sebuah event tidak boleh > grand_total.
--
-- Mirror logika app: hanya ditegakkan saat grand_total > 0 (event dgn
-- grand_total 0/legacy tidak diblok). Row reversed di-skip (tidak menambah
-- total). BEFORE-trigger → hanya cek tulisan baru, data lama tidak divalidasi
-- ulang (no regression utk baris existing).

CREATE OR REPLACE FUNCTION enforce_payment_not_overpay()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_grand BIGINT;
  v_sum   BIGINT;
BEGIN
  IF COALESCE(NEW.is_reversed, false) THEN
    RETURN NEW;  -- reversal hanya menurunkan total, tak mungkin overpay
  END IF;

  SELECT COALESCE(grand_total, 0) INTO v_grand
  FROM events WHERE id = NEW.event_id;

  IF v_grand <= 0 THEN
    RETURN NEW;  -- mirror app: hanya enforce saat grand_total > 0
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_sum
  FROM payments
  WHERE event_id = NEW.event_id
    AND is_reversed = false
    AND id <> NEW.id;

  IF v_sum + NEW.amount > v_grand THEN
    RAISE EXCEPTION
      'Pembayaran melebihi tagihan: total % > grand_total %',
      v_sum + NEW.amount, v_grand
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_not_overpay ON payments;
CREATE TRIGGER trg_payment_not_overpay
  BEFORE INSERT OR UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION enforce_payment_not_overpay();

COMMENT ON FUNCTION enforce_payment_not_overpay IS
  'F2 guard: Σ payment non-reversed per event ≤ grand_total (saat grand_total>0). Tutup race overpayment yang lolos cek app-level.';
