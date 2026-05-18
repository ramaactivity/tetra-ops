-- 20260520_event_recap_proofs.sql
-- Pindahkan crew_rekap.proof_photo_urls (TEXT[]) ke dedicated table dengan kategori
-- (counter_dslr, transport_receipt, dll). TEXT[] hanya bisa simpan URL flat tanpa metadata.
--
-- Strategi EXTEND:
--   • crew_rekap.proof_photo_urls tetap exist (backward compat) — TIDAK di-drop.
--   • Backfill: copy semua URL existing ke event_recap_proofs sebagai photo_type='other'.
--   • App code baru pakai event_recap_proofs (per-photo metadata).
--   • App code lama yang masih baca proof_photo_urls tetap jalan.
--   • Sync nanti via app code, bukan DB trigger (biar simple).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_recap_proof_type') THEN
    CREATE TYPE event_recap_proof_type AS ENUM (
      'counter_dslr',       -- foto counter DSLR di-akhir event (bukti total cetak)
      'transport_receipt',  -- bukti transport (Gocar receipt, struk bensin, tol)
      'consumable',         -- bukti pemakaian consumable (mediaset, sleeve sisa)
      'area_event',         -- foto venue / area kerja saat event
      'other'               -- bukti lain
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS event_recap_proofs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recap_id UUID NOT NULL REFERENCES crew_rekap(id) ON DELETE CASCADE,

  photo_url TEXT NOT NULL,
  photo_type event_recap_proof_type NOT NULL DEFAULT 'other',
  caption TEXT,

  uploaded_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_recap_proofs_recap ON event_recap_proofs(recap_id);
CREATE INDEX IF NOT EXISTS idx_event_recap_proofs_type ON event_recap_proofs(recap_id, photo_type);

COMMENT ON TABLE event_recap_proofs IS
  'Per-photo proof untuk crew_rekap. Pindahan dari crew_rekap.proof_photo_urls TEXT[] supaya bisa per-photo metadata.';

-- ----------------------------------------------------------------------------
-- Backfill: split crew_rekap.proof_photo_urls jadi rows di event_recap_proofs
-- Hanya jalankan kalau event_recap_proofs masih kosong (idempotent).
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_inserted INTEGER := 0;
BEGIN
  IF (SELECT COUNT(*) FROM event_recap_proofs) = 0 THEN
    INSERT INTO event_recap_proofs (recap_id, photo_url, photo_type, uploaded_by, created_at)
    SELECT
      cr.id,
      url,
      'other'::event_recap_proof_type,
      cr.submitted_by,
      cr.created_at
    FROM crew_rekap cr
    CROSS JOIN LATERAL unnest(cr.proof_photo_urls) AS url
    WHERE cr.proof_photo_urls IS NOT NULL
      AND array_length(cr.proof_photo_urls, 1) > 0;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    RAISE NOTICE '[event_recap_proofs] Backfilled % rows from crew_rekap.proof_photo_urls', v_inserted;
  ELSE
    RAISE NOTICE '[event_recap_proofs] Table not empty, skipping backfill';
  END IF;
END $$;

-- Verification:
--   SELECT photo_type, COUNT(*) FROM event_recap_proofs GROUP BY photo_type;
--   -- Cross-check totalnya = sum(array_length(crew_rekap.proof_photo_urls, 1))
