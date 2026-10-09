-- Migration: dashboard bersama WO ↔ klien + panduan pertama masuk (owner 9 Okt 2026).
-- client_price_visible: WO memilih apakah klien yang diundangnya (role pemilik) melihat harga,
--   tagihan, riwayat bayar & dokumen Tetra. Bawaan false = tersembunyi (deal Tetra–WO rahasia).
-- portal_people.onboarded_at: panduan dashboard sudah dilihat/dilewati. Idempotent.
ALTER TABLE client_bookings ADD COLUMN IF NOT EXISTS client_price_visible boolean NOT NULL DEFAULT false;
ALTER TABLE portal_people ADD COLUMN IF NOT EXISTS onboarded_at timestamptz;
-- payer: siapa yang membayar ke Tetra di booking yang ada WO/vendor-nya.
--   klien = klien bayar penuh ke Tetra, Tetra kirim komisi ke WO (vendor_commission_mode 'commission');
--   wo    = klien bayar ke WO, WO bayar ke Tetra (vendor_commission_mode 'upfront_cut').
--   NULL  = belum diatur (bawaan dari contacts.commission_mode vendor; WO diminta memilih saat setup).
ALTER TABLE client_bookings ADD COLUMN IF NOT EXISTS payer text CHECK (payer IS NULL OR payer IN ('klien', 'wo'));
