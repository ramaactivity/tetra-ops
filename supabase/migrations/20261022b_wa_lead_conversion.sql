-- 20261022b_wa_lead_conversion.sql
-- KPI konversi lead WA (DR-051). Lead bot WA (whatsapp_bot_leads) ditandai
-- converted otomatis begitu ada event dengan nomor klien/PIC yang sama —
-- lewat jalur apa pun (portal, input owner, booking dari bot), karena semua
-- jalur berakhir di tabel events. Satu aturan, satu fungsi; backfill memakai
-- fungsi yang sama. Aditif & idempotent.

ALTER TABLE whatsapp_bot_leads
	ADD COLUMN IF NOT EXISTS converted_at timestamptz,
	ADD COLUMN IF NOT EXISTS converted_event_id uuid REFERENCES events(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_wa_bot_leads_converted_event
	ON whatsapp_bot_leads (converted_event_id) WHERE converted_event_id IS NOT NULL;
COMMENT ON COLUMN whatsapp_bot_leads.converted_event_id IS
	'Event hasil lead ini (diisi wa_lead_convert sekali; status manual ignored/converted tidak ditimpa).';

-- Tandai lead yang nomornya (9 digit terakhir) sama dengan client_wa / pic_wa
-- event ini dan masuk SEBELUM event dibuat. Hanya status new/contacted yang
-- belum pernah dikonversi — status yang diubah manual (ignored, converted)
-- tidak disentuh. Event demo / dihapus / legacy dilewati, begitu juga event
-- lewat vendor: nomornya milik PIC rekanan (WO/EO yang memang sering chat),
-- bukan klien yang datang dari bot — KPI ini mengukur booking direct.
CREATE OR REPLACE FUNCTION public.wa_lead_convert(p_event_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_tails text[];
	v_created timestamptz;
	v_n integer;
BEGIN
	SELECT
		array_remove(ARRAY[
			CASE WHEN length(regexp_replace(coalesce(e.client_wa, ''), '\D', '', 'g')) >= 9
				THEN right(regexp_replace(e.client_wa, '\D', '', 'g'), 9) END,
			CASE WHEN length(regexp_replace(coalesce(e.pic_wa, ''), '\D', '', 'g')) >= 9
				THEN right(regexp_replace(e.pic_wa, '\D', '', 'g'), 9) END
		], NULL),
		e.created_at
	INTO v_tails, v_created
	FROM events e
	WHERE e.id = p_event_id
		AND e.deleted_at IS NULL
		AND NOT coalesce(e.is_demo, false)
		AND NOT coalesce(e.is_migrated_legacy, false)
		AND coalesce(e.channel, 'direct') <> 'vendor';
	IF v_tails IS NULL OR cardinality(v_tails) = 0 THEN
		RETURN 0;
	END IF;

	UPDATE whatsapp_bot_leads l
	SET status = 'converted',
		converted_at = now(),
		converted_event_id = p_event_id
	WHERE l.status IN ('new', 'contacted')
		AND l.converted_at IS NULL
		AND l.received_at <= v_created
		AND right(regexp_replace(coalesce(l.phone, ''), '\D', '', 'g'), 9) = ANY (v_tails);
	GET DIAGNOSTICS v_n = ROW_COUNT;
	RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.wa_lead_convert(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_lead_convert(uuid) TO service_role;

-- Pemicu: event dibuat atau nomornya diisi/diubah. Gagal menandai lead TIDAK
-- boleh menggagalkan penyimpanan event.
CREATE OR REPLACE FUNCTION public.trg_events_wa_lead_convert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
	BEGIN
		PERFORM wa_lead_convert(NEW.id);
	EXCEPTION WHEN OTHERS THEN
		RAISE WARNING 'wa_lead_convert % gagal: %', NEW.id, SQLERRM;
	END;
	RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_events_wa_lead_convert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS events_wa_lead_convert ON events;
CREATE TRIGGER events_wa_lead_convert
	AFTER INSERT OR UPDATE OF client_wa, pic_wa ON events
	FOR EACH ROW EXECUTE FUNCTION public.trg_events_wa_lead_convert();
