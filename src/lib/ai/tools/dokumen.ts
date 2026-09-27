import "server-only";

import type { AiSchema, AiTool, AiToolContext } from "@/lib/ai/types";
import { findActiveDoc } from "@/lib/documents/invoice";
import {
	createQuotationCore,
	previewQuotation,
} from "@/lib/documents/quotation-core";
import { SERVICE_CATEGORIES } from "@/lib/documents/quotation-plan";
import { resolveSendDocument, sendDocumentCore } from "@/lib/documents/send";
import {
	checkPayment,
	logPaymentCore,
	PAYMENT_TYPE_LABEL,
	PAYMENT_TYPES,
	type PaymentType,
} from "@/lib/finance/payment-core";
import { formatDateID, formatRupiah } from "@/lib/format";

/**
 * Skill dokumen & tagihan (keputusan Rama 27 Sep 2026). Aturan uang:
 * agent tidak menentukan harga, tidak memverifikasi mutasi, tidak menerapkan
 * diskon, dan tidak mengirim dokumen berisi uang tanpa konfirmasi owner.
 * Semua tool tulis lewat gerbang `<nama>_usulan` + `konfirmasi` di mcp.ts.
 */

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function requireActor(ctx: AiToolContext): string | { error: string } {
	return ctx.actorId ?? { error: "Permukaan ini tidak boleh menulis data." };
}

/** document_id (uuid) atau nomor dokumen → id. */
async function resolveDocId(
	ctx: AiToolContext,
	raw: string,
): Promise<string | { error: string }> {
	if (!raw) return { error: "document_id wajib (uuid atau nomor dokumen)" };
	const byNumber = !/^[0-9a-f-]{36}$/i.test(raw);
	const { data } = await ctx.supabase
		.from("documents")
		.select("id")
		.eq(byNumber ? "doc_number" : "id", raw)
		.maybeSingle();
	return (
		(data?.id as string | undefined) ?? {
			error: `Dokumen ${raw} tidak ditemukan`,
		}
	);
}

// ── B1. kirim_dokumen ─────────────────────────────────────────────────────

async function kirimArgs(args: Record<string, unknown>, ctx: AiToolContext) {
	const id = await resolveDocId(ctx, str(args.document_id));
	if (typeof id !== "string") return id;
	return {
		documentId: id,
		pesan: str(args.pesan),
		nomor: str(args.nomor_wa) || null,
	};
}

export const kirimDokumen: AiTool = {
	name: "kirim_dokumen",
	description:
		"Kirim PDF dokumen (quotation/invoice/kuitansi/nota lunas/BAST) + pesan ke WhatsApp klien lewat bot WA Tetra. " +
		"HANYA setelah owner menyetujui dokumen & pesannya. Ditolak kalau dokumen void atau masih ada harga 'diisi admin' yang kosong.",
	scope: "finance",
	mutates: true,
	parameters: {
		type: "OBJECT",
		properties: {
			document_id: {
				type: "STRING",
				description: "Id dokumen atau nomornya, mis. QUO-TP-01-27092026.",
			},
			pesan: {
				type: "STRING",
				description:
					"Teks WA untuk klien (20–1500 karakter), persis yang disetujui owner.",
			},
			nomor_wa: {
				type: "STRING",
				nullable: true,
				description: "Opsional. Default: WA klien di dokumen/event.",
			},
		},
		required: ["document_id", "pesan"],
	},
	async preview(args, ctx) {
		const a = await kirimArgs(args, ctx);
		if ("error" in a) return a;
		const r = await resolveSendDocument(ctx.supabase, a);
		if ("error" in r) return r;
		return {
			ringkasan: r.ringkasan,
			nomor_wa: `+${r.nomor}`,
			file: r.namaFile,
			pesan: r.pesan,
		};
	},
	async run(args, ctx) {
		const actor = requireActor(ctx);
		if (typeof actor !== "string") return actor;
		const a = await kirimArgs(args, ctx);
		if ("error" in a) return a;
		return sendDocumentCore(ctx.supabase, a, { actorId: actor });
	},
};

// ── B2. buat_quotation ────────────────────────────────────────────────────

