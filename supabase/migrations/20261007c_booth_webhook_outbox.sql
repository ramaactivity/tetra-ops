-- 20261007c_booth_webhook_outbox.sql
-- Fase 5: webhook keluar Ops → Tetra Booth (kontrak docs/INTEGRASI-TETRA-BOOTH.md §4).
-- Setiap kiriman dicatat di sini; yang gagal dicoba ulang oleh cron harian
-- selama 7 hari. Hanya diisi kalau TETRA_BOOTH_URL & secret terpasang.
-- RLS: owner baca saja (untuk diagnosa); tulis lewat server (service role).
-- Idempotent & aditif.

CREATE TABLE IF NOT EXISTS booth_webhook_outbox (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	delivery_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
	event text NOT NULL CHECK (event IN ('booking.confirmed', 'booking.updated', 'booking.cancelled', 'design.approved')),
	event_id uuid REFERENCES events(id) ON DELETE SET NULL,
	payload jsonb NOT NULL,
	attempts int NOT NULL DEFAULT 0,
	last_status int,
	last_error text,
	delivered_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS booth_webhook_outbox_pending_idx
	ON booth_webhook_outbox (created_at) WHERE delivered_at IS NULL;

DROP TRIGGER IF EXISTS booth_webhook_outbox_updated_at ON booth_webhook_outbox;
CREATE TRIGGER booth_webhook_outbox_updated_at BEFORE UPDATE ON booth_webhook_outbox
	FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE booth_webhook_outbox ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS booth_webhook_outbox_owner_select ON booth_webhook_outbox;
CREATE POLICY booth_webhook_outbox_owner_select ON booth_webhook_outbox FOR SELECT USING (is_owner_level());
