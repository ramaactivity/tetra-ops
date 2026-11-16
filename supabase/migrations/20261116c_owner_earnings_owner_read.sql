-- Semua owner boleh MEMBACA bagi hasil semua owner.
--
-- Sejak skema awal (docs/05_DATABASE_SCHEMA.sql, 6 Mei 2026) policy
-- owner_earnings_self hanya mengizinkan baris milik sendiri + super admin.
-- Owner (Rama, 16 Nov 2026): "harusnya bisa melihat keseluruhan" — jatahnya
-- sama rata dan bukan rahasia antar owner; tabel tunggakan
-- (owner_pool_arrears) sudah memakai is_owner_level() juga.
--
-- Hanya SELECT. Menulis tetap super admin (owner_earnings_super_admin) dan
-- lewat RPC SECURITY DEFINER; mencatat ambil bagi hasil tetap dicek
-- super_admin di server (owner-withdrawal.ts).
DROP POLICY IF EXISTS owner_earnings_self ON public.owner_earnings;
CREATE POLICY owner_earnings_owner_read ON public.owner_earnings FOR SELECT
  USING (is_owner_level());
