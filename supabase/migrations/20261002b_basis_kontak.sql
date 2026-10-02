-- Migration: basis_kontak — salinan database lama Rama (Google Sheet "DATABASE TRACKING LEADS TISKA 2025")
-- Date: 2026-10-02
-- Purpose: sumber outreach agent sales (Bruno) tanpa akses Google Sheet lagi. Bruno mengambil batch
--   (basis_kontak_daftar), lalu menandai yang sudah diproses (basis_kontak_tandai). Prospek yang benar-benar
--   disapa tetap masuk tabel prospek; tabel ini hanya bahan mentah.
--   jenis: vendor (WO/EO/venue/dekor) | korporat | hangat (pernah membalas TISKA)
-- Idempotent: safe to re-run.

create table if not exists basis_kontak (
  id uuid primary key default gen_random_uuid(),
  kunci text not null unique,            -- tab + email/wa/ig/nama dinormalkan (anti-dobel impor ulang)
  tab text not null,                     -- nama tab asal di sheet
  jenis text not null check (jenis in ('vendor', 'korporat', 'hangat')),
  nama text,
  perusahaan text,
  jabatan text,
  email text,
  wa text,                               -- 628…
  instagram text,                        -- tanpa @
  kategori text,
  area text,
  catatan text,
  status_lama text,                      -- status di sheet (On Going, Ga dibales, Email Sent, …)
  diproses_at timestamptz,
  hasil text,                            -- diantrekan / dilewati: <alasan>
  created_at timestamptz not null default now()
);

create index if not exists idx_basis_kontak_ambil on basis_kontak (jenis, diproses_at);

alter table basis_kontak enable row level security;
drop policy if exists basis_kontak_owner_all on basis_kontak;
create policy basis_kontak_owner_all on basis_kontak for all
  to authenticated
  using (is_owner_level()) with check (is_owner_level());
