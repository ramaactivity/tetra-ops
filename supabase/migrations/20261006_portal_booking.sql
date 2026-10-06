-- 20261006_portal_booking.sql
-- Fase 1 booking publik + portal klien (keputusan owner 6 Okt 2026, DR-026..DR-034,
-- rencana di docs/RENCANA-BOOKING-PORTAL.md).
--
-- Booking dari portal TIDAK masuk `events` sampai DP diterima. Draf hidup di
-- client_bookings; event dibuat oleh createBooking yang sudah ada saat admin
-- menerima DP. Klien tidak memakai Supabase Auth: identitas = nomor WA
-- (portal_people), sesi = portal_sessions (token disimpan sebagai hash).
--
-- RLS: semua tabel baru hanya bisa dibaca owner lewat app. Portal, bot, dan
-- webhook memakai admin client di server dengan cek keanggotaan di kode.
-- Tabel sesi/verifikasi/rate limit tanpa policy sama sekali = hanya service role.
-- Idempotent & aditif.

-- ── Penanda publik di katalog + designer ────────────────────────────────────
ALTER TABLE packages ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS public_description text;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS public_sort int NOT NULL DEFAULT 0;
ALTER TABLE addons ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_designer boolean NOT NULL DEFAULT false;

-- Paket publik = isi pricelist publik 2026 (keputusan owner). Paket 13 jam
-- bukan bagian pricelist → tetap privat. Hanya set sekali (baris yang masih
-- default), supaya pilihan owner berikutnya tidak tertimpa kalau dijalankan ulang.
UPDATE packages SET is_public = true
WHERE is_active AND deleted_at IS NULL AND duration_hours <= 8 AND NOT is_public
	AND NOT EXISTS (SELECT 1 FROM system_config WHERE key = 'booking.dp_minimum');
UPDATE addons SET is_public = true
WHERE is_active AND deleted_at IS NULL AND NOT is_public
	AND NOT EXISTS (SELECT 1 FROM system_config WHERE key = 'booking.dp_minimum');

