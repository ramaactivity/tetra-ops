-- Migration: desain kartu QR Guest Cam di event (Booth v0.9 `guest_card_design`).
-- Sumber kebenaran setelah booking jadi event; dashboard klien & form admin menulis ke sini
-- (dashboard juga tetap menulis client_bookings.detail.guest_card_design). Idempotent.
ALTER TABLE events ADD COLUMN IF NOT EXISTS guest_card_design text;
UPDATE events e SET guest_card_design = cb.detail->>'guest_card_design'
FROM client_bookings cb
WHERE cb.event_id = e.id AND e.guest_card_design IS NULL AND cb.detail ? 'guest_card_design';
