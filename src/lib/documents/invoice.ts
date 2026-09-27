import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
	discountFromEvent,
	eventInfoFromEvent,
	itemsFromEvent,
	loadEventForPdfById,
} from "@/lib/documents/load";
import {
	addDays,
	type BillToSource,
	billTo,
	DOC_PREFIX,
	type DocClient,
	type DocType,
	type DocumentRow,
	defaultTerms,
	GROSS_UP_RATE_DEFAULT,
} from "@/lib/documents/types";
import { formatPhoneLocal } from "@/lib/format";
import type { EventForPdf } from "@/lib/pdf/event-data";

/**
 * Helper dokumen yang dipakai dua pintu: server action (sesi owner) dan tool
 * MCP (klien admin + actorId). Sengaja BUKAN "use server": ekspor di file
 * "use server" jadi endpoint yang bisa dipanggil browser tanpa cek peran.
 */

export async function allocateNumber(
	supabase: SupabaseClient,
	docType: DocType,
	issuedAt: string,
): Promise<string> {
	const { data, error } = await supabase.rpc("next_document_number", {
		p_prefix: DOC_PREFIX[docType],
		p_date: issuedAt,
	});
	if (error || !data) {
		throw new Error(`Gagal alokasi nomor: ${error?.message ?? "kosong"}`);
	}
	return data as string;
}

type EventClientFields = BillToSource &
	Pick<EventForPdf, "client_wa" | "client_email">;

/** Klien dokumen dari event: KEPADA/u.p. sesuai pilihan "Ditujukan kepada". */
export function clientFromEvent(ev: EventClientFields): DocClient {
	const { name, attn } = billTo(ev);
	return {
		name,
		org: null,
		attn,
		phone: ev.client_wa ? formatPhoneLocal(ev.client_wa) : null,
		email: ev.client_email,
		address: null,
	};
}

/**
 * Klien dokumen yang tertaut event SELALU mengikuti data event (satu sumber):
 * nama, u.p., WA. Email/alamat yang diketik di dokumen dipertahankan.
 * Dipanggil setelah event dibuat/diubah & saat invoice ditautkan.
 */
export async function syncDocClientsFromEvent(
	supabase: SupabaseClient,
	eventId: string,
): Promise<void> {
	const { data: ev } = await supabase
		.from("events")
		.select(
			"client_name, client_org, booker_name, event_category, bill_to_mode, bill_to_name, bill_to_attn, client_wa, client_email",
		)
		.eq("id", eventId)
		.maybeSingle();
	if (!ev) return;
	const live = clientFromEvent(ev as EventClientFields);
	const { data: docs } = await supabase
		.from("documents")
		.select("id, client")
		.eq("event_id", eventId)
		.neq("status", "void");
	for (const d of docs ?? []) {
		const cur = (d.client ?? {}) as DocClient;
		const next: DocClient = {
			...cur,
			name: live.name,
			org: null,
			attn: live.attn,
			phone: live.phone,
			email: cur.email || live.email,
		};
		if (JSON.stringify(next) === JSON.stringify(cur)) continue;
		const { error } = await supabase
			.from("documents")
			.update({ client: next })
			.eq("id", d.id);
		if (error) console.error("[syncDocClientsFromEvent]", d.id, error.message);
	}
}

export async function findActiveDoc(
	supabase: SupabaseClient,
	eventId: string,
	docType: DocType,
): Promise<DocumentRow | null> {
	const { data } = await supabase
		.from("documents")
		.select("*")
		.eq("event_id", eventId)
		.eq("doc_type", docType)
		.neq("status", "void")
		.order("created_at", { ascending: false })
		.limit(1)
		.maybeSingle();
	return (data as DocumentRow | null) ?? null;
}

export async function defaultSignerId(supabase: SupabaseClient) {
	const { data } = await supabase
		.from("document_signers")
		.select("id, name, position")
		.eq("is_default", true)
		.maybeSingle();
	return data as { id: string; name: string; position: string } | null;
}

export type GetOrCreateInvoiceResult =
	| {
			ok: true;
			id: string;
			docNumber: string;
			created: boolean;
			projectId: string | null;
	  }
	| { ok: false; error: string };

/** Invoice aktif sebuah event; belum ada → dibuat dari data event. */
export async function getOrCreateInvoice(
	supabase: SupabaseClient,
	eventId: string,
	actorId: string,
	today: string,
): Promise<GetOrCreateInvoiceResult> {
	const existing = await findActiveDoc(supabase, eventId, "invoice");
	if (existing) {
		return {
			ok: true,
			id: existing.id,
			docNumber: existing.doc_number,
			created: false,
			projectId: null,
		};
	}

	const ev = await loadEventForPdfById(supabase, eventId);
	if (!ev) return { ok: false, error: "Event tidak ditemukan." };
	const signer = await defaultSignerId(supabase);
	const grossUp = ev.gross_up_pph_amount > 0;
	try {
		const docNumber = await allocateNumber(supabase, "invoice", today);
		const { data, error } = await supabase
			.from("documents")
			.insert({
				doc_type: "invoice",
				doc_number: docNumber,
				event_id: eventId,
				client: clientFromEvent(ev),
				event_info: eventInfoFromEvent(ev),
				items: itemsFromEvent(ev),
				discount: discountFromEvent(ev),
				gross_up_enabled: grossUp,
				gross_up_rate: GROSS_UP_RATE_DEFAULT,
				terms: defaultTerms("invoice", grossUp),
				signer_id: signer?.id ?? null,
				signer_name: signer?.name ?? null,
				signer_position: signer?.position ?? null,
				issued_at: today,
				// Tenggat ikut event (satu sumber); cadangan H-1 untuk event lama.
				due_date: ev.due_date ?? addDays(ev.event_date, -1),
				status: "sent",
				created_by: actorId,
			})
			.select("id")
			.single();
		if (error) return { ok: false, error: error.message };
		return {
			ok: true,
			id: data.id as string,
			docNumber,
			created: true,
			projectId: ev.project_id,
		};
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : "Gagal" };
	}
}