const S = (description: string, nullable = true): AiSchema => ({
	type: "STRING",
	description,
	nullable,
});

const QUOTATION_PARAMS: AiSchema = {
	type: "OBJECT",
	properties: {
		klien: {
			type: "OBJECT",
			properties: {
				nama: S("Nama orang yang menghubungi / klien.", false),
				organisasi: S("Perusahaan/instansi kalau ada."),
				attn: S("u.p. (orang yang dituju) kalau beda dari nama."),
				wa: S("Nomor WA klien."),
				email: S("Email klien."),
			},
			required: ["nama"],
		},
		bill_to: {
			type: "STRING",
			enum: ["auto", "client", "booker"],
			nullable: true,
			description:
				"Nama di KEPADA: auto = organisasi + u.p. orang; client = organisasi saja; booker = nama orang saja.",
		},
		acara: {
			type: "OBJECT",
			properties: {
				judul: S(
					"Nama acara, mis. 'Rizky & Nadia' atau 'Annual Gathering 2026'.",
				),
				jenis: S(
					"event_types.code: wedding, birthday, corporate, gathering, wisuda, instansi, event, reuni.",
				),
				tanggal: S("YYYY-MM-DD."),
				jam_mulai: S("HH:mm."),
				jam_selesai: S("HH:mm."),
				venue: S("Nama gedung/venue."),
				kota: S("Kota acara — menentukan transport (gratis se-Jabodetabek)."),
				jumlah_tamu: S("Perkiraan tamu (teks)."),
			},
		},
		layanan: {
			type: "ARRAY",
			description:
				"Minimal satu. Isi package_id, ATAU kategori + jam (+ format untuk photobooth_classic). Harga selalu dari master.",
			items: {
				type: "OBJECT",
				properties: {
					package_id: S("Id paket master (opsional)."),
					kategori: {
						type: "STRING",
						enum: [...SERVICE_CATEGORIES],
						nullable: true,
					},
					jam: { type: "INTEGER", nullable: true, description: "Durasi jam." },
					format: {
						type: "STRING",
						enum: ["2r", "4r", "polaroid"],
						nullable: true,
						description: "Format cetak Photobooth Classic; kosong = menyusul.",
					},
					qty: { type: "INTEGER", nullable: true, description: "Default 1." },
				},
			},
		},
		addons: {
			type: "ARRAY",
			nullable: true,
			items: {
				type: "OBJECT",
				properties: {
					addon_id: S("Id add-on (opsional)."),
					nama: S("Nama add-on, mis. 'Guest Books'."),
					qty: { type: "INTEGER", nullable: true },
				},
			},
		},
		backdrop: S(
			"Kode backdrop (BG-BASIC-GOLD, BG-BASIC-WHITE, BG-BASIC-RED, BG-BASIC-SILVER, BG-BASIC-EMERALD, BG-BASIC-BLUE, BG-RENTAL-LUX-01/02) atau 'dekorasi_klien'.",
		),
		gross_up: {
			type: "BOOLEAN",
			nullable: true,
			description:
				"true HANYA kalau klien minta pajak dicantumkan (gross-up 2,5%).",
		},
		usulan_diskon: {
			type: "OBJECT",
			nullable: true,
			description: "Usulan saja — TIDAK masuk total; owner yang memutuskan.",
			properties: {
				persen: { type: "NUMBER", nullable: true },
				nominal: { type: "INTEGER", nullable: true },
				alasan: S("Alasan usulan.", false),
			},
			required: ["alasan"],
		},
		catatan: S("Catatan tambahan untuk dokumen."),
		sumber: {
			type: "OBJECT",
			properties: {
				jenis: { type: "STRING", enum: ["wa_bot", "telegram"] },
				wa_jid: S("JID WA klien."),
				lead_id: S("Id lead."),
			},
			required: ["jenis"],
		},
	},
	required: ["klien", "layanan", "sumber"],
};

/** Gemini/MCP bisa mengirim null untuk array/objek kosong — rapikan. */
function cleanQuotationArgs(args: Record<string, unknown>) {
	return {
		...args,
		acara: args.acara ?? {},
		addons: args.addons ?? [],
	};
}

