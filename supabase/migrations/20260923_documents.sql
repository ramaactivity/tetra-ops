-- ============================================================================
-- 20260923_documents.sql — Pusat Dokumen: Quotation · Invoice · Kuitansi ·
-- Nota Lunas · BAST.
--
-- Sebelumnya dokumen klien dibuat di Canva (lambat, nomor rawan dobel, tidak
-- nyambung ke event/pembayaran) dan PDF di app menurunkan nomor dari
-- project_id (tidak urut, tidak tersimpan). Sekarang:
--   • documents          — satu baris per dokumen terbit, nomor tersimpan & unik
--   • document_counters  — penghitung urut PER BULAN per prefix
--   • next_document_number() — alokasi nomor atomik (anti dobel antar sesi)
--   • document_signers   — preset penanda tangan (nama, jabatan, tanda tangan)
--   • packages.quotation_includes — daftar "include" paket untuk quotation
--
-- Format nomor: {PREFIX}-TP-{urut 2 digit}-{DDMMYYYY}, mis. QUO-TP-12-23092026.
-- Urutan reset tiap bulan (keputusan owner 23 Sep 2026).
--
-- Quotation TIDAK pernah tertaut event (murni penawaran). Invoice WAJIB
-- tertaut event: tagihan & pembayaran dibaca live dari events/payments, bukan
-- disalin ke dokumen. Kuitansi = 1 per pembayaran (payment_id unik), Nota Lunas
-- & BAST = 1 per event — unduh ulang selalu memberi nomor yang sama.
--
-- Idempotent — aman dijalankan ulang.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Penanda tangan
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS document_signers (
	id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
	name TEXT NOT NULL,
	position TEXT NOT NULL DEFAULT 'Owner',
	-- PNG/JPG sebagai data URL (kecil, <100KB). App tidak memakai Supabase
	-- Storage, dan tanda tangan tidak boleh berada di folder public.
	signature_data TEXT,
	is_default BOOLEAN NOT NULL DEFAULT false,
	sort_order INT NOT NULL DEFAULT 0,
	is_active BOOLEAN NOT NULL DEFAULT true,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE document_signers IS
	'Preset penanda tangan dokumen klien (quotation/invoice/nota/BAST). Nama & jabatan tetap bisa diubah per dokumen.';

-- Hanya satu default.
CREATE UNIQUE INDEX IF NOT EXISTS document_signers_one_default
	ON document_signers ((true)) WHERE is_default;

INSERT INTO document_signers (name, position, is_default, sort_order)
SELECT 'Ramadan Saputra', 'Owner', true, 0
WHERE NOT EXISTS (SELECT 1 FROM document_signers);

INSERT INTO document_signers (name, position, is_default, sort_order)
SELECT 'Muhammad Iqbal', 'Owner', false, 1
WHERE NOT EXISTS (
	SELECT 1 FROM document_signers WHERE LOWER(name) LIKE '%iqbal%'
);

-- ---------------------------------------------------------------------------
-- Penghitung nomor per bulan
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS document_counters (
	prefix TEXT NOT NULL,
	period TEXT NOT NULL, -- 'YYYY-MM'
	last_seq INT NOT NULL DEFAULT 0,
	PRIMARY KEY (prefix, period)
);

CREATE OR REPLACE FUNCTION next_document_number(p_prefix TEXT, p_date DATE)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_period TEXT := to_char(p_date, 'YYYY-MM');
	v_seq INT;
BEGIN
	IF p_prefix !~ '^[A-Z]{2,6}$' THEN
		RAISE EXCEPTION 'Prefix dokumen tidak valid: %', p_prefix;
	END IF;

	-- Upsert atomik: dua sesi yang minta nomor bersamaan akan antre di baris
	-- yang sama dan mendapat urutan berbeda.
	INSERT INTO document_counters (prefix, period, last_seq)
	VALUES (p_prefix, v_period, 1)
	ON CONFLICT (prefix, period)
	DO UPDATE SET last_seq = document_counters.last_seq + 1
	RETURNING last_seq INTO v_seq;

	RETURN p_prefix || '-TP-' || lpad(v_seq::TEXT, 2, '0') || '-' || to_char(p_date, 'DDMMYYYY');
END;
$$;

REVOKE ALL ON FUNCTION next_document_number(TEXT, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION next_document_number(TEXT, DATE) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Dokumen
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
	id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
	doc_type TEXT NOT NULL
		CHECK (doc_type IN ('quotation', 'invoice', 'receipt', 'nota_lunas', 'bast')),
	doc_number TEXT NOT NULL UNIQUE,
	event_id UUID REFERENCES events(id) ON DELETE SET NULL,
	payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
	source_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
	-- {name, org, phone, email, address}
	client JSONB NOT NULL DEFAULT '{}'::jsonb,
	-- {date, time, venue, city} — potret untuk quotation (belum ada event)
	event_info JSONB NOT NULL DEFAULT '{}'::jsonb,
	-- [{name, includes: text[], qty, unit_price, package_id?, addon_id?}]
	items JSONB NOT NULL DEFAULT '[]'::jsonb,
	discount BIGINT NOT NULL DEFAULT 0,
	gross_up_enabled BOOLEAN NOT NULL DEFAULT false,
	gross_up_rate NUMERIC(5,2) NOT NULL DEFAULT 2,
	notes TEXT,
	terms TEXT,
	signer_id UUID REFERENCES document_signers(id) ON DELETE SET NULL,
	signer_name TEXT,
	signer_position TEXT,
	issued_at DATE NOT NULL DEFAULT CURRENT_DATE,
	due_date DATE,
	valid_until DATE,
	status TEXT NOT NULL DEFAULT 'draft'
		CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'void')),
	created_by UUID REFERENCES users(id) ON DELETE SET NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	CONSTRAINT documents_invoice_needs_event
		CHECK (doc_type <> 'invoice' OR event_id IS NOT NULL),
	CONSTRAINT documents_quotation_no_event
		CHECK (doc_type <> 'quotation' OR event_id IS NULL),
	CONSTRAINT documents_receipt_needs_payment
		CHECK (doc_type <> 'receipt' OR payment_id IS NOT NULL)
);

