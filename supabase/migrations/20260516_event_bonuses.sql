-- 20260516_event_bonuses.sql
-- Bonus untuk klien — item gratis (magnetic, keychain, guestbook, dll)
-- yang kita kasih sebagai itikad baik tanpa klien tahu. Beda dari
-- add-ons:
--   • Add-ons    → klien bayar, masuk grand_total
--   • Bonus      → free, internal-only, tidak masuk grand_total
--                  tapi tetap dicatat biar crew tahu harus kasih
--                  + (nantinya) inventory deduct & HPP tracking.
--
-- Idempotent.

CREATE TABLE IF NOT EXISTS event_bonuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    addon_id UUID NOT NULL REFERENCES addons(id) ON DELETE RESTRICT,
    quantity INT NOT NULL CHECK (quantity > 0),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_bonuses_event ON event_bonuses(event_id);
CREATE INDEX IF NOT EXISTS idx_event_bonuses_addon ON event_bonuses(addon_id);

COMMENT ON TABLE event_bonuses IS
    'Item gratis yang kami berikan ke klien sebagai itikad baik. Internal-only, tidak masuk grand_total. Crew harus tahu biar bisa kasih hari-H.';
COMMENT ON COLUMN event_bonuses.notes IS
    'Optional internal note (cth. "kasih saat sesi family", "pre-print sebelum acara").';

ALTER TABLE event_bonuses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_bonuses_read_authn" ON event_bonuses;
CREATE POLICY "event_bonuses_read_authn"
    ON event_bonuses
    FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "event_bonuses_write_owner" ON event_bonuses;
CREATE POLICY "event_bonuses_write_owner"
    ON event_bonuses
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid()
                AND u.role IN ('super_admin', 'owner')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid()
                AND u.role IN ('super_admin', 'owner')
        )
    );
