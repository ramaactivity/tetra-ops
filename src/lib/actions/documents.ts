"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureVenue } from "@/lib/actions/venues";
import { getCurrentUser } from "@/lib/auth/get-user";
import {
	allocateNumber,
	clientFromEvent,
	defaultSignerId,
	findActiveDoc,
	getOrCreateInvoice,
	linkInvoiceToEvent,
} from "@/lib/documents/invoice";
import {
	discountFromEvent,
	itemsFromEvent,
	loadDocument,
	loadEventForPdfById,
} from "@/lib/documents/load";
import {
	addDays,
	DOC_STATUSES,
	type DocClient,
	type DocItem,
	defaultTerms,
} from "@/lib/documents/types";
import type { EventForPdf } from "@/lib/pdf/event-data";
import { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function requireOwnerLevel() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Unauthorized");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		throw new Error("Forbidden — owner-level only");
	}
	return me;
}

const nullishStr = (max: number) =>
	z
		.string()
		.trim()
		.max(max)
		.nullish()
		.transform((v) => (v ? v : null));

const ClientSchema = z.object({
	name: z.string().trim().min(1, "Nama klien wajib diisi").max(160),
	org: nullishStr(160),
	attn: nullishStr(160),
	phone: nullishStr(40),
	email: nullishStr(160),
	address: nullishStr(400),
});

const EventInfoSchema = z.object({
	title: nullishStr(160),
	date: nullishStr(10),
	time: nullishStr(80),
	venue: nullishStr(200),
	city: nullishStr(100),
});

const ItemSchema = z.object({
	name: z.string().trim().min(1, "Nama item kosong").max(200),
	includes: z.array(z.string().trim().max(200)).max(30).default([]),
	qty: z.coerce.number().min(0).max(9999),
	unit_price: z.coerce.number().int().min(0),
	package_id: z.string().uuid().nullish(),
	addon_id: z.string().uuid().nullish(),
});

const DraftSchema = z.object({
	id: z.string().uuid().nullish(),
	doc_type: z.enum(["quotation", "invoice"]),
	event_id: z.string().uuid().nullish(),
	source_document_id: z.string().uuid().nullish(),
	client: ClientSchema,
	event_info: EventInfoSchema,
	items: z.array(ItemSchema).min(1, "Minimal satu item").max(50),
	discount: z.coerce.number().int().min(0).default(0),
	gross_up_enabled: z.boolean().default(false),
	gross_up_rate: z.coerce.number().min(0).max(99).default(2),
	notes: nullishStr(2000),
	terms: nullishStr(4000),
	signer_id: z.string().uuid().nullish(),
	signer_name: nullishStr(120),
	signer_position: nullishStr(120),
	issued_at: z.iso.date("Tanggal terbit tidak valid"),
	due_date: nullishStr(10),
	valid_until: nullishStr(10),
	status: z.enum(DOC_STATUSES).default("draft"),
});

export type DocumentDraftInput = z.input<typeof DraftSchema>;

export type SaveDocumentResult =
	| { ok: true; id: string; doc_number: string }
	| { ok: false; error: string; fieldErrors?: Record<string, string[]> };

function revalidateDocs(projectId?: string | null) {
	revalidatePath("/finance/dokumen");
	revalidatePath("/billing");
	if (projectId) {
		revalidatePath(`/operations/${projectId}`);
		revalidatePath(`/operations/${projectId}/payments`);
	}
}

async function projectIdOf(supabase: Supabase, eventId: string | null) {
	if (!eventId) return null;
	const { data } = await supabase
		.from("events")
		.select("project_id")
		.eq("id", eventId)
		.maybeSingle();
	return (data?.project_id as string | undefined) ?? null;
}