export const buatQuotation: AiTool = {
	name: "buat_quotation",
	description:
		"Susun DRAFT quotation dari permintaan klien. Harga otomatis dari pricelist master (jangan menyebut harga sendiri). " +
		"Transport luar Jabodetabek/Magazine Box & backdrop Luxury jadi 'diisi admin'. Draft dikirim ke grup owner untuk disetujui; " +
		"TIDAK terkirim ke klien sebelum owner tap 'Kirim ke klien'.",
	scope: "finance",
	mutates: true,
	parameters: QUOTATION_PARAMS,
	async preview(args, ctx) {
		return previewQuotation(
			ctx.supabase,
			cleanQuotationArgs(args),
			ctx.todayISO,
		);
	},
	async run(args, ctx) {
		const actor = requireActor(ctx);
		if (typeof actor !== "string") return actor;
		return createQuotationCore(ctx.supabase, cleanQuotationArgs(args), {
			actorId: actor,
			today: ctx.todayISO,
		});
	},
};

// ── B3. catat_pembayaran ──────────────────────────────────────────────────

async function resolveBayar(args: Record<string, unknown>, ctx: AiToolContext) {
	const projectId = str(args.project_id);
	const jenis = str(args.jenis) as PaymentType;
	const nominal =
		typeof args.nominal === "number" ? Math.round(args.nominal) : Number.NaN;
	const tanggal = str(args.tanggal) || ctx.todayISO;
	if (!projectId) return { error: "project_id wajib" };
	if (!PAYMENT_TYPES.includes(jenis))
		return { error: "jenis wajib: dp, partial, atau pelunasan" };
	if (!Number.isFinite(nominal) || nominal <= 0)
		return { error: "nominal wajib > 0" };
	if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal))
		return { error: "tanggal format YYYY-MM-DD" };
	if (tanggal > ctx.todayISO)
		return { error: "tanggal pembayaran tidak boleh di masa depan" };

	const { data: ev } = await ctx.supabase
		.from("events")
		.select("id, project_id, client_name")
		.eq("project_id", projectId)
		.is("deleted_at", null)
		.maybeSingle();
	if (!ev) return { error: `Event ${projectId} tidak ditemukan` };

	const bankQuery = ctx.supabase
		.from("bank_accounts")
		.select("id, bank_name, account_name, is_default_receive")
		.eq("is_active", true)
		.neq("account_kind", "emoney");
	const { data: banks } = await bankQuery;
	const bankId = str(args.bank_account_id);
	const bank = bankId
		? banks?.find((b) => b.id === bankId)
		: (banks?.find((b) => b.is_default_receive) ?? banks?.[0]);
	if (!bank) return { error: "Rekening penerima tidak ditemukan" };

	const guard = await checkPayment(ctx.supabase, {
		eventId: ev.id as string,
		amount: nominal,
		paymentDate: tanggal,
	});
	if (!guard.ok) return { error: guard.error };
	return {
		ev,
		bank,
		guard,
		input: {
			eventId: ev.id as string,
			amount: nominal,
			paymentDate: tanggal,
			bankAccountId: bank.id as string,
			paymentType: jenis,
			proofUrl: /^https?:\/\//.test(str(args.bukti_url))
				? str(args.bukti_url)
				: null,
			notes: str(args.catatan) || null,
		},
	};
}

