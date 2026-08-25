-- ============================================================================
-- datafix_emoney_flazz_bca_20260825.sql
-- Daftarkan kartu e-toll Flazz BCA milik Tetra ke pembukuan.
--
-- Sumber angka: screenshot aplikasi BCA, 25 Agu 2026 12:16
--   • No. kartu     0145-2003-0572-6525
--   • Saldo asli    Rp57.400
--   • Riwayat 22 Agu 2026: tol 19.000 + 7.500 + 19.000 + 7.500 = Rp53.000
--     → persis biaya tol di rekap event BRI — Culture Fest 2026 (22 Agu),
--       yang BELUM di-settle.
--
-- Maka saldo menurut buku hari ini harus 57.400 + 53.000 = Rp110.400:
-- pemakaian 53.000 baru akan terbukukan saat event di-settle, dan setelah itu
-- saldo buku mendarat tepat di Rp57.400 seperti kartunya.
--
-- Lawan jurnalnya 3-101 Modal Awal, BUKAN Bank BCA. Alasannya: topup e-toll
-- selama ini sudah terlanjur dibebankan langsung (mis. JE 11 Agu "Topup Etoll"
-- Dr 5-213, 22 Jul "Topup Etoll & Bensin" Dr 5-210). Uangnya sudah keluar dari
-- BCA di periode lalu — mengambilnya dari BCA lagi berarti saldo bank
-- berkurang dua kali. Salah-catat periode lalu dibiarkan di periode lalu.
--
-- Tanggal saldo awal sengaja 21 Agu (sehari sebelum event) supaya buku besar
-- kartu terbaca urut: terisi → terpakai 22 Agu → sisa.
--
-- Idempotent: berhenti tanpa efek kalau kartunya sudah ada.
-- ============================================================================

DO $datafix$
DECLARE
	v_actor   UUID;
	v_card    UUID;
	v_code    TEXT := '1-140';
	v_amount  BIGINT := 110400;
	v_entry   UUID;
	v_bca0    BIGINT;
	v_bca1    BIGINT;
	v_bal     BIGINT;
BEGIN
	IF EXISTS (SELECT 1 FROM bank_accounts WHERE account_kind = 'emoney') THEN
		RAISE NOTICE 'Sudah ada kartu e-money — datafix dilewati.';
		RETURN;
	END IF;
	IF EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = v_code) THEN
		RAISE EXCEPTION 'Kode akun % sudah dipakai', v_code;
	END IF;

	SELECT id INTO v_actor FROM users
	WHERE role IN ('super_admin', 'owner') AND is_active
	ORDER BY CASE role WHEN 'super_admin' THEN 0 ELSE 1 END
	LIMIT 1;
	IF v_actor IS NULL THEN
		RAISE EXCEPTION 'Tidak ada user owner/super_admin aktif';
	END IF;

	SELECT COALESCE(SUM(debit_amount - credit_amount), 0) INTO v_bca0
	FROM journal_lines WHERE account_code = '1-110';

	INSERT INTO chart_of_accounts (code, name, account_type, parent_code, is_active, description)
	VALUES (v_code, 'E-toll Flazz BCA', 'asset', '1-000', true,
	        'Kartu e-money — BCA Flazz 0145-2003-0572-6525');

	INSERT INTO bank_accounts (
		account_name, bank_name, account_number, coa_code, account_kind,
		card_provider, low_balance_threshold, is_default_receive, is_active
	) VALUES (
		'E-toll Flazz BCA', 'BCA Flazz', '0145 2003 0572 6525', v_code, 'emoney',
		'BCA Flazz', 100000, false, true
	) RETURNING id INTO v_card;

	v_entry := record_emoney_opening_balance(
		v_card, v_amount, DATE '2026-08-21',
		'Saldo per aplikasi BCA 25 Agu 2026 Rp57.400 + tol event BRI 22 Agu Rp53.000 yang belum di-settle',
		v_actor
	);

	-- Pemeriksaan: kas tidak boleh bergerak, saldo kartu harus pas.
	SELECT COALESCE(SUM(debit_amount - credit_amount), 0) INTO v_bca1
	FROM journal_lines WHERE account_code = '1-110';
	SELECT COALESCE(SUM(debit_amount - credit_amount), 0) INTO v_bal
	FROM journal_lines WHERE account_code = v_code;

	IF v_bca1 <> v_bca0 THEN
		RAISE EXCEPTION 'Saldo BCA berubah (% → %) — seharusnya tidak tersentuh', v_bca0, v_bca1;
	END IF;
	IF v_bal <> v_amount THEN
		RAISE EXCEPTION 'Saldo kartu %, seharusnya %', v_bal, v_amount;
	END IF;

	RAISE NOTICE 'Kartu E-toll Flazz BCA (%) dibuat. Saldo buku %, BCA tetap %. Jurnal %',
		v_code, v_bal, v_bca1, v_entry;
END
$datafix$;
