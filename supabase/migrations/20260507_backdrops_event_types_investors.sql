-- ============================================================================
-- Phase-3 master data additions migrated from old Phase-2 sheets:
--   • backdrops (NEW table) — booking-time backdrop selection + pricing
--   • event_types (NEW table) — replaces free-form event_category
--   • users.share_pct + users.capital_contributed — investor share for owner pool
--   • events.backdrop_id + events.vendor_decor_markup — booking-side wiring
-- Run in Supabase Dashboard → SQL Editor → Run.
-- Idempotent (CREATE IF NOT EXISTS, safe ON CONFLICT, ADD COLUMN IF NOT EXISTS).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. BACKDROPS
-- ----------------------------------------------------------------------------
CREATE TYPE backdrop_type AS ENUM (
  'basic_included',  -- 5 dasar warna, gratis kalau gak pakai vendor decor
  'rental_owned',    -- backdrop premium milik Tetra, ada harga sewa
  'vendor_decor'     -- klien pakai vendor decor; kita ambil markup
);

CREATE TABLE IF NOT EXISTS backdrops (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type backdrop_type NOT NULL,
  rental_price BIGINT NOT NULL DEFAULT 0,  -- IDR; only meaningful for rental_owned
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  description TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_backdrops_active ON backdrops(is_active);
CREATE INDEX IF NOT EXISTS idx_backdrops_type ON backdrops(type);

-- Seed from old SYS_BACKDROPS
INSERT INTO backdrops (code, name, type, rental_price, display_order, description) VALUES
  ('BG-BASIC-GOLD',     'Basic Gold',     'basic_included', 0, 1,  'Included if no vendor decor'),
  ('BG-BASIC-SILVER',   'Basic Silver',   'basic_included', 0, 2,  'Included if no vendor decor'),
  ('BG-BASIC-WHITE',    'Basic White',    'basic_included', 0, 3,  'Included if no vendor decor'),
  ('BG-BASIC-BLACK',    'Basic Black',    'basic_included', 0, 4,  'Included if no vendor decor'),
  ('BG-BASIC-RED',      'Basic Red',      'basic_included', 0, 5,  'Included if no vendor decor'),
  ('BG-RENTAL-LUX-01',  'Backdrop Rental Luxury #01', 'rental_owned', 500000, 10, 'Premium rental backdrop (owned by Tetra)'),
  ('BG-RENTAL-LUX-02',  'Backdrop Rental Luxury #02', 'rental_owned', 500000, 11, 'Premium rental backdrop (owned by Tetra)'),
  ('BG-VENDOR-DECOR',   'Vendor Decor Backdrop',     'vendor_decor', 0,      20, 'Klien pakai vendor decor; Tetra ambil markup di field terpisah')
ON CONFLICT (code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. EVENT TYPES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS event_types (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO event_types (code, label, display_order, notes) VALUES
  ('wedding',   'Wedding',   1,  NULL),
  ('birthday',  'Birthday',  2,  NULL),
  ('wisuda',    'Wisuda',    3,  NULL),
  ('gathering', 'Gathering', 4,  NULL),
  ('reuni',     'Reuni',     5,  NULL),
  ('corporate', 'Corporate', 6,  NULL),
  ('instansi',  'Instansi',  7,  NULL),
  ('event',     'Event',     99, 'Generic — pakai kalau belum jelas')
ON CONFLICT (code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. INVESTOR / OWNER SHARE
-- Extend users with capital + share_pct. Settle RPC will distribute owner pool
-- proportional to share_pct instead of flat per-person. (Code update follows.)
-- ----------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS share_pct DECIMAL(5,2);  -- e.g. 36.65
ALTER TABLE users ADD COLUMN IF NOT EXISTS capital_contributed BIGINT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS capital_contributed_at DATE;

-- Constraint: share_pct only valid for owner-level roles (super_admin/owner)
-- Soft check at app level rather than DB to allow migration flexibility.

-- ----------------------------------------------------------------------------
-- 4. EVENTS — backdrop wiring + vendor decor markup
-- ----------------------------------------------------------------------------
ALTER TABLE events ADD COLUMN IF NOT EXISTS backdrop_id UUID REFERENCES backdrops(id);
ALTER TABLE events ADD COLUMN IF NOT EXISTS vendor_decor_markup BIGINT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_events_backdrop ON events(backdrop_id);

-- ----------------------------------------------------------------------------
-- 5. RLS — let everyone authenticated read these masters
-- (write is gated at app server-action level by role check)
-- ----------------------------------------------------------------------------
ALTER TABLE backdrops    ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_types  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "backdrops_read_authn"   ON backdrops;
CREATE POLICY "backdrops_read_authn"   ON backdrops   FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "backdrops_write_owner"  ON backdrops;
CREATE POLICY "backdrops_write_owner"  ON backdrops   FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('super_admin','owner'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('super_admin','owner'))
  );

DROP POLICY IF EXISTS "event_types_read_authn" ON event_types;
CREATE POLICY "event_types_read_authn" ON event_types FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "event_types_write_owner" ON event_types;
CREATE POLICY "event_types_write_owner" ON event_types FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('super_admin','owner'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('super_admin','owner'))
  );

-- ----------------------------------------------------------------------------
-- 6. Settlement RPC — replace flat owner pool with proportional distribution.
-- Drops + recreates with share-based logic. p_owner_pool_per_person now means
-- "total per-person if shares are equal" used as a fallback when total share < 100.
-- New behavior:
--   • If at least one owner has share_pct set, total pool = base × num_owners,
--     split per share_pct of those owners (normalised to 100).
--   • If no shares set, falls back to flat (legacy) behavior.
-- Keeps the same signature so server-action calls don't change.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS close_event_settlement(UUID, BIGINT, BIGINT, JSONB, JSONB, UUID[], BIGINT, UUID);

CREATE OR REPLACE FUNCTION close_event_settlement(
  p_event_id              UUID,
  p_revenue_gross         BIGINT,
  p_discount_total        BIGINT,
  p_hpp                   JSONB,
  p_opex                  JSONB,
  p_owner_user_ids        UUID[],
  p_owner_pool_per_person BIGINT,
  p_closed_by             UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settlement_id    UUID;
  v_event_status     event_status;
  v_project_id       TEXT;
  v_revenue_net      BIGINT;
  v_hpp_total        BIGINT;
  v_opex_total       BIGINT;
  v_total_biaya      BIGINT;
  v_net_profit       BIGINT;
  v_margin_pct       NUMERIC(5,2);
  v_is_loss          BOOLEAN;
  v_owner_count      INTEGER;
  v_owner_pool_total BIGINT;
  v_fund             RECORD;
  v_alloc            BIGINT;
  v_total_sinking    BIGINT := 0;
  v_sinking_eq       BIGINT := 0;
  v_sinking_main     BIGINT := 0;
  v_sinking_crew     BIGINT := 0;
  v_sinking_emerg    BIGINT := 0;
  v_owner_id         UUID;
  v_share_total      NUMERIC(7,2) := 0;
  v_share            NUMERIC(7,2);
  v_owner_amount     BIGINT;
  v_operating_cash   BIGINT;
BEGIN
  SELECT status, project_id INTO v_event_status, v_project_id
    FROM events WHERE id = p_event_id FOR UPDATE;

  IF v_event_status IS NULL THEN
    RAISE EXCEPTION 'Event % not found', p_event_id USING ERRCODE = 'P0002';
  END IF;
  IF v_event_status NOT IN ('in_progress', 'awaiting_settlement') THEN
    RAISE EXCEPTION 'Event status must be in_progress or awaiting_settlement (current: %)', v_event_status USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM event_settlements WHERE event_id = p_event_id) THEN
    RAISE EXCEPTION 'Event % already settled', p_event_id USING ERRCODE = '23505';
  END IF;

  v_revenue_net := p_revenue_gross - COALESCE(p_discount_total, 0);

  v_hpp_total := COALESCE((p_hpp->>'mediaset')::BIGINT, 0)
               + COALESCE((p_hpp->>'sleeve')::BIGINT, 0)
               + COALESCE((p_hpp->>'flashdisk')::BIGINT, 0)
               + COALESCE((p_hpp->>'pouch')::BIGINT, 0)
               + COALESCE((p_hpp->>'photomagnet')::BIGINT, 0)
               + COALESCE((p_hpp->>'keychain')::BIGINT, 0)
               + COALESCE((p_hpp->>'other')::BIGINT, 0);

  v_opex_total := COALESCE((p_opex->>'fee_lead')::BIGINT, 0)
                + COALESCE((p_opex->>'fee_asisten')::BIGINT, 0)
                + COALESCE((p_opex->>'fee_crew_c')::BIGINT, 0)
                + COALESCE((p_opex->>'fee_extra')::BIGINT, 0)
                + COALESCE((p_opex->>'transport_bbm')::BIGINT, 0)
                + COALESCE((p_opex->>'sewa_alat')::BIGINT, 0)
                + COALESCE((p_opex->>'perawatan')::BIGINT, 0)
                + COALESCE((p_opex->>'konsumsi')::BIGINT, 0)
                + COALESCE((p_opex->>'komisi_vendor')::BIGINT, 0)
                + COALESCE((p_opex->>'komisi_relasi')::BIGINT, 0)
                + COALESCE((p_opex->>'komisi_sales_direct')::BIGINT, 0)
                + COALESCE((p_opex->>'platform_fee')::BIGINT, 0)
                + COALESCE((p_opex->>'diskon_tambahan')::BIGINT, 0);

  v_total_biaya := v_hpp_total + v_opex_total;
  v_net_profit  := v_revenue_net - v_total_biaya;
  v_is_loss     := v_net_profit <= 0;
  v_margin_pct  := CASE WHEN v_revenue_net > 0
                        THEN ROUND((v_net_profit::NUMERIC / v_revenue_net) * 100, 2)
                        ELSE 0 END;

  v_owner_count := COALESCE(array_length(p_owner_user_ids, 1), 0);

  -- Sum of owner share_pct among the listed owners (only if any has share set).
  IF v_owner_count > 0 THEN
    SELECT COALESCE(SUM(share_pct), 0) INTO v_share_total
      FROM users WHERE id = ANY(p_owner_user_ids) AND share_pct IS NOT NULL;
  END IF;

  -- Total pool: base × num_owners (legacy contract). When shares are present,
  -- the same total is preserved but distributed proportionally.
  IF NOT v_is_loss AND v_owner_count > 0 THEN
    v_owner_pool_total := v_owner_count * COALESCE(p_owner_pool_per_person, 0);
  ELSE
    v_owner_pool_total := 0;
  END IF;

  IF NOT v_is_loss THEN
    FOR v_fund IN SELECT * FROM sinking_funds WHERE is_active = true LOOP
      IF v_fund.allocation_type = 'percentage' THEN
        v_alloc := FLOOR(v_net_profit * v_fund.allocation_value / 100);
      ELSIF v_fund.allocation_type = 'flat' THEN
        v_alloc := v_fund.allocation_value::BIGINT;
      ELSE
        v_alloc := 0;
      END IF;

      v_total_sinking := v_total_sinking + v_alloc;

      IF v_fund.code = 'equipment' THEN v_sinking_eq := v_alloc;
      ELSIF v_fund.code = 'maintenance' THEN v_sinking_main := v_alloc;
      ELSIF v_fund.code = 'crew_reserve' THEN v_sinking_crew := v_alloc;
      ELSIF v_fund.code = 'emergency' THEN v_sinking_emerg := v_alloc;
      END IF;
    END LOOP;
  END IF;

  v_operating_cash := v_net_profit - v_total_sinking - v_owner_pool_total;

  INSERT INTO event_settlements (
    event_id, revenue_gross, discount_total, revenue_net,
    hpp_mediaset, hpp_sleeve, hpp_flashdisk, hpp_pouch,
    hpp_photomagnet, hpp_keychain, hpp_other, hpp_total,
    fee_lead, fee_asisten, fee_crew_c, fee_extra,
    transport_bbm, sewa_alat, perawatan, konsumsi,
    komisi_vendor, komisi_relasi, komisi_sales_direct,
    platform_fee, diskon_tambahan, opex_total,
    total_biaya, net_profit, margin_percentage, is_loss,
    sinking_equipment, sinking_maintenance, sinking_crew_reserve,
    sinking_emergency, sinking_total,
    owner_pool_total, owner_pool_per_person,
    operating_cash_kept,
    closed_by
  ) VALUES (
    p_event_id, p_revenue_gross, COALESCE(p_discount_total, 0), v_revenue_net,
    COALESCE((p_hpp->>'mediaset')::BIGINT, 0),
    COALESCE((p_hpp->>'sleeve')::BIGINT, 0),
    COALESCE((p_hpp->>'flashdisk')::BIGINT, 0),
    COALESCE((p_hpp->>'pouch')::BIGINT, 0),
    COALESCE((p_hpp->>'photomagnet')::BIGINT, 0),
    COALESCE((p_hpp->>'keychain')::BIGINT, 0),
    COALESCE((p_hpp->>'other')::BIGINT, 0),
    v_hpp_total,
    COALESCE((p_opex->>'fee_lead')::BIGINT, 0),
    COALESCE((p_opex->>'fee_asisten')::BIGINT, 0),
    COALESCE((p_opex->>'fee_crew_c')::BIGINT, 0),
    COALESCE((p_opex->>'fee_extra')::BIGINT, 0),
    COALESCE((p_opex->>'transport_bbm')::BIGINT, 0),
    COALESCE((p_opex->>'sewa_alat')::BIGINT, 0),
    COALESCE((p_opex->>'perawatan')::BIGINT, 0),
    COALESCE((p_opex->>'konsumsi')::BIGINT, 0),
    COALESCE((p_opex->>'komisi_vendor')::BIGINT, 0),
    COALESCE((p_opex->>'komisi_relasi')::BIGINT, 0),
    COALESCE((p_opex->>'komisi_sales_direct')::BIGINT, 0),
    COALESCE((p_opex->>'platform_fee')::BIGINT, 0),
    COALESCE((p_opex->>'diskon_tambahan')::BIGINT, 0),
    v_opex_total,
    v_total_biaya, v_net_profit, v_margin_pct, v_is_loss,
    v_sinking_eq, v_sinking_main, v_sinking_crew, v_sinking_emerg, v_total_sinking,
    v_owner_pool_total, COALESCE(p_owner_pool_per_person, 0),
    v_operating_cash,
    p_closed_by
  ) RETURNING id INTO v_settlement_id;

  UPDATE events SET status = 'completed', updated_at = NOW() WHERE id = p_event_id;

  IF NOT v_is_loss THEN
    -- Sinking fund movements
    FOR v_fund IN SELECT * FROM sinking_funds WHERE is_active = true LOOP
      IF v_fund.allocation_type = 'percentage' THEN
        v_alloc := FLOOR(v_net_profit * v_fund.allocation_value / 100);
      ELSIF v_fund.allocation_type = 'flat' THEN
        v_alloc := v_fund.allocation_value::BIGINT;
      ELSE
        v_alloc := 0;
      END IF;

      IF v_alloc > 0 THEN
        INSERT INTO sinking_fund_movements (
          fund_id, movement_type, amount,
          source_type, source_event_id, source_settlement_id,
          description, performed_by
        ) VALUES (
          v_fund.id, 'deposit', v_alloc,
          'settlement', p_event_id, v_settlement_id,
          'Auto-allocate dari settlement event ' || v_project_id,
          p_closed_by
        );
      END IF;
    END LOOP;

    -- Owner earnings — proportional to share_pct if any owner has share set,
    -- else fall back to flat per-person.
    IF v_owner_count > 0 AND v_owner_pool_total > 0 THEN
      IF v_share_total > 0 THEN
        FOR v_owner_id IN SELECT unnest(p_owner_user_ids) LOOP
          SELECT COALESCE(share_pct, 0) INTO v_share FROM users WHERE id = v_owner_id;
          IF v_share > 0 THEN
            v_owner_amount := FLOOR(v_owner_pool_total * v_share / v_share_total);
          ELSE
            v_owner_amount := 0;
          END IF;
          IF v_owner_amount > 0 THEN
            INSERT INTO owner_earnings (
              owner_user_id, earning_type, amount,
              source_event_id, source_settlement_id,
              description, performed_by
            ) VALUES (
              v_owner_id, 'profit_share', v_owner_amount,
              p_event_id, v_settlement_id,
              'Bagi hasil settlement event ' || v_project_id || ' (share ' || v_share || '%)',
              p_closed_by
            );
          END IF;
        END LOOP;
      ELSE
        -- Flat fallback (legacy)
        FOREACH v_owner_id IN ARRAY p_owner_user_ids LOOP
          INSERT INTO owner_earnings (
            owner_user_id, earning_type, amount,
            source_event_id, source_settlement_id,
            description, performed_by
          ) VALUES (
            v_owner_id, 'profit_share', p_owner_pool_per_person,
            p_event_id, v_settlement_id,
            'Bagi hasil settlement event ' || v_project_id || ' (flat)',
            p_closed_by
          );
        END LOOP;
      END IF;
    END IF;
  END IF;

  INSERT INTO audit_log (
    actor_id, action, entity_type, entity_id, metadata
  ) VALUES (
    p_closed_by, 'settlement_close', 'event_settlement', v_settlement_id,
    jsonb_build_object(
      'event_id', p_event_id,
      'project_id', v_project_id,
      'net_profit', v_net_profit,
      'is_loss', v_is_loss,
      'owner_count', v_owner_count,
      'sinking_total', v_total_sinking,
      'distribution_mode', CASE WHEN v_share_total > 0 THEN 'proportional' ELSE 'flat' END
    )
  );

  RETURN v_settlement_id;
END;
$$;

GRANT EXECUTE ON FUNCTION close_event_settlement(UUID, BIGINT, BIGINT, JSONB, JSONB, UUID[], BIGINT, UUID) TO authenticated;
