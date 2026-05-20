-- 20260521_finance_hutang_dagang.sql
-- ============================================================================
-- Finance: Hutang Dagang (Accounts Payable) tracking
-- ============================================================================
--
-- Sebelum: Pembelian dengan payment_method != 'cash' (TOP) bikin journal
-- entry yang CREDIT 2-101 Hutang Vendor. Tapi ga ada per-invoice tracking
-- — owner ga bisa lihat "hutang ke Toko Frame Bandung berapa, jatuh tempo
-- kapan, sudah bayar berapa".
--
-- Sekarang:
--   - payables: 1 row per Pembelian TOP, track amount + amount_paid + due_date
--   - payable_payments: 1 row per kali bayar (boleh partial / multiple times)
--   - Triggers auto-roll status: open → partial → paid berdasarkan amount_paid
--
-- recordPurchaseBatch (di server action) bakal di-update buat insert payable
-- bareng dengan journal entry-nya.
--
-- Idempotent.

-- ============================================================================
-- 1. payables
-- ============================================================================

CREATE TABLE IF NOT EXISTS payables (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL DEFAULT 'purchase'
    CHECK (source_type IN ('purchase', 'manual')),
  source_journal_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  invoice_no TEXT,
  description TEXT,
  amount BIGINT NOT NULL CHECK (amount > 0),
  amount_paid BIGINT NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  issued_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  payment_terms TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'partial', 'paid', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_payables_supplier ON payables(supplier_id);
CREATE INDEX IF NOT EXISTS idx_payables_status
  ON payables(status) WHERE status IN ('open', 'partial');
CREATE INDEX IF NOT EXISTS idx_payables_due_date
  ON payables(due_date) WHERE status IN ('open', 'partial');

COMMENT ON TABLE payables IS
  'Per-invoice payable tracking. One row per Pembelian TOP (and optionally manual). Trigger auto-rolls status from amount_paid.';

-- ============================================================================
-- 2. payable_payments
-- ============================================================================

CREATE TABLE IF NOT EXISTS payable_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payable_id UUID NOT NULL REFERENCES payables(id) ON DELETE CASCADE,
  amount BIGINT NOT NULL CHECK (amount > 0),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_account_code TEXT NOT NULL
    REFERENCES chart_of_accounts(code) ON DELETE RESTRICT,
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  notes TEXT,
  paid_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payable_payments_payable
  ON payable_payments(payable_id);
CREATE INDEX IF NOT EXISTS idx_payable_payments_date
  ON payable_payments(payment_date DESC);

-- ============================================================================
-- 3. Triggers
-- ============================================================================

-- Auto-roll payable status berdasarkan amount_paid vs amount.
CREATE OR REPLACE FUNCTION recompute_payable_status()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'cancelled' THEN
    NEW.updated_at = NOW();
    RETURN NEW;
  END IF;
  IF NEW.amount_paid >= NEW.amount THEN
    NEW.status = 'paid';
    NEW.paid_at = COALESCE(NEW.paid_at, NOW());
  ELSIF NEW.amount_paid > 0 THEN
    NEW.status = 'partial';
    NEW.paid_at = NULL;
  ELSE
    NEW.status = 'open';
    NEW.paid_at = NULL;
  END IF;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payable_status ON payables;
CREATE TRIGGER trg_payable_status
  BEFORE UPDATE OF amount_paid ON payables
  FOR EACH ROW
  EXECUTE FUNCTION recompute_payable_status();

-- Bump payables.amount_paid saat payment_payments di-insert / di-delete.
CREATE OR REPLACE FUNCTION bump_payable_amount_paid()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE payables
    SET amount_paid = amount_paid + NEW.amount
    WHERE id = NEW.payable_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE payables
    SET amount_paid = GREATEST(0, amount_paid - OLD.amount)
    WHERE id = OLD.payable_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_payable_paid ON payable_payments;
CREATE TRIGGER trg_bump_payable_paid
  AFTER INSERT OR DELETE ON payable_payments
  FOR EACH ROW
  EXECUTE FUNCTION bump_payable_amount_paid();

-- ============================================================================
-- 4. RLS
-- ============================================================================

ALTER TABLE payables ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payables_read_all ON payables;
CREATE POLICY payables_read_all ON payables
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS payables_owner_mutate ON payables;
CREATE POLICY payables_owner_mutate ON payables
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid()
      AND role IN ('owner', 'super_admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid()
      AND role IN ('owner', 'super_admin')
  ));

ALTER TABLE payable_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payable_payments_read_all ON payable_payments;
CREATE POLICY payable_payments_read_all ON payable_payments
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS payable_payments_owner_mutate ON payable_payments;
CREATE POLICY payable_payments_owner_mutate ON payable_payments
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid()
      AND role IN ('owner', 'super_admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid()
      AND role IN ('owner', 'super_admin')
  ));
