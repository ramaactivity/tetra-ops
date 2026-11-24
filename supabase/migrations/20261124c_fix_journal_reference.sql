-- generate_journal_reference memotong nomor (lpad(x, 3) MEMANGKAS string
-- yang lebih panjang) dan ikut menghitung ref acak 8 karakter yang kebetulan
-- serba angka (mis. JE-20260907-58056315 → 58056316 → "580"), sehingga
-- menghasilkan nomor yang sudah dipakai → catat pembayaran 7 Sep 2026 gagal
-- "duplicate key journal_entries_ref_id_key" (Sa'adah, 24 Nov 2026).
-- Perbaikan: hitung hanya penghitung pendek (≤ 6 digit), jangan memotong,
-- dan lompati nomor yang sudah ada.
CREATE OR REPLACE FUNCTION public.generate_journal_reference(p_date date DEFAULT CURRENT_DATE)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET "TimeZone" TO 'Asia/Jakarta'
AS $function$
DECLARE
  v_date_str TEXT := to_char(p_date, 'YYYYMMDD');
  v_next_num INTEGER;
  v_ref_id   TEXT;
BEGIN
  SELECT COALESCE(
    MAX(CAST(SUBSTRING(ref_id FROM '^JE-' || v_date_str || '-([0-9]{1,6})$') AS INTEGER)),
    0
  ) + 1
  INTO v_next_num
  FROM journal_entries
  WHERE ref_id LIKE 'JE-' || v_date_str || '-%';

  LOOP
    v_ref_id := 'JE-' || v_date_str || '-' ||
      CASE WHEN length(v_next_num::TEXT) >= 3 THEN v_next_num::TEXT
           ELSE LPAD(v_next_num::TEXT, 3, '0') END;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM journal_entries WHERE ref_id = v_ref_id);
    v_next_num := v_next_num + 1;
  END LOOP;

  RETURN v_ref_id;
END;
$function$;
