-- Isi tanggal jatuh tempo langganan (dari owner, 2026-07-02) + siklus quarterly.
-- VPS: langganan 3 bulan mulai 18 Jun 2026 → jatuh tempo berikutnya 18 Sep 2026.
-- Domain: dibeli akhir Mei 2026 utk 3 tahun → ±28 Mei 2029 (sengaja beberapa
--   hari lebih awal dari "akhir Mei" supaya reminder tidak telat; koreksi kalau
--   tanggal pasti di registrar beda).
-- Telkomsel pascabayar (simcard admin Tetra): tiap akhir bulan → pakai tanggal
--   28 (ada di semua bulan, tidak drift saat roll +1 bulan).

ALTER TABLE telegram_renewals DROP CONSTRAINT IF EXISTS telegram_renewals_cycle_check;
ALTER TABLE telegram_renewals ADD CONSTRAINT telegram_renewals_cycle_check
  CHECK (cycle IN ('monthly', 'quarterly', 'yearly'));

UPDATE telegram_renewals
SET next_due = '2026-09-18', cycle = 'quarterly', updated_at = NOW()
WHERE name LIKE 'VPS%';

UPDATE telegram_renewals
SET next_due = '2029-05-28', cycle = 'yearly',
    notes = 'domain 3 tahun sejak akhir Mei 2026; tanggal perkiraan — cek registrar',
    updated_at = NOW()
WHERE name LIKE 'Hosting%';

INSERT INTO telegram_renewals (name, next_due, cycle, notes)
SELECT 'Telkomsel Pascabayar (simcard admin Tetra)', '2026-07-28', 'monthly',
       'bayar tiap akhir bulan'
WHERE NOT EXISTS (
  SELECT 1 FROM telegram_renewals WHERE name LIKE 'Telkomsel%'
);
