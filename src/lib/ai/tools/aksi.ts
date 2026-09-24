import "server-only";

import { assignCrewCore } from "@/lib/actions/crew-assignments";
import { recordQuickTransactionCore } from "@/lib/actions/journal-entries";
import type { AiTool, AiToolContext } from "@/lib/ai/types";
import { findActiveDoc, getOrCreateInvoice } from "@/lib/documents/invoice";
import { signedPdfQuery } from "@/lib/documents/pdf-link";
import {
	type CashAccountOption,
	loadCashAccounts,
} from "@/lib/finance/cash-accounts";
import {
	type CatatCategory,
	type CatatDirection,
	categoriesFor,
} from "@/lib/finance/quick-record-categories";
import { rp } from "@/lib/telegram/digest";
import { isLikelyWaPhone, toWaPhone } from "@/lib/whatsapp";

/**
 * Tool TULIS untuk agent. Polanya sama untuk semua:
 *   preview(args) → validasi + ringkasan "apa yang akan terjadi", tanpa simpan
 *   run(args)     → simpan lewat core server action yang sama dengan UI
 *
 * Lapisan MCP (src/lib/ai/mcp.ts) mengekspos preview sebagai `<nama>_usulan`
 * dan menolak run tanpa `konfirmasi: true` + actorId. Jangan tulis query
 * INSERT/UPDATE di sini kalau server action-nya sudah ada — panggil core-nya.
 *
 * Tidak ada tool hapus, dan tidak akan ada.
 */

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const int = (v: unknown) =>
	typeof v === "number" && Number.isFinite(v) ? Math.round(v) : Number.NaN;

function requireActor(ctx: AiToolContext): string | { error: string } {
	return ctx.actorId ?? { error: "Permukaan ini tidak boleh menulis data." };
}

// ── Catat transaksi ──────────────────────────────────────────────────────

const ARAH: CatatDirection[] = ["masuk", "keluar", "transfer"];

type Res<T> = { ok: true; value: T } | { ok: false; error: string };

async function resolveCashAccount(
	ctx: AiToolContext,
	query: string,
	label: string,
): Promise<Res<CashAccountOption>> {
	const accounts = await loadCashAccounts(ctx.supabase);
	const q = query.toLowerCase();
	const exact = accounts.find((a) => a.code.toLowerCase() === q);
	const list = exact
		? [exact]
		: accounts.filter((a) => a.name.toLowerCase().includes(q));
	if (list.length === 1) return { ok: true, value: list[0] };
	return {
		ok: false,
		error:
			`${label} "${query}" ${list.length === 0 ? "tidak ditemukan" : "ambigu"}. Pilihan: ` +
			accounts.map((a) => `${a.name} (${a.code})`).join(", "),
	};
}

function resolveCategory(
	arah: CatatDirection,
	query: string,
): Res<CatatCategory> {
	const options = categoriesFor(arah);
	const q = query.toLowerCase();
	const exact = options.find((c) => c.id === q);
	const list = exact
		? [exact]
		: options.filter((c) => c.label.toLowerCase().includes(q));
	if (list.length === 1) return { ok: true, value: list[0] };
	return {
		ok: false,
		error:
			`Kategori "${query}" ${list.length === 0 ? "tidak ditemukan" : "ambigu"}. Pilihan: ` +
			(list.length > 1 ? list : options)
				.map((c) => `${c.label} [${c.id}]`)
				.join(", "),
	};
}

type CatatResolved = {
	input: Record<string, unknown>;
	ringkasan: string;
	saldo_akun_asal: number;
	peringatan?: string;
	category?: CatatCategory;
};

