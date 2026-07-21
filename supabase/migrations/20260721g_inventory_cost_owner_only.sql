-- ============================================================================
-- 20260721g — FIX: crew bisa membaca harga beli / HPP dari inventory_items
-- ============================================================================
-- MASALAH
--   Policy lama: inventory_read_all FOR SELECT USING (auth.uid() IS NOT NULL)
--   → siapa pun yang login bisa membaca SELURUH baris inventory_items,
--   termasuk purchase_price, purchase_price_avg, selling_price, dan
--   expected_supplier_cost.
--
--   Aplikasi memang sudah menyaring biaya untuk crew (getRekapContext
--   menol-kan purchase_price_avg), tapi penyaringan itu KOSMETIK: crew
--   memegang anon key + JWT-nya sendiri, jadi cukup membuka devtools dan
--   menjalankan supabase.from('inventory_items').select('*') untuk menarik
--   seluruh tabel HPP. Melanggar aturan inti "crew tidak pernah melihat
--   cost/HPP/profit".
--
-- KENAPA VIEW, BUKAN PECAH TABEL
--   RLS bekerja per-BARIS, bukan per-KOLOM, dan GRANT kolom tidak bisa
--   memisahkan owner dari crew karena keduanya memakai role Postgres yang
--   sama (`authenticated`).
--
--   Pemetaan pemakaian menunjukkan crew hanya menyentuh inventory_items di
--   TIGA tempat, dan TIDAK SATU PUN benar-benar butuh kolom biaya:
--     • (crew)/crew/jadwal/[projectId]  → id, sku, name, category, condition
--     • (crew)/crew/alat                → id, sku, name, condition, current_event_id
--     • getRekapContext                 → mengambil biaya lalu menol-kannya
--   Sementara ~160 referensi lain seluruhnya milik owner.
--
--   Maka: kunci tabelnya untuk owner, sediakan view tanpa kolom biaya untuk
--   crew. Sisi owner tidak berubah sama sekali.
--
-- CATATAN KEAMANAN VIEW
--   View ini SENGAJA security_invoker = false (berjalan sebagai pemiliknya)
--   supaya bisa melewati policy owner-only di tabel dasar. Itu aman di sini
--   karena keamanannya bersifat STRUKTURAL: kolom biaya tidak ada di dalam
--   view, jadi tidak ada yang bisa dibocorkan. Kolom didaftarkan EKSPLISIT
--   (bukan SELECT *) supaya kolom biaya baru di masa depan tidak otomatis
--   ikut terekspos.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. View aman — tanpa purchase_price, purchase_price_avg, selling_price,
--    expected_supplier_cost, purchase_date, useful_life_months, coa_account.
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS inventory_items_safe;

CREATE VIEW inventory_items_safe
WITH (security_invoker = false) AS
SELECT
  id,
  sku,
  name,
  category,
  unit,
  unit_conversion,
  min_stock_alert,
  condition,
  current_location,
  current_event_id,
  current_crew_id,
  is_active,
  image_url,
  notes,
  created_at,
  updated_at,
  deleted_at
FROM inventory_items;

COMMENT ON VIEW inventory_items_safe IS
  'Proyeksi inventory_items TANPA kolom biaya, untuk pembaca non-owner (crew). '
  'Kolom didaftarkan eksplisit — jangan diganti SELECT *, supaya kolom biaya '
  'baru tidak otomatis bocor.';

GRANT SELECT ON inventory_items_safe TO authenticated;
REVOKE ALL ON inventory_items_safe FROM anon;

-- ---------------------------------------------------------------------------
-- 2. Kunci tabel dasar ke owner-level
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "inventory_read_all" ON inventory_items;

CREATE POLICY "inventory_read_owner" ON inventory_items FOR SELECT
  TO authenticated USING (is_owner_level());

-- ---------------------------------------------------------------------------
-- 3. Verifikasi
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_leak text;
BEGIN
  -- View tidak boleh memuat kolom biaya apa pun.
  SELECT string_agg(column_name, ', ')
  INTO v_leak
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'inventory_items_safe'
    AND column_name IN (
      'purchase_price', 'purchase_price_avg', 'selling_price',
      'expected_supplier_cost'
    );
  IF v_leak IS NOT NULL THEN
    RAISE EXCEPTION 'View masih membocorkan kolom biaya: %', v_leak;
  END IF;

  -- Tabel dasar tidak boleh lagi punya SELECT yang terbuka untuk semua.
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='inventory_items'
      AND cmd='SELECT' AND qual NOT ILIKE '%is_owner_level%'
  ) THEN
    RAISE EXCEPTION 'inventory_items masih punya policy SELECT non-owner';
  END IF;

  RAISE NOTICE 'OK: biaya inventory terkunci owner-level, view aman tersedia.';
END $$;
