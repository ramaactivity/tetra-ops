-- ============================================================================
-- datafix_purchase_admin_fee_20260828.sql
-- Tambahkan biaya admin bank Rp2.500 ke jurnal pembelian JE-20260828-7669B6A6.
--
-- Struk transfer BCA (27 Agu 2026 17:00:30, BI-FAST ke blu BCA Digital):
--   Nominal   IDR 2.250.000
--   Biaya     IDR     2.500   ← kolom "Biaya admin" di dialog tidak diisi
--   Keluar    IDR 2.252.500
--
-- Jurnal semula hanya Dr 1-200 / Cr 1-110 sebesar 2.250.000, jadi saldo BCA di
-- buku Rp2.500 lebih tinggi dari kenyataan.
--
-- Hasil akhir dibuat PERSIS seperti yang akan ditulis recordPurchaseBatch kalau
-- kolom itu terisi sejak awal:
--   Dr 1-200 Persediaan Media Set   2.250.000   (nilai barang, tidak berubah —
--                                                biaya admin bukan HPP)
--   Dr 5-600 Beban Administrasi Bank    2.500
--       Cr 1-110 Bank BCA                    2.252.500
--
-- Idempotent: berhenti tanpa efek kalau baris 5-600 sudah ada di jurnal itu.
-- ============================================================================

DO $datafix$
DECLARE
	v_ref     TEXT   := 'JE-20260828-7669B6A6';
	v_fee     BIGINT := 2500;
	v_entry   UUID;
	v_bca0    BIGINT;
	v_bca1    BIGINT;
	v_debit   BIGINT;
	v_credit  BIGINT;
BEGIN
	SELECT id INTO v_entry FROM journal_entries WHERE ref_id = v_ref;
	IF v_entry IS NULL THEN
		RAISE EXCEPTION 'Jurnal % tidak ditemukan', v_ref;
	END IF;

	IF EXISTS (
		SELECT 1 FROM journal_lines
		WHERE entry_id = v_entry AND account_code = '5-600'
	) THEN
		RAISE NOTICE 'Biaya admin sudah ada di % — datafix dilewati.', v_ref;
		RETURN;
	END IF;

	SELECT COALESCE(SUM(debit_amount - credit_amount), 0) INTO v_bca0
	FROM journal_lines WHERE account_code = '1-110';

	-- Kredit bank digeser ke urutan terakhir supaya susunannya sama dengan
	-- jurnal pembelian yang memang punya biaya admin sejak awal.
	UPDATE journal_lines
	SET credit_amount = credit_amount + v_fee, line_order = 3
	WHERE entry_id = v_entry AND account_code = '1-110';

	INSERT INTO journal_lines (
		entry_id, account_code, debit_amount, credit_amount, description, line_order
	) VALUES (
		v_entry, '5-600', v_fee, 0, 'Biaya admin/transfer bank', 2
	);

	UPDATE journal_entries
	SET total_amount = total_amount + v_fee
	WHERE id = v_entry;

	-- Pemeriksaan: jurnalnya harus tetap balance & bank turun tepat v_fee.
	SELECT COALESCE(SUM(debit_amount), 0), COALESCE(SUM(credit_amount), 0)
	INTO v_debit, v_credit
	FROM journal_lines WHERE entry_id = v_entry;
	IF v_debit <> v_credit THEN
		RAISE EXCEPTION 'Jurnal tidak balance: D=% C=%', v_debit, v_credit;
	END IF;

	SELECT COALESCE(SUM(debit_amount - credit_amount), 0) INTO v_bca1
	FROM journal_lines WHERE account_code = '1-110';
	IF v_bca1 <> v_bca0 - v_fee THEN
		RAISE EXCEPTION 'Saldo BCA turun % , seharusnya %', v_bca0 - v_bca1, v_fee;
	END IF;

	RAISE NOTICE 'OK % → D=C=% · BCA % → %', v_ref, v_debit, v_bca0, v_bca1;
END
$datafix$;
