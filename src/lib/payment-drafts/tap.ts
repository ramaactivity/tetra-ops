import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveOwnerActorId } from "@/lib/auth/owner-actor";
import { ownerGroupChatId } from "@/lib/documents/approval";
import { type DraftTapAction, isOwnerTg } from "@/lib/documents/approval-auth";
import type { DraftRow } from "./core";
import { batalCore, konfirmasiCore } from "./server";

const rp = (n: number | null) => (n ? `Rp${n.toLocaleString("id-ID")}` : "");
const STATUS: Record<string, string> = {
	disetujui: "disetujui",
	tercatat: "tercatat",
	dibatalkan: "ditolak",
};

/**
 * Tap tombol kartu bukti transfer di grup owner (DR-059). Inti sama dengan
 * tombol di Billing › Uang Masuk. `clear` = hapus tombol dari kartu.
 */
export async function handleDraftTap(
	admin: SupabaseClient,
	tap: { action: DraftTapAction; id: string },
	fromId: number | null,
): Promise<{ reply: string; clear: boolean }> {
	const { ownerIds } = await ownerGroupChatId(admin);
	if (!isOwnerTg(fromId, ownerIds))
		return {
			reply: "Hanya owner terdaftar yang bisa memproses bukti transfer.",
			clear: false,
		};
	const { data } = await admin
		.from("payment_drafts")
		.select("*")
		.eq("id", tap.id)
		.maybeSingle();
	const d = data as DraftRow | null;
	if (!d) return { reply: "Bukti transfer tidak ditemukan.", clear: true };
	if (d.status !== "menunggu")
		return {
			reply: `Bukti ${rp(d.nominal)} ini sudah ${STATUS[d.status] ?? d.status}.`,
			clear: true,
		};
	const actor = await resolveOwnerActorId(admin);
	if (!actor)
		return { reply: "❌ Akun owner pelaku tidak ditemukan.", clear: false };

	if (tap.action === "tolak") {
		const r = await batalCore(admin, d, actor);
		return r.ok
			? {
					reply: `❌ Bukti ${rp(d.nominal)} ditolak — tidak masuk buku.`,
					clear: true,
				}
			: { reply: `❌ Gagal menolak: ${r.error}`, clear: false };
	}

	let bank = d.bank_account_id;
	if (!bank) {
		const { data: b } = await admin
			.from("bank_accounts")
			.select("id")
			.eq("is_active", true)
			.eq("is_default_receive", true)
			.limit(1)
			.maybeSingle();
		bank = (b?.id as string | undefined) ?? null;
	}
	if (!bank)
		return {
			reply: "❌ Rekening penerima belum jelas — konfirmasi di Uang Masuk.",
			clear: false,
		};
	const kirim = tap.action === "kirim";
	const r = await konfirmasiCore(admin, d, bank, actor, { kirim });
	if (!r.ok)
		return r.warning
			? {
					reply: `⚠️ ${r.warning} Cek lalu konfirmasi di Billing › Uang Masuk.`,
					clear: false,
				}
			: { reply: `❌ ${r.error}`, clear: false };
	return {
		reply: !r.tercatat
			? `✅ ${rp(d.nominal)} disetujui — masuk buku saat event dibuat.`
			: kirim
				? `✅ ${rp(d.nominal)} masuk buku. Kuitansi + ucapan terima kasih sedang dikirim ke klien.`
				: `✅ ${rp(d.nominal)} masuk buku. Kartu "Kirim ke klien" untuk dokumennya menyusul di sini.`,
		clear: true,
	};
}
