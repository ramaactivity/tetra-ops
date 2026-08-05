-- ============================================================================
-- Rekap: flag "siapa yang bayar" per pengeluaran lapangan + fix Lainnya tak
-- terhitung di OpEx.
--
-- Konteks bisnis: biaya lapangan (transport/bensin/toll/parkir/konsumsi/
-- lain-lain) kadang DITALANGI crew (perlu di-rembers) dan kadang DIBAYAR
-- OWNER langsung (uang perusahaan, biasanya sudah/akan dicatat owner via
-- "Catat transaksi" → 5-2xx). Model lama menganggap SEMUA biaya lapangan
-- talangan crew: settle_event men-debit beban + kredit 2-100 Hutang Crew
-- penuh. Kalau owner yang bayar & juga mencatatnya via Catat, bebannya
-- DOBEL dan 2-100 menggelembung tanpa pernah dibayar (bukti nyata: JE
-- "Koreksi pencatatan ganda biaya bensin 100k", 2026-07-23).
--
-- Perubahan:
-- 1. crew_rekap.expense_paid_by JSONB — map {transport|bensin|toll|parking|
--    konsumsi: 'crew'|'owner'}. Absen/kosong = 'crew' (perilaku lama persis).
--    Item lainnya_items membawa paid_by per item di JSONB-nya sendiri.
-- 2. calculate_recap_opex():
--    • Biaya ber-flag 'owner' DIKELUARKAN dari OpEx (anti dobel dgn Catat
--      transaksi; aturan utk owner: biaya yang kamu bayar sendiri tetap
--      dicatat via Catat transaksi seperti biasa).
--    • FIX BUG LATEN: 'misc' sekarang dibaca dari crew_rekap.lainnya_items
--      (JSONB) — bukan tabel event_recap_misc_expenses yang TIDAK PERNAH
--      diisi oleh aplikasi sejak backfill satu kali 2026-05-20, sehingga
--      biaya "Lainnya" yang disubmit setelah itu tidak pernah masuk OpEx
--      settlement. JSONB adalah superset data tabel (backfill dulu menyalin
--      DARI JSONB), jadi aman utk semua era.
--    • Key info baru 'owner_paid_total' (tidak dibaca settle_event — hanya
--      utk tampilan preview/laporan).
--
-- settle_event TIDAK diubah: ia membaca output fungsi ini, jadi jurnal
-- (Dr 5-2xx / Cr 2-100) otomatis hanya memuat porsi talangan crew + fee.
-- Forward-only: event yang sudah settled tetap pakai angka tersimpan.
-- ============================================================================

ALTER TABLE crew_rekap
  ADD COLUMN IF NOT EXISTS expense_paid_by JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN crew_rekap.expense_paid_by IS
  'Siapa yang membayar tiap biaya lapangan: map {transport|bensin|toll|parking|konsumsi: ''crew''|''owner''}. Absen = crew (ditalangi, perlu reimburse via 2-100). ''owner'' = dibayar uang perusahaan, TIDAK ikut OpEx settlement (dicatat owner via Catat transaksi). Item lain-lain membawa paid_by di crew_rekap.lainnya_items.';

