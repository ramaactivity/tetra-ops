-- Migration: whatsapp_bot_contacts — Lead segmentation (B2B / Rekanan) Phase 1
-- Date: 2026-06-22
-- Purpose:
--   One row per WhatsApp CONTACT (1 nomor = 1 segmen). Segment is a property of
--   the contact, NOT of a single chat — so it lives here, separate from the
--   append-only `whatsapp_bot_leads` log.
--
--   The bot (repo `TETRA WA BOT`, running 24/7 on the VPS) writes here via the
--   service_role key (bypasses RLS):
--     - auto-detected segment   → segment_source = 'auto'
--     - reads admin overrides    → any row with segment_source = 'manual'
--
--   GOLDEN RULE: segment_source = 'manual' is the admin's decision and the bot
--   must NEVER overwrite it. The bot only writes/overwrites rows with
--   source = 'auto'. The trigger below makes that bulletproof even under a race.
--
--   Contract (source of truth) — do NOT rename columns/values without agreeing
--   with the bot maintainer. See WHATSAPP_BOT_SEGMENTASI_HANDOVER §2.
--
--   RLS pattern mirrors supabase/migrations/20260618_whatsapp_bot_leads.sql:
--     - SELECT               : any authenticated user
--     - INSERT/UPDATE/DELETE : super_admin / owner only
--
-- Idempotent: safe to re-run.

create table if not exists whatsapp_bot_contacts (
  id uuid primary key default gen_random_uuid(),
  wa_jid text unique not null,                  -- contact key ('628xxx@s.whatsapp.net' / '...@lid')
  phone text,                                   -- digits only (for wa.me / display)
  name text,                                    -- WhatsApp pushName
  segment text not null default 'private',      -- private | corporate | instansi | eo_wo | venue
  segment_source text not null default 'auto',  -- 'auto' (bot guess) | 'manual' (admin truth)
  org_name text,                                -- PT/EO/venue name (optional)
  status text not null default 'prospek',       -- prospek | aktif | rekanan (relationship cycle)
  notes text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_wa_contacts_segment on whatsapp_bot_contacts (segment);
create index if not exists idx_wa_contacts_phone on whatsapp_bot_contacts (phone);

alter table whatsapp_bot_contacts enable row level security;

-- SELECT: every authenticated user (dashboard read).
drop policy if exists "wa_contacts_read_authn" on whatsapp_bot_contacts;
create policy "wa_contacts_read_authn"
  on whatsapp_bot_contacts
  for select
  to authenticated
  using (true);

-- INSERT / UPDATE / DELETE: owner / super_admin only.
-- (Bot writes via service_role → bypasses RLS, so auto upserts still flow.)
drop policy if exists "wa_contacts_write_owner" on whatsapp_bot_contacts;
create policy "wa_contacts_write_owner"
  on whatsapp_bot_contacts
  for all
  to authenticated
  using (
    exists (
      select 1 from users u
      where u.id = auth.uid()
        and u.role in ('super_admin', 'owner')
    )
  )
  with check (
    exists (
      select 1 from users u
      where u.id = auth.uid()
        and u.role in ('super_admin', 'owner')
    )
  );

-- ── Anti-overwrite guard (bulletproof against races) ────────────────────────
-- The bot already refuses to touch manual rows, but if an in-flight auto upsert
-- lands on a row an admin just set to 'manual', this trigger preserves the
-- admin's segment + source. last_seen_at / name / phone / org_name still update
-- so freshness + contact details keep flowing.
create or replace function wa_contacts_guard_manual()
returns trigger
language plpgsql
as $$
begin
  if OLD.segment_source = 'manual' and NEW.segment_source <> 'manual' then
    NEW.segment := OLD.segment;
    NEW.segment_source := 'manual';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_wa_contacts_guard_manual on whatsapp_bot_contacts;
create trigger trg_wa_contacts_guard_manual
  before update on whatsapp_bot_contacts
  for each row
  execute function wa_contacts_guard_manual();
