-- 20261018g_settle_queue_rekap_key.sql — biaya rekap "dibayar owner X" otomatis jadi hutang (owner 2026-10-18).
-- Baris antrean yang dibuat otomatis dari biaya rekap ber-pembayar 'owner:<id>'
-- ditandai kunci biayanya (transport/bensin/…/lainnya:<i>) supaya selalu
-- sinkron dengan rekap: pembayar/nominal berubah → barisnya diganti, dihapus
-- kalau bukan owner lagi. Satu baris aktif per biaya. Aditif & idempotent.
ALTER TABLE event_settle_queue ADD COLUMN IF NOT EXISTS rekap_key text;
CREATE UNIQUE INDEX IF NOT EXISTS event_settle_queue_rekap_key_uq
	ON event_settle_queue (event_id, rekap_key)
	WHERE rekap_key IS NOT NULL AND posted_at IS NULL;
