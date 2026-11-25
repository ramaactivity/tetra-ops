-- DR-064 (owner 25 Nov 2026, lewat hermes-ff): klien sering chat dari nomor
-- yang belum tercatat di event (Shella: event memuat nomor pemesan). Bot
-- mengirim usulan; owner memutuskan di Ops (nomor klien / PIC cadangan /
-- bukan klien). Data event hanya berubah saat owner menekan tombol. Aditif.
CREATE TABLE IF NOT EXISTS public.kontak_usulan (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	-- 9 digit terakhir nomor; kalau nomor tak diketahui (LID) pakai wa_jid.
	kunci text NOT NULL UNIQUE,
	nomor text,
	wa_jid text,
	nama_kontak text,
	nama_wa text,
	alasan text NOT NULL CHECK (alasan IN ('nama_kontak_cocok', 'mengaku_booking')),
	cuplikan text,
	-- [{event_id, project_id, client_name, event_date, skor, alasan[]}]
	kandidat jsonb NOT NULL DEFAULT '[]'::jsonb,
	status text NOT NULL DEFAULT 'terbuka'
		CHECK (status IN ('terbuka', 'ditambahkan', 'bukan_klien')),
	event_id uuid REFERENCES public.events(id),
	peran text CHECK (peran IS NULL OR peran IN ('klien', 'pic')),
	ditutup_oleh uuid REFERENCES public.users(id),
	ditutup_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kontak_usulan_terbuka_idx
	ON public.kontak_usulan (updated_at DESC) WHERE status = 'terbuka';

ALTER TABLE public.kontak_usulan ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kontak_usulan_owner_select ON public.kontak_usulan;
CREATE POLICY kontak_usulan_owner_select ON public.kontak_usulan FOR SELECT
	USING (is_owner_level());
