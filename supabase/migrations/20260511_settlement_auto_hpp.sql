-- 20260511_settlement_auto_hpp.sql
-- Add columns to event_settlements that capture the auto-derived HPP
-- snapshot at close time + flag whether the owner overrode any field.
-- Idempotent.

ALTER TABLE event_settlements
	ADD COLUMN IF NOT EXISTS hpp_auto_snapshot JSONB NULL;

ALTER TABLE event_settlements
	ADD COLUMN IF NOT EXISTS hpp_was_overridden BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN event_settlements.hpp_auto_snapshot IS
	'Object {mediaset, sleeve, flashdisk, pouch, photomagnet, keychain, other} — auto-derived HPP from rekap × purchase_price_avg at close time. Null = legacy settlement before Phase C.';

COMMENT ON COLUMN event_settlements.hpp_was_overridden IS
	'True if owner manually edited any HPP field instead of accepting the auto-derived value. Used by reports to surface "Manual override" badges.';
