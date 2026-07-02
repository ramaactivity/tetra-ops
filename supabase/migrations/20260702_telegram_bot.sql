-- Telegram bot untuk grup owner — reminder kesiapan event.
--
-- telegram_settings  : singleton (id=1) menyimpan chat_id grup owner. Diisi
--                      otomatis oleh webhook saat bot di-invite ke grup
--                      (my_chat_member update), bukan manual.
-- telegram_sent_log  : dedup pengiriman — cron bisa di-retrigger manual tanpa
--                      grup kebanjiran pesan yang sama di hari yang sama.
--
-- Kedua tabel hanya ditulis lewat service role (webhook + cron). Owner boleh
-- baca (untuk panel status nanti); tidak ada write policy untuk authenticated.

CREATE TABLE IF NOT EXISTS telegram_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  group_chat_id BIGINT,
  group_title TEXT,
  digest_enabled BOOLEAN NOT NULL DEFAULT true,
  connected_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO telegram_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS telegram_sent_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kind TEXT NOT NULL,          -- 'digest' | 'critical' | 'briefing'
  dedup_key TEXT NOT NULL,     -- digest/critical: tanggal WIB; briefing: event_id
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_telegram_sent_log_kind_key
  ON telegram_sent_log (kind, dedup_key);

ALTER TABLE telegram_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_sent_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS telegram_settings_owner_read ON telegram_settings;
CREATE POLICY telegram_settings_owner_read ON telegram_settings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('owner', 'super_admin')
        AND u.is_active = true
    )
  );

DROP POLICY IF EXISTS telegram_sent_log_owner_read ON telegram_sent_log;
CREATE POLICY telegram_sent_log_owner_read ON telegram_sent_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('owner', 'super_admin')
        AND u.is_active = true
    )
  );
