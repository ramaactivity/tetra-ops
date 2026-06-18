-- Migration: whatsapp_bot_leads — WhatsApp Bot Leads (CRM) Phase 1
-- Date: 2026-06-18
-- Purpose:
--   Append-only log of WhatsApp leads captured automatically by the Tetra
--   WhatsApp bot (Baileys, running 24/7 on the VPS). The bot writes rows via
--   the service_role key (bypasses RLS); the Tetra Ops dashboard reads/manages
--   them under RLS (per logged-in user).
--
--   Contract (source of truth) — do NOT rename columns without agreeing with
--   the bot maintainer (repo `TETRA WA BOT`). Both sides must use these exact
--   names.
--
--   RLS pattern mirrors supabase/migrations/20260507_contacts_rls.sql:
--     - SELECT          : any authenticated user
--     - INSERT/UPDATE/DELETE : super_admin / owner only
--
-- Idempotent: safe to re-run.

create table if not exists whatsapp_bot_leads (
  id uuid primary key default gen_random_uuid(),
  wa_jid text not null,
  phone text not null,
  name text,
  topic text not null,
  message text,
  is_after_hours boolean not null default false,
  status text not null default 'new',
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_wa_bot_leads_received on whatsapp_bot_leads (received_at desc);
create index if not exists idx_wa_bot_leads_phone on whatsapp_bot_leads (phone);

alter table whatsapp_bot_leads enable row level security;

-- SELECT: every authenticated user (dashboard read)
drop policy if exists "wa_bot_leads_read_authn" on whatsapp_bot_leads;
create policy "wa_bot_leads_read_authn"
  on whatsapp_bot_leads
  for select
  to authenticated
  using (true);

-- INSERT / UPDATE / DELETE: owner / super_admin only.
-- (Bot writes via service_role → bypasses RLS, so inserts still flow.)
drop policy if exists "wa_bot_leads_write_owner" on whatsapp_bot_leads;
create policy "wa_bot_leads_write_owner"
  on whatsapp_bot_leads
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
