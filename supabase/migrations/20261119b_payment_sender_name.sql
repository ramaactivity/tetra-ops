-- DR-055: nama pemilik rekening pengirim (dari bukti transfer). BERBEDA dari
-- payer_name: payer_name mengganti "Telah terima dari" (pihak lain yang
-- membayar, mis. WO), sender_name hanya menambah "transfer dari rek. a.n. …"
-- di kuitansi dan dipakai mencocokkan mutasi bank. Aditif.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS sender_name TEXT;
COMMENT ON COLUMN payments.sender_name IS
	'Nama pemilik rekening pengirim. Kuitansi: "Telah terima dari: <klien>, transfer dari rek. a.n. <sender_name>".';