async function resolveCatat(
	args: Record<string, unknown>,
	ctx: AiToolContext,
): Promise<CatatResolved | { error: string }> {
	const arah = str(args.arah) as CatatDirection;
	if (!ARAH.includes(arah))
		return { error: "arah harus masuk / keluar / transfer" };
	const jumlah = int(args.jumlah);
	if (!(jumlah > 0)) return { error: "jumlah harus bilangan bulat > 0" };
	const tanggal = str(args.tanggal) || ctx.todayISO;
	if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal))
		return { error: "tanggal harus YYYY-MM-DD" };
	const biayaAdmin = args.biaya_admin === undefined ? 0 : int(args.biaya_admin);
	if (!(biayaAdmin >= 0))
		return { error: "biaya_admin harus bilangan bulat ≥ 0" };
	const bulanPeriode = str(args.bulan_periode);
	if (bulanPeriode && !/^\d{4}-\d{2}$/.test(bulanPeriode)) {
		return { error: "bulan_periode harus YYYY-MM" };
	}

	const dari = str(args.dari_akun);
	if (!dari)
		return { error: "dari_akun wajib diisi (nama/kode akun kas atau bank)" };
	const srcRes = await resolveCashAccount(ctx, dari, "Akun kas/bank");
	if (!srcRes.ok) return { error: srcRes.error };
	const src = srcRes.value;

	const catatan = str(args.catatan);
	const input: Record<string, unknown> = {
		direction: arah,
		amount: jumlah,
		entry_date: tanggal,
		account_code: src.code,
		admin_fee: biayaAdmin,
		note: catatan || undefined,
		period_month: bulanPeriode || undefined,
	};

	if (arah === "transfer") {
		const ke = str(args.ke_akun);
		if (!ke) return { error: "ke_akun wajib untuk transfer" };
		const dstRes = await resolveCashAccount(ctx, ke, "Akun tujuan");
		if (!dstRes.ok) return { error: dstRes.error };
		input.to_account_code = dstRes.value.code;
		return {
			input,
			saldo_akun_asal: src.balance,
			ringkasan: `Transfer ${rp(jumlah)} dari ${src.name} ke ${dstRes.value.name}, ${tanggal}${
				biayaAdmin ? `, biaya admin ${rp(biayaAdmin)}` : ""
			}${catatan ? `. Catatan: ${catatan}` : ""}`,
		};
	}

	const kat = str(args.kategori);
	if (!kat)
		return { error: "kategori wajib diisi (lihat akun_kategori_catat)" };
	const catRes = resolveCategory(arah, kat);
	if (!catRes.ok) return { error: catRes.error };
	const cat = catRes.value;
	input.category_id = cat.id;
	if (cat.monthly && !bulanPeriode) {
		return {
			error: `Kategori "${cat.label}" adalah biaya bulanan: isi bulan_periode (YYYY-MM) = bulan yang dibayar.`,
		};
	}
	const arahLabel = arah === "keluar" ? "Keluar" : "Masuk";
	const prep = arah === "keluar" ? "dari" : "ke";
	return {
		input,
		category: cat,
		saldo_akun_asal: src.balance,
		peringatan: cat.warning,
		ringkasan: `${arahLabel} ${rp(jumlah)} ${prep} ${src.name} — ${cat.label} (${cat.coa}), ${tanggal}${
			bulanPeriode ? `, periode ${bulanPeriode}` : ""
		}${biayaAdmin ? `, biaya admin ${rp(biayaAdmin)}` : ""}${catatan ? `. Catatan: ${catatan}` : ""}`,
	};
}

