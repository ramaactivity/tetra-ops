-- 20261118b_followup_requests.sql — follow-up sekali klik dari /leads (spek Hermes
-- SPEC-LEADS-HERMES §4). Owner klik Follow-up → bot_commands `followup-draf:{…}`
-- (Hermes cs-wa menulis draf dari riwayat chat) → draf tampil, bisa diubah →
-- Kirim → bot_commands `send-followup:{nomor,pesan}`. Tetra Ops tidak menyusun
-- teks follow-up sendiri. Tabel ini = sumber status tombol, riwayat, dan
-- penjaga 1 follow-up per kontak per 48 jam.

CREATE TABLE IF NOT EXISTS followup_requests (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	wa_jid text,
	nomor text NOT NULL,
	alasan text NOT NULL,
	draf text,
	-- pesan yang benar-benar dikirim (draf bisa diubah owner sebelum Kirim)
	pesan text,
	status text NOT NULL DEFAULT 'menunggu_draf'
		CHECK (status IN ('menunggu_draf', 'draf', 'mengirim', 'terkirim', 'batal', 'gagal')),
	-- alasan bot/Hermes kalau draf/kirim gagal (mis. "[DIAM] belum ada hal baru")
	hasil text,
	command_id uuid REFERENCES bot_commands(id) ON DELETE SET NULL,
	send_command_id uuid REFERENCES bot_commands(id) ON DELETE SET NULL,
	dibuat_oleh uuid REFERENCES users(id),
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS followup_requests_nomor_idx
	ON followup_requests (nomor, created_at DESC);
ALTER TABLE followup_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS followup_requests_owner_all ON followup_requests;
CREATE POLICY followup_requests_owner_all ON followup_requests FOR ALL
	USING (is_owner_level()) WITH CHECK (is_owner_level());
