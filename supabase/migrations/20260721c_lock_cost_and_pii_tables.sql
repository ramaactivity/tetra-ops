-- ============================================================================
-- 20260721c — FIX: crew bisa membaca biaya, hutang, komisi, dan PII pelanggan
-- ============================================================================
-- MASALAH (diverifikasi terhadap pg_policies produksi 2026-07-21)
--   Tabel-tabel ini punya policy `FOR SELECT TO authenticated USING (true)`:
--     supplier_prices        → harga beli tiap vendor
--     payables               → seluruh ledger hutang dagang
--     payable_payments       → nominal tiap pembayaran hutang
--     commission_payouts     → nominal komisi
--     whatsapp_bot_leads     → nomor HP + isi pesan calon pelanggan
--     whatsapp_bot_contacts  → kontak
--     contacts               → kontak pelanggan
--
--   Lapisan aplikasi memang menyaring biaya untuk crew (getRekapContext
--   membuang purchase_price, SCOPES_BY_ROLE menahan scope finance dari crew),
--   tapi penyaringan itu KOSMETIK: crew memegang anon key + JWT-nya sendiri,
--   jadi dari console browser cukup
--     supabase.from('supplier_prices').select('*')
--   untuk menarik seluruh tabel. Melanggar aturan inti "crew tidak pernah
--   melihat cost/HPP/profit", dan lead PII bisa diekspor ke pesaing.
--
--   Diverifikasi juga bahwa rute crew TIDAK membaca satu pun tabel di atas
--   (yang dibaca crew hanya crew_assignments, crew_rekap, event_assets,
--   event_types, events, inventory_items, users), jadi pengetatan ini tidak
--   memutus alur crew mana pun.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Biaya & keuangan → baca owner-level saja
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "supplier_prices_read_all" ON supplier_prices;
CREATE POLICY "supplier_prices_read_owner" ON supplier_prices FOR SELECT
  TO authenticated USING (is_owner_level());

DROP POLICY IF EXISTS "payables_read_all" ON payables;
CREATE POLICY "payables_read_owner" ON payables FOR SELECT
  TO authenticated USING (is_owner_level());

DROP POLICY IF EXISTS "payable_payments_read_all" ON payable_payments;
CREATE POLICY "payable_payments_read_owner" ON payable_payments FOR SELECT
  TO authenticated USING (is_owner_level());

DROP POLICY IF EXISTS "commission_payouts_read_all" ON commission_payouts;
CREATE POLICY "commission_payouts_read_owner" ON commission_payouts FOR SELECT
  TO authenticated USING (is_owner_level());

-- ---------------------------------------------------------------------------
-- 2. PII pelanggan / lead → baca owner-level saja
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "wa_bot_leads_read_authn" ON whatsapp_bot_leads;
CREATE POLICY "wa_bot_leads_read_owner" ON whatsapp_bot_leads FOR SELECT
  TO authenticated USING (is_owner_level());

DROP POLICY IF EXISTS "wa_contacts_read_authn" ON whatsapp_bot_contacts;
CREATE POLICY "wa_contacts_read_owner" ON whatsapp_bot_contacts FOR SELECT
  TO authenticated USING (is_owner_level());

DROP POLICY IF EXISTS "contacts_read_authn" ON contacts;
CREATE POLICY "contacts_read_owner" ON contacts FOR SELECT
  TO authenticated USING (is_owner_level());

-- ---------------------------------------------------------------------------
-- 3. purchase_request_items — crew boleh MEMBUAT permintaan, tidak boleh
--    mengubah/menghapus milik orang lain.
--
--    Policy lama `pri_owner_mutate` adalah FOR ALL dengan daftar role yang
--    menyertakan 'crew', sehingga crew bisa UPDATE/DELETE baris siapa pun.
--    Tidak bisa sekadar mencabut 'crew': FOR ALL juga yang mengizinkan INSERT,
--    dan createPurchaseRequest (purchase-requests.ts:76) memang
--    requireOwnerOrCrew. Jadi policy-nya dipecah.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "pri_owner_mutate" ON purchase_request_items;

