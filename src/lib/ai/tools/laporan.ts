import "server-only";

import type { AiTool } from "@/lib/ai/types";
import { getCommissionsOverview } from "@/lib/finance/commissions-data";
import { getMonthlyOverview } from "@/lib/finance/monthly-data";
import {
	buildDigestText,
	buildMonthText,
	buildRenewalsText,
} from "@/lib/telegram/digest";
import { buildCrewText, buildVendorText } from "@/lib/telegram/queries";

/**
 * Tool "laporan siap baca": membungkus teks yang sudah dipakai bot Telegram
 * (/cek, /crew, /bulan, /langganan, /vendor) supaya angkanya SAMA PERSIS
 * dengan yang owner lihat di grup. Jangan tulis query baru di sini — kalau
 * definisinya berubah, ubah di helper Telegram-nya.
 *
 * Semua ber-scope "finance" karena teksnya memuat fee / komisi / omzet.
 */

export const digestHarian: AiTool = {
	name: "digest_harian",
	description:
		"Ringkasan operasional hari ini persis seperti /cek di Telegram: event 7 hari ke depan, " +
		"crew yang belum lengkap, crew bentrok, stok kritis, langganan jatuh tempo, dan hal yang perlu " +
		"ditindak. Pakai untuk 'ada yang perlu diurus hari ini?', 'kondisi hari ini gimana'.",
	scope: "finance",
	parameters: { type: "OBJECT", properties: {} },
	async run() {
		return { teks: await buildDigestText() };
	},
};

export const crewMingguIni: AiTool = {
	name: "crew_minggu_ini",
	description:
		"Penugasan crew per event 7 hari ke depan, termasuk event yang BELUM punya crew dan fee crew " +
		"yang belum dibayar. Pakai untuk 'siapa jaga hari Sabtu', 'event mana yang belum ada crew'.",
	scope: "finance",
	parameters: { type: "OBJECT", properties: {} },
	async run() {
		return { teks: await buildCrewText() };
	},
};

export const rekapBulan: AiTool = {
	name: "rekap_bulan",
	description:
		"Rekap event satu bulan (daftar tanggal, klien, status) seperti /bulan di Telegram. " +
		"Pakai untuk 'jadwal bulan Oktober', 'bulan depan ada berapa acara'.",
	scope: "finance",
	parameters: {
		type: "OBJECT",
		properties: {
			bulan: {
				type: "STRING",
				description:
					"Nama bulan Indonesia atau YYYY-MM, mis. 'oktober' atau '2026-10'. Kosongkan = bulan ini.",
			},
		},
	},
	async run(args) {
		const bulan = typeof args.bulan === "string" ? args.bulan : undefined;
		return { teks: await buildMonthText(bulan) };
	},
};

export const langgananApp: AiTool = {
	name: "langganan_app",
	description:
		"Daftar langganan aplikasi/layanan (Canva, domain, hosting, dll) beserta tanggal jatuh tempo " +
		"berikutnya. Pakai untuk 'langganan apa yang segera habis', 'kapan bayar Canva'.",
	scope: "finance",
	parameters: { type: "OBJECT", properties: {} },
	async run() {
		return { teks: await buildRenewalsText() };
	},
};

export const vendorRelasi: AiTool = {
	name: "vendor_relasi",
	description:
		"Event mendatang yang datang dari channel vendor/relasi (WO, EO, MUA), dikelompokkan per vendor. " +
		"Pakai untuk 'event dari vendor mana saja bulan ini', 'berapa event dari WO X'.",
	scope: "finance",
	parameters: {
		type: "OBJECT",
		properties: {
			vendor: {
				type: "STRING",
				description:
					"Nama vendor untuk melihat detailnya. Kosongkan = ringkasan semua vendor.",
			},
		},
	},
	async run(args) {
		const vendor = typeof args.vendor === "string" ? args.vendor.trim() : "";
		return { teks: await buildVendorText(vendor || undefined) };
	},
};

export const komisiVendor: AiTool = {
	name: "komisi_vendor",
	description:
		"Komisi vendor/relasi/sales: total yang sudah boleh dibayar, yang menunggu event di-settle, " +
		"dan daftar event yang komisinya belum dibayar. Pakai untuk 'hutang komisi berapa', " +
		"'komisi WO X sudah dibayar belum'.",
	scope: "finance",
	parameters: { type: "OBJECT", properties: {} },
	async run(_args, ctx) {
		// Helper ini ditulis untuk client ber-cookie; bentuk query-nya sama.
		const o = await getCommissionsOverview(ctx.supabase as never);
		const belumDibayar = o.rows
			.filter((r) => r.status === "payable" || r.status === "not_settled")
			.slice(0, 30)
			.map((r) => ({
				project_id: r.projectId,
				klien: r.clientName,
				tanggal: r.eventDate,
				penerima: r.payeeName,
				jenis: r.kind,
				nominal: r.amount,
				status: r.status === "payable" ? "boleh dibayar" : "menunggu settle",
			}));
		return {
			boleh_dibayar_jumlah: o.totals.payableCount,
			boleh_dibayar_total: o.totals.payableAmount,
			menunggu_settle_total: o.totals.notSettledAmount,
			sudah_dibayar_total: o.totals.paidAmount,
			dibayar_di_muka_total: o.totals.advanceAmount,
			belum_dibayar: belumDibayar,
		};
	},
};

export const bukuBulanan: AiTool = {
	name: "buku_bulanan",
	description:
		"Buku keuangan satu bulan: saldo awal/akhir kas+bank, uang masuk/keluar, omzet, biaya, " +
		"untung buku vs untung event settle, kelompok biaya terbesar, dan pembanding bulan lalu. " +
		"Pakai untuk 'bulan ini untung nggak', 'biaya terbesar bulan lalu apa', 'saldo akhir Agustus'.",
	scope: "finance",
	parameters: {
		type: "OBJECT",
		properties: {
			bulan: {
				type: "STRING",
				description: "Format YYYY-MM. Kosongkan = bulan berjalan.",
			},
		},
	},
	async run(args, ctx) {
		const bulan = typeof args.bulan === "string" ? args.bulan.trim() : "";
		if (bulan && !/^\d{4}-\d{2}$/.test(bulan)) {
			return { error: "bulan harus format YYYY-MM" };
		}
		const o = await getMonthlyOverview(
			ctx.supabase as never,
			bulan || undefined,
		);
		if (o.beforeBooks) {
			return {
				error: `Bulan ${o.current.label} sebelum cutoff buku (${o.cutoffDate}); data belum ada.`,
			};
		}
		return {
			bulan: o.current,
			bulan_sebelumnya: o.previous,
			kelompok_biaya: o.expenseGroups,
			uang_masuk_terbesar: o.topInflows,
			uang_keluar_terbesar: o.topOutflows,
			keluar_jadi_biaya: o.outflowForExpense,
			keluar_bukan_biaya: o.outflowNonExpense,
			catatan:
				"profitBook = omzet − biaya bulan itu; profitSettled = laba event yang di-settle bulan itu.",
		};
	},
};