COMMENT ON TABLE documents IS
	'Dokumen klien bernomor. Quotation berdiri sendiri; invoice wajib tertaut event dan angka bayarnya dibaca live dari events/payments.';

CREATE INDEX IF NOT EXISTS documents_event_id_idx ON documents (event_id);
CREATE INDEX IF NOT EXISTS documents_type_issued_idx ON documents (doc_type, issued_at DESC);

-- Kuitansi: satu per pembayaran. Nota Lunas / BAST: satu per event (yang belum
-- void). Unduh ulang mengembalikan dokumen yang sama, bukan nomor baru.
CREATE UNIQUE INDEX IF NOT EXISTS documents_receipt_per_payment
	ON documents (payment_id) WHERE doc_type = 'receipt' AND status <> 'void';
CREATE UNIQUE INDEX IF NOT EXISTS documents_one_per_event_type
	ON documents (event_id, doc_type)
	WHERE doc_type IN ('nota_lunas', 'bast', 'invoice') AND status <> 'void';

DROP TRIGGER IF EXISTS trg_documents_updated_at ON documents;
CREATE TRIGGER trg_documents_updated_at
	BEFORE UPDATE ON documents
	FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_document_signers_updated_at ON document_signers;
CREATE TRIGGER trg_document_signers_updated_at
	BEFORE UPDATE ON document_signers
	FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------------------
-- Include paket untuk quotation (1 elemen = 1 poin). NULL = pakai template
-- default per kategori di app (src/lib/documents/types.ts).
-- ---------------------------------------------------------------------------
ALTER TABLE packages ADD COLUMN IF NOT EXISTS quotation_includes TEXT[];
COMMENT ON COLUMN packages.quotation_includes IS
	'Poin "include" yang tampil di quotation. NULL = template default per kategori.';

-- ---------------------------------------------------------------------------
-- RLS — owner/super_admin saja (dokumen berisi harga → rahasia bisnis)
-- ---------------------------------------------------------------------------
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_signers ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS documents_owner_all ON documents;
CREATE POLICY documents_owner_all ON documents FOR ALL
	USING (is_owner_level()) WITH CHECK (is_owner_level());

DROP POLICY IF EXISTS document_signers_owner_all ON document_signers;
CREATE POLICY document_signers_owner_all ON document_signers FOR ALL
	USING (is_owner_level()) WITH CHECK (is_owner_level());

-- Counter hanya disentuh lewat RPC (SECURITY DEFINER); tetap boleh dibaca owner.
DROP POLICY IF EXISTS document_counters_owner_read ON document_counters;
CREATE POLICY document_counters_owner_read ON document_counters FOR SELECT
	USING (is_owner_level());
