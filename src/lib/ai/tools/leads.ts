import "server-only";

import type { AiTool } from "@/lib/ai/types";

/**
 * Leads dari bot WhatsApp (tabel whatsapp_bot_leads). Status yang dipakai
 * bot: new → contacted → converted / ignored.
 */
export const leadsWa: AiTool = {
	name: "leads_wa",
	description:
		"Calon pelanggan yang masuk lewat bot WhatsApp: nama, nomor, topik, pesan, dan status " +
		"(new/contacted/converted/ignored). Pakai untuk 'ada leads baru?', 'siapa yang belum di-follow up', " +
		"'berapa closing minggu ini'.",
	scope: "ops",
	parameters: {
		type: "OBJECT",
		properties: {
			hari: {
				type: "INTEGER",
				description: "Ambil leads dari N hari terakhir. Default 7.",
			},
			status: {
				type: "STRING",
				description: "Filter status. Kosongkan = semua.",
				enum: ["new", "contacted", "converted", "ignored"],
			},
		},
	},
	async run(args, ctx) {
		const hari =
			typeof args.hari === "number" && args.hari > 0
				? Math.min(args.hari, 90)
				: 7;
		const since = new Date(`${ctx.todayISO}T00:00:00+07:00`);
		since.setUTCDate(since.getUTCDate() - hari);

		let q = ctx.supabase
			.from("whatsapp_bot_leads")
			.select(
				"name, phone, topic, message, status, is_after_hours, received_at",
			)
			.gte("received_at", since.toISOString())
			.order("received_at", { ascending: false })
			.limit(40);
		if (typeof args.status === "string" && args.status) {
			q = q.eq("status", args.status);
		}
		const { data, error } = await q;
		if (error) return { error: error.message };

		const rows = data ?? [];
		const perStatus: Record<string, number> = {};
		for (const r of rows as Array<{ status: string }>) {
			perStatus[r.status] = (perStatus[r.status] ?? 0) + 1;
		}
		return {
			rentang_hari: hari,
			jumlah: rows.length,
			per_status: perStatus,
			leads: rows,
		};
	},
};
