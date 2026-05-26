-- ============================================================================
-- 20260602_packages_bundle_id — Link package ke item_bundles untuk
-- auto-decompose components saat rekap stock deduction.
--
-- Sebelumnya: setiap event pakai package (mis. "2R Unlimited 2 Jam") yang
-- punya items wajib (flashdisk, box, pouch) yang harus di-track manual via
-- rekap_field_mapping. Tidak ada auto-deduct dari recipe paket.
--
-- Sekarang: package.bundle_id (nullable) link ke item_bundles. Saat
-- planRekapDeduction jalan, items dari bundle.components otomatis di-append
-- ke deduction lines, dengan dedup terhadap items yang sudah ada di
-- rekap_field_mapping / assembly logic.
--
-- Optional FK — package tanpa bundle (default) = current behavior unchanged.
-- ============================================================================

ALTER TABLE packages
    ADD COLUMN IF NOT EXISTS bundle_id UUID
        REFERENCES item_bundles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_packages_bundle
    ON packages(bundle_id)
    WHERE bundle_id IS NOT NULL;

COMMENT ON COLUMN packages.bundle_id IS
    'Optional link ke item_bundles. Kalau di-set, rekap deduction otomatis explode bundle.components per event. NULL = no bundle (current behavior, manual track via rekap_field_mapping).';
