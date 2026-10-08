-- Kode promo tamu (Booth v0.8) yang dipakai saat booking. Kolom terpisah dari
-- `detail` supaya klien tidak bisa mengubahnya lewat autosave detail.
-- {code, label, discount_idr, discount, item, whatsapp_match, redeemed_at?}
ALTER TABLE client_bookings ADD COLUMN IF NOT EXISTS promo jsonb;