export const catatPembayaran: AiTool = {
	name: "catat_pembayaran",
	description:
		"Catat pembayaran klien (DP/cicilan/pelunasan) ke event — jurnal kas ikut tercatat. Agent TIDAK memverifikasi mutasi: " +
		"usulkan dari bukti transfer klien, owner yang cek rekening & konfirmasi. Setelah tercatat, kuitansi/nota dibuat otomatis dan ditawarkan ke owner.",
	scope: "finance",
	mutates: true,
	parameters: {
		type: "OBJECT",
		properties: {
			project_id: { type: "STRING", description: "Kode project event." },
			jenis: { type: "STRING", enum: [...PAYMENT_TYPES] },
			nominal: { type: "INTEGER", description: "Rupiah." },
			tanggal: S("YYYY-MM-DD, default hari ini."),
			bank_account_id: S("Default: rekening penerima utama."),
			bukti_url: S("URL bukti transfer."),
			catatan: S("Catatan."),
		},
		required: ["project_id", "jenis", "nominal"],
	},
	async preview(args, ctx) {
		const r = await resolveBayar(args, ctx);
		if ("error" in r) return r;
		return {
			ringkasan: `Catat ${PAYMENT_TYPE_LABEL[r.input.paymentType]} ${formatRupiah(r.input.amount)} dari ${r.ev.client_name} [${r.ev.project_id}] tgl ${formatDateID(r.input.paymentDate)} ke ${r.bank.bank_name} ${r.bank.account_name}.`,
			sisa_sebelum: r.guard.sisaSebelum,
			sisa_sesudah: r.guard.sisaSesudah,
			lunas_setelahnya: r.guard.sisaSesudah <= 0,
			peringatan:
				"Pastikan uang sudah masuk di mutasi rekening sebelum konfirmasi.",
		};
	},
	async run(args, ctx) {
		const actor = requireActor(ctx);
		if (typeof actor !== "string") return actor;
		const r = await resolveBayar(args, ctx);
		if ("error" in r) return r;
		const res = await logPaymentCore(ctx.supabase, r.input, actor);
		if (!res.ok) return { error: res.error };
		return {
			tersimpan: true,
			payment_id: res.paymentId,
			sisa_tagihan: res.sisaSesudah,
			dokumen:
				res.sisaSesudah <= 0
					? "Nota lunas dibuat & ditawarkan ke grup owner."
					: "Kuitansi + invoice sisa dibuat & ditawarkan ke grup owner.",
		};
	},
};

// ── B5. tagihan_jatuh_tempo (baca) ────────────────────────────────────────

export const tagihanJatuhTempo: AiTool = {
	name: "tagihan_jatuh_tempo",
	description:
		"Event yang lewat jatuh tempo pelunasan (due_date < hari ini), masih ada sisa, belum lunas — sama dengan tab Overdue di Billing. " +
		"Sertakan invoice & draft pesan penagihan sopan per klien; kirim lewat kirim_dokumen setelah owner setuju.",
	scope: "finance",
	parameters: { type: "OBJECT", properties: {} },
	async run(_args, ctx) {
		const { data, error } = await ctx.supabase
			.from("events")
			.select(
				"id, project_id, client_name, client_wa, event_date, due_date, remaining_balance, total_paid",
			)
			.is("deleted_at", null)
			.eq("is_migrated_legacy", false)
			.lt("due_date", ctx.todayISO)
			.gt("remaining_balance", 0)
			.neq("payment_status", "paid")
			.order("due_date", { ascending: true })
			.limit(50);
		if (error) return { error: error.message };
		const rows = await Promise.all(
			(data ?? []).map(async (e) => {
				const inv = await findActiveDoc(
					ctx.supabase,
					e.id as string,
					"invoice",
				);
				const sisa = Number(e.remaining_balance);
				const telat = Math.round(
					(Date.parse(ctx.todayISO) - Date.parse(e.due_date as string)) /
						86_400_000,
				);
				return {
					project_id: e.project_id,
					klien: e.client_name,
					acara: e.event_date,
					jatuh_tempo: e.due_date,
					telat_hari: telat,
					sisa,
					sudah_bayar: Number(e.total_paid),
					invoice: inv ? { id: inv.id, nomor: inv.doc_number } : null,
					draft_pesan: [
						`Halo Kak, semoga sehat selalu 🙏`,
						`Kami dari Tetra Photobooth ingin mengingatkan sisa pembayaran untuk acara ${formatDateID(e.event_date as string)} sebesar ${formatRupiah(sisa)}, yang jatuh tempo ${formatDateID(e.due_date as string)}.`,
						"Invoice terlampir. Kalau sudah transfer, mohon kirim buktinya ya. Terima kasih 🙏",
					].join("\n"),
				};
			}),
		);
		return {
			jumlah: rows.length,
			total_sisa: rows.reduce((s, r) => s + r.sisa, 0),
			tagihan: rows,
			catatan:
				"Event tanpa invoice: pakai kirim_pengingat_pelunasan (invoice dibuat otomatis).",
		};
	},
};