/** Simpan draft editor (buat baru → alokasi nomor; ubah → nomor tetap). */
export async function saveDocument(
	input: DocumentDraftInput,
): Promise<SaveDocumentResult> {
	const me = await requireOwnerLevel();
	const parsed = DraftSchema.safeParse(input);
	if (!parsed.success) {
		const flat = parsed.error.flatten();
		return {
			ok: false,
			error:
				flat.formErrors[0] ??
				Object.values(flat.fieldErrors).flat()[0] ??
				"Data tidak valid",
			fieldErrors: flat.fieldErrors as Record<string, string[]>,
		};
	}
	const d = parsed.data;
	if (d.doc_type === "quotation" && d.event_id) {
		return { ok: false, error: "Quotation tidak tertaut ke event." };
	}

	const supabase = await createClient();
	// Venue quotation yang baru diketik masuk master venue (sama seperti form
	// booking), supaya bisa dipilih lagi berikutnya. Gagal tidak memblokir simpan.
	// Quotation & invoice DP (belum ada event) mengetik venue sendiri.
	if (!d.event_id && d.event_info.venue) {
		await ensureVenue({
			name: d.event_info.venue,
			address: null,
			city: d.event_info.city,
			province: null,
			google_maps_url: null,
		}).catch(() => null);
	}
	const payload = {
		doc_type: d.doc_type,
		event_id: d.event_id ?? null,
		source_document_id: d.source_document_id ?? null,
		client: d.client,
		event_info: d.event_info,
		items: d.items,
		discount: d.discount,
		gross_up_enabled: d.gross_up_enabled,
		gross_up_rate: d.gross_up_rate,
		notes: d.notes,
		terms: d.terms,
		signer_id: d.signer_id ?? null,
		signer_name: d.signer_name,
		signer_position: d.signer_position,
		issued_at: d.issued_at,
		due_date: d.due_date,
		valid_until: d.valid_until,
		status: d.status,
	};

	try {
		if (d.id) {
			// Tanggal terbit diubah → tanggal di nomor ikut (QUO-TP-12-23092026 →
			// QUO-TP-12-25092026). Urutan dipertahankan dalam bulan yang sama;
			// pindah bulan = nomor urut baru di bulan itu (urutan reset per bulan).
			const { data: before } = await supabase
				.from("documents")
				.select("doc_number, issued_at")
				.eq("id", d.id)
				.single();
			let docNumber: string | undefined;
			if (before && before.issued_at !== d.issued_at) {
				docNumber =
					String(before.issued_at).slice(0, 7) === d.issued_at.slice(0, 7)
						? renumberDate(before.doc_number as string, d.issued_at)
						: await allocateNumber(supabase, d.doc_type, d.issued_at);
			}
			const { data, error } = await supabase
				.from("documents")
				.update(docNumber ? { ...payload, doc_number: docNumber } : payload)
				.eq("id", d.id)
				.select("id, doc_number")
				.single();
			if (error) return { ok: false, error: error.message };
			await syncEventDueDate(supabase, d);
			revalidateDocs(await projectIdOf(supabase, d.event_id ?? null));
			return {
				ok: true,
				id: data.id as string,
				doc_number: data.doc_number as string,
			};
		}

		const docNumber = await allocateNumber(supabase, d.doc_type, d.issued_at);
		const { data, error } = await supabase
			.from("documents")
			.insert({ ...payload, doc_number: docNumber, created_by: me.profile.id })
			.select("id, doc_number")
			.single();
		if (error) {
			if (error.code === "23505" && d.doc_type === "invoice") {
				return { ok: false, error: "Event ini sudah punya invoice aktif." };
			}
			return { ok: false, error: error.message };
		}
		await syncEventDueDate(supabase, d);
		revalidateDocs(await projectIdOf(supabase, d.event_id ?? null));
		return {
			ok: true,
			id: data.id as string,
			doc_number: data.doc_number as string,
		};
	} catch (e) {
		return {
			ok: false,
			error: e instanceof Error ? e.message : "Gagal menyimpan",
		};
	}
}

/** Ganti bagian tanggal (DDMMYYYY) di akhir nomor dokumen. */
function renumberDate(docNumber: string, issuedAt: string): string {
	const [y, m, dd] = issuedAt.split("-");
	return docNumber.replace(/\d{8}$/, `${dd}${m}${y}`);
}

/**
 * Jatuh tempo invoice yang tertaut = tenggat pelunasan event (satu sumber,
 * dibaca Billing & agent pengingat). Mengubah salah satunya mengubah keduanya.
 */
async function syncEventDueDate(
	supabase: Supabase,
	d: { doc_type: string; event_id?: string | null; due_date?: string | null },
) {
	if (d.doc_type !== "invoice" || !d.event_id || !d.due_date) return;
	await supabase
		.from("events")
		.update({ due_date: d.due_date })
		.eq("id", d.event_id);
}

export type LinkableEvent = {
	id: string;
	project_id: string;
	client_name: string;
	event_date: string;
};

