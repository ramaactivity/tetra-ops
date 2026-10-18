-- 20261018m_event_transport_reimburse.sql — sewa mobil dibayar owner: diganti langsung atau hutang (owner 2026-10-18).
-- transport_reimburse_account = kode rekening Tetra (1-1xx): saat settle biaya
-- sewa langsung dibayar dari rekening itu (owner diganti di tempat, tanpa
-- hutang). NULL = jadi hutang dulu ke owner (transport_paid_by). Aditif.
ALTER TABLE events ADD COLUMN IF NOT EXISTS transport_reimburse_account text;
COMMENT ON COLUMN events.transport_reimburse_account IS
	'Sewa mobil dibayar owner & diganti langsung saat settle dari rekening ini; NULL = jadi hutang ke owner.';
