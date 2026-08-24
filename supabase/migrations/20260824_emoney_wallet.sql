-- ============================================================================
-- 20260824_emoney_wallet.sql — Kartu e-money (e-toll) sebagai akun saldo.
--
-- Masalah: kartu e-toll di-topup dulu dari bank, baru dipakai di gerbang tol.
-- Selama ini sistem cuma mengenal "Beban Toll" — uang yang sudah pindah ke
-- kartu tidak punya tempat berdiri, jadi:
--   • saldo BCA di buku terlalu besar (topup tak pernah tercatat), dan
--   • pemakaian di gerbang tol tak punya lawan jurnal selain talangan crew.
--
-- Perlakuan: kartu = rekening biasa di golongan Kas & Bank (1-1xx). Dengan
-- begitu ia otomatis ikut Neraca, Buku Bulanan, penjaga saldo-tak-boleh-minus,
-- dan seluruh pemilih "uang keluar dari rekening" yang sudah ada — tanpa satu
-- pun layar itu perlu diubah (semuanya menyaring lewat isCashOrBank/1-1xx).
--
-- Rentang kode SENGAJA dipisah dari bank:
--   1-100          Kas Tunai
--   1-110 … 1-139  Bank
--   1-140 … 1-159  Kartu e-money   ← baru
-- Penomoran bank berjalan "ambil nomor kosong berikutnya"; tanpa blok
-- terpisah, bank baru akan nyempil di tengah daftar kartu.
--
-- Idempotent — aman dijalankan ulang.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Kolom baru di bank_accounts
-- ---------------------------------------------------------------------------
ALTER TABLE bank_accounts
	ADD COLUMN IF NOT EXISTS account_kind TEXT NOT NULL DEFAULT 'bank',
	ADD COLUMN IF NOT EXISTS card_provider TEXT,
	ADD COLUMN IF NOT EXISTS holder_note TEXT,
	ADD COLUMN IF NOT EXISTS low_balance_threshold BIGINT NOT NULL DEFAULT 0;

DO $do$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'bank_accounts_account_kind_check'
	) THEN
		ALTER TABLE bank_accounts
			ADD CONSTRAINT bank_accounts_account_kind_check
			CHECK (account_kind IN ('cash', 'bank', 'emoney'));
	END IF;
END
$do$;

-- Kas Tunai bukan "bank" — supaya pemilih rekening tujuan pembayaran klien
-- bisa menyaring per jenis, bukan per kode yang di-hardcode.
UPDATE bank_accounts SET account_kind = 'cash'
WHERE coa_code = '1-100' AND account_kind <> 'cash';

COMMENT ON COLUMN bank_accounts.account_kind IS
	'cash = kas tunai (1-100). bank = rekening bank (1-110..1-139). emoney = kartu e-toll/e-money (1-140..1-159). Kartu emoney TIDAK boleh jadi rekening penerima pembayaran klien.';
COMMENT ON COLUMN bank_accounts.card_provider IS
	'Penerbit kartu e-money (Mandiri e-Money, BCA Flazz, BRI Brizzi). Keterangan saja, tidak dipakai hitungan.';
COMMENT ON COLUMN bank_accounts.holder_note IS
	'Siapa yang sedang memegang kartu — supaya waktu ada selisih saldo, jelas ke siapa harus bertanya.';
COMMENT ON COLUMN bank_accounts.low_balance_threshold IS
	'Di bawah nominal ini kartu ditandai "saldo menipis". 0 = tanpa peringatan.';