/**
 * Tautkan invoice DP yang berdiri sendiri ke event (setelah DP masuk & event
 * diinput). Nomor invoice tetap; jatuh tempo ikut tenggat event.
 */
export async function linkInvoiceToEvent(
	supabase: SupabaseClient,
	invoiceId: string,
	eventId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const { data: inv } = await supabase
		.from("documents")
		.select("id, doc_type, event_id, status")
		.eq("id", invoiceId)
		.maybeSingle();
	if (!inv || inv.doc_type !== "invoice") {
		return { ok: false, error: "Invoice tidak ditemukan." };
	}
	if (inv.status === "void")
		return { ok: false, error: "Invoice sudah dibatalkan." };
	if (inv.event_id && inv.event_id !== eventId) {
		return { ok: false, error: "Invoice ini sudah tertaut ke event lain." };
	}
	const other = await findActiveDoc(supabase, eventId, "invoice");
	if (other && other.id !== invoiceId) {
		return {
			ok: false,
			error: `Event ini sudah punya invoice ${other.doc_number}.`,
		};
	}
	const ev = await loadEventForPdfById(supabase, eventId);
	if (!ev) return { ok: false, error: "Event tidak ditemukan." };
	const { error } = await supabase
		.from("documents")
		.update({
			event_id: eventId,
			event_info: eventInfoFromEvent(ev),
			due_date: ev.due_date ?? addDays(ev.event_date, -1),
		})
		.eq("id", invoiceId);
	if (error) return { ok: false, error: error.message };
	await syncDocClientsFromEvent(supabase, eventId);
	return { ok: true };
}

// ---------------------------------------------------------------------------
// Kuitansi / Nota Lunas / BAST — inti tanpa sesi (server action, MCP, hook
// pembayaran). Semua idempoten: diminta ulang = dokumen & nomor yang sama.
// ---------------------------------------------------------------------------

export type IssueCoreResult =
	| {
			ok: true;
			id: string;
			docNumber: string;
			created: boolean;
			projectId: string | null;
	  }
	| { ok: false; error: string };

/** Item & pengaturan nota/kuitansi: ikut invoice bila ada, else dari event. */
async function billingSnapshot(
	supabase: SupabaseClient,
	eventId: string,
	ev: EventForPdf,
) {
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
		gross_up_rate: GROSS_UP_RATE_DEFAULT,
		client: clientFromEvent(ev),
		signer_id: signer?.id ?? null,
		signer_name: signer?.name ?? null,
		signer_position: signer?.position ?? null,
	};
}

/** Kuitansi untuk satu pembayaran — nomor tetap kalau diminta ulang. */
export async function issueReceiptCore(
	supabase: SupabaseClient,
	paymentId: string,
	actorId: string,
	today: string,
): Promise<IssueCoreResult> {
	const { data: existing } = await supabase
		.from("documents")
		.select("id, doc_number")
		.eq("payment_id", paymentId)
		.eq("doc_type", "receipt")
		.neq("status", "void")
		.maybeSingle();
	if (existing)
		return {
			ok: true,
			id: existing.id as string,
			docNumber: existing.doc_number as string,
			created: false,
			projectId: null,
		};

	const { data: pay } = await supabase
		.from("payments")
		.select("event_id, is_reversed")
		.eq("id", paymentId)
		.maybeSingle();
	if (!pay) return { ok: false, error: "Pembayaran tidak ditemukan." };
	if (pay.is_reversed)
		return { ok: false, error: "Pembayaran ini sudah di-reverse." };

	const ev = await loadEventForPdfById(supabase, pay.event_id as string);
	if (!ev) return { ok: false, error: "Event tidak ditemukan." };
	const snap = await billingSnapshot(supabase, pay.event_id as string, ev);
	try {
		const docNumber = await allocateNumber(supabase, "receipt", today);
		const { data, error } = await supabase
			.from("documents")
			.insert({
				doc_type: "receipt",
				doc_number: docNumber,
				event_id: pay.event_id,
				payment_id: paymentId,
				...snap,
				event_info: eventInfoFromEvent(ev),
				issued_at: today,
				status: "sent",
				created_by: actorId,
			})
			.select("id")
			.single();
		if (error) return { ok: false, error: error.message };
		return {
			ok: true,
			id: data.id as string,
			docNumber,
			created: true,
			projectId: ev.project_id,
		};
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : "Gagal" };
	}
}

/** Nota Lunas / BAST — hanya setelah event lunas. */
export async function issuePaidDocCore(
	supabase: SupabaseClient,
	eventId: string,
	docType: "nota_lunas" | "bast",
	actorId: string | null,
	today: string,
): Promise<IssueCoreResult> {
	const existing = await findActiveDoc(supabase, eventId, docType);
	if (existing)
		return {
			ok: true,
			id: existing.id,
			docNumber: existing.doc_number,
			created: false,
			projectId: null,
		};

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
		const docNumber = await allocateNumber(supabase, docType, today);
		const { data, error } = await supabase
			.from("documents")
			.insert({
				doc_type: docType,
				doc_number: docNumber,
				event_id: eventId,
				...snap,
				event_info: eventInfoFromEvent(ev),
				issued_at: today,
				status: "sent",
				created_by: actorId,
			})
			.select("id")
			.single();
		if (error) return { ok: false, error: error.message };
		return {
			ok: true,
			id: data.id as string,
			docNumber,
			created: true,
			projectId: ev.project_id,
		};
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : "Gagal" };
	}
}