CREATE POLICY "pri_insert_owner_or_crew" ON purchase_request_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('owner', 'super_admin', 'crew')
    )
  );

CREATE POLICY "pri_update_owner" ON purchase_request_items FOR UPDATE
  TO authenticated USING (is_owner_level()) WITH CHECK (is_owner_level());

CREATE POLICY "pri_delete_owner" ON purchase_request_items FOR DELETE
  TO authenticated USING (is_owner_level());

-- ---------------------------------------------------------------------------
-- 4. stock_movements INSERT — ikat performed_by ke pemanggil.
--    WITH CHECK lama hanya `auth.uid() IS NOT NULL`, jadi siapa pun yang login
--    bisa menulis mutasi stok ATAS NAMA orang lain dengan unit_cost sembarang,
--    lalu tidak bisa membacanya kembali (policy SELECT owner-only) — blind
--    write yang merusak kuantitas & WAC dan sulit diatribusikan.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "stock_movements_insert_all" ON stock_movements;
CREATE POLICY "stock_movements_insert_own" ON stock_movements FOR INSERT
  TO authenticated
  WITH CHECK (is_owner_level() OR performed_by = auth.uid());

-- ---------------------------------------------------------------------------
-- 5. event_bonuses — RLS AKTIF tapi NOL policy → deny-all senyap.
--    20260516_event_bonuses.sql membuat policy USING (true), tapi di DB live
--    tidak ada satu pun policy tersisa. Akibatnya halaman crew
--    ((crew)/crew/jadwal/[projectId]/page.tsx:80, klien RLS) menampilkan
--    daftar bonus KOSONG tanpa error, sementara sisi owner memakai
--    createAdminClient() sehingga terlihat normal — itu sebabnya luput.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "event_bonuses_read_authn" ON event_bonuses;
CREATE POLICY "event_bonuses_read_authn" ON event_bonuses FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "event_bonuses_write_owner" ON event_bonuses;
CREATE POLICY "event_bonuses_write_owner" ON event_bonuses FOR ALL
  TO authenticated USING (is_owner_level()) WITH CHECK (is_owner_level());

-- ---------------------------------------------------------------------------
-- 6. Verifikasi
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(tablename || '.' || policyname, ', ')
  INTO v_bad
  FROM pg_policies
  WHERE schemaname = 'public'
    AND cmd = 'SELECT'
    AND qual = 'true'
    AND tablename IN (
      'supplier_prices','payables','payable_payments','commission_payouts',
      'whatsapp_bot_leads','whatsapp_bot_contacts','contacts'
    );

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Masih ada SELECT USING(true) di tabel sensitif: %', v_bad;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='event_bonuses'
  ) THEN
    RAISE EXCEPTION 'event_bonuses masih tanpa policy';
  END IF;

  RAISE NOTICE 'OK: tabel biaya & PII terkunci ke owner-level.';
END $$;

-- ============================================================================
-- BELUM DIPERBAIKI DI SINI — butuh keputusan desain
-- ============================================================================
-- inventory_items.purchase_price / purchase_price_avg / expected_supplier_cost
-- masih terbaca oleh crew. Tidak bisa ditutup lewat RLS: crew MEMANG perlu
-- membaca baris inventory_items (rute crew + getRekapContext memakai klien
-- sesi), dan RLS bekerja per-BARIS, bukan per-KOLOM. GRANT kolom juga tidak
-- bisa memisahkan, karena owner dan crew sama-sama role `authenticated`.
--
-- Perbaikan sebenarnya: pindahkan kolom biaya ke tabel terpisah
-- (mis. inventory_item_costs) ber-RLS owner-only, lalu arahkan semua pembacaan
-- biaya ke sana. Blast radius-nya besar (HPP, WAC, forecast, market list),
-- jadi dikerjakan terpisah dengan pengujian sendiri.
-- ============================================================================
