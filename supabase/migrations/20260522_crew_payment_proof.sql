-- 20260522_crew_payment_proof.sql
-- Add payment_proof_url + payment_proof_uploaded_at columns to crew_assignments.
-- Used untuk attach bukti transfer (Drive URL) per crew saat fee paid.
-- Settlement journal description akan include reference URL ini.

ALTER TABLE crew_assignments
  ADD COLUMN IF NOT EXISTS payment_proof_url TEXT,
  ADD COLUMN IF NOT EXISTS payment_proof_uploaded_at TIMESTAMPTZ;

COMMENT ON COLUMN crew_assignments.payment_proof_url IS
  'Drive URL untuk bukti transfer fee crew. Optional. Di-display di CrewFeeForm dan referenced di journal saat settle.';
COMMENT ON COLUMN crew_assignments.payment_proof_uploaded_at IS
  'Timestamp upload terakhir. Auto-set saat payment_proof_url berubah dari NULL ke valid URL.';
