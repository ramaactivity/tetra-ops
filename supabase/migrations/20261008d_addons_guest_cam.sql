-- Migration: add-on Guest Cam + extend 3+ crew (keputusan owner 8 Okt 2026, riset Booth 6 Okt 2026)
-- Guest Cam selalu add-on berbayar; gratis hanya lewat campaign (event_bonuses / kode promo).
-- Upsell Guest Cam tidak publik (ditambahkan admin saat quotation).
-- Idempotent: insert hanya kalau nama belum ada.

insert into addons (name, unit, price, category, requires_extra_crew, is_active, is_public)
select v.name, v.unit, v.price, v.category::addon_category, false, true, v.is_public
from (values
  ('Tambahan Durasi 1 Jam (3+ crew)', '1 Jam', 750000, 'time_extras', true),
  ('Guest Cam Digital', 'acara', 750000, 'experience', true),
  ('Guest Cam + Print', 'acara', 1500000, 'experience', true),
  ('Guest Cam: tamu tak terbatas', 'acara', 250000, 'experience', false),
  ('Guest Cam: simpan 1 tahun', 'acara', 150000, 'experience', false)
) as v(name, unit, price, category, is_public)
where not exists (select 1 from addons a where a.name = v.name and a.deleted_at is null);
