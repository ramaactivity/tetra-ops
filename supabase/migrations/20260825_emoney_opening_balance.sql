-- ============================================================================
-- 20260825_emoney_opening_balance.sql — saldo awal kartu yang uangnya sudah
-- lama keluar dari bank.
--
-- Cacat yang ditutup: saldo awal kartu semula WAJIB diambil dari rekening
-- kas/bank (lewat record_balance_transfer). Itu benar cuma untuk kartu yang
-- BARU diisi. Untuk kartu yang sudah lama dipakai, uangnya sudah keluar dari
-- bank berbulan-bulan lalu — dan di Tetra Ops topup e-toll selama ini malah
-- langsung dibebankan (mis. JE 11 Agu "Topup Etoll" Dr 5-213). Mengambilnya
-- dari bank lagi = saldo bank berkurang dua kali.
--
-- Perlakuan yang benar untuk mendaftarkan aset yang selama ini tak terlacak:
--   Dr 1-1xx Kartu          <saldo asli>
--       Cr 3-101 Modal Awal / Saldo Awal
-- Sama seperti yang dipakai cutoff keuangan. Kas tidak disentuh (memang tidak
-- ada uang bergerak hari ini), dan laba bulan berjalan tidak terdistorsi —
-- salah-catat di periode lalu dibiarkan di periode lalu.
--
-- Penjaga: hanya untuk kartu e-money, dan hanya kalau kartunya BELUM punya
-- satu pun baris jurnal. Jadi mustahil dipakai dua kali untuk "menciptakan"
-- saldo.
-- ============================================================================

CREATE OR REPLACE FUNCTION record_emoney_opening_balance(
	p_account_id UUID,
	p_amount     BIGINT,
	p_entry_date DATE,
	p_note       TEXT,
	p_actor_id   UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
	v_card     RECORD;
	v_existing INTEGER;
	v_entry_id UUID;
	v_ref_id   TEXT;
	v_desc     TEXT;
BEGIN
	PERFORM require_owner_level_rpc('record_emoney_opening_balance');

	IF p_amount IS NULL OR p_amount <= 0 THEN
		RAISE EXCEPTION 'Saldo awal harus lebih dari 0' USING ERRCODE = '22023';
	END IF;

	SELECT id, account_name, coa_code, account_kind
	INTO v_card FROM bank_accounts WHERE id = p_account_id;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'Kartu tidak ditemukan' USING ERRCODE = 'P0002';
	END IF;
	IF v_card.account_kind <> 'emoney' THEN
		RAISE EXCEPTION 'Saldo awal cara ini hanya untuk kartu e-money'
			USING ERRCODE = '22023';
	END IF;

	SELECT COUNT(*) INTO v_existing
	FROM journal_lines WHERE account_code = v_card.coa_code;
	IF v_existing > 0 THEN
		RAISE EXCEPTION 'Kartu % sudah punya riwayat jurnal — pakai Isi saldo atau Cocokkan saldo, bukan saldo awal',
			v_card.account_name USING ERRCODE = '22023';
	END IF;

	v_ref_id := generate_journal_reference(p_entry_date);
	v_desc := 'Saldo awal kartu ' || v_card.account_name
	        || ' (uangnya sudah keluar dari bank sebelum kartu ini didaftarkan)';
	IF NULLIF(TRIM(COALESCE(p_note, '')), '') IS NOT NULL THEN
		v_desc := v_desc || ' — ' || TRIM(p_note);
	END IF;

	INSERT INTO journal_entries (
		ref_id, entry_date, entry_type, description,
		source_type, source_id, total_amount, created_by
	) VALUES (
		v_ref_id, p_entry_date, 'adjustment', v_desc,
		'emoney_opening', p_account_id, p_amount, p_actor_id
	) RETURNING id INTO v_entry_id;

	INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
	VALUES (v_entry_id, v_card.coa_code, p_amount, 'Saldo yang sudah ada di kartu', 0);

	INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
	VALUES (v_entry_id, '3-101', p_amount, 'Penyeimbang saldo awal kartu', 1);

	RETURN v_entry_id;
END;
$fn$;

COMMENT ON FUNCTION record_emoney_opening_balance IS
	'Daftarkan saldo yang sudah lama ada di kartu e-money: Dr kartu / Cr 3-101 Modal Awal. Tidak menyentuh kas — uangnya sudah keluar dari bank di periode lalu. Hanya bisa sekali per kartu (ditolak kalau kartu sudah punya jurnal).';

REVOKE ALL ON FUNCTION record_emoney_opening_balance(UUID, BIGINT, DATE, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_emoney_opening_balance(UUID, BIGINT, DATE, TEXT, UUID) TO authenticated, service_role;
