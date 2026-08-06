-- ============================================================================
-- Rekap: nota per biaya lapangan → ikut Arsip Nota.
--
-- Sebelum ini hanya transport (berangkat/pulang) yang punya slot bukti. Bensin,
-- toll, parkir, konsumsi, dan tiap item lain-lain tidak punya tempat menempel
-- nota, sehingga jejak audit biaya lapangan bolong — padahal justru biaya
-- itulah yang ditalangi crew dan diganti uangnya.
--
-- 1. crew_rekap.expense_nota_urls JSONB — map {transport|bensin|toll|parking|
--    konsumsi: <drive_url>}. Item lain-lain membawa `nota_url` di dalam
--    crew_rekap.lainnya_items (JSONB) miliknya sendiri.
-- 2. v_nota_sistem ditambah 2 sumber: nota biaya lapangan (dari map) dan nota
--    item lain-lain (dari array). Sumber lama `misc_expense` DIPERTAHANKAN
--    (tabel event_recap_misc_expenses masih menyimpan data era backfill), tapi
--    aplikasi sekarang menulis ke JSONB — lihat 20260806_rekap_expense_paid_by.
-- ============================================================================

ALTER TABLE crew_rekap
  ADD COLUMN IF NOT EXISTS expense_nota_urls JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN crew_rekap.expense_nota_urls IS
  'Nota/struk per biaya lapangan: map {transport|bensin|toll|parking|konsumsi: drive_url}. Item lain-lain menyimpan nota di crew_rekap.lainnya_items[].nota_url. Diagregasi ke Arsip Nota lewat v_nota_sistem.';

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

  -- Bukti misc expense (lain-lain) era tabel — dipertahankan untuk data lama
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
  WHERE me.receipt_url IS NOT NULL AND me.receipt_url <> ''

  UNION ALL

  -- BARU: nota per biaya lapangan (bensin/toll/parkir/konsumsi/transport)
  SELECT
    'field_expense'::text,
    cr.id,
    cr.event_id,
    e.project_id,
    e.client_name,
    INITCAP(nota.key),
    CASE nota.key
      WHEN 'transport' THEN cr.transport_cost
      WHEN 'bensin'    THEN cr.bensin_cost
      WHEN 'toll'      THEN cr.toll_cost
      WHEN 'parking'   THEN cr.parking_cost
      WHEN 'konsumsi'  THEN cr.konsumsi_cost
    END,
    cr.created_at::date,
    nota.value,
    cr.submitted_by,
    u.full_name,
    cr.created_at
  FROM crew_rekap cr
  JOIN events e ON e.id = cr.event_id
  LEFT JOIN users u ON u.id = cr.submitted_by
  CROSS JOIN LATERAL jsonb_each_text(COALESCE(cr.expense_nota_urls, '{}'::jsonb))
    AS nota(key, value)
  WHERE nota.value IS NOT NULL AND nota.value <> ''

  UNION ALL

  -- BARU: nota per item lain-lain (crew_rekap.lainnya_items[].nota_url)
  SELECT
    'field_expense_misc'::text,
    cr.id,
    cr.event_id,
    e.project_id,
    e.client_name,
    COALESCE(NULLIF(item->>'note', ''), 'Lain-lain'),
    NULLIF(item->>'amount', '')::numeric,
    cr.created_at::date,
    item->>'nota_url',
    cr.submitted_by,
    u.full_name,
    cr.created_at
  FROM crew_rekap cr
  JOIN events e ON e.id = cr.event_id
  LEFT JOIN users u ON u.id = cr.submitted_by
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(cr.lainnya_items) = 'array'
         THEN cr.lainnya_items ELSE '[]'::jsonb END
  ) AS item
  WHERE COALESCE(item->>'nota_url', '') <> '';

COMMENT ON VIEW v_nota_sistem IS
  'Agregasi read-only semua bukti/nota yang dihasilkan sistem: pembayaran klien, foto rekap, bukti transport, bukti fee crew, misc expense (tabel lama), plus nota per biaya lapangan & per item lain-lain dari crew_rekap JSONB.';
