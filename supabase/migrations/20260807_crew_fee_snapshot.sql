-- ============================================================================
-- 20260807_crew_fee_snapshot
--
-- 1. event_settlements.crew_fee_snapshot — siapa dapat berapa saat event
--    ditutup, dibekukan per ORANG.
--
--    Sebelumnya settlement hanya menyimpan fee per PERAN (fee_lead,
--    fee_asisten, fee_crew_c, fee_extra). Kalau fee di crew_assignments
--    diubah setelah settle, tidak ada satu pun jejak berapa yang sebenarnya
--    disepakati saat itu — dan angkanya memang sudah pernah beda: audit
--    2026-08-07 menemukan settlement Hafizh & Dinda mencatat fee Rp300.000
--    sementara assignment-nya Rp350.000 (talangan Rp50.000 tidak ikut kolom
--    peran). Snapshot ini yang jadi rujukan saat menelusuri selisih.
--
-- 2. Komentar kolom crew_rekap.stock_movement_batch_id — meluruskan yang
--    menyesatkan: kolom ini TIDAK dipakai untuk mencari gerakan stok.
-- ============================================================================

ALTER TABLE event_settlements
  ADD COLUMN IF NOT EXISTS crew_fee_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN event_settlements.crew_fee_snapshot IS
  'Fee tiap crew saat event ditutup: [{user_id, name, role, fee, bonus, reimbursement, total}]. '
  'Dibekukan oleh settleEvent (src/lib/actions/settle-event.ts) tepat setelah settle_event berhasil. '
  'Kolom fee_lead/fee_asisten/fee_crew_c/fee_extra hanya total per peran — tidak cukup untuk audit per orang.';

COMMENT ON COLUMN crew_rekap.stock_movement_batch_id IS
  'Label batch commit stok. BUKAN kunci pencarian: tidak ada satu baris stock_movements pun '
  'yang menyimpan nilai ini. Gerakan stok konsumsi ditautkan lewat '
  'stock_movements.source = ''rekap_consumption'' AND source_id = crew_rekap.event_id '
  '(lihat reverseRekapStock di src/lib/actions/rekap.ts). Mencocokkan lewat kolom ini '
  'akan selalu nihil.';
