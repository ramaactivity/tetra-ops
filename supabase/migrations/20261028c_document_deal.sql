-- 20261028c_document_deal.sql
-- Rincian kesepakatan di quotation / invoice DP (sebelum ada event), isinya
-- sama dengan form booking supaya Deal → booking → invoice → kuitansi
-- konsisten: channel (direct/vendor), vendor + PIC, skema komisi vendor
-- (commission / upfront_cut, percent / flat, nilai, nominal potongan), tipe
-- diskon klien. documents.discount tetap = total potongan di dokumen
-- (diskon klien + potongan langsung vendor). NULL = dokumen lama / langsung.
-- Idempotent.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS deal jsonb;
COMMENT ON COLUMN documents.deal IS
	'Quotation/invoice DP: {channel, vendor_name, vendor_pic_name, vendor_contact, vendor_commission_mode, vendor_commission_value_type, vendor_commission_value, vendor_cut, discount_type}. Dipetakan ke form booking saat Deal.';
