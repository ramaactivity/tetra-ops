-- Link manual_notas to a journal entry by its stable ref_id (JE-YYYYMMDD-XXXXXXXX).
-- Powers the Jurnal UI: view an entry's bukti transaksi, and upload a missing/
-- forgotten one straight from the journal row (then it's structurally attached).

ALTER TABLE manual_notas ADD COLUMN IF NOT EXISTS entry_ref_id TEXT;

COMMENT ON COLUMN manual_notas.entry_ref_id IS
  'journal_entries.ref_id this nota is the bukti for (nullable). Set by Catat transaksi receipt upload and the Jurnal "Upload bukti" action.';

CREATE INDEX IF NOT EXISTS idx_manual_notas_entry_ref_id
  ON manual_notas (entry_ref_id) WHERE entry_ref_id IS NOT NULL;

-- Backfill: past "Catat transaksi" receipts embed the JE ref in their description
-- (e.g. "Bensin survey · JE-20260626-AB12CD34"). Lift it into the new column.
UPDATE manual_notas
SET entry_ref_id = (regexp_match(description, 'JE-[0-9]{8}-[0-9A-Fa-f]{8}'))[1]
WHERE entry_ref_id IS NULL
  AND description ~ 'JE-[0-9]{8}-[0-9A-Fa-f]{8}';
