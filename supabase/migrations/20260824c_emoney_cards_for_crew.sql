-- ============================================================================
-- 20260824c_emoney_cards_for_crew.sql — daftar kartu e-money untuk form rekap.
--
-- Kenapa perlu RPC sendiri: RLS `bank_accounts` cuma mengizinkan owner-level
-- membaca (policy bank_read_owner). Kalau form rekap dibuka crew, pemilih
-- "dibayar pakai kartu" akan kosong TANPA error apa pun — persis pola bug
-- yang sudah pernah kena di daftar penalang (lihat get_event_crew).
--
-- Yang dipaparkan sengaja minimum: id + nama + tanda saldo menipis.
-- SALDO TIDAK IKUT — crew tidak pernah melihat angka keuangan perusahaan.
-- Tanda "menipis" sudah cukup untuk keputusan di lapangan ("pakai kartu yang
-- mana"), tanpa membocorkan nominalnya.
-- ============================================================================

CREATE OR REPLACE FUNCTION list_emoney_cards_safe()
RETURNS TABLE (id UUID, name TEXT, is_low BOOLEAN)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_active
	) THEN
		RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
	END IF;

	RETURN QUERY
	SELECT
		b.id,
		b.account_name,
		b.low_balance_threshold > 0
			AND COALESCE((
				SELECT SUM(jl.debit_amount - jl.credit_amount)
				FROM journal_lines jl
				WHERE jl.account_code = b.coa_code
			), 0) < b.low_balance_threshold
	FROM bank_accounts b
	WHERE b.account_kind = 'emoney' AND b.is_active
	ORDER BY b.coa_code;
END;
$fn$;

COMMENT ON FUNCTION list_emoney_cards_safe IS
	'Kartu e-money aktif untuk pemilih pembayar di form rekap. Kolom aman saja (id, nama, tanda saldo menipis) — tanpa nominal saldo, karena crew tidak boleh melihat angka keuangan.';

REVOKE ALL ON FUNCTION list_emoney_cards_safe() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_emoney_cards_safe() TO authenticated, service_role;
