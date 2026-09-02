-- ============================================================================
-- 20260829b_merge_venues.sql — gabungkan dua master venue yang sebenarnya
-- tempat yang sama ("Harris CCM" vs "Harris Hotel CCM").
--
-- Dibuat sebagai RPC, bukan beberapa update dari aplikasi, karena tiga langkah
-- di bawah harus jadi satu: kalau event sudah dipindah tapi venue sumber gagal
-- diarsipkan, daftar pilihan tetap memuat duplikat yang sudah kosong.
--
-- Yang gampang terlewat: venue sumber sering justru yang punya data lebih
-- lengkap (mis. duplikatnya yang di-pin di Maps). Jadi sebelum diarsipkan,
-- kolom yang MASIH KOSONG di venue tujuan diisi dari sumber — menggabungkan
-- tidak boleh membuang data.
-- ============================================================================

CREATE OR REPLACE FUNCTION merge_venues(
	p_source_id     UUID,
	p_target_id     UUID,
	p_rename_events BOOLEAN
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
	v_source RECORD;
	v_target RECORD;
	v_moved  INTEGER;
BEGIN
	PERFORM require_owner_level_rpc('merge_venues');

	IF p_source_id = p_target_id THEN
		RAISE EXCEPTION 'Venue sumber dan tujuan tidak boleh sama'
			USING ERRCODE = '22023';
	END IF;

	SELECT * INTO v_source FROM venues WHERE id = p_source_id;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'Venue yang mau digabung tidak ditemukan'
			USING ERRCODE = 'P0002';
	END IF;

	SELECT * INTO v_target FROM venues WHERE id = p_target_id;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'Venue tujuan tidak ditemukan' USING ERRCODE = 'P0002';
	END IF;
	IF NOT v_target.is_active THEN
		RAISE EXCEPTION 'Venue tujuan sudah diarsipkan — pilih yang aktif'
			USING ERRCODE = '22023';
	END IF;

	-- 1. Tujuan mewarisi apa yang cuma dimiliki sumber. Yang sudah terisi di
	--    tujuan TIDAK ditimpa.
	UPDATE venues t SET
		address         = COALESCE(t.address, v_source.address),
		city            = COALESCE(t.city, v_source.city),
		province        = COALESCE(t.province, v_source.province),
		google_maps_url = COALESCE(t.google_maps_url, v_source.google_maps_url),
		google_maps_lat = COALESCE(t.google_maps_lat, v_source.google_maps_lat),
		google_maps_lng = COALESCE(t.google_maps_lng, v_source.google_maps_lng),
		notes           = COALESCE(t.notes, v_source.notes),
		updated_at      = NOW()
	WHERE t.id = p_target_id;

	-- 2. Pindahkan event. Nama di event adalah POTRET saat acara berlangsung,
	--    jadi penyeragaman namanya opsional — dipakai kalau ejaan lama memang
	--    salah ketik, bukan nama yang benar-benar dipakai waktu itu.
	IF p_rename_events THEN
		UPDATE events
		SET venue_id = p_target_id, venue_name = v_target.name
		WHERE venue_id = p_source_id;
	ELSE
		UPDATE events SET venue_id = p_target_id WHERE venue_id = p_source_id;
	END IF;
	GET DIAGNOSTICS v_moved = ROW_COUNT;

	-- 3. Arsipkan sumbernya. Diarsipkan, bukan dihapus: kalau ternyata salah
	--    gabung, datanya masih ada. Indeks unik cuma berlaku untuk baris aktif,
	--    jadi namanya otomatis bebas dipakai lagi.
	UPDATE venues
	SET is_active = false,
	    notes = TRIM(BOTH ' ' FROM
	              COALESCE(notes || ' · ', '') || 'Digabung ke ' || v_target.name),
	    updated_at = NOW()
	WHERE id = p_source_id;

	RETURN jsonb_build_object(
		'moved_events', v_moved,
		'source_name', v_source.name,
		'target_name', v_target.name
	);
END;
$fn$;

COMMENT ON FUNCTION merge_venues IS
	'Gabungkan venue duplikat: tujuan mewarisi kolom yang masih kosong dari sumber, event dipindah (opsional sekalian menyeragamkan nama), sumber diarsipkan.';

REVOKE ALL ON FUNCTION merge_venues(UUID, UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION merge_venues(UUID, UUID, BOOLEAN) TO authenticated, service_role;
