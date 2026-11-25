-- DR-065 (owner 25 Nov 2026, lewat hermes-ff: "pindahin ke R2 aja deh"):
-- Drive Tetra penuh → bukti transfer baru disimpan privat di Cloudflare R2.
-- bukti_file_id = id file Drive (lama) atau path objek R2 (baru). Aditif.
ALTER TABLE payment_drafts ADD COLUMN IF NOT EXISTS bukti_storage text
	CHECK (bukti_storage IS NULL OR bukti_storage IN ('drive', 'r2'));
UPDATE payment_drafts SET bukti_storage = 'drive'
	WHERE bukti_file_id IS NOT NULL AND bukti_storage IS NULL;
