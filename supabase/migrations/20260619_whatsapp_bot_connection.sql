-- Migration: WhatsApp Bot Connection — Fase 3 (status + command queue)
-- Date: 2026-06-19
-- Purpose:
--   Let the owner reconnect / scan QR / logout the bot from Tetra Ops without
--   SSH. Two tables (handover §3.5–3.6):
--     • bot_status   — single row (id=1): connection state + QR string the bot
--       publishes when Baileys needs pairing. Realtime-enabled so the dashboard
--       sees the QR / "connected" live.
--     • bot_commands — dashboard → bot command queue (reconnect/logout/restart).
--
--   Sisi bot (handover §6.2 — maintainer bot): update bot_status on every
--   connection event, write the QR string when pairing, and poll/realtime
--   bot_commands to execute pending commands.
--
--   RLS mirrors the contacts pattern: SELECT = any authenticated; write = owner
--   / super_admin. (Bot uses service_role → bypasses RLS.)
--
-- Idempotent: safe to re-run.

-- ─────────────────────────────────────────────────────────────────────────
-- 3.5  bot_status — connection state + QR (single row, id = 1)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists bot_status (
  id int primary key default 1,
  connection text not null default 'unknown',  -- open / connecting / close / logged_out / unknown
  qr text,                                      -- QR pairing string; null when connected
  last_connected_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint bot_status_singleton check (id = 1)
);

alter table bot_status enable row level security;

drop policy if exists "bot_status_read_authn" on bot_status;
create policy "bot_status_read_authn"
  on bot_status for select to authenticated using (true);

drop policy if exists "bot_status_write_owner" on bot_status;
create policy "bot_status_write_owner"
  on bot_status for all to authenticated
  using (exists (select 1 from users u where u.id = auth.uid() and u.role in ('super_admin','owner')))
  with check (exists (select 1 from users u where u.id = auth.uid() and u.role in ('super_admin','owner')));

insert into bot_status (id, connection) values (1, 'unknown')
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────
-- 3.6  bot_commands — dashboard → bot command queue
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists bot_commands (
  id uuid primary key default gen_random_uuid(),
  command text not null,                        -- reconnect / logout / restart
  status text not null default 'pending',       -- pending / done / error
  result text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists idx_bot_commands_pending
  on bot_commands (status, created_at) where status = 'pending';

alter table bot_commands enable row level security;

drop policy if exists "bot_commands_read_authn" on bot_commands;
create policy "bot_commands_read_authn"
  on bot_commands for select to authenticated using (true);

-- Dashboard inserts commands (owner only); bot updates status via service_role.
drop policy if exists "bot_commands_write_owner" on bot_commands;
create policy "bot_commands_write_owner"
  on bot_commands for all to authenticated
  using (exists (select 1 from users u where u.id = auth.uid() and u.role in ('super_admin','owner')))
  with check (exists (select 1 from users u where u.id = auth.uid() and u.role in ('super_admin','owner')));

-- ─────────────────────────────────────────────────────────────────────────
-- Realtime — dashboard subscribes to bot_status to render the live QR / state.
-- REPLICA IDENTITY FULL so UPDATE events carry the full row (qr + connection).
-- ─────────────────────────────────────────────────────────────────────────
alter table bot_status replica identity full;

do $$
begin
  begin alter publication supabase_realtime add table bot_status;
  exception when duplicate_object then null;
  end;
end $$;