CREATE OR REPLACE FUNCTION calculate_recap_opex(p_recap_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id   UUID;
  v_recap      RECORD;

  v_fee_lead       BIGINT := 0;
  v_fee_asisten    BIGINT := 0;
  v_fee_crew_c     BIGINT := 0;
  v_fee_extra      BIGINT := 0;
  v_transport      BIGINT := 0;
  v_bensin         BIGINT := 0;
  v_toll           BIGINT := 0;
  v_parking        BIGINT := 0;
  v_konsumsi       BIGINT := 0;
  v_misc           BIGINT := 0;
  v_owner_paid     BIGINT := 0;

  v_paid_by        JSONB;
  v_amt            BIGINT;
  v_item           JSONB;
BEGIN
  SELECT * INTO v_recap FROM crew_rekap WHERE id = p_recap_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recap not found: %', p_recap_id USING ERRCODE = 'P0002';
  END IF;
  v_event_id := v_recap.event_id;
  v_paid_by  := COALESCE(v_recap.expense_paid_by, '{}'::jsonb);

  -- Field expenses — hanya yang DITALANGI CREW yang masuk OpEx settlement.
  -- Yang dibayar owner dihitung ke v_owner_paid (info), TIDAK ke OpEx:
  -- owner mencatatnya sendiri via Catat transaksi → menghitung di sini lagi
  -- = beban dobel + Hutang Crew fiktif.
  v_amt := ROUND(COALESCE(v_recap.transport_cost, 0))::BIGINT;
  IF COALESCE(v_paid_by->>'transport', 'crew') = 'owner' THEN
    v_owner_paid := v_owner_paid + v_amt; ELSE v_transport := v_amt; END IF;

  v_amt := ROUND(COALESCE(v_recap.bensin_cost, 0))::BIGINT;
  IF COALESCE(v_paid_by->>'bensin', 'crew') = 'owner' THEN
    v_owner_paid := v_owner_paid + v_amt; ELSE v_bensin := v_amt; END IF;

  v_amt := ROUND(COALESCE(v_recap.toll_cost, 0))::BIGINT;
  IF COALESCE(v_paid_by->>'toll', 'crew') = 'owner' THEN
    v_owner_paid := v_owner_paid + v_amt; ELSE v_toll := v_amt; END IF;

  v_amt := ROUND(COALESCE(v_recap.parking_cost, 0))::BIGINT;
  IF COALESCE(v_paid_by->>'parking', 'crew') = 'owner' THEN
    v_owner_paid := v_owner_paid + v_amt; ELSE v_parking := v_amt; END IF;

  v_amt := ROUND(COALESCE(v_recap.konsumsi_cost, 0))::BIGINT;
  IF COALESCE(v_paid_by->>'konsumsi', 'crew') = 'owner' THEN
    v_owner_paid := v_owner_paid + v_amt; ELSE v_konsumsi := v_amt; END IF;

  -- Lain-lain — dari crew_rekap.lainnya_items (JSONB), per item punya
  -- paid_by opsional. (Dulu baca event_recap_misc_expenses yang orphan.)
  IF v_recap.lainnya_items IS NOT NULL
     AND jsonb_typeof(v_recap.lainnya_items) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_recap.lainnya_items)
    LOOP
      v_amt := ROUND(COALESCE((v_item->>'amount')::NUMERIC, 0))::BIGINT;
      IF v_amt <= 0 THEN CONTINUE; END IF;
      IF COALESCE(v_item->>'paid_by', 'crew') = 'owner' THEN
        v_owner_paid := v_owner_paid + v_amt;
      ELSE
        v_misc := v_misc + v_amt;
      END IF;
    END LOOP;
  END IF;

  -- Crew fees per role + bonus (from crew_assignments). reimbursement_amount
  -- tetap TIDAK dibaca ke OpEx (payout pelunasan talangan, bukan beban kedua
  -- — lihat 20260624_opex_exclude_reimbursement).
  SELECT
    COALESCE(SUM(CASE WHEN role_in_event = 'lead'    THEN fee_amount END), 0),
    COALESCE(SUM(CASE WHEN role_in_event = 'asisten' THEN fee_amount END), 0),
    COALESCE(SUM(CASE WHEN role_in_event = 'crew_c'  THEN fee_amount END), 0),
    COALESCE(SUM(bonus_amount), 0)
  INTO v_fee_lead, v_fee_asisten, v_fee_crew_c, v_fee_extra
  FROM crew_assignments
  WHERE event_id = v_event_id;

  RETURN jsonb_build_object(
    'fee_lead',       v_fee_lead,
    'fee_asisten',    v_fee_asisten,
    'fee_crew_c',     v_fee_crew_c,
    'fee_extra',      v_fee_extra,
    'reimbursement',  0,
    'transport',      v_transport,
    'bensin',         v_bensin,
    'toll',           v_toll,
    'parking',        v_parking,
    'konsumsi',       v_konsumsi,
    'misc',           v_misc,
    -- Info: biaya event yang dibayar langsung owner (tercatat via Catat
    -- transaksi, BUKAN bagian total OpEx settlement). settle_event tidak
    -- membaca key ini.
    'owner_paid_total', v_owner_paid,
    'total',          v_fee_lead + v_fee_asisten + v_fee_crew_c + v_fee_extra
                    + v_transport + v_bensin + v_toll
                    + v_parking + v_konsumsi + v_misc
  );
END;
$$;

COMMENT ON FUNCTION calculate_recap_opex IS
  'OpEx breakdown (JSONB) utk crew_rekap: crew fees + field expenses TALANGAN CREW + lain-lain (dari crew_rekap.lainnya_items). Biaya ber-flag paid_by=owner dikeluarkan dari total (owner mencatatnya via Catat transaksi) dan dilaporkan di key owner_paid_total. Reimbursement crew tetap bukan OpEx.';
