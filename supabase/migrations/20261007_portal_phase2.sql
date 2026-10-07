-- 20261007_portal_phase2.sql
-- Fase 2 portal klien (rencana docs/RENCANA-BOOKING-PORTAL.md, DR-028, DR-034):
-- permintaan klien (pindah tanggal / batal) yang ditangani admin. Undangan
-- anggota & pelunasan memakai tabel fase 1 (booking_members, payment_submissions).
-- RLS: owner-only baca lewat app; portal menulis lewat server (admin client).
-- Idempotent & aditif.

CREATE TABLE IF NOT EXISTS booking_requests (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	booking_id uuid NOT NULL REFERENCES client_bookings(id) ON DELETE CASCADE,
	kind text NOT NULL CHECK (kind IN ('pindah_tanggal', 'batal')),
	new_date date,
	new_start time,
	reason text,
	-- Perkiraan refund saat diajukan (DR-034), hanya informasi; refund dijalankan admin.
	refund_estimate bigint,
	status text NOT NULL DEFAULT 'baru' CHECK (status IN ('baru', 'selesai', 'ditolak')),
	admin_note text,
	requested_by uuid REFERENCES portal_people(id),
	resolved_by uuid REFERENCES users(id),
	resolved_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now(),
	CHECK (kind <> 'pindah_tanggal' OR new_date IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS booking_requests_status_idx ON booking_requests (status, created_at);
CREATE INDEX IF NOT EXISTS booking_requests_booking_idx ON booking_requests (booking_id);

ALTER TABLE booking_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS booking_requests_owner_select ON booking_requests;
CREATE POLICY booking_requests_owner_select ON booking_requests FOR SELECT USING (is_owner_level());
