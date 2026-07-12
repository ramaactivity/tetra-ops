-- ============================================================================
-- 20260712_commission_payouts.sql
--
-- Modul bayar komisi (vendor & relasi). Sebelumnya komisi hanya di-AKRU saat
-- settlement (Dr 5-300/5-301 beban, Cr 2-100 Hutang Crew — tercampur dgn fee
-- crew) tanpa cara membayarnya. Perubahan:
--
--   1. COA utang komisi terpisah: 2-101 (vendor), 2-102 (relasi/sales).
--   2. Tabel commission_payouts — catatan tiap pembayaran komisi + status.
--   3. _create_settlement_journal: kredit komisi dipisah ke 2-101/2-102.
--      Untuk vendor "Potongan Langsung" (upfront_cut) komisi TIDAK jadi utang —
--      vendor sudah memotong dari aliran uang → di-kredit ke Pendapatan 4-100
--      (gross-up: pendapatan bruto diakui, beban komisi 5-300 tetap didebit,
--      laba tak berubah, tak ada "utang hantu" yang mustahil dibayar).
--
-- Aman: recon 2026-07-12 → belum ada event ber-komisi yang ter-settle di buku
-- aktif (saldo 2-100 = 0, tak ada baris komisi settlement), jadi TIDAK perlu
-- reklasifikasi data lama. Perubahan jurnal hanya berlaku untuk settlement ke
-- depan. Pembayaran komisi meng-DEBIT 2-101/2-102 (utang turun) / Cr kas-bank.
-- ============================================================================

-- 1. Chart of accounts ------------------------------------------------------
UPDATE chart_of_accounts
SET name = 'Hutang Komisi Vendor', description = 'Utang komisi ke vendor (mode Komisi Langsung), dibayar setelah event'
WHERE code = '2-101';

INSERT INTO chart_of_accounts (code, name, account_type, parent_code, is_active, description)
VALUES ('2-102', 'Hutang Komisi Relasi', 'liability', '2-000', true,
        'Utang komisi ke perelasi/sales, dibayar setelah event')
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, description = EXCLUDED.description, is_active = true;

-- 2. commission_payouts ------------------------------------------------------
CREATE TABLE IF NOT EXISTS commission_payouts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_id           TEXT UNIQUE NOT NULL,
  event_id         UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL CHECK (kind IN ('vendor', 'relasi')),
  payee_name       TEXT,
  payee_user_id    UUID REFERENCES users(id),          -- relasi: internal referrer
  amount           BIGINT NOT NULL CHECK (amount > 0),
  admin_fee        BIGINT NOT NULL DEFAULT 0 CHECK (admin_fee >= 0),
  payment_date     DATE NOT NULL,
  bank_account_id  UUID NOT NULL REFERENCES bank_accounts(id),
  proof_url        TEXT,
  notes            TEXT,
  journal_entry_id UUID REFERENCES journal_entries(id),
  is_reversed      BOOLEAN NOT NULL DEFAULT false,
  reversed_at      TIMESTAMPTZ,
  reversal_reason  TEXT,
  created_by       UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Satu pembayaran AKTIF (belum di-reverse) per event+jenis → cegah dobel bayar.
CREATE UNIQUE INDEX IF NOT EXISTS ux_commission_payout_active
  ON commission_payouts (event_id, kind) WHERE is_reversed = false;
CREATE INDEX IF NOT EXISTS ix_commission_payout_event ON commission_payouts (event_id);

ALTER TABLE commission_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commission_payouts_read_all ON commission_payouts;
CREATE POLICY commission_payouts_read_all ON commission_payouts
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS commission_payouts_owner_mutate ON commission_payouts;
CREATE POLICY commission_payouts_owner_mutate ON commission_payouts
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('owner', 'super_admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('owner', 'super_admin')
  ));

