-- DR-055 M2: setelah DP dari draft tercatat, Tetra Ops mengabari Hermes lewat
-- webhook "pembayaran tercatat" (Hermes menyusun usulan kuitansi ke Rama).
-- Gagal → "kuitansi belum disiapkan" + cadangan tawaran Telegram 1-tap. Aditif.
ALTER TABLE payment_drafts ADD COLUMN IF NOT EXISTS kuitansi_status text
	CHECK (kuitansi_status IN ('dikabarkan_ke_hermes', 'belum_disiapkan'));
ALTER TABLE payment_drafts ADD COLUMN IF NOT EXISTS kuitansi_catatan text;