-- ── Orang di portal ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS portal_people (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	phone text NOT NULL UNIQUE, -- format 62xxxxxxxxxx (toWaPhone)
	email text,
	name text,
	wa_jid text,
	wa_verified_at timestamptz,
	email_verified_at timestamptz,
	contact_id uuid REFERENCES contacts(id),
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS portal_people_email_uidx
	ON portal_people (lower(email)) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS portal_sessions (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	person_id uuid NOT NULL REFERENCES portal_people(id) ON DELETE CASCADE,
	token_hash text NOT NULL UNIQUE,
	expires_at timestamptz NOT NULL,
	revoked_at timestamptz,
	last_seen_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portal_sessions_person_idx ON portal_sessions (person_id);

-- Satu baris per percobaan verifikasi. Kode terikat ke nonce browser yang
-- memintanya: kode yang bocor tidak bisa dipakai membuka sesi di browser lain.
CREATE TABLE IF NOT EXISTS portal_verifications (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	channel text NOT NULL CHECK (channel IN ('wa', 'email')),
	phone text NOT NULL,
	email text,
	name text,
	code text NOT NULL, -- WA: dikirim klien sendiri ke nomor Tetra
	code_hash text, -- email: kode dikirim ke klien, yang disimpan hash-nya
	nonce_hash text NOT NULL,
	attempts int NOT NULL DEFAULT 0,
	expires_at timestamptz NOT NULL,
	verified_at timestamptz, -- bot/kode email cocok
	consumed_at timestamptz, -- sudah ditukar jadi sesi
	wa_jid text,
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portal_verifications_code_idx
	ON portal_verifications (code) WHERE verified_at IS NULL;

-- ── Booking portal ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS client_bookings (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	public_code text NOT NULL UNIQUE,
	status text NOT NULL DEFAULT 'draft'
		CHECK (status IN ('draft', 'menunggu_konfirmasi', 'resmi', 'kedaluwarsa', 'batal')),
	managed_by text NOT NULL DEFAULT 'klien' CHECK (managed_by IN ('klien', 'wo', 'tetra')),
	channel channel_type NOT NULL DEFAULT 'direct',
	vendor_contact_id uuid REFERENCES contacts(id),
	service_type service_type NOT NULL,
	package_hours int NOT NULL CHECK (package_hours BETWEEN 1 AND 24),
	frame_size text CHECK (frame_size IN ('2R', '4R', 'polaroid', 'none')),
	unit_count int NOT NULL DEFAULT 1 CHECK (unit_count BETWEEN 1 AND 3),
	addons jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{addon_id, quantity}]
	quoted_total bigint NOT NULL DEFAULT 0, -- perkiraan saat booking; harga resmi dihitung ulang saat jadi event
	event_date date NOT NULL,
	start_time time,
	end_time time,
	venue_city text,
	detail jsonb NOT NULL DEFAULT '{}'::jsonb, -- isian bertahap (autosave)
	pdp_consent_at timestamptz NOT NULL,
	terms_version text NOT NULL,
	expires_at timestamptz NOT NULL,
	event_id uuid REFERENCES events(id),
	created_by_person uuid REFERENCES portal_people(id),
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_bookings_status_idx ON client_bookings (status, event_date);
CREATE INDEX IF NOT EXISTS client_bookings_event_idx ON client_bookings (event_id) WHERE event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS booking_members (
	booking_id uuid NOT NULL REFERENCES client_bookings(id) ON DELETE CASCADE,
	person_id uuid NOT NULL REFERENCES portal_people(id) ON DELETE CASCADE,
	role text NOT NULL CHECK (role IN ('pemesan', 'pemilik', 'wo')),
	invited_by uuid REFERENCES portal_people(id),
	created_at timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (booking_id, person_id)
);
CREATE INDEX IF NOT EXISTS booking_members_person_idx ON booking_members (person_id);

-- Klien hanya MENGAJUKAN. Pencatatan ke payments + jurnal tetap lewat
-- record_payment_je (actor = admin yang menerima), lihat DR-029.
CREATE TABLE IF NOT EXISTS payment_submissions (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	booking_id uuid NOT NULL REFERENCES client_bookings(id) ON DELETE CASCADE,
	kind text NOT NULL CHECK (kind IN ('dp', 'pelunasan')),
	method text NOT NULL DEFAULT 'transfer' CHECK (method IN ('transfer', 'midtrans')),
	amount bigint NOT NULL CHECK (amount > 0),
	bank_account_id uuid REFERENCES bank_accounts(id),
	proof_path text, -- objek di bucket portal-private
	status text NOT NULL DEFAULT 'menunggu'
		CHECK (status IN ('menunggu', 'diterima', 'ditolak', 'pending', 'kedaluwarsa')),
	reject_reason text,
	midtrans_order_id text UNIQUE,
	payment_id uuid REFERENCES payments(id),
	submitted_by uuid REFERENCES portal_people(id),
	reviewed_by uuid REFERENCES users(id),
	reviewed_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_submissions_status_idx ON payment_submissions (status, created_at);
CREATE INDEX IF NOT EXISTS payment_submissions_booking_idx ON payment_submissions (booking_id);

DO $$
DECLARE t text;
BEGIN
	FOREACH t IN ARRAY ARRAY['portal_people', 'client_bookings', 'payment_submissions'] LOOP
		EXECUTE format('DROP TRIGGER IF EXISTS %I_updated_at ON %I', t, t);
		EXECUTE format('CREATE TRIGGER %I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at()', t, t);
	END LOOP;
END $$;

-- ── Rate limit (DR-032) ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rate_limits (
	key text NOT NULL,
	window_start timestamptz NOT NULL,
	hits int NOT NULL DEFAULT 0,
	PRIMARY KEY (key, window_start)
);

-- true = boleh lanjut. Fixed window; baris lama dibersihkan sesekali.
CREATE OR REPLACE FUNCTION hit_rate_limit(p_key text, p_limit int, p_window_sec int)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	w timestamptz := to_timestamp(floor(extract(epoch FROM now()) / p_window_sec) * p_window_sec);
	n int;
BEGIN
	INSERT INTO rate_limits (key, window_start, hits) VALUES (p_key, w, 1)
	ON CONFLICT (key, window_start) DO UPDATE SET hits = rate_limits.hits + 1
	RETURNING hits INTO n;
	IF random() < 0.01 THEN
		DELETE FROM rate_limits WHERE window_start < now() - interval '1 day';
	END IF;
	RETURN n <= p_limit;
END $$;
REVOKE ALL ON FUNCTION hit_rate_limit(text, int, int) FROM PUBLIC, anon, authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE portal_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
	FOREACH t IN ARRAY ARRAY['portal_people', 'client_bookings', 'booking_members', 'payment_submissions'] LOOP
		EXECUTE format('DROP POLICY IF EXISTS %I_owner_select ON %I', t, t);
		EXECUTE format('CREATE POLICY %I_owner_select ON %I FOR SELECT USING (is_owner_level())', t, t);
	END LOOP;
END $$;

-- ── Storage privat untuk file portal (DR-030) ───────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
	'portal-private', 'portal-private', false, 26214400,
	ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- ── Konfigurasi ─────────────────────────────────────────────────────────────
INSERT INTO system_config (key, value) VALUES
	('booking.dp_minimum', '500000'::jsonb),
	('booking.lead_expiry_days', '30'::jsonb),
	('booking.cancellation_fee', '500000'::jsonb),
	('booking.terms_version', '"2026-10-06"'::jsonb),
	('design.revision_limit', '3'::jsonb),
	('portal.gallery_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Iqbal = owner sekaligus designer (keputusan owner 6 Okt 2026).
UPDATE users SET is_designer = true
WHERE id = '47a93ee7-12e9-4136-bf4d-46ab1a89435b' AND NOT is_designer;
