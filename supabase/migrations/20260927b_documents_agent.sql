-- 20260927b_documents_agent.sql
-- Skill dokumen & tagihan untuk agent (keputusan Rama 27 Sep 2026).
-- Idempotent. Tidak menghapus baris apa pun.

-- A1. Backdrop: Hitam pensiun; basic aktif = White, Red, Silver, Gold,
-- Emerald Green, Blue.
UPDATE backdrops SET is_active = false WHERE code = 'BG-BASIC-BLACK';

INSERT INTO backdrops (code, name, type, rental_price, is_active, display_order)
SELECT 'BG-BASIC-EMERALD', 'Basic Emerald Green', 'basic_included', 0, true,
	COALESCE((SELECT max(display_order) FROM backdrops WHERE type = 'basic_included'), 0) + 1
WHERE NOT EXISTS (SELECT 1 FROM backdrops WHERE code = 'BG-BASIC-EMERALD');

INSERT INTO backdrops (code, name, type, rental_price, is_active, display_order)
SELECT 'BG-BASIC-BLUE', 'Basic Blue', 'basic_included', 0, true,
	COALESCE((SELECT max(display_order) FROM backdrops WHERE type = 'basic_included'), 0) + 1
WHERE NOT EXISTS (SELECT 1 FROM backdrops WHERE code = 'BG-BASIC-BLUE');

-- A1b. Add-on: harga & nama sesuai pricelist 2026. Dokumen terbit tidak
-- diubah (harga item tersimpan di documents.items).
UPDATE addons SET price = 650000 WHERE name = 'Photomagnet' AND price = 350000;
UPDATE addons SET name = 'Custom Sleeve' WHERE name = 'Costume Sleeve';
ALTER TABLE addons ADD COLUMN IF NOT EXISTS min_qty integer;
COMMENT ON COLUMN addons.min_qty IS
	'Minimal order (qty). NULL = tanpa minimum. Dipakai quotation agent.';
UPDATE addons SET min_qty = 100
WHERE name = 'Keychain Photobooth Station' AND min_qty IS NULL;

-- A2. Gross-up 2,5% (Tetra non-PKP; hanya bila klien minta). Satu sumber
-- config untuk form booking & editor dokumen. Dokumen terbit tidak diubah.
UPDATE system_config SET value = '2.5'::jsonb
WHERE key = 'tax.default_grossup_rate_pct';

-- A4. "Terkirim" yang sebenarnya: diisi hanya saat bot benar-benar mengirim
-- atau owner menandai kirim manual. Status lama tidak diubah.
ALTER TABLE documents
	ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
	ADD COLUMN IF NOT EXISTS delivered_via text;
DO $$ BEGIN
	ALTER TABLE documents ADD CONSTRAINT documents_delivered_via_check
		CHECK (delivered_via IS NULL OR delivered_via IN ('wa_bot', 'manual'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- B2. Quotation dari agent/bot: usulan diskon terpisah dari `discount` (tidak
-- masuk total sampai Rama menerapkan), asal-usul, dan kunci idempoten bot.
ALTER TABLE documents
	ADD COLUMN IF NOT EXISTS proposed_discount jsonb,
	ADD COLUMN IF NOT EXISTS origin jsonb,
	ADD COLUMN IF NOT EXISTS external_id text;
CREATE UNIQUE INDEX IF NOT EXISTS documents_external_id_key
	ON documents (external_id) WHERE external_id IS NOT NULL;

-- B2/B4. Permintaan kirim dokumen yang menunggu 1 tap owner di Telegram.
-- callback_data Telegram maks 64 byte → tombol cukup membawa id baris ini.
CREATE TABLE IF NOT EXISTS doc_send_requests (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	document_ids uuid[] NOT NULL,
	-- NULL = pesan disusun otomatis saat tombol ditekan (total selalu terbaru).
	pesan text,
	nomor text,
	created_at timestamptz NOT NULL DEFAULT now(),
	handled_at timestamptz,
	handled_by_tg bigint,
	result jsonb
);
ALTER TABLE doc_send_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS doc_send_requests_owner_read ON doc_send_requests;
CREATE POLICY doc_send_requests_owner_read ON doc_send_requests FOR SELECT
	USING (is_owner_level());

-- Tombol uang di Telegram hanya boleh ditekan owner: grup berisi juga
-- desainer/crew. Diisi manual (ketik /id di grup untuk melihat user id).
ALTER TABLE telegram_settings
	ADD COLUMN IF NOT EXISTS owner_tg_ids bigint[] NOT NULL DEFAULT '{}';
