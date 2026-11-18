-- 20261118c_tagihan_rutin.sql — halaman Finance › Tagihan rutin (owner 18 Nov 2026:
-- "halaman perihal subscription yang perlu dibayar rutin… supaya gua diberi peringatan",
-- reminder ke grup owner Telegram + grup WA Tetra Photobooth).
--
-- telegram_renewals tetap jadi tabelnya (dipakai digest & /langganan). Status "sudah
-- dibayar" dibaca dari jurnal Catat: kategori (category_id → akun beban) + kata kunci
-- di keterangan + bulan yang dibayar (period_month). manual_paid_due = owner menandai
-- lunas tanpa jurnal (mis. dibayar dari luar kas Tetra). kind 'bagi_hasil' membaca
-- penarikan bagi hasil owner. Aditif saja; tidak ada data yang dihapus.

ALTER TABLE telegram_renewals
	ADD COLUMN IF NOT EXISTS amount integer,
	ADD COLUMN IF NOT EXISTS category_id text,
	ADD COLUMN IF NOT EXISTS match_keyword text,
	ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'bill',
	ADD COLUMN IF NOT EXISTS manual_paid_due date;

DO $$ BEGIN
	ALTER TABLE telegram_renewals
		ADD CONSTRAINT telegram_renewals_kind_check CHECK (kind IN ('bill', 'bagi_hasil'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Lengkapi baris lama.
UPDATE telegram_renewals
SET amount = 111000, category_id = 'bayar-internet', match_keyword = 'telkomsel', updated_at = NOW()
WHERE name ILIKE 'Telkomsel%' AND category_id IS NULL;

UPDATE telegram_renewals
SET category_id = 'platform', match_keyword = 'domain', updated_at = NOW()
WHERE name ILIKE 'Hosting / Domain%' AND category_id IS NULL;

-- VPS DomaiNesia sudah tidak dipakai (bot pindah ke SumoPod) — owner: "kalau abis gapapa".
UPDATE telegram_renewals
SET is_enabled = false, notes = COALESCE(notes, '') || ' · dimatikan 18 Nov 2026: bot pindah ke SumoPod', updated_at = NOW()
WHERE name ILIKE 'VPS WhatsApp Bot (DomaiNesia)%' AND is_enabled;

-- Tagihan rutin yang dibayar dari kas Tetra (riwayat jurnal Agu–Nov 2026).
INSERT INTO telegram_renewals (name, next_due, cycle, amount, category_id, match_keyword, notes)
SELECT v.name, v.next_due::date, 'monthly', v.amount, v.category_id, v.match_keyword, v.notes
FROM (VALUES
	('Kost', '2026-12-01', 800000, 'bayar-kost', 'kost', 'awal bulan'),
	('Wifi kantor', '2026-12-01', 101000, 'bayar-internet', 'wifi', 'awal bulan'),
	('VPS Sumopod', '2026-11-21', 90000, 'platform', 'vps', 'server bot WA + Hermes; diperpanjang dari kredit SumoPod')
) AS v(name, next_due, amount, category_id, match_keyword, notes)
WHERE NOT EXISTS (SELECT 1 FROM telegram_renewals r WHERE r.name = v.name);

INSERT INTO telegram_renewals (name, next_due, cycle, kind, notes)
SELECT 'Bagi hasil owner', '2026-12-01'::date, 'monthly', 'bagi_hasil', 'ambil jatah bulan lalu di awal bulan'
WHERE NOT EXISTS (SELECT 1 FROM telegram_renewals WHERE kind = 'bagi_hasil');