export const catatTransaksi: AiTool = {
	name: "catat_transaksi",
	description:
		"Catat uang masuk / keluar / transfer antar kas-bank ke pembukuan (sama dengan menu Catat). " +
		"Contoh: 'catat bensin 50rb dari kas', 'terima DP 500rb ke BCA'. Kategori dan akun bisa " +
		"ditulis dengan nama; lihat akun_kategori_catat untuk daftarnya.",
	scope: "finance",
	mutates: true,
	parameters: {
		type: "OBJECT",
		properties: {
			arah: { type: "STRING", enum: ["masuk", "keluar", "transfer"] },
			jumlah: { type: "INTEGER", description: "Rupiah, bilangan bulat." },
			dari_akun: {
				type: "STRING",
				description:
					"Akun kas/bank: nama atau kode. Untuk 'masuk' = akun penerima; untuk keluar/transfer = akun asal.",
			},
			ke_akun: { type: "STRING", description: "Hanya transfer: akun tujuan." },
			kategori: {
				type: "STRING",
				description:
					"Id atau kata kunci label kategori (mis. 'bensin', 'konsumsi-rapat').",
			},
			catatan: {
				type: "STRING",
				description: "Keterangan singkat, mis. nama layanan.",
			},
			tanggal: { type: "STRING", description: "YYYY-MM-DD. Default hari ini." },
			bulan_periode: {
				type: "STRING",
				description:
					"YYYY-MM, wajib untuk biaya bulanan (kost, internet, langganan).",
			},
			biaya_admin: {
				type: "INTEGER",
				description: "Biaya admin bank, default 0.",
			},
		},
		required: ["arah", "jumlah", "dari_akun"],
	},
	async preview(args, ctx) {
		const r = await resolveCatat(args, ctx);
		if ("error" in r) return r;
		const { input: _input, category: _c, ...rest } = r;
		return rest;
	},
	async run(args, ctx) {
		const actor = requireActor(ctx);
		if (typeof actor !== "string") return actor;
		const r = await resolveCatat(args, ctx);
		if ("error" in r) return r;
		const res = await recordQuickTransactionCore(
			ctx.supabase as never,
			actor,
			r.input,
		);
		if (!res?.success) return { error: res?.error ?? "Gagal menyimpan" };
		return { tersimpan: true, ref: res.refId, ringkasan: r.ringkasan };
	},
};

export const akunKategoriCatat: AiTool = {
	name: "akun_kategori_catat",
	description:
		"Daftar akun kas/bank (dengan saldo) dan kategori yang bisa dipakai catat_transaksi. " +
		"Panggil sebelum mencatat kalau belum yakin nama akun/kategorinya.",
	scope: "finance",
	parameters: { type: "OBJECT", properties: {} },
	async run(_args, ctx) {
		const accounts = await loadCashAccounts(ctx.supabase);
		const slim = (c: CatatCategory) => ({
			id: c.id,
			label: c.label,
			coa: c.coa,
			...(c.monthly ? { bulanan: true } : {}),
		});
		return {
			akun_kas_bank: accounts.map((a) => ({
				kode: a.code,
				nama: a.name,
				saldo: a.balance,
			})),
			kategori_keluar: categoriesFor("keluar").map(slim),
			kategori_masuk: categoriesFor("masuk").map(slim),
		};
	},
};

// ── Assign crew ───────────────────────────────────────────────────────────

const PERAN = ["lead", "asisten", "crew_c"] as const;

type CrewRow = {
	id: string;
	full_name: string;
	nickname: string | null;
	tier: string | null;
};

