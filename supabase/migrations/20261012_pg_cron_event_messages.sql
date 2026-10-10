-- 20261012_pg_cron_event_messages.sql
-- Jadwal GitHub Actions ternyata molor berjam-jam (10 Okt: run :07/:37 hanya
-- jalan 3× sehari) → briefing crew & galeri telat. Penjadwal utama dipindah ke
-- pg_cron + pg_net Supabase (tepat waktu). Secret CRON_SECRET disimpan di Vault
-- (nama 'ops_cron_secret', diisi lewat skrip, TIDAK di repo); job dibuat oleh
-- skrip yang sama. GitHub Actions tetap jadi cadangan (endpoint idempoten).
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
