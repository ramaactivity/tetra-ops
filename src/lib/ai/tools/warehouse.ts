import "server-only";

import { computeForecast } from "@/lib/actions/forecast";
import type { AiTool } from "@/lib/ai/types";

/**
 * Tool gudang: stok bahan habis pakai + aset tetap.
 *
 * Cakupan item disamakan dengan /warehouse dan /stok di bot: SEMUA item
 * kategori "inventory" yang belum dihapus. Jangan filter is_active atau
 * min_stock_alert > 0 — item stok 0 tanpa minimum wajib tetap kelihatan habis.
 */

export const stok: AiTool = {
	name: "stok",
	description:
		"Stok bahan habis pakai di gudang (kertas, tinta, dll) beserta yang habis / di bawah minimum, " +
		"dan perkiraan kekurangan untuk event yang akan datang. Pakai untuk 'stok kertas berapa', " +
		"'ada yang perlu restock?'.",
	scope: "warehouse",
	parameters: {
		type: "OBJECT",
		properties: {
			cari: {
				type: "STRING",
				description:
					"Kata kunci nama barang. Kosongkan untuk melihat semua / ringkasan yang kritis.",
			},
			hanya_bermasalah: {
				type: "BOOLEAN",
				description:
					"true = hanya tampilkan yang habis atau di bawah minimum. Default false.",
			},
		},
	},
	async run(args, ctx) {
		const cari = typeof args.cari === "string" ? args.cari.trim() : "";
		const hanyaBermasalah = args.hanya_bermasalah === true;

		let q = ctx.supabase
			.from("inventory_items")
			.select("id, name, unit, min_stock_alert")
			.eq("category", "inventory")
			.is("deleted_at", null);
		if (cari) q = q.ilike("name", `%${cari}%`);

		const { data: items, error } = await q.order("name");
		if (error) return { error: error.message };

		const rows = (items ?? []) as Array<{
			id: string;
			name: string;
			unit: string | null;
			min_stock_alert: number;
		}>;
		if (rows.length === 0) {
			return { jumlah: 0, barang: [], catatan: "Tidak ada barang yang cocok." };
		}

		// Error di sini JANGAN ditelan: data null → semua item terbaca stok 0 →
		// seluruh katalog dilaporkan HABIS (alarm palsu massal ke owner).
		const { data: levels, error: levelErr } = await ctx.supabase.rpc(
			"get_stock_levels",
			{ p_item_ids: rows.map((i) => i.id) },
		);
		if (levelErr) {
			return {
				error: `Stok tidak terbaca (${levelErr.message}). Jangan tebak angkanya.`,
			};
		}
		const stockMap = new Map<string, number>();
		for (const r of (levels ?? []) as Array<{
			item_id: string;
			stock: number;
		}>) {
			stockMap.set(r.item_id, Number(r.stock));
		}

		const barang = rows.map((i) => {
			const sisa = stockMap.get(i.id) ?? 0;
			return {
				nama: i.name,
				sisa,
				satuan: i.unit,
				minimum: i.min_stock_alert,
				// `<=` supaya sepakat dengan hitungan "kritis" di /warehouse: stok
				// yang PAS di angka minimum sudah dianggap kritis di webapp.
				kondisi:
					sisa <= 0
						? "HABIS"
						: i.min_stock_alert > 0 && sisa <= i.min_stock_alert
							? "di bawah minimum"
							: "aman",
			};
		});

		// Perkiraan kebutuhan event mendatang — opsional, jangan gagalkan tool.
		let kurangUntukEvent: unknown = null;
		try {
			const forecast = await computeForecast(ctx.supabase, ctx.todayISO);
			if (!forecast.stock_unknown && forecast.upcoming_count > 0) {
				kurangUntukEvent = {
					jumlah_event_mendatang: forecast.upcoming_count,
					barang_kurang: forecast.rows.map((r) => ({
						nama: r.name,
						stok_sekarang: Math.round(r.on_hand),
						perkiraan_kebutuhan: Math.round(r.projected_demand),
						kurang: Math.round(r.shortfall),
						satuan: r.unit,
					})),
				};
			}
		} catch {
			// forecast opsional
		}

		const bermasalah = barang.filter((b) => b.kondisi !== "aman");
		return {
			jumlah: barang.length,
			barang: hanyaBermasalah ? bermasalah : barang,
			ringkasan_kritis: {
				habis: barang.filter((b) => b.kondisi === "HABIS").map((b) => b.nama),
				di_bawah_minimum: barang
					.filter((b) => b.kondisi === "di bawah minimum")
					.map((b) => b.nama),
			},
			kurang_untuk_event_mendatang: kurangUntukEvent,
		};
	},
};

export const asetTetap: AiTool = {
	name: "aset_tetap",
	description:
		"Daftar aset tetap / peralatan (kamera, printer, laptop) beserta kondisinya. " +
		"Pakai untuk 'alat apa saja yang rusak', 'printer kita ada berapa'.",
	scope: "warehouse",
	parameters: {
		type: "OBJECT",
		properties: {
			cari: { type: "STRING", description: "Kata kunci nama alat." },
			kondisi: {
				type: "STRING",
				description: "Filter kondisi alat.",
				enum: ["normal", "service", "damaged", "lost"],
			},
		},
	},
	async run(args, ctx) {
		// Satu baris = satu unit alat (tidak ada kolom quantity di sini), dan
		// lokasinya bernama current_location — sama seperti /warehouse.
		let q = ctx.supabase
			.from("inventory_items")
			.select("sku, name, condition, current_location, is_active")
			.eq("category", "fixed_asset")
			.is("deleted_at", null);
		if (typeof args.cari === "string" && args.cari.trim()) {
			q = q.ilike("name", `%${args.cari.trim()}%`);
		}
		if (typeof args.kondisi === "string") q = q.eq("condition", args.kondisi);

		const { data, error } = await q.order("name").limit(100);
		if (error) return { error: error.message };

		const rows = (data ?? []) as Array<{
			sku: string | null;
			name: string;
			condition: string | null;
			current_location: string | null;
			is_active: boolean | null;
		}>;
		return {
			jumlah: rows.length,
			aset: rows.map((r) => ({
				sku: r.sku,
				nama: r.name,
				kondisi: r.condition,
				lokasi: r.current_location,
				aktif: r.is_active,
			})),
			perlu_perhatian: rows
				.filter((r) => r.condition === "damaged" || r.condition === "lost")
				.map((r) => `${r.name} (${r.condition})`),
		};
	},
};
