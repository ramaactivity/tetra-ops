import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDateID, formatRupiah } from "@/lib/format";
import { tgEscape } from "@/lib/telegram/client";
import { editorUrl, offerSendToOwner } from "./approval";
import { allocateNumber, defaultSignerId } from "./invoice";
import {
	type Catalog,
	planQuotation,
	type QuotationPlan,
	QuotationRequestSchema,
} from "./quotation-plan";
import { computeTotals } from "./totals";
import { type DocItem, parseGrossUpRate, pendingAdminItems } from "./types";

/**
 * buat_quotation (B2) — dipakai tool MCP (agent) dan POST /api/bot/quotation.
 * Selalu DRAFT; tidak ada yang terkirim ke klien sebelum owner tap "Kirim".
 */

export async function loadCatalog(supabase: SupabaseClient): Promise<Catalog> {
	const [{ data: packages }, { data: addons }, { data: backdrops }] =
		await Promise.all([
			supabase
				.from("packages")
				.select(
					"id, name, category, frame_size, duration_hours, base_price, is_active, quotation_includes",
				)
				.is("deleted_at", null),
			supabase
				.from("addons")
				.select("id, name, unit, price, is_active, min_qty")
				.is("deleted_at", null),
			supabase.from("backdrops").select("code, name, type, is_active"),
		]);
	return {
		packages: (packages ?? []) as Catalog["packages"],
		addons: (addons ?? []) as Catalog["addons"],
		backdrops: (backdrops ?? []) as Catalog["backdrops"],
	};
}

export async function loadGrossUpRate(supabase: SupabaseClient) {
	const { data } = await supabase
		.from("system_config")
		.select("value")
		.eq("key", "tax.default_grossup_rate_pct")
		.maybeSingle();
	return parseGrossUpRate(data?.value);
}

type PlanOk = {
	ok: true;
	plan: QuotationPlan;
	jenis: string | null;
	origin: Record<string, unknown>;
};

async function plan(
	supabase: SupabaseClient,
	input: unknown,
	today: string,
): Promise<PlanOk | { ok: false; error: string }> {
	const parsed = QuotationRequestSchema.safeParse(input);
	if (!parsed.success) {
		const i = parsed.error.issues[0];
		return {
			ok: false,
			error: `Input tidak valid: ${i.path.join(".") || "(root)"} — ${i.message}`,
		};
	}
	const [catalog, rate] = await Promise.all([
		loadCatalog(supabase),
		loadGrossUpRate(supabase),
	]);
	const res = planQuotation(parsed.data, catalog, { today, grossUpRate: rate });
	if (!res.ok) return res;
	return {
		ok: true,
		plan: res.plan,
		jenis: parsed.data.acara.jenis,
		origin: { ...parsed.data.sumber, jenis_acara: parsed.data.acara.jenis },
	};
}

const pct = (r: number) => `${String(r).replace(".", ",")}%`;

/** Ringkasan satu paragraf untuk agent/owner. */
function ringkasan(p: QuotationPlan, docNumber: string | null): string {
	const a = p.event_info;
	const acara = [a.title, a.date ? formatDateID(a.date) : null, a.city]
		.filter(Boolean)
		.join(" · ");
	return [
		`${docNumber ?? "Quotation baru"} untuk ${p.client.name}${acara ? ` (${acara})` : ""}.`,
		`Item: ${p.items.map((i) => `${i.name}${i.qty > 1 ? ` ×${i.qty}` : ""}`).join(", ")}.`,
		`Total ${formatRupiah(p.total)}${p.gross_up_enabled ? ` (termasuk gross-up ${pct(p.gross_up_rate)})` : ""}, berlaku s/d ${formatDateID(p.valid_until)}.`,
		p.butuh_isian_admin.length
			? `Harga wajib diisi admin: ${p.butuh_isian_admin.join(", ")}.`
			: null,
		p.proposed_discount
			? `Usulan diskon ${p.usulan_diskon_rp != null ? formatRupiah(p.usulan_diskon_rp) : ""} (${p.proposed_discount.alasan}) — belum diterapkan.`
			: null,
		...p.catatan_server,
	]
		.filter(Boolean)
		.join(" ");
}

function previewShape(p: QuotationPlan) {
	return {
		klien: p.client,
		acara: p.event_info,
		item: p.items.map((i) => ({
			nama: i.name,
			qty: i.qty,
			harga: i.needs_admin_price ? "diisi admin" : i.unit_price,
		})),
		subtotal: p.subtotal,
		gross_up: p.gross_up_enabled ? pct(p.gross_up_rate) : false,
		total: p.total,
		butuh_isian_admin: p.butuh_isian_admin,
		usulan_diskon: p.proposed_discount
			? {
					...p.proposed_discount,
					rupiah: p.usulan_diskon_rp,
					masuk_total: false,
				}
			: null,
		berlaku_sampai: p.valid_until,
		catatan: p.catatan_server,
	};
}

export async function previewQuotation(
	supabase: SupabaseClient,
	input: unknown,
	today: string,
) {
	const r = await plan(supabase, input, today);
	if (!r.ok) return { error: r.error };
	return { ringkasan: ringkasan(r.plan, null), ...previewShape(r.plan) };
}

export type CreateQuotationResult =
	| {
			id: string;
			doc_number: string;
			total: number;
			butuh_isian_admin: string[];
			usulan_diskon: unknown;
			url_editor: string;
			ringkasan: string;
			baru: boolean;
	  }
	| { error: string };

