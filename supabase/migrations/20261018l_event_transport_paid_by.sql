-- 20261018l_event_transport_paid_by.sql — sewa mobil dibayar owner siapa (owner 2026-10-18).
-- 'owner:<users.id>' = owner yang membayar sewa; rekap transport ikut pembayar
-- ini → otomatis hutang ke owner itu (syncOwnerPaidQueue). NULL = belum
-- dipilih (perlakuan lama: "dibayar owner", dicatat manual). Aditif.
ALTER TABLE events ADD COLUMN IF NOT EXISTS transport_paid_by text;
COMMENT ON COLUMN events.transport_paid_by IS
	'Pembayar sewa mobil: owner:<users.id> (jadi hutang ke owner itu) atau NULL.';
-- CIMB 16 Okt: sewa mobil 250rb dibayar Adit (sudah tercatat manual 18 Okt).
UPDATE events SET transport_paid_by = 'owner:377c2a4c-0a59-4a65-9977-4c67ef88e0e5'
WHERE project_id = 'PRJ-20261016-1873' AND transport_paid_by IS NULL;
