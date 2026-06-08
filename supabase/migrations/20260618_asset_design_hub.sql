-- 20260618_asset_design_hub.sql
-- Asset & Design hub + structured Drive folders.
--
-- 1) events.drive_folders JSONB — caches per-event Drive subfolder ids/urls
--    ({ "Footage": {"id":..., "url":...}, ... }) so links are stable without
--    re-listing Drive on every page load.
-- 2) event_assets: merge softfile_photo + softfile_video → 'softfile', and add
--    drive_file_id (for Drive direct-download links on uploaded design frames).

ALTER TABLE events
	ADD COLUMN IF NOT EXISTS drive_folders JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN events.drive_folders IS
	'Cached Drive subfolder refs per category: { "<Category>": { "id": "...", "url": "..." } }.';

-- Merge softfile types (data first, so the new CHECK passes).
ALTER TABLE event_assets DROP CONSTRAINT IF EXISTS event_assets_asset_type_check;

UPDATE event_assets
SET asset_type = 'softfile'
WHERE asset_type IN ('softfile_photo', 'softfile_video');

ALTER TABLE event_assets
	ADD CONSTRAINT event_assets_asset_type_check
	CHECK (asset_type IN ('design_frame', 'footage_crew', 'softfile'));

-- Drive file id for uploaded assets (design frames) → build download links.
ALTER TABLE event_assets
	ADD COLUMN IF NOT EXISTS drive_file_id TEXT;