/** Event yang belum punya invoice aktif — kandidat untuk ditautkan invoice DP. */
export async function listLinkableEvents(): Promise<LinkableEvent[]> {
	await requireOwnerLevel();
	const supabase = await createClient();
	const [{ data: events }, { data: linked }] = await Promise.all([
		supabase
			.from("events")
			.select("id, project_id, client_name, event_date")
			.is("deleted_at", null)
			.eq("is_migrated_legacy", false)
			.order("event_date", { ascending: false })
			.limit(200),
		supabase
			.from("documents")
			.select("event_id")
			.eq("doc_type", "invoice")
			.neq("status", "void")
			.not("event_id", "is", null),
	]);
	const taken = new Set((linked ?? []).map((d) => d.event_id as string));
	return ((events ?? []) as LinkableEvent[]).filter((e) => !taken.has(e.id));
}

/** Tautkan invoice DP ke event yang sudah ada (dari editor invoice). */
export async function linkInvoice(
	invoiceId: string,
	eventId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
	await requireOwnerLevel();
	const supabase = await createClient();
	const res = await linkInvoiceToEvent(supabase, invoiceId, eventId);
	if (res.ok) {
		revalidateDocs(await projectIdOf(supabase, eventId));
		revalidatePath(`/finance/dokumen/${invoiceId}`);
	}
	return res;
}

export async function setDocumentStatus(
	id: string,
	status: (typeof DOC_STATUSES)[number],
): Promise<{ ok: true } | { ok: false; error: string }> {
	await requireOwnerLevel();
	const supabase = await createClient();
	const { data, error } = await supabase
		.from("documents")
		.update({ status })
		.eq("id", id)
		.select("event_id")
		.single();
	if (error) return { ok: false, error: error.message };
	revalidateDocs(await projectIdOf(supabase, data.event_id as string | null));
	return { ok: true };
}

// ---------------------------------------------------------------------------
// Get-or-create per event / pembayaran
// ---------------------------------------------------------------------------

/** Item & pengaturan yang dipakai nota/kuitansi: ikut invoice bila ada, else dari event. */
async function billingSnapshot(
	supabase: Supabase,
	eventId: string,
	ev: EventForPdf,
): Promise<{
	items: DocItem[];
	discount: number;
	gross_up_enabled: boolean;
	gross_up_rate: number;
	client: DocClient;
	signer_id: string | null;
	signer_name: string | null;
	signer_position: string | null;
}> {
	const inv = await findActiveDoc(supabase, eventId, "invoice");
	if (inv) {
		return {
			items: inv.items,
			discount: inv.discount,
			gross_up_enabled: inv.gross_up_enabled,
			gross_up_rate: inv.gross_up_rate,
			client: inv.client,
			signer_id: inv.signer_id,
			signer_name: inv.signer_name,
			signer_position: inv.signer_position,
		};
	}
	const signer = await defaultSignerId(supabase);
	return {
		items: itemsFromEvent(ev),
		discount: discountFromEvent(ev),
		gross_up_enabled: ev.gross_up_pph_amount > 0,
		gross_up_rate: 2,
		client: clientFromEvent(ev),
		signer_id: signer?.id ?? null,
		signer_name: signer?.name ?? null,
		signer_position: signer?.position ?? null,
	};
}

type IssueResult =
	| { ok: true; id: string; created: boolean }
	| { ok: false; error: string };

/** Invoice event: buka yang ada, atau buat dari data event. */
export async function ensureInvoiceForEvent(
	eventId: string,
): Promise<IssueResult> {
	const me = await requireOwnerLevel();
	const supabase = await createClient();
	const res = await getOrCreateInvoice(
		supabase,
		eventId,
		me.profile.id,
		todayISO(),
	);
	if (!res.ok) return res;
	if (res.created) revalidateDocs(res.projectId);
	return { ok: true, id: res.id, created: res.created };
}