export async function createQuotationCore(
	supabase: SupabaseClient,
	input: unknown,
	opts: { actorId: string | null; today: string; externalId?: string | null },
): Promise<CreateQuotationResult> {
	// Idempoten untuk bot: external_id yang sama → draft yang sama.
	if (opts.externalId) {
		const { data: ex } = await supabase
			.from("documents")
			.select(
				"id, doc_number, items, discount, gross_up_enabled, gross_up_rate, proposed_discount",
			)
			.eq("external_id", opts.externalId)
			.maybeSingle();
		if (ex) {
			const items = ex.items as DocItem[];
			return {
				id: ex.id as string,
				doc_number: ex.doc_number as string,
				total: computeTotals(items, Number(ex.discount), {
					enabled: Boolean(ex.gross_up_enabled),
					ratePct: Number(ex.gross_up_rate),
				}).total,
				butuh_isian_admin: pendingAdminItems(items),
				usulan_diskon: ex.proposed_discount ?? null,
				url_editor: editorUrl(ex.id as string),
				ringkasan: `${ex.doc_number} sudah dibuat sebelumnya untuk permintaan ini.`,
				baru: false,
			};
		}
	}

	const r = await plan(supabase, input, opts.today);
	if (!r.ok) return { error: r.error };
	const p = r.plan;
	const signer = await defaultSignerId(supabase);
	let docNumber: string;
	try {
		docNumber = await allocateNumber(supabase, "quotation", p.issued_at);
	} catch (e) {
		return { error: e instanceof Error ? e.message : "Gagal alokasi nomor" };
	}
	const { data, error } = await supabase
		.from("documents")
		.insert({
			doc_type: "quotation",
			doc_number: docNumber,
			event_id: null,
			client: p.client,
			event_info: p.event_info,
			items: p.items,
			discount: 0,
			gross_up_enabled: p.gross_up_enabled,
			gross_up_rate: p.gross_up_rate,
			notes: p.notes,
			terms: p.terms,
			signer_id: signer?.id ?? null,
			signer_name: signer?.name ?? null,
			signer_position: signer?.position ?? null,
			issued_at: p.issued_at,
			valid_until: p.valid_until,
			status: "draft",
			proposed_discount: p.proposed_discount,
			origin: r.origin,
			external_id: opts.externalId ?? null,
			created_by: opts.actorId,
		})
		.select("id")
		.single();
	if (error) {
		// Balapan dua panggilan bot dengan external_id sama.
		if (error.code === "23505" && opts.externalId)
			return createQuotationCore(supabase, input, opts);
		return { error: error.message };
	}
	const id = data.id as string;

	await offerSendToOwner(supabase, {
		documentIds: [id],
		headerHtml: approvalHtml(p, docNumber, r.origin),
	});

	return {
		id,
		doc_number: docNumber,
		total: p.total,
		butuh_isian_admin: p.butuh_isian_admin,
		usulan_diskon: p.proposed_discount
			? {
					...p.proposed_discount,
					rupiah: p.usulan_diskon_rp,
					masuk_total: false,
				}
			: null,
		url_editor: editorUrl(id),
		ringkasan: ringkasan(p, docNumber),
		baru: true,
	};
}

/** Pesan persetujuan di grup owner. */
export function approvalHtml(
	p: QuotationPlan,
	docNumber: string,
	origin: Record<string, unknown>,
): string {
	const a = p.event_info;
	const src = origin.jenis === "wa_bot" ? "bot WA" : "agent (Telegram)";
	const lines = [
		`📝 <b>Draft quotation ${tgEscape(docNumber)}</b> dari ${src}`,
		"",
		`👤 ${tgEscape(p.client.name)}${p.client.attn ? ` · u.p. ${tgEscape(p.client.attn)}` : ""}${p.client.phone ? ` · ${tgEscape(p.client.phone)}` : ""}`,
		`🎉 ${[
			a.title,
			a.date ? formatDateID(a.date) : "tanggal ?",
			a.time,
			[a.venue, a.city].filter(Boolean).join(", "),
		]
			.filter(Boolean)
			.map((x) => tgEscape(String(x)))
			.join(" · ")}`,
		"",
		...p.items.map(
			(i) =>
				`• ${tgEscape(i.name)}${i.qty > 1 ? ` ×${i.qty}` : ""} — ${i.needs_admin_price ? "<b>diisi admin</b>" : formatRupiah(i.unit_price * i.qty)}`,
		),
		"",
		`<b>Total ${formatRupiah(p.total)}</b>${p.gross_up_enabled ? ` (gross-up ${pct(p.gross_up_rate)})` : ""} · berlaku s/d ${formatDateID(p.valid_until)}`,
	];
	if (p.butuh_isian_admin.length)
		lines.push(
			`⚠️ Isi dulu: ${p.butuh_isian_admin.map(tgEscape).join(", ")} — belum bisa dikirim.`,
		);
	if (p.proposed_discount)
		lines.push(
			`💡 Usulan diskon agent: ${p.usulan_diskon_rp != null ? formatRupiah(p.usulan_diskon_rp) : ""} — ${tgEscape(p.proposed_discount.alasan)} (belum masuk total; terapkan di editor)`,
		);
	for (const c of p.catatan_server) lines.push(`ℹ️ ${tgEscape(c)}`);
	return lines.join("\n");
}
