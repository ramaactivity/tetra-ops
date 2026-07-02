-- Langganan/tagihan berulang yang di-remind bot Telegram (VPS, hosting, dll).
-- next_due NULL = belum diisi → dilewati scanner. Setelah lewat jatuh tempo,
-- cron meng-advance next_due sesuai cycle (monthly/yearly) otomatis.
-- Reminder dikirim H-7, H-3, H-1, dan hari-H (bagian dari digest pagi).

CREATE TABLE IF NOT EXISTS telegram_renewals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  next_due DATE,
  cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (cycle IN ('monthly', 'yearly')),
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE telegram_renewals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS telegram_renewals_owner_read ON telegram_renewals;
CREATE POLICY telegram_renewals_owner_read ON telegram_renewals
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('owner', 'super_admin')
        AND u.is_active = true
    )
  );

-- Seed: tanggal jatuh tempo diisi menyusul (NULL = reminder belum aktif)
INSERT INTO telegram_renewals (name, next_due, cycle, notes)
SELECT * FROM (VALUES
  ('VPS WhatsApp Bot (DomaiNesia)', NULL::date, 'monthly', 'bot WA leads di 157.15.124.114'),
  ('Hosting / Domain Website', NULL::date, 'yearly', 'domain & hosting website perusahaan')
) AS seed(name, next_due, cycle, notes)
WHERE NOT EXISTS (SELECT 1 FROM telegram_renewals);
