-- ============================================================================
-- 20260813_crew_rekap_team_edit.sql
--
-- Rekap satu event = milik TIM, bukan milik orang yang kebetulan submit duluan.
--
-- Policy lama: UPDATE hanya boleh oleh `submitted_by = auth.uid()`. Padahal
-- satu event dikerjakan 2–3 crew (25 event di produksi punya ≥2 crew), dan
-- yang membuka form untuk merevisi sering bukan yang menekan submit pertama.
-- Karena UPDATE yang ditolak RLS tidak melempar error — cuma "0 baris kena" —
-- crew melihat notifikasi "tersimpan" padahal isinya hilang diam-diam.
--
-- Perbaikannya sejalan dengan policy INSERT yang memang sudah mengizinkan
-- siapa pun yang ditugaskan di event itu. Guard `locked` TIDAK dilonggarkan:
-- setelah event di-settle, rekap tetap beku untuk semua crew.
--
-- Sisi aplikasi memeriksa jumlah baris ter-update (rekap.ts submitRekap), jadi
-- penolakan RLS apa pun sekarang muncul sebagai pesan, bukan sukses palsu.
-- ============================================================================

DROP POLICY IF EXISTS "crew_rekap_update" ON crew_rekap;

CREATE POLICY "crew_rekap_update" ON crew_rekap
  FOR UPDATE TO authenticated
  USING (
    (
      is_owner_level()
      OR submitted_by = auth.uid()
      OR auth.uid() IN (
        SELECT ca.user_id FROM crew_assignments ca
        WHERE ca.event_id = crew_rekap.event_id
      )
    )
    AND COALESCE(locked, false) = false
  )
  WITH CHECK (
    (
      is_owner_level()
      OR submitted_by = auth.uid()
      OR auth.uid() IN (
        SELECT ca.user_id FROM crew_assignments ca
        WHERE ca.event_id = crew_rekap.event_id
      )
    )
    AND COALESCE(locked, false) = false
  );

COMMENT ON POLICY "crew_rekap_update" ON crew_rekap IS
  'Owner, si penyubmit, atau crew mana pun yang ditugaskan di event itu boleh merevisi selama rekap belum dikunci (locked) oleh settlement.';

-- Catatan: kontak PIC/pembooking TIDAK dibuka lewat RLS. `contacts` tetap
-- owner-only (PII klien); halaman crew mengambil nama+nomor PIC lewat
-- service-role yang sudah dipagari "crew ini ditugaskan di event ini"
-- (lib/crew/event-contacts.ts). Membuka tabelnya di RLS akan memperluas
-- permukaan baca jauh melebihi kebutuhan.