async function resolveAssign(
	args: Record<string, unknown>,
	ctx: AiToolContext,
) {
	const projectId = str(args.project_id);
	const crewQ = str(args.crew).toLowerCase();
	const peran = str(args.peran) as (typeof PERAN)[number];
	if (!projectId)
		return { error: "project_id wajib (dapatkan dari cari_event)" };
	if (!crewQ) return { error: "crew wajib (nama atau panggilan)" };
	if (!PERAN.includes(peran))
		return { error: "peran harus lead / asisten / crew_c" };

	const { data: ev } = await ctx.supabase
		.from("events")
		.select("id, project_id, client_name, event_date")
		.eq("project_id", projectId)
		.is("deleted_at", null)
		.maybeSingle();
	if (!ev) return { error: `Event ${projectId} tidak ditemukan` };

	const { data: crews } = await ctx.supabase
		.from("users")
		.select("id, full_name, nickname, tier")
		.eq("role", "crew")
		.eq("is_active", true);
	const all = (crews ?? []) as CrewRow[];
	const hits = all.filter(
		(u) =>
			u.nickname?.toLowerCase() === crewQ ||
			u.full_name.toLowerCase() === crewQ ||
			u.nickname?.toLowerCase().includes(crewQ) ||
			u.full_name.toLowerCase().includes(crewQ),
	);
	const exact = hits.filter(
		(u) =>
			u.nickname?.toLowerCase() === crewQ ||
			u.full_name.toLowerCase() === crewQ,
	);
	const picked = exact.length === 1 ? exact : hits;
	if (picked.length !== 1) {
		return {
			error: `Crew "${args.crew}" ${picked.length === 0 ? "tidak ditemukan" : "ambigu"}. Pilihan: ${(picked.length
				? picked
				: all
			)
				.map((u) => u.nickname || u.full_name)
				.join(", ")}`,
		};
	}
	const crew = picked[0];

	const { data: existing } = await ctx.supabase
		.from("crew_assignments")
		.select("role_in_event")
		.eq("event_id", ev.id)
		.eq("user_id", crew.id)
		.maybeSingle();

	return {
		event: ev,
		crew,
		peran,
		sudah_ditugaskan: existing ? (existing.role_in_event as string) : null,
		ringkasan: `${crew.nickname || crew.full_name} (${crew.tier ?? "tier ?"}) → ${peran} di ${ev.client_name}, ${ev.event_date} [${ev.project_id}]`,
	};
}

export const assignCrew: AiTool = {
	name: "assign_crew",
	description:
		"Tugaskan crew ke sebuah event dengan peran lead / asisten / crew_c. Fee mengikuti tier crew. " +
		"Butuh project_id (dari cari_event) dan nama/panggilan crew (dari daftar_crew).",
	scope: "ops",
	mutates: true,
	parameters: {
		type: "OBJECT",
		properties: {
			project_id: {
				type: "STRING",
				description: "Kode event, mis. TP-2026-014.",
			},
			crew: { type: "STRING", description: "Nama atau panggilan crew." },
			peran: { type: "STRING", enum: [...PERAN] },
		},
		required: ["project_id", "crew", "peran"],
	},
	async preview(args, ctx) {
		const r = await resolveAssign(args, ctx);
		if ("error" in r) return r;
		return {
			ringkasan: r.ringkasan,
			sudah_ditugaskan: r.sudah_ditugaskan,
			...(r.sudah_ditugaskan
				? {
						peringatan: `Crew ini sudah terdaftar di event ini sebagai ${r.sudah_ditugaskan}.`,
					}
				: {}),
		};
	},
	async run(args, ctx) {
		const actor = requireActor(ctx);
		if (typeof actor !== "string") return actor;
		const r = await resolveAssign(args, ctx);
		if ("error" in r) return r;
		if (r.sudah_ditugaskan) {
			return {
				error: `Sudah terdaftar sebagai ${r.sudah_ditugaskan}; ubah lewat aplikasi.`,
			};
		}
		const res = await assignCrewCore(ctx.supabase as never, actor, {
			event_id: r.event.id,
			user_id: r.crew.id,
			role_in_event: r.peran,
		});
		if (res.error) return { error: res.error };
		return { tersimpan: true, ringkasan: r.ringkasan };
	},
};

export const daftarCrew: AiTool = {
	name: "daftar_crew",
	description: "Daftar crew aktif beserta panggilan dan tier (senior/junior).",
	scope: "ops",
	parameters: { type: "OBJECT", properties: {} },
	async run(_args, ctx) {
		const { data, error } = await ctx.supabase
			.from("users")
			.select("full_name, nickname, tier")
			.eq("role", "crew")
			.eq("is_active", true)
			.order("full_name");
		if (error) return { error: error.message };
		return { jumlah: data?.length ?? 0, crew: data ?? [] };
	},
};

// ── Status lead WA ────────────────────────────────────────────────────────

const LEAD_STATUS = ["new", "contacted", "converted", "ignored"] as const;

