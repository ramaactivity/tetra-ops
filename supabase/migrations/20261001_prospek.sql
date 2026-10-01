-- Migration: prospek — pipeline outbound (agent sales Hermes)
-- Date: 2026-10-01
-- Purpose:
--   Calon klien/rekanan yang DICARI agent (jemput bola), beda dengan
--   whatsapp_bot_leads/contacts yang MASUK sendiri lewat bot WA.
--
--   Agent `sales` di VPS menulis lewat /api/mcp dengan MCP_SALES_TOKEN
--   (service role, bypass RLS). Agent hanya mencatat + menyiapkan draf;
--   pesan dikirim Rama sendiri lewat link /api/s/<id>.
--
--   Status: kandidat → disapa → follow_up → membalas → deal | tolak | jangan_hubungi
--
-- Idempotent: safe to re-run.

create table if not exists prospek (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  segmen text not null default 'corporate'
    check (segmen in ('corporate', 'venue', 'eo_wo', 'instansi', 'kampus')),
  sumber text not null default 'places',   -- places | web | threads | manual
  place_id text unique,                     -- Google place id (boleh disimpan permanen)
  area text,
  website text,
  email text,
  telepon text,
  instagram text,
  pic text,                                 -- nama/jabatan kontak kalau ketemu
  alasan text,                              -- kenapa cocok / sinyal yang ditemukan
  draf_subjek text,
  draf_pesan text,
  status text not null default 'kandidat'
    check (status in ('kandidat', 'disapa', 'follow_up', 'membalas', 'deal', 'tolak', 'jangan_hubungi')),
  catatan text,
  disapa_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_prospek_status on prospek (status, segmen);

alter table prospek enable row level security;

drop policy if exists prospek_owner_all on prospek;
create policy prospek_owner_all on prospek for all
  to authenticated
  using (is_owner_level()) with check (is_owner_level());
