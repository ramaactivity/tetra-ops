-- 20260702b_asset_check.sql
-- ============================================================================
-- Cek Alat (Asset Check) — ritual bulanan keberadaan & kondisi aset tetap
-- ============================================================================
--
-- Kenapa module terpisah dari Stock Opname (lihat audit 2026-07-02):
--   Opname = soal JUMLAH barang habis pakai (selisih → adjustment + jurnal).
--   Aset tetap tidak dikonsumsi — pertanyaannya keberadaan & kondisi:
--   "barangnya masih ada? rusak? sedang di mana?". Jawabannya checklist
--   Ada / Rusak / Hilang, bukan angka, dan TANPA jurnal (write-off/disposal
--   tetap flow manual terpisah di register aset).
--
-- Alur (meniru Stock Opname v2 yang sudah owner pahami):
--   1. Mulai Cek Alat → seed semua aset tetap aktif yang belum di-dispose.
--   2. Owner tandai per alat: ada / rusak / hilang (+ catatan opsional).
--      NULL = belum dicek (progress tracking, sama seperti opname).
--   3. "Sisanya Anggap Ada" untuk sisa yang tidak sempat dicek.
--   4. Selesai & Simpan → kondisi di items_fixed_asset_config ikut ter-update
--      (ada→normal, rusak→damaged, hilang→lost) dalam satu transaksi.
--   5. Rule notifikasi asset_check_overdue menagih kalau >30 hari.
--
-- Idempotent.

-- ============================================================================
-- 1. Tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS asset_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  taken_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checked_by UUID REFERENCES users(id),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'committed', 'cancelled')),
  committed_at TIMESTAMPTZ,
  committed_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS asset_check_lines (
  check_id UUID NOT NULL REFERENCES asset_checks(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES inventory_items(id),
  -- NULL = belum dicek. 'ada' = ketemu & baik, 'rusak' = ketemu tapi perlu
  -- perhatian, 'hilang' = tidak ketemu.
  result TEXT NULL CHECK (result IN ('ada', 'rusak', 'hilang')),
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (check_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_asset_checks_status ON asset_checks(status);
CREATE INDEX IF NOT EXISTS idx_asset_checks_taken_at ON asset_checks(taken_at DESC);
CREATE INDEX IF NOT EXISTS idx_asset_check_lines_item ON asset_check_lines(item_id);

COMMENT ON TABLE asset_checks IS
  'Sesi cek fisik aset tetap (bulanan). Checklist ada/rusak/hilang per alat — tanpa qty, tanpa jurnal. Commit meng-update items_fixed_asset_config.condition.';

-- ============================================================================
-- 2. RLS — owner-level only (mirror stock_takes)
-- ============================================================================

ALTER TABLE asset_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_check_lines ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "asset_checks_owner" ON asset_checks
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('super_admin','owner')))
    WITH CHECK (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('super_admin','owner')));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "asset_check_lines_owner" ON asset_check_lines
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('super_admin','owner')))
    WITH CHECK (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('super_admin','owner')));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- 3. match_all_asset_check_lines — bulk "anggap ada" (1 statement)
-- ============================================================================

CREATE OR REPLACE FUNCTION match_all_asset_check_lines(p_check_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_status TEXT;
  v_count INTEGER;
BEGIN
  SELECT status INTO v_status FROM asset_checks WHERE id = p_check_id FOR UPDATE;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Cek alat % tidak ditemukan', p_check_id USING ERRCODE = 'P0002';
  END IF;
  IF v_status != 'draft' THEN
    RAISE EXCEPTION 'Cek alat % sudah tidak bisa diedit (status=%)', p_check_id, v_status USING ERRCODE = 'P0001';
  END IF;

  UPDATE asset_check_lines
  SET result = 'ada', updated_at = NOW()
  WHERE check_id = p_check_id AND result IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION match_all_asset_check_lines(UUID) TO authenticated;

-- ============================================================================
-- 4. commit_asset_check — tutup sesi + sinkron kondisi register aset (atomik)
-- ============================================================================

CREATE OR REPLACE FUNCTION commit_asset_check(
  p_check_id UUID,
  p_actor UUID
) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_status TEXT;
  v_ada INTEGER;
  v_rusak INTEGER;
  v_hilang INTEGER;
BEGIN
  SELECT status INTO v_status FROM asset_checks WHERE id = p_check_id FOR UPDATE;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Cek alat % tidak ditemukan', p_check_id USING ERRCODE = 'P0002';
  END IF;
  IF v_status != 'draft' THEN
    RAISE EXCEPTION 'Cek alat % sudah pernah diselesaikan (status=%)', p_check_id, v_status USING ERRCODE = 'P0001';
  END IF;

  -- Sinkron kondisi register aset dari hasil cek (baris NULL = tidak dicek,
  -- kondisi lama dibiarkan). 'ada' juga meng-update: alat yang tadinya
  -- damaged lalu diperbaiki dan dicek "ada" kembali jadi normal.
  UPDATE items_fixed_asset_config cfg
  SET condition = CASE l.result
        WHEN 'ada' THEN 'normal'::equipment_condition
        WHEN 'rusak' THEN 'damaged'::equipment_condition
        WHEN 'hilang' THEN 'lost'::equipment_condition
      END
  FROM asset_check_lines l
  WHERE l.check_id = p_check_id
    AND l.result IS NOT NULL
    AND cfg.item_id = l.item_id
    AND cfg.disposed_at IS NULL;

  SELECT
    COUNT(*) FILTER (WHERE result = 'ada'),
    COUNT(*) FILTER (WHERE result = 'rusak'),
    COUNT(*) FILTER (WHERE result = 'hilang')
  INTO v_ada, v_rusak, v_hilang
  FROM asset_check_lines
  WHERE check_id = p_check_id;

  UPDATE asset_checks
  SET status = 'committed',
      committed_at = NOW(),
      committed_by = p_actor,
      updated_at = NOW()
  WHERE id = p_check_id;

  RETURN jsonb_build_object('ada', v_ada, 'rusak', v_rusak, 'hilang', v_hilang);
END;
$$;

GRANT EXECUTE ON FUNCTION commit_asset_check(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION commit_asset_check(UUID, UUID) IS
  'Selesaikan cek alat draft: update items_fixed_asset_config.condition per hasil (ada→normal, rusak→damaged, hilang→lost; NULL dilewati; aset disposed tidak disentuh), lalu tandai committed. Tanpa jurnal — write-off aset tetap flow disposal terpisah. Returns {ada, rusak, hilang}.';

-- ============================================================================
-- 5. Rule notifikasi bulanan (mirror opname_overdue)
-- ============================================================================

INSERT INTO notification_rules
  (code, name, description, category, severity, trigger_condition,
   recipient_roles, send_push, is_enabled)
VALUES
  ('asset_check_overdue',
   'Saatnya Cek Alat',
   'Remind owners to physically check fixed assets when the last committed check is >30 days old',
   'inventory',
   'info',
   '{"check": "asset_check_overdue", "days": 30}'::jsonb,
   ARRAY['super_admin', 'owner'],
   false,
   true)
ON CONFLICT (code) DO NOTHING;
