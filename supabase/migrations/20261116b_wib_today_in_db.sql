-- "Hari ini" di database mengikuti WIB, bukan UTC.
--
-- Database Supabase berjalan dengan TimeZone=UTC, jadi CURRENT_DATE masih
-- tanggal KEMARIN sepanjang 00.00–07.00 WIB. Akibatnya jurnal dari fungsi di
-- bawah (buka ulang settle, batal pembayaran, ambil bagi hasil, commit stok
-- opname) bisa tercatat sehari mundur — di pergantian bulan masuk laporan
-- bulan yang salah — dan status "telat bayar" berpindah jam 07.00, bukan
-- tengah malam.
--
-- Perbaikan tanpa menulis ulang isi fungsi: tiap fungsi dijalankan dengan
-- timezone Asia/Jakarta (SET pada fungsi; search_path yang sudah ada tetap).
-- PENTING: CREATE OR REPLACE FUNCTION mengganti daftar SET — kalau salah satu
-- fungsi ini didefinisikan ulang, sertakan `SET timezone = 'Asia/Jakarta'`.
-- Batalkan: ALTER FUNCTION ... RESET timezone.
ALTER FUNCTION public.commit_stock_take(uuid, uuid) SET timezone = 'Asia/Jakarta';
ALTER FUNCTION public.generate_journal_reference(date) SET timezone = 'Asia/Jakarta';
ALTER FUNCTION public.owner_withdrawable_balance(uuid) SET timezone = 'Asia/Jakarta';
ALTER FUNCTION public.recalculate_event_payment_status(uuid) SET timezone = 'Asia/Jakarta';
ALTER FUNCTION public.record_owner_withdrawal_impl(uuid, bigint, uuid, text, text, text, text, uuid, bigint) SET timezone = 'Asia/Jakarta';
ALTER FUNCTION public.reopen_settlement_impl(uuid, uuid, text) SET timezone = 'Asia/Jakarta';
ALTER FUNCTION public.reverse_payment_je_impl(uuid, uuid, text) SET timezone = 'Asia/Jakarta';

-- Default kolom tanggal (hanya berlaku untuk baris baru).
ALTER TABLE public.payables ALTER COLUMN issued_date SET DEFAULT ((now() AT TIME ZONE 'Asia/Jakarta')::date);
ALTER TABLE public.payable_payments ALTER COLUMN payment_date SET DEFAULT ((now() AT TIME ZONE 'Asia/Jakarta')::date);
ALTER TABLE public.documents ALTER COLUMN issued_at SET DEFAULT ((now() AT TIME ZONE 'Asia/Jakarta')::date);
ALTER TABLE public.users ALTER COLUMN joined_date SET DEFAULT ((now() AT TIME ZONE 'Asia/Jakarta')::date);
