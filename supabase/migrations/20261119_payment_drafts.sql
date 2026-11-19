-- DR-055: bukti DP dari WA jadi DRAFT (tidak menyentuh buku). Bot mengirim
-- lewat POST /api/bot/pembayaran/draft (idempoten per pesan_id_wa). Draft
-- disetujui (admin balas di WA + syarat ketat, atau Konfirmasi di app) lalu
-- diposting ke payments lewat logPaymentCore saat event ada. Aditif.

CREATE TABLE IF NOT EXISTS payment_drafts (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	pesan_id_wa text NOT NULL UNIQUE,
	status text NOT NULL DEFAULT 'menunggu'
		CHECK (status IN ('menunggu', 'disetujui', 'tercatat', 'dibatalkan')),
	sumber text NOT NULL DEFAULT 'client_only'
		CHECK (sumber IN ('client_only', 'admin_wa')),
	client_wa text,
	wa_jid text,
	nama_klien text,
	invoice_no text,
	booking_inbox_id uuid REFERENCES booking_inbox(id) ON DELETE SET NULL,
	document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
	event_id uuid REFERENCES events(id) ON DELETE SET NULL,
	payment_id uuid REFERENCES payments(id) ON DELETE SET NULL,
	-- null = tidak terbaca (bot tidak pernah mengirim 0).
	nominal bigint CHECK (nominal IS NULL OR nominal > 0),
	nama_pengirim text,
	bank_pengirim text,
	bank_tujuan text,
	bank_account_id uuid REFERENCES bank_accounts(id) ON DELETE SET NULL,
	waktu_transfer timestamptz,
	waktu_pesan timestamptz,
	confidence numeric,
	teks_mentah text,
	-- Bukti di Google Drive TANPA link publik; dibuka lewat /api/payment-drafts/<id>/bukti.
	bukti_file_id text,
	bukti_url text,
	-- Syarat konfirmasi otomatis yang tidak lolos (untuk log bot & tampilan).
	gerbang jsonb NOT NULL DEFAULT '[]'::jsonb,
	disetujui_at timestamptz,
	disetujui_via text CHECK (disetujui_via IN ('admin_wa', 'app')),
	disetujui_oleh uuid REFERENCES users(id),
	dibatalkan_at timestamptz,
	dibatalkan_oleh uuid REFERENCES users(id),
	alasan_batal text,
	-- Alasan terakhir posting ke buku gagal (mis. lebih bayar).
	catatan_posting text,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	updated_by uuid REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS payment_drafts_open_idx
	ON payment_drafts (status, created_at DESC)
	WHERE status IN ('menunggu', 'disetujui');
CREATE INDEX IF NOT EXISTS payment_drafts_booking_idx
	ON payment_drafts (booking_inbox_id) WHERE booking_inbox_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payment_drafts_document_idx
	ON payment_drafts (document_id) WHERE document_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payment_drafts_event_idx
	ON payment_drafts (event_id) WHERE event_id IS NOT NULL;

DROP TRIGGER IF EXISTS payment_drafts_updated_at ON payment_drafts;
CREATE TRIGGER payment_drafts_updated_at BEFORE UPDATE ON payment_drafts
	FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Data finansial klien: hanya owner. Tulis lewat server (admin client).
ALTER TABLE payment_drafts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_drafts_owner_select ON payment_drafts;
CREATE POLICY payment_drafts_owner_select ON payment_drafts FOR SELECT
	USING (is_owner_level());