-- ---------------------------------------------------------------------------
-- 2. Akun selisih saldo
-- ---------------------------------------------------------------------------
-- Dipakai saat owner mencocokkan saldo kartu tapi tidak tahu sebab selisihnya.
-- Sengaja akun sendiri (bukan menumpang 5-900 Beban Operasional Lain) supaya
-- besarnya "uang yang tak terlacak" kelihatan sebagai satu angka.
INSERT INTO chart_of_accounts (code, name, account_type, parent_code, is_active, description)
VALUES (
	'5-905', 'Selisih Saldo Kas & Kartu', 'expense', '5-000', true,
	'Selisih saat mencocokkan saldo kartu e-money/kas yang sebabnya tidak diketahui. Bisa bergerak dua arah: didebit saat saldo asli lebih kecil, dikredit saat lebih besar.'
)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Pindah saldo antar rekening (topup kartu = kasus khusus)
-- ---------------------------------------------------------------------------
-- Sebelum ini tidak ada satu pun jalur untuk memindahkan uang antar rekening
-- sendiri. Topup e-toll butuh itu, dan tarik tunai BCA → Kas Tunai juga.
--
-- Topup BUKAN pengeluaran: yang jadi beban hanya biaya adminnya.
--   Dr 1-140 E-toll A            100.000
--   Dr 5-600 Beban Adm Bank        1.500
--       Cr 1-110 Bank BCA               101.500
CREATE OR REPLACE FUNCTION record_balance_transfer(
	p_from_coa   TEXT,
	p_to_coa     TEXT,
	p_amount     BIGINT,
	p_admin_fee  BIGINT,
	p_entry_date DATE,
	p_note       TEXT,
	p_actor_id   UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
	v_from_name TEXT;
	v_to_name   TEXT;
	v_fee       BIGINT;
	v_out       BIGINT;
	v_balance   BIGINT;
	v_entry_id  UUID;
	v_ref_id    TEXT;
	v_ord       INTEGER := 0;
	v_desc      TEXT;
BEGIN
	PERFORM require_owner_level_rpc('record_balance_transfer');

	IF p_amount IS NULL OR p_amount <= 0 THEN
		RAISE EXCEPTION 'Nominal pindah saldo harus lebih dari 0' USING ERRCODE = '22023';
	END IF;
	v_fee := GREATEST(COALESCE(p_admin_fee, 0), 0);
	v_out := p_amount + v_fee;

	IF p_from_coa = p_to_coa THEN
		RAISE EXCEPTION 'Rekening asal dan tujuan tidak boleh sama' USING ERRCODE = '22023';
	END IF;

	SELECT name INTO v_from_name FROM chart_of_accounts
	WHERE code = p_from_coa AND is_active
	  AND account_type = 'asset' AND code ~ '^1-1[0-9]{2}$';
	IF v_from_name IS NULL THEN
		RAISE EXCEPTION 'Rekening asal % bukan kas/bank yang aktif', p_from_coa
			USING ERRCODE = '22023';
	END IF;

	SELECT name INTO v_to_name FROM chart_of_accounts
	WHERE code = p_to_coa AND is_active
	  AND account_type = 'asset' AND code ~ '^1-1[0-9]{2}$';
	IF v_to_name IS NULL THEN
		RAISE EXCEPTION 'Rekening tujuan % bukan kas/bank yang aktif', p_to_coa
			USING ERRCODE = '22023';
	END IF;

	-- Penjaga saldo: rekening asal tidak boleh jadi minus. Pesan menyebut
	-- angkanya supaya owner tahu kurangnya berapa, bukan cuma "gagal".
	SELECT COALESCE(SUM(debit_amount - credit_amount), 0) INTO v_balance
	FROM journal_lines WHERE account_code = p_from_coa;

	IF v_balance < v_out THEN
		RAISE EXCEPTION 'Saldo % cuma % , sedangkan yang mau dipindah % (termasuk biaya admin)',
			v_from_name, v_balance, v_out
			USING ERRCODE = '22023';
	END IF;

	v_ref_id := generate_journal_reference(p_entry_date);
	v_desc := 'Pindah saldo: ' || v_from_name || ' → ' || v_to_name;
	IF NULLIF(TRIM(COALESCE(p_note, '')), '') IS NOT NULL THEN
		v_desc := v_desc || ' — ' || TRIM(p_note);
	END IF;

	INSERT INTO journal_entries (
		ref_id, entry_date, entry_type, description,
		source_type, total_amount, created_by
	) VALUES (
		v_ref_id, p_entry_date, 'transfer', v_desc,
		'balance_transfer', v_out, p_actor_id
	) RETURNING id INTO v_entry_id;

	INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
	VALUES (v_entry_id, p_to_coa, p_amount, 'Saldo masuk: ' || v_to_name, v_ord);
	v_ord := v_ord + 1;

	IF v_fee > 0 THEN
		INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
		VALUES (v_entry_id, '5-600', v_fee, 'Biaya admin pindah saldo', v_ord);
		v_ord := v_ord + 1;
	END IF;

	INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
	VALUES (v_entry_id, p_from_coa, v_out, 'Saldo keluar: ' || v_from_name, v_ord);

	RETURN v_entry_id;
END;
$fn$;

COMMENT ON FUNCTION record_balance_transfer IS
	'Pindah saldo antar rekening kas/bank/kartu (1-1xx). Bukan beban — hanya biaya adminnya yang dibebankan ke 5-600. Dipakai untuk topup kartu e-toll dan tarik tunai.';

REVOKE ALL ON FUNCTION record_balance_transfer(TEXT, TEXT, BIGINT, BIGINT, DATE, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_balance_transfer(TEXT, TEXT, BIGINT, BIGINT, DATE, TEXT, UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Cocokkan saldo kartu (opname saldo)
-- ---------------------------------------------------------------------------
-- Pemakaian e-toll sering lolos catat. Ini jaring pengamannya: owner isi saldo
-- asli di kartu, selisihnya dijurnal. Pola sama dengan Stok Opname.
--
-- p_reason:
--   'usage'            selisih kurang karena kepakai (default) → Dr p_expense_coa
--   'topup_unrecorded' selisih lebih karena topup belum dicatat → Cr rekening asal
--   'unknown'          sebab tak diketahui → 5-905 (dua arah)
CREATE OR REPLACE FUNCTION record_emoney_recount(
	p_account_id      UUID,
	p_actual_balance  BIGINT,
	p_reason          TEXT,
	p_counterpart_coa TEXT,
	p_expense_coa     TEXT,
	p_entry_date      DATE,
	p_note            TEXT,
	p_actor_id        UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
	v_card        RECORD;
	v_book        BIGINT;
	v_diff        BIGINT;
	v_abs         BIGINT;
	v_entry_id    UUID;
	v_ref_id      TEXT;
	v_desc        TEXT;
	v_expense_coa TEXT;
	v_cp_name     TEXT;
BEGIN
	PERFORM require_owner_level_rpc('record_emoney_recount');

	IF p_actual_balance IS NULL OR p_actual_balance < 0 THEN
		RAISE EXCEPTION 'Saldo asli tidak boleh kosong atau minus' USING ERRCODE = '22023';
	END IF;

	SELECT id, account_name, coa_code, account_kind, is_active
	INTO v_card FROM bank_accounts WHERE id = p_account_id;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'Kartu tidak ditemukan' USING ERRCODE = 'P0002';
	END IF;
	IF v_card.account_kind <> 'emoney' THEN
		RAISE EXCEPTION 'Cocokkan saldo hanya untuk kartu e-money' USING ERRCODE = '22023';
	END IF;

	SELECT COALESCE(SUM(debit_amount - credit_amount), 0) INTO v_book
	FROM journal_lines WHERE account_code = v_card.coa_code;

	v_diff := p_actual_balance - v_book;

	IF v_diff = 0 THEN
		RETURN jsonb_build_object(
			'entry_id', NULL, 'book_balance', v_book,
			'actual_balance', p_actual_balance, 'difference', 0
		);
	END IF;

	v_abs    := ABS(v_diff);
	v_ref_id := generate_journal_reference(p_entry_date);
	v_desc   := 'Cocokkan saldo ' || v_card.account_name
	         || ' (buku ' || v_book || ' → asli ' || p_actual_balance || ')';
	IF NULLIF(TRIM(COALESCE(p_note, '')), '') IS NOT NULL THEN
		v_desc := v_desc || ' — ' || TRIM(p_note);
	END IF;

	INSERT INTO journal_entries (
		ref_id, entry_date, entry_type, description,
		source_type, source_id, total_amount, created_by
	) VALUES (
		v_ref_id, p_entry_date, 'adjustment', v_desc,
		'emoney_recount', p_account_id, v_abs, p_actor_id
	) RETURNING id INTO v_entry_id;

	IF v_diff < 0 THEN
		-- Saldo asli lebih kecil: ada pemakaian yang tidak tercatat.
		v_expense_coa := CASE
			WHEN p_reason = 'unknown' THEN '5-905'
			ELSE COALESCE(NULLIF(TRIM(COALESCE(p_expense_coa, '')), ''), '5-213')
		END;
		IF NOT EXISTS (
			SELECT 1 FROM chart_of_accounts
			WHERE code = v_expense_coa AND is_active AND account_type = 'expense'
		) THEN
			RAISE EXCEPTION 'Akun beban % tidak ada atau nonaktif', v_expense_coa
				USING ERRCODE = '22023';
		END IF;

		INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
		VALUES (v_entry_id, v_expense_coa, v_abs, 'Pemakaian kartu yang belum tercatat', 0);
		INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
		VALUES (v_entry_id, v_card.coa_code, v_abs, 'Saldo ' || v_card.account_name || ' berkurang', 1);
	ELSE
		-- Saldo asli lebih besar: biasanya topup yang belum dicatat.
		INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
		VALUES (v_entry_id, v_card.coa_code, v_abs, 'Saldo ' || v_card.account_name || ' bertambah', 0);

		IF p_reason = 'topup_unrecorded' THEN
			SELECT name INTO v_cp_name FROM chart_of_accounts
			WHERE code = p_counterpart_coa AND is_active
			  AND account_type = 'asset' AND code ~ '^1-1[0-9]{2}$';
			IF v_cp_name IS NULL THEN
				RAISE EXCEPTION 'Rekening asal topup harus kas/bank yang aktif'
					USING ERRCODE = '22023';
			END IF;
			IF p_counterpart_coa = v_card.coa_code THEN
				RAISE EXCEPTION 'Rekening asal topup tidak boleh kartu itu sendiri'
					USING ERRCODE = '22023';
			END IF;
			INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
			VALUES (v_entry_id, p_counterpart_coa, v_abs, 'Topup yang belum dicatat, dari ' || v_cp_name, 1);
		ELSE
			INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
			VALUES (v_entry_id, '5-905', v_abs, 'Selisih saldo lebih, sebab tidak diketahui', 1);
		END IF;
	END IF;

	RETURN jsonb_build_object(
		'entry_id', v_entry_id, 'book_balance', v_book,
		'actual_balance', p_actual_balance, 'difference', v_diff
	);
END;
$fn$;

COMMENT ON FUNCTION record_emoney_recount IS
	'Cocokkan saldo buku kartu e-money dengan saldo asli. Selisih kurang → beban (default 5-213 Toll). Selisih lebih → kredit rekening asal topup, atau 5-905 kalau sebabnya tak diketahui.';

REVOKE ALL ON FUNCTION record_emoney_recount(UUID, BIGINT, TEXT, TEXT, TEXT, DATE, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_emoney_recount(UUID, BIGINT, TEXT, TEXT, TEXT, DATE, TEXT, UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Penerjemah penanda "dibayar dari rekening"
-- ---------------------------------------------------------------------------
-- crew_rekap.expense_paid_by menyimpan 'crew' | 'owner' | <uuid crew> — dan
-- sekarang juga 'acct:<uuid bank_accounts>' untuk biaya yang dibayar langsung
-- dari saldo perusahaan (kartu e-toll, kas, bank). Fungsi ini menerjemahkannya
-- ke kode COA, dan mengembalikan NULL untuk semua bentuk lain.
CREATE OR REPLACE FUNCTION paid_from_account_coa(p_val TEXT) RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
	v_id  UUID;
	v_coa TEXT;
BEGIN
	IF p_val IS NULL OR LEFT(p_val, 5) <> 'acct:' THEN
		RETURN NULL;
	END IF;
	BEGIN
		v_id := SUBSTRING(p_val FROM 6)::UUID;
	EXCEPTION WHEN others THEN
		RETURN NULL;
	END;
	SELECT coa_code INTO v_coa FROM bank_accounts WHERE id = v_id AND is_active;
	RETURN v_coa;
END;
$fn$;

COMMENT ON FUNCTION paid_from_account_coa IS
	'Terjemahkan penanda pembayar "acct:<uuid bank_accounts>" jadi kode COA. NULL untuk crew/owner/uuid crew/kartu nonaktif.';
