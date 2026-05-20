-- 20260521_inventory_v2_archive_strap_coklat.sql
-- ============================================================================
-- Inventory v2 — STEP 4b: archive missed strap color variant
-- ============================================================================
--
-- M4 (20260521_inventory_v2_assembly_components.sql) archived 4 ITM-AUT-*
-- strap color variants (Hitam, Hijau Muda, Biru Muda, Pink) but missed
-- ITM-KEYCHAIN-STRAP (Coklat) — it didn't follow the ITM-AUT-* naming pattern,
-- so it wasn't on the archive list. Spotted on the warehouse page after M4
-- applied.
--
-- Lump it into KEY-STRAP like the other variants.
--
-- Idempotent.

UPDATE inventory_items
SET
  is_active = false,
  deleted_at = NOW(),
  notes = COALESCE(notes, '') ||
          E'\n[INVV2 archived 2026-05-21] Strap color variant (Coklat) lumped into KEY-STRAP. ' ||
          'Missed by M4 because naming did not match ITM-AUT-* pattern.',
  updated_at = NOW()
WHERE sku = 'ITM-KEYCHAIN-STRAP'
  AND deleted_at IS NULL;
