-- 20260521_finance_cleanup_double_dedup.sql
-- ============================================================================
-- M9: Historical stock_movements cleanup — undo double-dedup + over-reversal
-- ============================================================================
--
-- Audit menemukan 2 events historis dengan stock_movements net yang salah:
--
-- 1. Event 436cc5fa (PRJ-20260509-41226, completed): DOUBLE deduction
--    - reviewRekap (rekap_consumption): -67 MEDIA-BASIC, -134 SLEEVE-2R (benar)
--    - settle_event (settlement): -67 MEDIA-BASIC, -134 SLEEVE-2R (DUPLIKAT)
--    - Total kepotong 2× yang seharusnya.
--    - Fix M8 (sebelumnya) sudah blok future events — sekarang cleanup historis.
--
-- 2. Event a4d24115 (PRJ-20260515-36078, awaiting_settlement, reopened):
--    OVER-reversal — settlement direversal lebih banyak dari deduksi awal.
--    - 1 OUT + 1 OUT = 2 OUT total
--    - 1 IN + 2 IN = 3 IN total
--    - Net = +1 ke stok (phantom gain).
--    - Buat 4 item: MEDIA-BASIC, SLEEVE-2R, FLASHDISK, POUCH masing-masing
--      kelebihan 1 (kecuali sleeve = kelebihan 200).
--    - Fix: deduct sesuai phantom gain.
--
-- Approach: insert stock_movements baru dengan source='manual_adjust' +
-- notes yang jelas referensi cleanup. Tidak menyentuh journal entries —
-- GL inventory balance dari settlement journal sudah benar (counts each
-- settlement once). Stock_movements jadi sinkron sama GL setelah cleanup.
--
-- Idempotent guard: cek apakah cleanup ini sudah pernah jalan (via
-- ref_id prefix CLEANUP-M9-).

DO $$
DECLARE
  v_already_done INTEGER;
  v_actor_id UUID;
  v_item_id UUID;
BEGIN
  -- Idempotency check: kalau cleanup ini sudah pernah jalan, skip
  SELECT COUNT(*) INTO v_already_done
  FROM stock_movements
  WHERE ref_id LIKE 'CLEANUP-M9-%';
  IF v_already_done > 0 THEN
    RAISE NOTICE 'Cleanup M9 sudah pernah jalan (% movements ditemukan). Skip.', v_already_done;
    RETURN;
  END IF;

  -- Actor: pakai super_admin pertama (atau owner) yang aktif
  SELECT id INTO v_actor_id
  FROM users
  WHERE role IN ('super_admin', 'owner') AND is_active = true
  ORDER BY role DESC  -- super_admin > owner
  LIMIT 1;
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Tidak ada super_admin/owner aktif sebagai actor';
  END IF;

  -- ──────────────────────────────────────────────────────────────────────
  -- Event 436cc5fa: counter double-dedup (return 67 MEDIA-BASIC + 134 SLEEVE-2R)
  -- ──────────────────────────────────────────────────────────────────────

  SELECT id INTO v_item_id FROM inventory_items WHERE sku = 'MEDIA-BASIC';
  INSERT INTO stock_movements (
    ref_id, item_id, direction, quantity, unit_cost,
    source, source_id, source_description, notes, performed_by
  ) VALUES (
    'CLEANUP-M9-1', v_item_id, 'in', 67, 0,
    'manual_adjust'::movement_source, NULL,
    'M9 cleanup: undo double-dedup event 436cc5fa (PRJ-20260509-41226)',
    'Settle_event RPC bug double-deducted alongside rekap_consumption. ' ||
    'M8 (settle_event safety fix) blok future cases; ini cleanup historis.',
    v_actor_id
  );

  SELECT id INTO v_item_id FROM inventory_items WHERE sku = 'SLEEVE-2R';
  INSERT INTO stock_movements (
    ref_id, item_id, direction, quantity, unit_cost,
    source, source_id, source_description, notes, performed_by
  ) VALUES (
    'CLEANUP-M9-2', v_item_id, 'in', 134, 0,
    'manual_adjust'::movement_source, NULL,
    'M9 cleanup: undo double-dedup event 436cc5fa (PRJ-20260509-41226)',
    'Settle_event RPC bug double-deducted alongside rekap_consumption.',
    v_actor_id
  );

  -- ──────────────────────────────────────────────────────────────────────
  -- Event a4d24115: counter over-reversal (deduct phantom gain)
  -- ──────────────────────────────────────────────────────────────────────

  SELECT id INTO v_item_id FROM inventory_items WHERE sku = 'MEDIA-BASIC';
  INSERT INTO stock_movements (
    ref_id, item_id, direction, quantity, unit_cost,
    source, source_id, source_description, notes, performed_by
  ) VALUES (
    'CLEANUP-M9-3', v_item_id, 'out', 1, 0,
    'manual_adjust'::movement_source, NULL,
    'M9 cleanup: phantom gain from over-reversal event a4d24115 (PRJ-20260515-36078)',
    'Reopen settlement fired reversal 2x — net stock got +1 phantom. Reverting.',
    v_actor_id
  );

  SELECT id INTO v_item_id FROM inventory_items WHERE sku = 'SLEEVE-2R';
  INSERT INTO stock_movements (
    ref_id, item_id, direction, quantity, unit_cost,
    source, source_id, source_description, notes, performed_by
  ) VALUES (
    'CLEANUP-M9-4', v_item_id, 'out', 200, 0,
    'manual_adjust'::movement_source, NULL,
    'M9 cleanup: phantom gain from over-reversal event a4d24115',
    'Reopen settlement fired reversal 2x — net stock got +200 phantom.',
    v_actor_id
  );

  SELECT id INTO v_item_id FROM inventory_items WHERE sku = 'FLASHDISK';
  INSERT INTO stock_movements (
    ref_id, item_id, direction, quantity, unit_cost,
    source, source_id, source_description, notes, performed_by
  ) VALUES (
    'CLEANUP-M9-5', v_item_id, 'out', 1, 0,
    'manual_adjust'::movement_source, NULL,
    'M9 cleanup: phantom gain from over-reversal event a4d24115',
    'Reopen settlement fired reversal 2x — net stock got +1 phantom.',
    v_actor_id
  );

  SELECT id INTO v_item_id FROM inventory_items WHERE sku = 'POUCH';
  INSERT INTO stock_movements (
    ref_id, item_id, direction, quantity, unit_cost,
    source, source_id, source_description, notes, performed_by
  ) VALUES (
    'CLEANUP-M9-6', v_item_id, 'out', 1, 0,
    'manual_adjust'::movement_source, NULL,
    'M9 cleanup: phantom gain from over-reversal event a4d24115',
    'Reopen settlement fired reversal 2x — net stock got +1 phantom.',
    v_actor_id
  );

  RAISE NOTICE 'M9 cleanup applied: 6 corrective stock_movements inserted.';
END $$;