/** Kuitansi untuk satu pembayaran — nomor tetap kalau diminta ulang. */
export async function issueReceipt(paymentId: string): Promise<IssueResult> {
	const me = await requireOwnerLevel();
	const supabase = await createClient();
	const { data: existing } = await supabase
		.from("documents")
		.select("id")
		.eq("payment_id", paymentId)
		.eq("doc_type", "receipt")
		.neq("status", "void")
		.maybeSingle();
	if (existing) return { ok: true, id: existing.id as string, created: false };

	const { data: pay } = await supabase
		.from("payments")
		.select("event_id, payment_date, is_reversed")
		.eq("id", paymentId)
		.maybeSingle();
	if (!pay) return { ok: false, error: "Pembayaran tidak ditemukan." };
	if (pay.is_reversed)
		return { ok: false, error: "Pembayaran ini sudah di-reverse." };

	const ev = await loadEventForPdfById(supabase, pay.event_id as string);
	if (!ev) return { ok: false, error: "Event tidak ditemukan." };
	const snap = await billingSnapshot(supabase, pay.event_id as string, ev);
	try {
		const issuedAt = todayISO();
		const docNumber = await allocateNumber(supabase, "receipt", issuedAt);
		const { data, error } = await supabase
			.from("documents")
			.insert({
				doc_type: "receipt",
				doc_number: docNumber,
				event_id: pay.event_id,
				payment_id: paymentId,
				...snap,
				event_info: {},
				issued_at: issuedAt,
				status: "sent",
				created_by: me.profile.id,
			})
			.select("id")
			.single();
		if (error) return { ok: false, error: error.message };
		revalidateDocs(ev.project_id);
		return { ok: true, id: data.id as string, created: true };
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : "Gagal" };
	}
}

async function issuePaidDoc(
	eventId: string,
	docType: "nota_lunas" | "bast",
): Promise<IssueResult> {
	const me = await requireOwnerLevel();
	const supabase = await createClient();
	const existing = await findActiveDoc(supabase, eventId, docType);
	if (existing) return { ok: true, id: existing.id, created: false };

	const ev = await loadEventForPdfById(supabase, eventId);
	if (!ev) return { ok: false, error: "Event tidak ditemukan." };
	if (ev.remaining_balance > 0 || ev.total_paid <= 0) {
		return {
			ok: false,
			error: `${docType === "bast" ? "BAST" : "Nota Lunas"} hanya bisa diterbitkan setelah event lunas.`,
		};
	}
	const snap = await billingSnapshot(supabase, eventId, ev);
	try {
		const issuedAt = todayISO();
		const docNumber = await allocateNumber(supabase, docType, issuedAt);
		const { data, error } = await supabase
			.from("documents")
			.insert({
				doc_type: docType,
				doc_number: docNumber,
				event_id: eventId,
				...snap,
				event_info: {},
				issued_at: issuedAt,
				status: "sent",
				created_by: me.profile.id,
			})
			.select("id")
			.single();
		if (error) return { ok: false, error: error.message };
		revalidateDocs(ev.project_id);
		return { ok: true, id: data.id as string, created: true };
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : "Gagal" };
	}
}

export async function issueNotaLunas(eventId: string) {
	return issuePaidDoc(eventId, "nota_lunas");
}
export async function issueBast(eventId: string) {
	return issuePaidDoc(eventId, "bast");
}

// ---------------------------------------------------------------------------
// Quotation ⇄ Invoice
// ---------------------------------------------------------------------------

/**
 * Deal: quotation → invoice event yang baru dibuat. Dipanggil dari
 * createBooking setelah event tersimpan. Item/klien/gross-up disalin,
 * quotation ditandai Disetujui.
 */
export async function createInvoiceFromQuotation(
	quotationId: string,
	eventId: string,
): Promise<IssueResult> {
	const me = await requireOwnerLevel();
	const supabase = await createClient();
	const q = await loadDocument(quotationId);
	if (!q || q.doc_type !== "quotation") {
		return { ok: false, error: "Quotation tidak ditemukan." };
	}
	const existing = await findActiveDoc(supabase, eventId, "invoice");
	if (existing) return { ok: true, id: existing.id, created: false };

	const { data: ev } = await supabase
		.from("events")
		.select("project_id, event_date, due_date")
		.eq("id", eventId)
		.maybeSingle();
	if (!ev) return { ok: false, error: "Event tidak ditemukan." };

	try {
		const issuedAt = todayISO();
		const docNumber = await allocateNumber(supabase, "invoice", issuedAt);
		const { data, error } = await supabase
			.from("documents")
			.insert({
				doc_type: "invoice",
				doc_number: docNumber,
				event_id: eventId,
				source_document_id: q.id,
				client: q.client,
				event_info: {},
				items: q.items,
				discount: q.discount,
				gross_up_enabled: q.gross_up_enabled,
				gross_up_rate: q.gross_up_rate,
				notes: q.notes,
				terms: defaultTerms("invoice", q.gross_up_enabled),
				signer_id: q.signer_id,
				signer_name: q.signer_name,
				signer_position: q.signer_position,
				issued_at: issuedAt,
				// Tenggat pelunasan ikut event (form booking); cadangan H-1.
				due_date:
					(ev.due_date as string | null) ??
					(ev.event_date ? addDays(ev.event_date as string, -1) : null),
				status: "sent",
				created_by: me.profile.id,
			})
			.select("id")
			.single();
		if (error) return { ok: false, error: error.message };
		await supabase
			.from("documents")
			.update({ status: "accepted" })
			.eq("id", q.id);
		revalidateDocs(ev.project_id as string);
		return { ok: true, id: data.id as string, created: true };
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : "Gagal" };
	}
}

