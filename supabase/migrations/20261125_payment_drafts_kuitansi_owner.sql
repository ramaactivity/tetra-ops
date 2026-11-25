-- DR-063 (owner 25 Nov 2026, lewat hermes-ff): kuitansi/nota lunas dari bukti
-- transfer hanya lewat Tetra Ops — ditawarkan ke owner (Perlu persetujuan +
-- Telegram), tidak lagi lewat webhook Hermes. Nilai lama tetap sah untuk
-- baris lama. Aditif: hanya menambah nilai yang diizinkan.
ALTER TABLE payment_drafts DROP CONSTRAINT IF EXISTS payment_drafts_kuitansi_status_check;
ALTER TABLE payment_drafts ADD CONSTRAINT payment_drafts_kuitansi_status_check
	CHECK (kuitansi_status IN ('ditawarkan_ke_owner', 'dikabarkan_ke_hermes', 'belum_disiapkan'));
