import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { DOC_TYPE_LABEL, type DocType } from "./types";

/**
 * Antrean "perlu persetujuan" di aplikasi — pasangan tombol Telegram
 * "Kirim ke klien" (doc_send_requests). Satu sumber untuk badge menu Dokumen,
 * kotak di daftar Dokumen, banner di halaman dokumen, dan notifikasi lonceng.
 */

/** Permintaan yang lebih tua dari ini dianggap basi (quotation berlaku 14 hari). */
const WINDOW_DAYS = 14;

export type PendingApproval = { documentId: string; requestId: string };

/**
 * Dokumen yang masih menunggu owner: ada di permintaan kirim yang belum
 * ditangani (≤14 hari), belum sampai ke klien, dan tidak void.
 */
export async function loadPendingApprovals(
	supabase: SupabaseClient,
	documentId?: string,
): Promise<PendingApproval[]> {
	const since = new Date(Date.now() - WINDOW_DAYS * 864e5).toISOString();
	let q = supabase
		.from("doc_send_requests")
		.select("id, document_ids")
		.is("handled_at", null)
		.gte("created_at", since)
		.order("created_at", { ascending: false });
	if (documentId) q = q.contains("document_ids", [documentId]);
	const { data: reqs, error } = await q;
	if (error) {
		console.error("[pending-approval] requests:", error.message);
		return [];
	}
	const ids = [
		...new Set((reqs ?? []).flatMap((r) => r.document_ids as string[])),
	];
	if (ids.length === 0) return [];
	const { data: docs, error: docErr } = await supabase
		.from("documents")
		.select("id")
		.in("id", ids)
		.is("delivered_at", null)
		.neq("status", "void");
	if (docErr) {
		console.error("[pending-approval] documents:", docErr.message);
		return [];
	}
	const open = new Set((docs ?? []).map((d) => d.id as string));
	const seen = new Set<string>();
	const out: PendingApproval[] = [];
	for (const r of reqs ?? [])
		for (const id of r.document_ids as string[]) {
			if (!open.has(id) || seen.has(id)) continue;
			if (documentId && id !== documentId) continue;
			seen.add(id);
			out.push({ documentId: id, requestId: r.id as string });
		}
	return out;
}

/** Notifikasi lonceng untuk permintaan ini selesai (sudah dikirim/diabaikan). */
export async function resolveApprovalNotifications(requestId: string) {
	const now = new Date().toISOString();
	const { error } = await createAdminClient()
		.from("notifications")
		.update({
			is_read: true,
			read_at: now,
			is_resolved: true,
			resolved_at: now,
		})
		.eq("entity_type", "doc_send_request")
		.eq("entity_id", requestId)
		.eq("is_resolved", false);
	if (error) console.error("[pending-approval] resolve notif:", error.message);
}

/**
 * Dokumen sudah dikirim (bot / manual) atau diabaikan owner → keluarkan dari
 * permintaan yang masih terbuka, supaya tombol Telegram tidak mengirim dobel.
 * Permintaan yang jadi kosong ditutup + notifikasinya diselesaikan.
 * Admin client: RLS doc_send_requests hanya membuka SELECT untuk owner.
 * Best-effort, tidak pernah throw.
 */
export async function closePendingSends(
	documentId: string,
	how: "sent" | "manual" | "dismissed",
	actorId: string | null,
) {
	try {
		const admin = createAdminClient();
		const { data: reqs, error } = await admin
			.from("doc_send_requests")
			.select("id, document_ids")
			.is("handled_at", null)
			.contains("document_ids", [documentId]);
		if (error) throw new Error(error.message);
		for (const r of reqs ?? []) {
			const rest = (r.document_ids as string[]).filter(
				(id) => id !== documentId,
			);
			const { data: closed } = await admin
				.from("doc_send_requests")
				.update(
					rest.length > 0
						? { document_ids: rest }
						: {
								handled_at: new Date().toISOString(),
								result: { via: "app", how, by: actorId },
							},
				)
				.eq("id", r.id)
				.is("handled_at", null)
				.select("id");
			if (rest.length === 0 && closed?.length)
				await resolveApprovalNotifications(r.id as string);
		}
	} catch (e) {
		console.error("[pending-approval] close:", e);
	}
}

/** Notifikasi lonceng ke semua owner: ada dokumen yang menunggu persetujuan. */
export async function notifyApprovalNeeded(
	requestId: string,
	documentIds: string[],
) {
	try {
		const admin = createAdminClient();
		const [{ data: docs }, { data: owners }] = await Promise.all([
			admin
				.from("documents")
				.select("id, doc_type, doc_number, client")
				.in("id", documentIds),
			admin
				.from("users")
				.select("id")
				.eq("is_active", true)
				.is("deleted_at", null)
				.in("role", ["owner", "super_admin"]),
		]);
		const ordered = documentIds
			.map((id) => docs?.find((d) => d.id === id))
			.filter((d) => d != null);
		if (ordered.length === 0 || !owners?.length) return;
		const first = ordered[0];
		const title = `Perlu persetujuan: ${ordered
			.map((d) => `${DOC_TYPE_LABEL[d.doc_type as DocType]} ${d.doc_number}`)
			.join(" + ")}`;
		const client = (first.client as { name?: string } | null)?.name || "Klien";
		const { error } = await admin.from("notifications").insert(
			owners.map((u) => ({
				user_id: u.id,
				severity: "warning",
				category: "financial",
				title,
				body: `${client} — periksa lalu kirim ke klien lewat bot WA.`,
				entity_type: "doc_send_request",
				entity_id: requestId,
				action_url: `/finance/dokumen/${first.id}`,
			})),
		);
		if (error) console.error("[pending-approval] notif:", error.message);
	} catch (e) {
		console.error("[pending-approval] notif:", e);
	}
}
