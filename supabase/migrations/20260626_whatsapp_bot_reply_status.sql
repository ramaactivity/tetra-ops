-- 20260626_whatsapp_bot_reply_status.sql
-- Tanda-terima balasan auto-reply ke customer, ditulis oleh bot WA (repo tetra-wa-bot).
--
-- Bot memantau status tiap balasan via event Baileys `messages.update` lalu
-- meng-update baris lead TERBARU kontak itu (heuristik wa_jid). Penulisan bot
-- fault-tolerant: kalau kolom belum ada, bot diam (tak crash). Begitu kolom ini
-- dibuat, data langsung mulai masuk tanpa perlu restart bot.
--
--   reply_status:    NULL = belum ada info / belum terkirim
--                    'delivered' = ✓✓ sampai HP customer
--                    'read'      = 👁️ dibaca (hanya jika read receipt customer ON)
--   reply_status_at: waktu status terakhir berubah.

alter table public.whatsapp_bot_leads
	add column if not exists reply_status     text,
	add column if not exists reply_status_at  timestamptz;
