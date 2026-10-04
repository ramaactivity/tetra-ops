-- ============================================================================
-- 20261004b_crew_fee_proof_labels.sql
--
-- Jenis tiap bukti transfer fee crew (owner transfer fee & bonus terpisah).
-- payment_proof_labels TEXT[] sejajar dengan payment_proof_urls (indeks sama):
-- 'fee' | 'bonus' | 'reimbursement' | '' (belum dipilih). Aplikasi selalu
-- menulis keduanya bersamaan. Arsip Nota: label "Fee Crew · Bonus".
-- ============================================================================

ALTER TABLE crew_assignments
  ADD COLUMN IF NOT EXISTS payment_proof_labels TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN crew_assignments.payment_proof_labels IS
  'Jenis tiap bukti di payment_proof_urls (indeks sama): fee | bonus | reimbursement | kosong.';

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

  -- Bukti pembayaran fee crew — SEMUA bukti per crew (satu baris per file).
  -- Fallback ke kolom lama bila array kosong (baris yang belum tersentuh).
  SELECT
    'crew_fee'::text,
    ca.id,
    ca.event_id,
    e.project_id,
    e.client_name,
    'Fee Crew' || CASE proof.label
      WHEN 'fee'           THEN ' · Fee'
      WHEN 'bonus'         THEN ' · Bonus'
      WHEN 'reimbursement' THEN ' · Reimbursement'
      ELSE '' END,
    NULL::numeric,
    ca.payment_proof_uploaded_at::date,
    proof.url,
    ca.user_id,
    u.full_name,
    ca.payment_proof_uploaded_at
  FROM crew_assignments ca
  JOIN events e ON e.id = ca.event_id
  LEFT JOIN users u ON u.id = ca.user_id
  -- unnest dua array sejajar: URL + jenis bukti (fee/bonus/reimbursement).
  CROSS JOIN LATERAL unnest(
    CASE WHEN cardinality(ca.payment_proof_urls) > 0
         THEN ca.payment_proof_urls
         ELSE ARRAY[ca.payment_proof_url] END,
    ca.payment_proof_labels
  ) AS proof(url, label)
  WHERE proof.url IS NOT NULL AND proof.url <> ''

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
  WHERE COALESCE(item->>'nota_url', '') <> ''

  UNION ALL

  -- BARU: bukti transaksi manual ("Catat") — pemasukan/pengeluaran lain yang
  -- dicatat owner, termasuk yang tertaut ke sebuah event.
  SELECT
    'manual_txn'::text,
    je.id,
    je.source_event_id,
    e.project_id,
    e.client_name,
    je.description,
    je.total_amount,
    je.entry_date,
    je.proof_url,
    je.created_by,
    u.full_name,
    je.created_at
  FROM journal_entries je
  LEFT JOIN events e ON e.id = je.source_event_id
  LEFT JOIN users u ON u.id = je.created_by
  WHERE je.proof_url IS NOT NULL AND je.proof_url <> '';

COMMENT ON VIEW v_nota_sistem IS
  'Agregasi read-only semua bukti/nota yang dihasilkan sistem: pembayaran klien, foto rekap, bukti transport, bukti fee crew, misc expense (tabel lama), nota per biaya lapangan & per item lain-lain dari crew_rekap JSONB, plus bukti transaksi manual (Catat).';
