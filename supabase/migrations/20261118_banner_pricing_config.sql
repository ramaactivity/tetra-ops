-- Rumus harga rekomendasi cetak banner ukuran bebas (owner 18 Nov 2026, masih
-- coba-coba → bisa diubah di Pengaturan › Sistem). Dipakai editor dokumen
-- (src/lib/documents/banner-price.ts). Hanya baris baru, tidak menimpa.
INSERT INTO public.system_config (key, value, category, description) VALUES
  ('banner_rate_per_m2', '45000'::jsonb, 'pricing',
   'Banner: tarif percetakan per m² (Laku Print, selongsong termasuk) — dasar HPP, tidak tampil ke klien'),
  ('banner_markup', '150000'::jsonb, 'pricing',
   'Banner: tambahan di atas HPP (GoSend dari percetakan + handling + pasang dengan tripod Tetra)'),
  ('banner_round_to', '50000'::jsonb, 'pricing',
   'Banner: harga rekomendasi dibulatkan ke atas ke kelipatan ini')
ON CONFLICT (key) DO NOTHING;
