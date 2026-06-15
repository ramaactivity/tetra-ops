-- 20260621_arsip_nota.sql
-- Modul "Arsip Nota": satu tempat lihat semua nota/bukti transaksi.
--
-- Dua bagian:
--   1. manual_notas       — nota yang di-upload owner manual (di luar sistem),
--                           file di Drive folder bulanan. Owner-only.
--   2. v_nota_sistem (VIEW) — agregasi read-only semua bukti yang dihasilkan
--                           sistem (pembayaran, rekap, transport, fee crew,
--                           misc expense) dinormalisasi ke satu bentuk.
--
-- Pakai helper RLS existing: is_owner_level(). Modul owner-only (rahasia bisnis).

-- ============================================================================
-- 1. TABLE manual_notas
-- ============================================================================
CREATE TABLE IF NOT EXISTS manual_notas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  category TEXT NOT NULL,              -- bebas (preset di UI, bisa ketik sendiri)
  nota_date DATE,                      -- tanggal di nota fisik (opsional)
  amount NUMERIC(12, 2),               -- nominal nota (opsional)
  description TEXT NOT NULL,

  drive_url TEXT NOT NULL,
  drive_file_id TEXT NOT NULL,
  file_name TEXT NOT NULL,             -- nama final setelah auto-rename
  drive_folder_id TEXT,                -- folder bulanan tempat file mendarat

  -- Bucket folder = BULAN UPLOAD (bukan tanggal nota), sesuai struktur Drive.
  upload_year INT NOT NULL,
  upload_month INT NOT NULL,

  event_id UUID REFERENCES events(id) ON DELETE SET NULL,  -- opsional, kalau terkait event
  uploaded_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT manual_nota_amount_nonneg CHECK (amount IS NULL OR amount >= 0),
  CONSTRAINT manual_nota_month_valid CHECK (upload_month BETWEEN 1 AND 12)
);

CREATE INDEX IF NOT EXISTS idx_manual_notas_upload_bucket
  ON manual_notas(upload_year DESC, upload_month DESC);
CREATE INDEX IF NOT EXISTS idx_manual_notas_created
  ON manual_notas(created_at DESC);

COMMENT ON TABLE manual_notas IS
  'Nota yang di-upload owner manual (di luar sistem, mis. belanja pasar). File di Drive folder bulanan.';

-- RLS: owner-only (read + write).
ALTER TABLE manual_notas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "manual_notas_read" ON manual_notas;
CREATE POLICY "manual_notas_read" ON manual_notas
  FOR SELECT USING (is_owner_level());

DROP POLICY IF EXISTS "manual_notas_write" ON manual_notas;
CREATE POLICY "manual_notas_write" ON manual_notas
  FOR ALL USING (is_owner_level()) WITH CHECK (is_owner_level());

-- ============================================================================
-- 2. VIEW v_nota_sistem — agregasi bukti dari sistem (read-only)
-- ============================================================================
-- security_invoker=on → view jalan dengan RLS si pemanggil (defense-in-depth).
-- Halaman juga sudah dijaga owner-only.
CREATE OR REPLACE VIEW v_nota_sistem
WITH (security_invoker = on) AS
  -- Bukti pembayaran klien (DP / partial / pelunasan)
  SELECT
    'payment'::text                       AS source_type,
    p.id                                  AS source_id,
    p.event_id                            AS event_id,
    e.project_id                          AS project_id,
    e.client_name                         AS client_name,
    INITCAP(COALESCE(p.payment_type, 'pembayaran')) AS label,
    p.amount                              AS amount,
    p.payment_date                        AS nota_date,
    p.proof_url                           AS drive_url,
    p.recorded_by                         AS uploaded_by,
    u.full_name                           AS uploaded_by_name,
    p.created_at                          AS created_at
  FROM payments p
  JOIN events e ON e.id = p.event_id
  LEFT JOIN users u ON u.id = p.recorded_by
  WHERE p.proof_url IS NOT NULL AND p.proof_url <> ''

  UNION ALL

  -- Foto bukti rekap crew (counter DSLR, konsumabel, area, dll)
  SELECT
    'recap_proof'::text,
    erp.id,
    cr.event_id,
    e.project_id,
    e.client_name,
    COALESCE(NULLIF(erp.caption, ''), erp.photo_type::text),
    NULL::numeric,
    erp.created_at::date,
    erp.photo_url,
    erp.uploaded_by,
    u.full_name,
    erp.created_at
  FROM event_recap_proofs erp
  JOIN crew_rekap cr ON cr.id = erp.recap_id
  JOIN events e ON e.id = cr.event_id
  LEFT JOIN users u ON u.id = erp.uploaded_by
  WHERE erp.photo_url IS NOT NULL AND erp.photo_url <> ''

  UNION ALL

  -- Bukti transport crew (berangkat & pulang → masing-masing satu baris)
  SELECT
    'transport_proof'::text,
    cr.id,
    cr.event_id,
    e.project_id,
    e.client_name,
    'Transport ' || leg.tag,
    cr.transport_cost,
    cr.created_at::date,
    leg.url,
    cr.submitted_by,
    u.full_name,
    cr.created_at
  FROM crew_rekap cr
  JOIN events e ON e.id = cr.event_id
  LEFT JOIN users u ON u.id = cr.submitted_by
  CROSS JOIN LATERAL (VALUES
    ('berangkat', cr.transport_proof_berangkat_url),
    ('pulang',    cr.transport_proof_pulang_url)
  ) AS leg(tag, url)
  WHERE leg.url IS NOT NULL AND leg.url <> ''

  UNION ALL

  -- Bukti pembayaran fee crew
  SELECT
    'crew_fee'::text,
    ca.id,
    ca.event_id,
    e.project_id,
    e.client_name,
    'Fee Crew',
    NULL::numeric,
    ca.payment_proof_uploaded_at::date,
    ca.payment_proof_url,
    ca.user_id,
    u.full_name,
    ca.payment_proof_uploaded_at
  FROM crew_assignments ca
  JOIN events e ON e.id = ca.event_id
  LEFT JOIN users u ON u.id = ca.user_id
  WHERE ca.payment_proof_url IS NOT NULL AND ca.payment_proof_url <> ''

  UNION ALL

  -- Bukti misc expense (lain-lain) dari rekap crew
  SELECT
    'misc_expense'::text,
    me.id,
    cr.event_id,
    e.project_id,
    e.client_name,
    me.description,
    me.amount,
    me.created_at::date,
    me.receipt_url,
    cr.submitted_by,
    u.full_name,
    me.created_at
  FROM event_recap_misc_expenses me
  JOIN crew_rekap cr ON cr.id = me.recap_id
  JOIN events e ON e.id = cr.event_id
  LEFT JOIN users u ON u.id = cr.submitted_by
  WHERE me.receipt_url IS NOT NULL AND me.receipt_url <> '';

COMMENT ON VIEW v_nota_sistem IS
  'Agregasi read-only semua bukti nota dari sistem (payment, recap, transport, crew fee, misc). Dipakai modul Arsip Nota.';
