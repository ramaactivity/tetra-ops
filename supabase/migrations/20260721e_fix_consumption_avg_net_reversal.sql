-- ============================================================================
-- 20260721e — FIX: rata-rata konsumsi forecast tidak menghitung reversal
-- ============================================================================
-- MASALAH
--   get_consumption_per_event_avg hanya menjumlahkan baris direction='out'
--   dengan source='rekap_consumption'. Baris 'in' yang ditulis
--   reverse_rekap_stock memakai source YANG SAMA, tapi tidak pernah dikurangkan.
--
--   Skenario: owner mengirim cetak_total = 5000 (salah ketik untuk 500),
--   approve, lalu koreksi dan submit ulang. Ledger berisi
--   out 5000 / in 4500 / out 500 — konsumsi bersih 500. RPC ini menghitung
--   5500 untuk event tersebut, sehingga forecast /warehouse menyuruh owner
--   membeli ~10x kebutuhan sebenarnya.
--
--   Jumlah event pembagi juga ikut salah: event yang seluruh konsumsinya sudah
--   dibalik penuh (mis. rekap ditolak) tetap dihitung sebagai satu event
--   teramati, sehingga rata-ratanya turun secara keliru.
--
-- CATATAN: yang di-replace adalah *_impl. Sejak 20260721b, nama publik
--   get_consumption_per_event_avg adalah wrapper ber-guard yang meneruskan
--   ke sini — kontrak pemanggil tidak berubah.
-- ============================================================================
CREATE OR REPLACE FUNCTION get_consumption_per_event_avg_impl()
RETURNS TABLE(item_id uuid, avg_per_event numeric, events_observed integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Konsumsi BERSIH per (event, item): keluar dikurangi yang dikembalikan.
  WITH net AS (
    SELECT
      sm.source_id,
      sm.item_id,
      SUM(CASE WHEN sm.direction = 'out' THEN sm.quantity ELSE -sm.quantity END) AS qty
    FROM stock_movements sm
    WHERE sm.source = 'rekap_consumption'
      AND sm.source_id IS NOT NULL
    GROUP BY sm.source_id, sm.item_id
  ),
  -- Hanya event yang benar-benar menyisakan konsumsi yang dihitung sebagai
  -- "teramati" — event yang dibalik penuh tidak boleh mengencerkan rata-rata.
  ev AS (
    SELECT COUNT(DISTINCT source_id) AS n
    FROM net
    WHERE qty > 0
  )
  SELECT
    net.item_id,
    SUM(net.qty) / NULLIF((SELECT n FROM ev), 0) AS avg_per_event,
    (SELECT n FROM ev)::int AS events_observed
  FROM net
  WHERE net.qty > 0
  GROUP BY net.item_id;
$$;

-- Verifikasi: fungsi masih bisa dieksekusi lewat wrapper.
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM get_consumption_per_event_avg();
  RAISE NOTICE 'OK: get_consumption_per_event_avg mengembalikan % baris', n;
END $$;