COMMENT ON TABLE commission_payouts IS
  'Pembayaran komisi vendor/relasi. Dr 2-101/2-102 (utang komisi turun) / Cr kas-bank (+ 5-600 admin). Reversible. Satu aktif per event+kind.';

-- 3. _create_settlement_journal — pisahkan kredit komisi -------------------
CREATE OR REPLACE FUNCTION _create_settlement_journal(
  p_settlement_id UUID,
  p_event_id UUID,
  p_hpp JSONB,
  p_opex JSONB,
  p_revenue_net BIGINT,       -- diterima utk kompat tanda tangan; TIDAK dibukukan
  p_sinking_total BIGINT,
  p_owner_pool_total BIGINT,
  p_operating_cash BIGINT,    -- UNUSED
  p_actor_id UUID,
  p_entry_date DATE
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_entry_id   UUID;
  v_ref_id     TEXT;
  v_total      BIGINT;
  v_line_ord   INTEGER := 0;
  v_hpp_total  BIGINT;
  v_opex_total BIGINT;
  v_fund       RECORD;
  v_client     TEXT;
  v_vendor_mode TEXT;
  -- Pemecahan kredit komisi.
  v_komisi_vendor         BIGINT;
  v_komisi_relasi_all     BIGINT;
  v_komisi_vendor_upfront BIGINT;
  v_komisi_vendor_payable BIGINT;
  v_crew_liab             BIGINT;
BEGIN
  v_ref_id := generate_journal_reference(p_entry_date);

  SELECT NULLIF(TRIM(client_name), ''), vendor_commission_mode
    INTO v_client, v_vendor_mode
  FROM events WHERE id = p_event_id;

  v_hpp_total :=
      COALESCE((p_hpp->>'mediaset')::BIGINT, 0)
    + COALESCE((p_hpp->>'sleeve')::BIGINT, 0)
    + COALESCE((p_hpp->>'flashdisk')::BIGINT, 0)
    + COALESCE((p_hpp->>'pouch')::BIGINT, 0)
    + COALESCE((p_hpp->>'photomagnet')::BIGINT, 0)
    + COALESCE((p_hpp->>'keychain')::BIGINT, 0)
    + COALESCE((p_hpp->>'bonus')::BIGINT, 0)
    + COALESCE((p_hpp->>'other')::BIGINT, 0);

  v_opex_total :=
      COALESCE((p_opex->>'fee_lead')::BIGINT, 0)
    + COALESCE((p_opex->>'fee_asisten')::BIGINT, 0)
    + COALESCE((p_opex->>'fee_crew_c')::BIGINT, 0)
    + COALESCE((p_opex->>'fee_extra')::BIGINT, 0)
    + COALESCE((p_opex->>'transport_bbm')::BIGINT, 0)
    + COALESCE((p_opex->>'sewa_alat')::BIGINT, 0)
    + COALESCE((p_opex->>'perawatan')::BIGINT, 0)
    + COALESCE((p_opex->>'konsumsi')::BIGINT, 0)
    + COALESCE((p_opex->>'komisi_vendor')::BIGINT, 0)
    + COALESCE((p_opex->>'komisi_relasi')::BIGINT, 0)
    + COALESCE((p_opex->>'komisi_sales_direct')::BIGINT, 0)
    + COALESCE((p_opex->>'platform_fee')::BIGINT, 0);

  v_total := v_hpp_total + v_opex_total + p_sinking_total + p_owner_pool_total;

  INSERT INTO journal_entries (
    ref_id, entry_date, entry_type, description,
    source_type, source_id, source_event_id, total_amount, created_by
  ) VALUES (
    v_ref_id, p_entry_date, 'expense',
    'Biaya & alokasi event — ' || COALESCE(v_client, 'tanpa nama klien'),
    'settlement', p_settlement_id, p_event_id, v_total, p_actor_id
  ) RETURNING id INTO v_entry_id;

  -- ===== DEBIT: HPP (beban) =====
  IF COALESCE((p_hpp->>'mediaset')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-100', (p_hpp->>'mediaset')::BIGINT, 'Biaya bahan: Mediaset', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'sleeve')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-101', (p_hpp->>'sleeve')::BIGINT, 'Biaya bahan: Sleeve', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'flashdisk')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-102', (p_hpp->>'flashdisk')::BIGINT, 'Biaya bahan: Flashdisk', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'pouch')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-103', (p_hpp->>'pouch')::BIGINT, 'Biaya bahan: Pouch', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'photomagnet')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-104', (p_hpp->>'photomagnet')::BIGINT, 'Biaya bahan: Photomagnet', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'keychain')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-105', (p_hpp->>'keychain')::BIGINT, 'Biaya bahan: Keychain', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'bonus')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-411', (p_hpp->>'bonus')::BIGINT, 'Biaya bonus/gratisan untuk klien', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'other')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-109', (p_hpp->>'other')::BIGINT, 'Biaya bahan: Lainnya', v_line_ord); v_line_ord := v_line_ord+1; END IF;

  -- ===== DEBIT: OpEx (beban) =====
  IF COALESCE((p_opex->>'fee_lead')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-201', (p_opex->>'fee_lead')::BIGINT, 'Fee crew (Lead)', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_opex->>'fee_asisten')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-202', (p_opex->>'fee_asisten')::BIGINT, 'Fee crew (Asisten)', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_opex->>'fee_crew_c')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-203', (p_opex->>'fee_crew_c')::BIGINT, 'Fee crew (Crew)', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_opex->>'fee_extra')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-204', (p_opex->>'fee_extra')::BIGINT, 'Bonus/reimbursement crew', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_opex->>'transport_bbm')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-210', (p_opex->>'transport_bbm')::BIGINT, 'Transport & bensin', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_opex->>'sewa_alat')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-220', (p_opex->>'sewa_alat')::BIGINT, 'Sewa alat', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_opex->>'perawatan')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-230', (p_opex->>'perawatan')::BIGINT, 'Perawatan alat', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_opex->>'konsumsi')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-240', (p_opex->>'konsumsi')::BIGINT, 'Konsumsi event', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_opex->>'komisi_vendor')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-300', (p_opex->>'komisi_vendor')::BIGINT, 'Komisi vendor', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_opex->>'komisi_relasi')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-301', (p_opex->>'komisi_relasi')::BIGINT, 'Komisi relasi/sales', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_opex->>'komisi_sales_direct')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-301', (p_opex->>'komisi_sales_direct')::BIGINT, 'Komisi sales langsung', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_opex->>'platform_fee')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-400', (p_opex->>'platform_fee')::BIGINT, 'Biaya platform', v_line_ord); v_line_ord := v_line_ord+1; END IF;

  -- ===== DEBIT: alokasi laba ditahan =====
  IF p_sinking_total > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '3-200', p_sinking_total, 'Sisihkan laba untuk dana cadangan', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF p_owner_pool_total > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '3-200', p_owner_pool_total, 'Sisihkan laba untuk bagi hasil owner', v_line_ord); v_line_ord := v_line_ord+1; END IF;

  -- ===== CREDIT: persediaan (lawan HPP) =====
  IF COALESCE((p_hpp->>'mediaset')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '1-200', (p_hpp->>'mediaset')::BIGINT, 'Stok berkurang: Media Set', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'sleeve')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '1-201', (p_hpp->>'sleeve')::BIGINT, 'Stok berkurang: Sleeve', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'flashdisk')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '1-202', (p_hpp->>'flashdisk')::BIGINT, 'Stok berkurang: Flashdisk', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'pouch')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '1-203', (p_hpp->>'pouch')::BIGINT, 'Stok berkurang: Pouch', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'photomagnet')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '1-204', (p_hpp->>'photomagnet')::BIGINT, 'Stok berkurang: Photomagnet', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'keychain')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '1-205', (p_hpp->>'keychain')::BIGINT, 'Stok berkurang: Keychain', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'bonus')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '1-209', (p_hpp->>'bonus')::BIGINT, 'Stok berkurang: Bonus', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'other')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '1-209', (p_hpp->>'other')::BIGINT, 'Stok berkurang: Lainnya', v_line_ord); v_line_ord := v_line_ord+1; END IF;

  -- ===== CREDIT: utang OpEx, dipecah per jenis =====
  -- Komisi dipisah dari Hutang Crew (2-100) → utang komisi vendor (2-101) &
  -- relasi/sales (2-102), supaya bisa dilacak & dibayar terpisah.
  -- Vendor "Potongan Langsung" (upfront_cut): komisi BUKAN utang — vendor sudah
  -- potong dari aliran uang → kredit ke Pendapatan 4-100 (gross-up).
  v_komisi_vendor     := COALESCE((p_opex->>'komisi_vendor')::BIGINT, 0);
  v_komisi_relasi_all := COALESCE((p_opex->>'komisi_relasi')::BIGINT, 0)
                       + COALESCE((p_opex->>'komisi_sales_direct')::BIGINT, 0);
  v_komisi_vendor_upfront := CASE WHEN v_vendor_mode = 'upfront_cut'
                                  THEN v_komisi_vendor ELSE 0 END;
  v_komisi_vendor_payable := v_komisi_vendor - v_komisi_vendor_upfront;
  v_crew_liab := v_opex_total - v_komisi_vendor - v_komisi_relasi_all;

  IF v_crew_liab > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '2-100', v_crew_liab, 'Utang ke crew (fee + reimbursement, dibayar saat transfer)', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF v_komisi_vendor_payable > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '2-101', v_komisi_vendor_payable, 'Utang komisi vendor (dibayar setelah event)', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF v_komisi_relasi_all > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '2-102', v_komisi_relasi_all, 'Utang komisi relasi/sales (dibayar setelah event)', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF v_komisi_vendor_upfront > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '4-100', v_komisi_vendor_upfront, 'Komisi vendor dipotong di muka (pendapatan bruto)', v_line_ord); v_line_ord := v_line_ord+1; END IF;

  -- ===== CREDIT: sinking & owner pool =====
  FOR v_fund IN
    SELECT sf.code, sfm.amount
    FROM sinking_fund_movements sfm
    JOIN sinking_funds sf ON sf.id = sfm.fund_id
    WHERE sfm.source_settlement_id = p_settlement_id AND sfm.movement_type = 'deposit'
  LOOP
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id,
      CASE v_fund.code
        WHEN 'equipment' THEN '2-200' WHEN 'maintenance' THEN '2-201'
        WHEN 'crew_reserve' THEN '2-202' WHEN 'emergency' THEN '2-203' ELSE '2-200' END,
      v_fund.amount,
      'Dana cadangan: ' || CASE v_fund.code
        WHEN 'equipment' THEN 'Alat' WHEN 'maintenance' THEN 'Perawatan'
        WHEN 'crew_reserve' THEN 'Cadangan crew' WHEN 'emergency' THEN 'Darurat'
        ELSE v_fund.code END,
      v_line_ord);
    v_line_ord := v_line_ord+1;
  END LOOP;

  IF p_owner_pool_total > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '2-300', p_owner_pool_total, 'Utang bagi hasil ke owner', v_line_ord); v_line_ord := v_line_ord+1; END IF;

  RETURN v_entry_id;
END;
$$;

COMMENT ON FUNCTION _create_settlement_journal IS
  'Settlement journal cash-basis. HPP→persediaan; OpEx→Hutang Crew(2-100); komisi→2-101(vendor)/2-102(relasi), kecuali vendor upfront_cut→Pendapatan 4-100 (gross-up, tak jadi utang). Pendapatan kas TIDAK dibukukan di sini (diakui saat pembayaran).';