async function resolveLead(args: Record<string, unknown>, ctx: AiToolContext) {
	const telepon = str(args.telepon).replace(/\D/g, "");
	const status = str(args.status) as (typeof LEAD_STATUS)[number];
	if (telepon.length < 8) return { error: "telepon minimal 8 digit" };
	if (!LEAD_STATUS.includes(status)) {
		return { error: `status harus ${LEAD_STATUS.join(" / ")}` };
	}
	const { data: lead } = await ctx.supabase
		.from("whatsapp_bot_leads")
		.select("id, name, phone, topic, status, received_at")
		.like("phone", `%${telepon}%`)
		.order("received_at", { ascending: false })
		.limit(1)
		.maybeSingle();
	if (!lead) return { error: `Lead dengan nomor ${telepon} tidak ditemukan` };
	return {
		lead,
		status,
		ringkasan: `${lead.name ?? lead.phone} (${lead.topic}): ${lead.status} → ${status}`,
	};
}

export const updateStatusLead: AiTool = {
	name: "update_status_lead",
	description:
		"Ubah status lead WhatsApp (pesan terbaru dari nomor itu): new → contacted → converted (atau ignored). " +
		"Pakai setelah owner menghubungi atau closing.",
	scope: "ops",
	mutates: true,
	parameters: {
		type: "OBJECT",
		properties: {
			telepon: { type: "STRING", description: "Nomor WA, mis. 6281234567890." },
			status: { type: "STRING", enum: [...LEAD_STATUS] },
		},
		required: ["telepon", "status"],
	},
	async preview(args, ctx) {
		const r = await resolveLead(args, ctx);
		if ("error" in r) return r;
		return { ringkasan: r.ringkasan, lead: r.lead };
	},
	async run(args, ctx) {
		const actor = requireActor(ctx);
		if (typeof actor !== "string") return actor;
		const r = await resolveLead(args, ctx);
		if ("error" in r) return r;
		const { error } = await ctx.supabase
			.from("whatsapp_bot_leads")
			.update({ status: r.status })
			.eq("id", r.lead.id);
		if (error) return { error: error.message };
		return { tersimpan: true, ringkasan: r.ringkasan };
	},
};

// ── Kirim pengingat pelunasan ke klien (lewat bot WA) ───────────────────

async function resolvePengingat(
	args: Record<string, unknown>,
	ctx: AiToolContext,
) {
	const projectId = str(args.project_id);
	const pesan = str(args.pesan);
	if (!projectId)
		return { error: "project_id wajib (dapatkan dari piutang/cari_event)" };
	if (pesan.length < 20 || pesan.length > 1500)
		return { error: "pesan wajib diisi, 20–1500 karakter" };

	const { data: ev } = await ctx.supabase
		.from("events")
		.select(
			"id, project_id, client_name, client_wa, event_date, remaining_balance, payment_status",
		)
		.eq("project_id", projectId)
		.is("deleted_at", null)
		.maybeSingle();
	if (!ev) return { error: `Event ${projectId} tidak ditemukan` };
	if (ev.payment_status === "paid" || Number(ev.remaining_balance) <= 0)
		return { error: `${ev.client_name} sudah lunas, tidak perlu diingatkan.` };
	if (!isLikelyWaPhone(ev.client_wa))
		return {
			error: `Nomor WA klien tidak valid ("${ev.client_wa ?? ""}"). Perbaiki di halaman event dulu.`,
		};

	const nomor = toWaPhone(ev.client_wa as string);
	const inv = await findActiveDoc(ctx.supabase, ev.id as string, "invoice");
	return {
		event: ev,
		nomor,
		pesan,
		invoice: inv?.doc_number ?? null,
		ringkasan: `Kirim WA ke ${ev.client_name} (+${nomor}) lewat bot Tetra: pesan di bawah + PDF ${
			inv
				? `invoice ${inv.doc_number}`
				: "invoice BARU (dibuat otomatis, tenggat H-1)"
		}. Sisa tagihan ${rp(Number(ev.remaining_balance))}, acara ${ev.event_date} [${ev.project_id}].`,
	};
}

