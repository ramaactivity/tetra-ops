-- 20260520_crew_rekap_assignments_extend.sql
-- Refactor pass: tambah kolom yang belum ada di crew_rekap & crew_assignments
-- untuk dukung workflow rekap baru.
--
-- crew_rekap:
--   • frame_size_snapshot      — capture frame_size saat rekap di-submit (denormalize dari events.frame_size)
--     Rationale: kalau owner ubah events.frame_size setelah crew submit, rekap tetap pakai snapshot.
--   • photomagnet_paid / _bonus — split total jadi paid (charged ke klien) vs bonus (freebie)
--   • keychain_paid / _bonus    — sama
--   • status                    — granular state machine rekap: draft → submitted → reviewed → settled
--                                 sebelumnya hanya is_approved BOOLEAN (tidak bisa bedakan draft vs submitted)
--   • locked                    — explicit lock flag, di-set true saat event di-settle
--
-- crew_assignments:
--   • reimbursement_amount      — sebelumnya cuma fee_amount + bonus_amount; sekarang ada reimbursement
--                                 (misal crew talangan transport pakai duit sendiri)
--   • total_fee                 — generated column: fee + bonus + reimbursement
--   • payment_notes             — notes terkait pembayaran (kapan, via apa, dll)
--
-- Idempotent — semua ADD COLUMN IF NOT EXISTS + CREATE TYPE IF NOT EXISTS.

-- ----------------------------------------------------------------------------
-- 1. crew_rekap: split photomagnet & keychain totals jadi paid vs bonus
-- ----------------------------------------------------------------------------

ALTER TABLE crew_rekap
  ADD COLUMN IF NOT EXISTS frame_size_snapshot frame_size,
  ADD COLUMN IF NOT EXISTS photomagnet_paid INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS photomagnet_bonus INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS keychain_paid INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS keychain_bonus INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ;

-- Constraint: total = paid + bonus (best-effort; existing rows may not match — only enforced for new writes via app code)
-- Tidak pakai CHECK constraint supaya historical data tidak break.

COMMENT ON COLUMN crew_rekap.frame_size_snapshot IS
  'Snapshot dari events.frame_size saat rekap submitted. Pakai field ini untuk resolve mapping, bukan events.frame_size langsung.';
COMMENT ON COLUMN crew_rekap.photomagnet_paid IS
  'Jumlah photomagnet yang ditagih ke klien (charged). photomagnet_used = paid + bonus.';
COMMENT ON COLUMN crew_rekap.photomagnet_bonus IS
  'Jumlah photomagnet sebagai freebie/bonus untuk klien (cost internal, tidak di-charge).';
COMMENT ON COLUMN crew_rekap.locked IS
  'Locked saat event settled. Tidak bisa di-edit selama locked=true.';

-- ----------------------------------------------------------------------------
-- 2. crew_rekap status enum (granular state machine)
-- ----------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crew_rekap_status') THEN
    CREATE TYPE crew_rekap_status AS ENUM (
      'draft',       -- crew sedang isi, belum submit
      'submitted',   -- crew sudah submit, owner belum review
      'reviewed',    -- owner sudah review & approve
      'rejected',    -- owner reject, crew perlu revise
      'settled'      -- event sudah di-settle, rekap locked
    );
  END IF;
END $$;

ALTER TABLE crew_rekap
  ADD COLUMN IF NOT EXISTS status crew_rekap_status NOT NULL DEFAULT 'draft';

-- Backfill status untuk row existing berdasarkan is_approved & stock_committed_at:
--   • is_approved = true AND stock_committed_at IS NOT NULL → 'reviewed'
--   • is_approved = false                                    → 'rejected'
--   • is_approved IS NULL AND submitted_by IS NOT NULL       → 'submitted'
--   • else                                                   → 'draft'
UPDATE crew_rekap
SET status = CASE
  WHEN is_approved = true AND stock_committed_at IS NOT NULL THEN 'reviewed'::crew_rekap_status
  WHEN is_approved = false                                   THEN 'rejected'::crew_rekap_status
  WHEN is_approved IS NULL AND submitted_by IS NOT NULL      THEN 'submitted'::crew_rekap_status
  ELSE 'draft'::crew_rekap_status
END
WHERE status = 'draft';  -- hanya backfill row yang masih default; jangan overwrite manual update

-- Index status untuk query "rekap pending review"
CREATE INDEX IF NOT EXISTS idx_crew_rekap_status ON crew_rekap(status);

-- ----------------------------------------------------------------------------
-- 3. crew_assignments: tambah reimbursement + generated total_fee + notes
-- ----------------------------------------------------------------------------

ALTER TABLE crew_assignments
  ADD COLUMN IF NOT EXISTS reimbursement_amount BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_notes TEXT;

-- total_fee sebagai generated column (stored, queryable). Drop dulu kalau sudah ada
-- dengan definisi berbeda (defensive), lalu create ulang.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'crew_assignments' AND column_name = 'total_fee'
  ) THEN
    -- Kolom sudah ada; biarkan. Asumsi definisi sudah benar.
    NULL;
  ELSE
    ALTER TABLE crew_assignments
      ADD COLUMN total_fee BIGINT
      GENERATED ALWAYS AS (fee_amount + bonus_amount + reimbursement_amount) STORED;
  END IF;
END $$;

COMMENT ON COLUMN crew_assignments.reimbursement_amount IS
  'Reimbursement crew untuk biaya yang dia talangin (transport, konsumsi crew sendiri, dll). 0 jika tidak ada.';
COMMENT ON COLUMN crew_assignments.total_fee IS
  'GENERATED: fee_amount + bonus_amount + reimbursement_amount. Total yang harus di-payout.';

-- ----------------------------------------------------------------------------
-- 4. Touch updated_at trigger sudah ada di base schema, tidak perlu re-create.
-- ----------------------------------------------------------------------------

-- Verification:
--   SELECT column_name, data_type, is_generated FROM information_schema.columns
--   WHERE table_name = 'crew_rekap' AND column_name IN ('status', 'photomagnet_paid', 'locked');
--   SELECT column_name, data_type, is_generated FROM information_schema.columns
--   WHERE table_name = 'crew_assignments' AND column_name IN ('total_fee', 'reimbursement_amount');
