-- Migration: prospek segmen 'personal' (calon klien perorangan dari komentar IG kompetitor)
-- Date: 2026-10-02
-- Purpose: agent sales (Bruno) mencatat komentator IG kompetitor yang menunjukkan minat
--   (tanya harga/tanggal/PL) sebagai prospek perorangan, lalu DM dari akun Tetra dengan
--   rem server (tool prospek_dm_ig): maks 10/hari, Senin–Sabtu 09–19 WIB, sekali per orang,
--   berhenti 48 jam setelah Instagram memblokir aksi.
-- Idempotent: safe to re-run.

alter table prospek drop constraint if exists prospek_segmen_check;
alter table prospek add constraint prospek_segmen_check
  check (segmen in ('corporate', 'venue', 'eo_wo', 'instansi', 'kampus', 'personal'));