/** Salin isi dokumen menjadi quotation baru (dari invoice atau quotation lama). */
export async function copyAsQuotation(sourceId: string): Promise<IssueResult> {
	const me = await requireOwnerLevel();
	const supabase = await createClient();
	const src = await loadDocument(sourceId);
	if (!src) return { ok: false, error: "Dokumen tidak ditemukan." };

	let eventInfo = src.event_info;
	if (src.event_id) {
		const ev = await loadEventForPdfById(supabase, src.event_id);
		if (ev) {
			eventInfo = {
				date: ev.event_date,
				time: null,
				venue: ev.venue_name,
				city: ev.venue_city,
			};
		}
	}
	try {
		const issuedAt = todayISO();
		const docNumber = await allocateNumber(supabase, "quotation", issuedAt);
		const { data, error } = await supabase
			.from("documents")
			.insert({
				doc_type: "quotation",
				doc_number: docNumber,
				source_document_id: src.id,
				client: src.client,
				event_info: eventInfo,
				items: src.items,
				discount: src.discount,
				gross_up_enabled: src.gross_up_enabled,
				gross_up_rate: src.gross_up_rate,
				notes: src.notes,
				terms: defaultTerms("quotation", src.gross_up_enabled),
				signer_id: src.signer_id,
				signer_name: src.signer_name,
				signer_position: src.signer_position,
				issued_at: issuedAt,
				valid_until: addDays(issuedAt, 7),
				status: "draft",
				created_by: me.profile.id,
			})
			.select("id")
			.single();
		if (error) return { ok: false, error: error.message };
		revalidateDocs();
		return { ok: true, id: data.id as string, created: true };
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : "Gagal" };
	}
}

// ---------------------------------------------------------------------------
// Pencarian klien (contacts + kontak bot WA + klien dokumen sebelumnya)
// ---------------------------------------------------------------------------

export type ClientSuggestion = DocClient & { source: string };

export async function searchClients(q: string): Promise<ClientSuggestion[]> {
	await requireOwnerLevel();
	const term = q.trim();
	if (term.length < 2) return [];
	const supabase = await createClient();
	const like = `%${term.replace(/[%_]/g, "")}%`;
	const [{ data: contacts }, { data: bot }, { data: docs }] = await Promise.all(
		[
			supabase
				.from("contacts")
				.select("name, phone, email, company_address, type")
				.eq("is_active", true)
				.ilike("name", like)
				.limit(6),
			supabase
				.from("whatsapp_bot_contacts")
				.select("name, phone, org_name")
				.or(`name.ilike.${like},org_name.ilike.${like}`)
				.limit(6),
			supabase
				.from("documents")
				.select("client")
				.or(`client->>name.ilike.${like},client->>org.ilike.${like}`)
				.order("created_at", { ascending: false })
				.limit(6),
		],
	);

	const out: ClientSuggestion[] = [];
	const seen = new Set<string>();
	const push = (c: ClientSuggestion) => {
		const key = `${c.name.toLowerCase()}|${c.phone ?? ""}`;
		if (!c.name || seen.has(key)) return;
		seen.add(key);
		out.push(c);
	};
	for (const d of docs ?? []) {
		const c = d.client as DocClient;
		push({ ...c, source: "Dokumen sebelumnya" });
	}
	for (const c of contacts ?? []) {
		push({
			name: c.name as string,
			org: null,
			phone: (c.phone as string | null) ?? null,
			email: (c.email as string | null) ?? null,
			address: (c.company_address as string | null) ?? null,
			source: "Kontak",
		});
	}
	for (const c of bot ?? []) {
		push({
			name: (c.name as string | null) ?? (c.org_name as string) ?? "",
			org: (c.org_name as string | null) ?? null,
			phone: (c.phone as string | null) ?? null,
			email: null,
			address: null,
			source: "WhatsApp",
		});
	}
	return out.slice(0, 10);
}

function todayISO() {
	return new Date().toISOString().slice(0, 10);
}
