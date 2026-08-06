import "server-only";

import { computeForecast } from "@/lib/actions/forecast";
import { createAdminClient } from "@/lib/supabase/admin";
import { tgEscape } from "@/lib/telegram/client";
import { rp } from "@/lib/telegram/digest";
import { sendToOwnerGroup } from "@/lib/telegram/notify";

/**
 * Alarm restock sesudah konsumsi rekap di-commit.
 *
 * Kenapa di sini: commit rekap adalah SATU-SATUNYA momen stok turun banyak
 * sekaligus, dan itu juga momen owner sedang memikirkan event — pas untuk
 * memberi tahu "stok tinggal segini, event mendatang butuh segitu". Sebelum
 * ini halaman /warehouse buta terhadap event (owner harus buka Forecast
 * sendiri dan mengingat untuk melakukannya).
 *
 * Hanya melaporkan item yang BARU SAJA terpakai dan kekurangan untuk event
 * mendatang — bukan seluruh isi gudang — supaya tidak jadi alert fatigue.
 *
 * Best-effort & TIDAK PERNAH throw: gagal mengalarm tidak boleh menggagalkan
 * commit rekap yang sudah sukses.
 */
export async function alertRestockAfterCommit(
	consumedItemIds: string[],
	context: { eventId: string; projectId: string; clientName?: string | null },
): Promise<void> {
	try {
		if (consumedItemIds.length === 0) return;
		const admin = createAdminClient();

		// Forecast pakai admin client: alarm ini berjalan sebagai efek samping,
		// bukan atas nama sesi user yang mungkin punya RLS lebih sempit.
		const forecast = await computeForecast(admin);
		if (forecast.stock_unknown || forecast.upcoming_count === 0) return;

		const consumed = new Set(consumedItemIds);
		const rows = forecast.rows
			.filter((r) => consumed.has(r.item_id) && r.shortfall > 0)
			.sort((a, b) => b.est_cost - a.est_cost);
		if (rows.length === 0) return;

		const totalCost = rows.reduce((s, r) => s + r.est_cost, 0);
		const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
		const eventWord =
			forecast.upcoming_count === 1
				? "1 event mendatang"
				: `${forecast.upcoming_count} event mendatang`;

		// 1) Notifikasi in-app untuk owner (tabel per-user → admin client).
		const { data: users } = await admin
			.from("users")
			.select("id, role")
			.eq("is_active", true)
			.is("deleted_at", null);
		const ownerIds = (users ?? [])
			.filter((u) => u.role === "owner" || u.role === "super_admin")
			.map((u) => u.id as string);
		if (ownerIds.length > 0) {
			const listing = rows
				.slice(0, 4)
				.map(
					(r) =>
						`${r.name} (sisa ${fmtQty(r.on_hand)} ${r.unit}, kurang ${fmtQty(r.shortfall)})`,
				)
				.join("; ");
			await admin.from("notifications").insert(
				ownerIds.map((user_id) => ({
					user_id,
					severity: "warning" as const,
					category: "inventory" as const,
					title: `Stok menipis untuk ${eventWord}`,
					body: `Sesudah rekap ${context.clientName ?? "event"} di-approve: ${listing}${rows.length > 4 ? `, +${rows.length - 4} item lain` : ""}. Perkiraan belanja ${rp(totalCost)}.`,
					entity_type: "inventory",
					entity_id: context.eventId,
					action_url: "/warehouse/purchase-requests",
				})),
			);
		}

		// 2) Ping grup Telegram owner — sama isinya, supaya kelihatan tanpa buka app.
		await sendToOwnerGroup(
			[
				`📦 <b>STOK MENIPIS</b> — setelah rekap ${tgEscape(context.clientName ?? "event")}`,
				`Kurang untuk ${eventWord}:`,
				...rows
					.slice(0, 6)
					.map(
						(r) =>
							`• ${tgEscape(r.name)} — sisa ${fmtQty(r.on_hand)} ${tgEscape(r.unit)}, kurang <b>${fmtQty(r.shortfall)}</b>${r.bulk_label && r.bulk_qty ? ` (≈${r.bulk_qty} ${tgEscape(r.bulk_label)})` : ""}`,
					),
				rows.length > 6 ? `• +${rows.length - 6} item lain` : null,
				`💰 Perkiraan belanja ${rp(totalCost)}`,
				...(appUrl ? [`\nBelanja: ${appUrl}/warehouse/purchase-requests`] : []),
			]
				.filter(Boolean)
				.join("\n"),
		);
	} catch (e) {
		console.error("[restock-alert] failed:", e);
	}
}

/** Qty tampil ringkas: buang desimal nol (2.0000 → 2; 0.6571 → 0.66). */
function fmtQty(n: number): string {
	const v = Number(n) || 0;
	if (Number.isInteger(v)) return v.toLocaleString("id-ID");
	return v.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}
