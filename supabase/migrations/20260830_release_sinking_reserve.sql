-- ============================================================================
-- 20260830_release_sinking_reserve.sql — pakai dana cadangan untuk pembelian.
--
-- Yang gampang salah di sini: dana cadangan itu KEWAJIBAN (2-2xx), bukan
-- rekening berisi uang. Uangnya sendiri tetap duduk di bank. Jadi "membeli
-- pakai dana cadangan" TIDAK berarti uangnya keluar dari tempat lain — kasnya
-- tetap berkurang dari bank seperti biasa. Yang terjadi tambahan: cadangan
-- yang dulu disisihkan sekarang terpakai, jadi penyisihannya dilepas.
--
-- Saat settle, penyisihan dicatat:   Dr 3-200 Laba Ditahan / Cr 2-2xx
-- Melepasnya berarti kebalikannya:   Dr 2-2xx              / Cr 3-200
--
-- Perhatikan bedanya dengan "penarikan dana" di halaman Dana Cadangan yang
-- mencatat Dr 2-2xx / Cr kas — itu untuk penarikan yang berdiri sendiri, di
-- mana belanjanya TIDAK dicatat di tempat lain. Memakainya di sini akan
-- mengkredit bank dua kali, karena jurnal pembelian sudah melakukannya.
--
-- Jurnal + baris pergerakan ditulis bersama supaya saldo dana (dihitung dari
-- sinking_fund_movements) dan buku besar (2-2xx) tidak pernah berbeda.
-- ============================================================================

CREATE OR REPLACE FUNCTION release_sinking_reserve(
	p_fund_id   UUID,
	p_amount    BIGINT,
	p_note      TEXT,
	p_entry_date DATE,
	p_actor_id  UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
	v_fund     RECORD;
	v_balance  BIGINT;
	v_entry_id UUID;
	v_ref_id   TEXT;
	v_desc     TEXT;
BEGIN
	PERFORM require_owner_level_rpc('release_sinking_reserve');

	IF p_amount IS NULL OR p_amount <= 0 THEN
		RAISE EXCEPTION 'Nominal pemakaian dana cadangan harus lebih dari 0'
			USING ERRCODE = '22023';
	END IF;

	SELECT id, code, name, coa_account, is_active
	INTO v_fund FROM sinking_funds WHERE id = p_fund_id;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'Dana cadangan tidak ditemukan' USING ERRCODE = 'P0002';
	END IF;
	IF NOT v_fund.is_active THEN
		RAISE EXCEPTION 'Dana cadangan % sudah nonaktif', v_fund.name
			USING ERRCODE = '22023';
	END IF;
	IF v_fund.coa_account IS NULL THEN
		RAISE EXCEPTION 'Dana cadangan % belum punya kode akun', v_fund.name
			USING ERRCODE = '22023';
	END IF;

	-- Saldo dihitung sama persis dengan get_sinking_fund_balances.
	SELECT COALESCE(SUM(
		CASE movement_type
			WHEN 'deposit' THEN amount
			WHEN 'withdrawal' THEN -amount
			ELSE 0
		END), 0)::BIGINT
	INTO v_balance
	FROM sinking_fund_movements WHERE fund_id = p_fund_id;

	IF v_balance < p_amount THEN
		RAISE EXCEPTION 'Dana % cuma berisi %, sedangkan yang mau dipakai %. Pilih dana lain atau kurangi nominalnya.',
			v_fund.name, v_balance, p_amount
			USING ERRCODE = '22023';
	END IF;

	v_ref_id := generate_journal_reference(p_entry_date);
	v_desc := 'Pakai dana cadangan ' || v_fund.name;
	IF NULLIF(TRIM(COALESCE(p_note, '')), '') IS NOT NULL THEN
		v_desc := v_desc || ' — ' || TRIM(p_note);
	END IF;

	INSERT INTO journal_entries (
		ref_id, entry_date, entry_type, description,
		source_type, source_id, total_amount, created_by
	) VALUES (
		v_ref_id, p_entry_date, 'adjustment', v_desc,
		'sinking_release', p_fund_id, p_amount, p_actor_id
	) RETURNING id INTO v_entry_id;

	INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
	VALUES (v_entry_id, v_fund.coa_account, p_amount,
	        'Cadangan ' || v_fund.name || ' terpakai', 0);

	INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
	VALUES (v_entry_id, '3-200', p_amount,
	        'Penyisihan dilepas kembali ke laba ditahan', 1);

	-- Baris pergerakan: inilah yang menurunkan saldo dana di semua layar.
	INSERT INTO sinking_fund_movements (
		fund_id, movement_type, amount, source_type, description, performed_by
	) VALUES (
		p_fund_id, 'withdrawal', p_amount, 'purchase',
		COALESCE(NULLIF(TRIM(COALESCE(p_note, '')), ''), 'Dipakai untuk pembelian'),
		p_actor_id
	);

	RETURN jsonb_build_object(
		'entry_ref', v_ref_id,
		'fund_name', v_fund.name,
		'balance_before', v_balance,
		'balance_after', v_balance - p_amount
	);
END;
$fn$;

COMMENT ON FUNCTION release_sinking_reserve IS
	'Lepas penyisihan dana cadangan karena terpakai (mis. beli alat): Dr 2-2xx / Cr 3-200 + baris withdrawal. TIDAK menyentuh kas — jurnal pembelian yang mengurangi bank. Jangan dipakai untuk penarikan dana yang berdiri sendiri (itu Dr 2-2xx / Cr kas).';

REVOKE ALL ON FUNCTION release_sinking_reserve(UUID, BIGINT, TEXT, DATE, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION release_sinking_reserve(UUID, BIGINT, TEXT, DATE, UUID) TO authenticated, service_role;
