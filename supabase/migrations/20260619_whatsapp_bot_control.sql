-- Migration: WhatsApp Bot Control — Fase 2 (settings + rules + paused contacts)
-- Date: 2026-06-19
-- Purpose:
--   Let the owner control the Tetra Photobooth WhatsApp bot from Tetra Ops
--   without SSH: master on/off, business hours, cooldown/pause, salam reply,
--   editable reply rules, and shared per-contact pause state.
--
--   Data contract — see WHATSAPP_BOT_LEADS_HANDOVER §3.2–3.4. Do NOT rename
--   columns without agreeing with the bot maintainer (repo `TETRA WA BOT`).
--   The bot (Fase 2 §5.3) will read bot_settings + bot_rules to OVERRIDE its
--   local config.js (config.js stays as the fallback default). Seed values
--   below mirror the bot's current config.js exactly, so wiring the bot to the
--   DB keeps behavior identical.
--
--   RLS mirrors supabase/migrations/20260507_contacts_rls.sql:
--     - SELECT          : any authenticated user
--     - INSERT/UPDATE/DELETE : super_admin / owner only
--   (Bot reads/writes via service_role → bypasses RLS.)
--
-- Idempotent: safe to re-run (seeds guarded; won't clobber owner edits).

-- ─────────────────────────────────────────────────────────────────────────
-- 3.2  bot_settings — global config (single row, id = 1)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists bot_settings (
  id int primary key default 1,
  enabled boolean not null default true,
  business_start_hour int not null default 6,
  business_end_hour int not null default 23,
  timezone_offset int not null default 7,
  after_hours_note text,
  cooldown_hours int not null default 12,
  pause_hours int not null default 24,
  salam_reply text,
  admin_notify_jid text,
  updated_at timestamptz not null default now(),
  constraint bot_settings_singleton check (id = 1)
);

alter table bot_settings enable row level security;

drop policy if exists "bot_settings_read_authn" on bot_settings;
create policy "bot_settings_read_authn"
  on bot_settings for select to authenticated using (true);

drop policy if exists "bot_settings_write_owner" on bot_settings;
create policy "bot_settings_write_owner"
  on bot_settings for all to authenticated
  using (exists (select 1 from users u where u.id = auth.uid() and u.role in ('super_admin','owner')))
  with check (exists (select 1 from users u where u.id = auth.uid() and u.role in ('super_admin','owner')));

-- Seed the singleton row with the bot's current config.js values.
-- ON CONFLICT DO NOTHING → never clobbers owner edits on re-run.
insert into bot_settings (
  id, enabled, business_start_hour, business_end_hour, timezone_offset,
  after_hours_note, cooldown_hours, pause_hours, salam_reply, admin_notify_jid
) values (
  1, true, 6, 23, 7,
  $ahn$

(Catatan: pesan ini masuk di luar jam operasional kami 06.00–23.00 WIB. Tim kami akan membalas lebih lengkap di jam kerja ya 🙏)$ahn$,
  12, 24,
  $salam$Wa'alaikumsalam wr. wb. 🙏$salam$,
  '6289611384767@s.whatsapp.net'
)
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────
-- 3.3  bot_rules — editable reply rules (priority asc = checked first)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists bot_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  keywords text[] not null default '{}',
  reply text not null,
  file_path text,
  priority int not null default 100,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

create index if not exists idx_bot_rules_active_priority
  on bot_rules (is_active, priority asc);

alter table bot_rules enable row level security;

drop policy if exists "bot_rules_read_authn" on bot_rules;
create policy "bot_rules_read_authn"
  on bot_rules for select to authenticated using (true);

drop policy if exists "bot_rules_write_owner" on bot_rules;
create policy "bot_rules_write_owner"
  on bot_rules for all to authenticated
  using (exists (select 1 from users u where u.id = auth.uid() and u.role in ('super_admin','owner')))
  with check (exists (select 1 from users u where u.id = auth.uid() and u.role in ('super_admin','owner')));

-- Seed rules from the bot's current config.js (only when table is empty, so
-- re-runs / later owner edits are preserved). Priority follows config order:
-- specific rules first, general "pricelist" last.
insert into bot_rules (name, keywords, reply, file_path, priority, is_active)
select * from (values
  (
    'dp',
    array['dp','uang muka','bayar','pembayaran','transfer','rekening','booking fee'],
    $dp$Untuk mengamankan tanggal acara, booking dikonfirmasi dengan DP ya 🙌

💰 *DP: Rp 500.000*
🏦 Transfer ke *BCA 0954965224*
👤 a.n. *Muhamad Ramadan Saputra*
🗓️ Pelunasan paling lambat *H-1* sebelum acara

Kalau sudah transfer, tinggal kirim bukti transfernya ke chat ini ya, nanti langsung kami konfirmasi & amankan tanggalnya 🙏$dp$,
    null::text, 10, true
  ),
  (
    'lokasi',
    array['lokasi','area','jangkauan','luar kota','bisa ke','coverage','jangkau'],
    $lokasi$Kami melayani area *Jabodetabek* untuk acara kamu 🚗

✅ Jabodetabek: *GRATIS biaya transport* 🎉
📍 Luar Jabodetabek: boleh diinfokan dulu lokasi venue-nya, nanti kami bantu cekkan & hitung estimasinya ya

Boleh infokan lokasi venue acaranya di mana? 🙌$lokasi$,
    null::text, 20, true
  ),
  (
    'booking',
    array['available','tersedia','kosong','booking','jadwal','tanggal','slot','ready'],
    $booking$Untuk cek ketersediaan tanggal, boleh diinfokan ya:
1. Tanggal acara?
2. Lokasi venue?
3. Jenis acaranya apa?

Nanti langsung kami cekkan slot-nya 🙌$booking$,
    null::text, 30, true
  ),
  (
    'pricelist',
    array['pricelist','price list','harga','price','berapa','paket','list'],
    $pl$Halo Kaka! Terima kasih sudah menghubungi Tetra Photobooth 📸

Detail lengkap untuk pricelist bisa langsung diakses di sini:
https://tetraphoto.com/pricelist

Boleh bantu infokan detail berikut agar kami bisa segera cek ketersediaan jadwal?

Jenis acara:
Tanggal acara:
Lokasi venue:

Ditunggu kabar baiknya ya Kak, kalau ada yang kurang jelas langsung tanya aja ya! 🙌$pl$,
    null::text, 100, true
  )
) as seed(name, keywords, reply, file_path, priority, is_active)
where not exists (select 1 from bot_rules);

-- ─────────────────────────────────────────────────────────────────────────
-- 3.4  bot_paused_contacts — shared per-contact pause state
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists bot_paused_contacts (
  wa_jid text primary key,
  paused_until timestamptz not null,
  source text not null default 'admin',
  updated_at timestamptz not null default now()
);

alter table bot_paused_contacts enable row level security;

drop policy if exists "bot_paused_read_authn" on bot_paused_contacts;
create policy "bot_paused_read_authn"
  on bot_paused_contacts for select to authenticated using (true);

drop policy if exists "bot_paused_write_owner" on bot_paused_contacts;
create policy "bot_paused_write_owner"
  on bot_paused_contacts for all to authenticated
  using (exists (select 1 from users u where u.id = auth.uid() and u.role in ('super_admin','owner')))
  with check (exists (select 1 from users u where u.id = auth.uid() and u.role in ('super_admin','owner')));
