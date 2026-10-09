-- Migration: Mode Demo permanen (owner 9 Okt 2026, DR-047).
-- Event demo: is_demo = true DAN deleted_at terisi → otomatis tersaring dari semua laporan,
-- KPI, digest, cek jadwal, feed Booth, notifikasi (semuanya memakai deleted_at IS NULL).
-- Portal (dashboard klien & dasbor rekanan) tetap menampilkannya lewat is_demo.
-- Booking portal demo: client_bookings.is_demo (disaring dari antrean admin & cek jadwal).
-- Tidak pernah ada pembayaran/jurnal untuk demo (DP diterima = simulasi). Idempotent.
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE client_bookings ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS events_is_demo_idx ON events (is_demo) WHERE is_demo;
