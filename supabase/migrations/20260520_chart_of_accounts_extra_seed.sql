-- 20260520_chart_of_accounts_extra_seed.sql
-- Tambahan seed chart_of_accounts untuk mendukung Rekap & Settlement refactor.
-- EXTENDS existing seed di base schema (docs/05_DATABASE_SCHEMA.sql line 1481+).
-- Format code "X-NNN" konsisten dengan seed existing. Idempotent via ON CONFLICT.
--
-- Coverage yang ditambahkan:
--   • Inventory: split Mediaset Basic vs Perforated (1-206, 1-207)
--   • Liabilities: Unearned Revenue (2-400) untuk DP klien yang belum di-deliver
--   • Revenue: split per event category (4-150..4-153)
--   • OpEx: split fee crew per role + transport granular + marketing/bonus

INSERT INTO chart_of_accounts (code, name, account_type, parent_code, description) VALUES
  -- ASSETS — split media set by type
  ('1-206', 'Persediaan Mediaset Basic', 'asset', '1-000', 'Mediaset basic stock (non-perforated, untuk 4R/2R)'),
  ('1-207', 'Persediaan Mediaset Perforated', 'asset', '1-000', 'Mediaset perforated stock (untuk Polaroid)'),

  -- LIABILITIES — unearned revenue (DP belum di-deliver)
  ('2-400', 'Unearned Revenue', 'liability', '2-000', 'DP klien diterima sebelum event di-deliver'),

  -- REVENUE — split per event category (sumbu kategori, beda dari sumbu service-type)
  ('4-150', 'Pendapatan Event - Wedding', 'revenue', '4-000', 'Revenue dari event kategori wedding'),
  ('4-151', 'Pendapatan Event - Birthday', 'revenue', '4-000', 'Revenue dari event kategori birthday'),
  ('4-152', 'Pendapatan Event - Corporate', 'revenue', '4-000', 'Revenue dari event kategori corporate'),
  ('4-153', 'Pendapatan Event - Other', 'revenue', '4-000', 'Revenue dari event kategori lainnya'),

  -- EXPENSES — split fee crew per role
  ('5-201', 'Beban Fee Crew - Lead', 'expense', '5-000', 'Fee crew role lead'),
  ('5-202', 'Beban Fee Crew - Asisten', 'expense', '5-000', 'Fee crew role asisten'),
  ('5-203', 'Beban Fee Crew - Crew C', 'expense', '5-000', 'Fee crew role tambahan (crew_c)'),
  ('5-204', 'Beban Fee Crew - Bonus', 'expense', '5-000', 'Bonus / extra fee crew'),

  -- EXPENSES — split transport granular
  ('5-211', 'Beban Transport Online', 'expense', '5-000', 'Gocar/Grab/online transport'),
  ('5-212', 'Beban Sewa Mobil', 'expense', '5-000', 'Sewa mobil untuk transport crew/alat'),
  ('5-213', 'Beban Toll', 'expense', '5-000', 'Biaya toll'),
  ('5-214', 'Beban Parkir', 'expense', '5-000', 'Biaya parkir'),

  -- EXPENSES — marketing & promo
  ('5-410', 'Beban Marketing', 'expense', '5-000', 'Iklan, promo, content production'),
  ('5-411', 'Beban Bonus Klien', 'expense', '5-000', 'Freebie/diskon bonus untuk klien (cost of customer goodwill)')
ON CONFLICT (code) DO NOTHING;

-- Verification query (run setelah apply):
--   SELECT account_type, COUNT(*)
--   FROM chart_of_accounts
--   GROUP BY account_type
--   ORDER BY account_type;
--   Expected: asset~14, liability~10, equity~2, revenue~10, expense~22