export const kirimPengingatPelunasan: AiTool = {
	name: "kirim_pengingat_pelunasan",
	description:
		"Kirim pesan pengingat pelunasan + PDF invoice terbaru ke WhatsApp klien lewat bot WA Tetra. " +
		"HANYA kalau owner memintanya untuk klien tertentu. Invoice dibuat otomatis kalau belum ada.",
	scope: "finance",
	mutates: true,
	parameters: {
		type: "OBJECT",
		properties: {
			project_id: { type: "STRING", description: "Kode project event." },
			pesan: {
				type: "STRING",
				description:
					"Teks pesan untuk klien, persis seperti yang disetujui owner. PDF invoice dilampirkan terpisah.",
			},
		},
		required: ["project_id", "pesan"],
	},
	async preview(args, ctx) {
		const r = await resolvePengingat(args, ctx);
		if ("error" in r) return r;
		return {
			ringkasan: r.ringkasan,
			nomor_wa: `+${r.nomor}`,
			invoice: r.invoice ?? "akan dibuat",
			pesan: r.pesan,
		};
	},
	async run(args, ctx) {
		const actor = requireActor(ctx);
		if (typeof actor !== "string") return actor;
		const r = await resolvePengingat(args, ctx);
		if ("error" in r) return r;

		const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
		if (!appUrl) return { error: "NEXT_PUBLIC_APP_URL belum diset." };
		const inv = await getOrCreateInvoice(
			ctx.supabase,
			r.event.id as string,
			actor,
			ctx.todayISO,
		);
		if (!inv.ok) return { error: `Gagal menyiapkan invoice: ${inv.error}` };
		// 1 jam cukup untuk antrean bot (cek tiap 10 dtk) plus bot yang sedang reconnect.
		const q = signedPdfQuery(inv.id, 3600);
		if (!q) return { error: "MCP_API_TOKEN belum diset." };
		const klien = String(r.event.client_name)
			.replace(/[^\w\s-]+/g, "")
			.trim();

		// Koneksi WA hidup di proses bot; perintah dititipkan ke antrean yang
		// sama dengan tombol dashboard (bot_commands), dieksekusi ≤10 detik.
		const { data: cmd, error } = await ctx.supabase
			.from("bot_commands")
			.insert({
				command: `send-invoice:${JSON.stringify({
					nomor: r.nomor,
					pesan: r.pesan,
					pdf_url: `${appUrl}/api/pdf/document/${inv.id}?download=1&${q}`,
					nama_file: `Invoice ${inv.docNumber} - ${klien}.pdf`,
				})}`,
				status: "pending",
			})
			.select("id")
			.single();
		if (error) return { error: `Gagal menitipkan ke bot: ${error.message}` };

		await ctx.supabase.from("event_reminders_log").insert({
			event_id: r.event.id,
			template_code: "pelunasan_bot",
			recipient_phone: r.nomor,
			recipient_label: r.event.client_name,
			sent_by: actor,
			notes: `bot_commands ${cmd.id}, invoice ${inv.docNumber}`,
		});

		// Tunggu hasil bot sebentar supaya owner langsung tahu terkirim/gagal.
		for (let i = 0; i < 8; i++) {
			await new Promise((res) => setTimeout(res, 4000));
			const { data: st } = await ctx.supabase
				.from("bot_commands")
				.select("status, result")
				.eq("id", cmd.id)
				.maybeSingle();
			if (st && st.status !== "pending") {
				return {
					status: st.status === "done" ? "terkirim" : "gagal",
					hasil: st.result,
					invoice: inv.docNumber,
					invoice_baru: inv.created,
				};
			}
		}
		return {
			status: "antre",
			hasil:
				"Bot belum memproses dalam 30 detik (mungkin sedang reconnect). Perintah tetap di antrean.",
			invoice: inv.docNumber,
			invoice_baru: inv.created,
		};
	},
};
