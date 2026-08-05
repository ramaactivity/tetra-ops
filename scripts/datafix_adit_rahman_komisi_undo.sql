-- ============================================================================
-- datafix_adit_rahman_komisi_undo.sql (2026-08-06)
--
-- Membatalkan datafix_adit_rahman_komisi_manual.sql yang baru saja dijalankan.
--
-- ALASAN: datafix itu berangkat dari asumsi komisi Adit Rahman = Rp50.000 dan
-- jurnal manual JE-20260723-E49B017C ("Penyesuaian kekurangan beban komisi")
-- adalah dobel-catat. Info dari owner: komisi sebenarnya Rp100.000 — naik dari
-- Rp50.000 setelah event di-rekap. Jadi jurnal manual itu BUKAN dobel-catat,
-- melainkan penambah beban yang sah (50.000 + 50.000 = 100.000 sesuai komisi
-- yang benar). Koreksi yang saya buat justru menghapus beban yang seharusnya
-- ada.
--
-- Entry yang dihapus umurnya beberapa menit, dibuat oleh datafix tadi, dan
-- belum dirujuk apa pun → aman dihapus (bukan dibalik), supaya buku bersih
-- seperti sebelum datafix. Jejaknya tetap tercatat di audit_log.
-- ============================================================================

DO $undo$
DECLARE
  v_event_id  UUID := 'e0ea4b69-ffb5-4b57-bebb-5195ed85e124';
  v_payout    RECORD;
  v_entry_id  UUID;
  v_ref       TEXT;
BEGIN
  SELECT * INTO v_payout FROM commission_payouts
  WHERE ref_id = 'KOM-20260723-FIX1' AND event_id = v_event_id;

  IF NOT FOUND THEN
    RAISE NOTICE 'SKIP: datafix tidak ditemukan — mungkin sudah dibatalkan.';
    RETURN;
  END IF;

  v_entry_id := v_payout.journal_entry_id;
  SELECT ref_id INTO v_ref FROM journal_entries WHERE id = v_entry_id;

  -- Guard: pastikan yang dihapus memang entry buatan datafix, bukan lainnya.
  IF NOT EXISTS (
    SELECT 1 FROM journal_entries
    WHERE id = v_entry_id
      AND source_type = 'commission_payment'
      AND description LIKE 'Koreksi: komisi relasi Adit Rahman%'
  ) THEN
    RAISE EXCEPTION 'BATAL: jurnal % bukan entry buatan datafix — jangan dihapus.', v_entry_id;
  END IF;

  DELETE FROM commission_payouts WHERE id = v_payout.id;
  DELETE FROM journal_lines WHERE entry_id = v_entry_id;
  DELETE FROM journal_entries WHERE id = v_entry_id;

  INSERT INTO audit_log (entity_type, entity_id, action, changes, actor_id)
  VALUES (
    'commission_payout', v_payout.id, 'datafix_undo',
    jsonb_build_object(
      'event', 'PRJ-20260722-3958',
      'removed_journal', v_ref,
      'removed_payout', 'KOM-20260723-FIX1',
      'reason', 'Asumsi awal keliru: komisi Adit Rahman sebenarnya Rp100.000 (naik dari Rp50.000 setelah rekap), jadi JE-20260723-E49B017C bukan dobel-catat melainkan penambah beban yang sah. Koreksi dibatalkan; buku kembali ke keadaan sebelum datafix.'
    ),
    v_payout.created_by
  );

  RAISE NOTICE 'OK: jurnal % dan payout KOM-20260723-FIX1 dihapus. Buku kembali seperti semula.', v_ref;
END
$undo$;
