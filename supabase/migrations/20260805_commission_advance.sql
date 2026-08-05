-- ============================================================================
-- 20260805_commission_advance.sql
--
-- Bayar komisi SEBELUM event di-settle ("uang muka komisi"), tetap nyambung ke
-- modul settle. Plus perbaikan tabrakan akun 2-101.
--
-- MASALAH 1 — komisi baru bisa dibayar setelah settle
--   Utang komisi baru lahir saat settlement (Cr 2-101/2-102). Kalau vendor minta
--   komisi lebih dulu (sebelum acara ditutup), owner tidak punya cara mencatat
--   uang keluar itu. Sekarang: pembayaran pra-settle dibukukan sebagai ASET
--   "Uang Muka Komisi" (1-310):
--       saat bayar : Dr 1-310 / Cr kas-bank
--       saat settle: beban komisi tetap Dr 5-300/5-301, tapi lawannya BUKAN
--                    utang — langsung Cr 1-310 (uang muka terpakai, habis).
--   Hasil akhir identik dengan bayar-setelah-settle; bedanya cuma urutan waktu.
--   Karena offset-nya dikerjakan di dalam _create_settlement_journal, tidak ada
--   jurnal susulan yang bisa gagal separuh jalan — atomik dalam transaksi settle.
--   Reopen membalik jurnal settlement secara mirror → uang muka hidup lagi dan
--   akan dipakai lagi saat re-settle. Konsisten tanpa perubahan di reopen.
--
-- MASALAH 2 — 2-101 dipakai DUA modul (bug laten sejak 20260712)
--   2-101 adalah control account Hutang Dagang (subledger `payables`, dicek di
--   /finance/reconciliation: saldo 2-101 harus = sisa payable terbuka). Sejak
--   modul komisi, settlement ikut mengkredit 2-101 untuk komisi vendor → begitu
--   ada 1 event vendor ber-komisi di-settle, rekonsiliasi Hutang Dagang langsung
--   drift & angka "Hutang Dagang" jadi salah.
--   Perbaikan: komisi vendor pindah ke akun sendiri 2-103. Aman tanpa reklas —
--   audit 2026-08-05: 2-101 belum punya baris jurnal komisi sama sekali
--   (0 baris; komisi terutang yang ada sekarang Rp50.000 ada di 2-102).
-- ============================================================================

-- 1. Chart of accounts -------------------------------------------------------
INSERT INTO chart_of_accounts (code, name, account_type, parent_code, is_active, description)
VALUES ('1-310', 'Uang Muka Komisi', 'asset', '1-000', true,
        'Komisi yang sudah dibayar sebelum event di-settle. Otomatis habis (di-offset) saat event di-settle.')
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, description = EXCLUDED.description, is_active = true;

INSERT INTO chart_of_accounts (code, name, account_type, parent_code, is_active, description)
VALUES ('2-103', 'Hutang Komisi Vendor', 'liability', '2-000', true,
        'Utang komisi ke vendor (mode Komisi Langsung), dibayar setelah event. Dipisah dari 2-101 Hutang Dagang.')
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, description = EXCLUDED.description, is_active = true;

-- Kembalikan 2-101 ke perannya semula: utang ke supplier dari Pembelian TOP.
UPDATE chart_of_accounts
SET name = 'Hutang Vendor',
    description = 'Utang ke supplier dari pembelian tempo (TOP). Control account subledger payables.'
WHERE code = '2-101';

-- 2. commission_payouts: tandai pembayaran di muka ---------------------------
ALTER TABLE commission_payouts
  ADD COLUMN IF NOT EXISTS is_advance BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN commission_payouts.is_advance IS
  'true = dibayar sebelum event di-settle (Dr 1-310 Uang Muka Komisi). Saat settle, uang muka ini di-offset otomatis jadi lawan beban komisi.';

