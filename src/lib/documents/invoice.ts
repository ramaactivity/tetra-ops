import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
	discountFromEvent,
	itemsFromEvent,
	loadEventForPdfById,
} from "@/lib/documents/load";
import {
	addDays,
	DOC_PREFIX,
	type DocClient,
	type DocType,
	type DocumentRow,
	defaultTerms,
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

export function clientFromEvent(ev: EventForPdf): DocClient {
	return {
		name: ev.client_name,
		org: null,
		phone: ev.client_wa ? formatPhoneLocal(ev.client_wa) : null,
		email: ev.client_email,
		address: null,
	};
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
				event_info: {},
				items: itemsFromEvent(ev),
				discount: discountFromEvent(ev),
				gross_up_enabled: grossUp,
				gross_up_rate: 2,
				terms: defaultTerms("invoice", grossUp),
				signer_id: signer?.id ?? null,
				signer_name: signer?.name ?? null,
				signer_position: signer?.position ?? null,
				issued_at: today,
				// Jatuh tempo standar H-1 sebelum acara (bisa diganti chip di editor).
				due_date: addDays(ev.event_date, -1),
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