-- 3. _create_settlement_journal ---------------------------------------------
--    Basis: definisi live 2026-08-05 (identik dgn 20260712_commission_payouts).
--    Yang berubah HANYA blok "CREDIT: utang OpEx":
--      • komisi vendor terutang: 2-101 → 2-103
--      • porsi komisi yang sudah dibayar di muka: Cr 1-310, bukan utang
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
  -- Uang muka komisi (dibayar sebelum settle) yang dipakai settlement ini.
  v_prepaid_vendor        BIGINT;
  v_prepaid_relasi        BIGINT;
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
  -- Komisi dipisah dari Hutang Crew (2-100) → utang komisi vendor (2-103) &
  -- relasi/sales (2-102), supaya bisa dilacak & dibayar terpisah.
  -- Vendor "Potongan Langsung" (upfront_cut): komisi BUKAN utang — vendor sudah
  -- potong dari aliran uang → kredit ke Pendapatan 4-100 (gross-up).
  -- Komisi yang sudah DIBAYAR DI MUKA (sebelum settle) juga bukan utang — uang
  -- sudah keluar & tercatat di aset 1-310; settlement tinggal menghabiskannya.
  v_komisi_vendor     := COALESCE((p_opex->>'komisi_vendor')::BIGINT, 0);
  v_komisi_relasi_all := COALESCE((p_opex->>'komisi_relasi')::BIGINT, 0)
                       + COALESCE((p_opex->>'komisi_sales_direct')::BIGINT, 0);
  v_komisi_vendor_upfront := CASE WHEN v_vendor_mode = 'upfront_cut'
                                  THEN v_komisi_vendor ELSE 0 END;
  v_komisi_vendor_payable := v_komisi_vendor - v_komisi_vendor_upfront;
  v_crew_liab := v_opex_total - v_komisi_vendor - v_komisi_relasi_all;

  -- Uang muka aktif untuk event ini. LEAST(): kalau nominal komisi diubah
  -- setelah uang muka dibayar, yang di-offset hanya sebesar beban yang diakui —
  -- kelebihannya sengaja ditinggal di 1-310 (kelebihan bayar, kelihatan di buku)
  -- daripada memaksakan jurnal yang tidak balance.
  SELECT COALESCE(SUM(amount), 0) INTO v_prepaid_vendor
  FROM commission_payouts
  WHERE event_id = p_event_id AND kind = 'vendor'
    AND is_advance = true AND is_reversed = false;
  SELECT COALESCE(SUM(amount), 0) INTO v_prepaid_relasi
  FROM commission_payouts
  WHERE event_id = p_event_id AND kind IN ('relasi', 'sales')
    AND is_advance = true AND is_reversed = false;

  v_prepaid_vendor := LEAST(v_prepaid_vendor, v_komisi_vendor_payable);
  v_prepaid_relasi := LEAST(v_prepaid_relasi, v_komisi_relasi_all);

  IF v_crew_liab > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '2-100', v_crew_liab, 'Utang ke crew (fee + reimbursement, dibayar saat transfer)', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF (v_komisi_vendor_payable - v_prepaid_vendor) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '2-103', v_komisi_vendor_payable - v_prepaid_vendor, 'Utang komisi vendor (dibayar setelah event)', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF v_prepaid_vendor > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '1-310', v_prepaid_vendor, 'Pakai uang muka komisi vendor (sudah dibayar sebelum settle)', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF (v_komisi_relasi_all - v_prepaid_relasi) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '2-102', v_komisi_relasi_all - v_prepaid_relasi, 'Utang komisi relasi/sales (dibayar setelah event)', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF v_prepaid_relasi > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '1-310', v_prepaid_relasi, 'Pakai uang muka komisi relasi/sales (sudah dibayar sebelum settle)', v_line_ord); v_line_ord := v_line_ord+1; END IF;
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
  'Settlement journal cash-basis. HPP→persediaan; OpEx→Hutang Crew(2-100); komisi→2-103(vendor)/2-102(relasi), kecuali vendor upfront_cut→Pendapatan 4-100 (gross-up) dan porsi yang sudah dibayar di muka→Cr 1-310 Uang Muka Komisi. Pendapatan kas TIDAK dibukukan di sini (diakui saat pembayaran).';

-- 4. Verifikasi: pastikan tidak ada baris komisi nyangkut di 2-101 ----------
DO $verify$
DECLARE
  v_komisi_di_2101 BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_komisi_di_2101
  FROM journal_lines jl
  JOIN journal_entries je ON je.id = jl.entry_id
  WHERE jl.account_code = '2-101' AND je.source_type = 'settlement';

  IF v_komisi_di_2101 > 0 THEN
    RAISE WARNING 'Ada % baris komisi settlement di 2-101 — perlu reklas manual ke 2-103.', v_komisi_di_2101;
  ELSE
    RAISE NOTICE 'OK: tidak ada baris komisi settlement di 2-101, pemisahan 2-103 aman tanpa reklas.';
  END IF;
END
$verify$;
