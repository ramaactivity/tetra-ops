import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { phoneTail } from "@/lib/portal/vendor-signup-core";
import { createAdminClient } from "@/lib/supabase/admin";
import { fillEmpty, type InboxFill, type InboxRow } from "./core";
import {
	buildDataKlien,
	type DataKlien,
	type DocLike,
	docToInboxFill,
	type PackageLite,
	pickPrimaryDoc,
} from "./klien-data";

/**
 * Jembatan dokumen resmi ↔ Booking Masuk ↔ bot (I/O). Pemetaan murni ada di
 * klien-data.ts. Klien dikenali dari wa_jid (origin quotation bot) atau
 * 9 digit terakhir nomor — aturan yang sama dengan modul lain (DR-051).
 */

const DOC_COLS =
	"id, doc_type, doc_number, status, issued_at, created_at, client, event_info, items, notes, origin";

/** Nilai di filter .or() PostgREST: buang karakter yang memecah sintaksnya. */
const clean = (s: string) => s.replace(/[,()"*\\%]/g, " ").trim();

/**
 * Quotation/invoice (non-void) milik klien, terbaru dulu. Putaran kedua
 * memakai nomor yang ditemukan di putaran pertama (quotation bot ber-jid LID
 * → nomor asli → invoice yang dibuat manual tanpa jid).
 */
export async function loadClientDocs(
	supabase: SupabaseClient,
	q: { jid?: string | null; wa?: string | null; nama?: string | null },
): Promise<DocLike[]> {
	const found = new Map<string, DocLike>();
	const tails = new Set<string>();
	const t0 = phoneTail(q.wa);
	if (t0.length === 9) tails.add(t0);
	const run = async (ors: string[]) => {
		if (ors.length === 0) return;
		const { data, error } = await supabase
			.from("documents")
			.select(DOC_COLS)
			.in("doc_type", ["quotation", "invoice"])
			.neq("status", "void")
			.or(ors.join(","))
			.order("created_at", { ascending: false })
			.limit(20);
		if (error) throw new Error(`documents: ${error.message}`);
		for (const d of (data ?? []) as DocLike[]) found.set(d.id, d);
	};
	const first: string[] = [...tails].map((t) => `client->>phone.like.*${t}`);
	if (q.jid) first.push(`origin->>wa_jid.eq."${clean(q.jid)}"`);
	const nama = q.nama ? clean(q.nama) : "";
	if (nama.length >= 3)
		first.push(
			`client->>name.ilike.*${nama}*`,
			`client->>attn.ilike.*${nama}*`,
		);
	await run(first);
	const more = [...found.values()]
		.map((d) => phoneTail(d.client?.phone))
		.filter((t) => t.length === 9 && !tails.has(t));
	await run([...new Set(more)].map((t) => `client->>phone.like.*${t}`));
	return [...found.values()].sort((a, b) =>
		b.created_at.localeCompare(a.created_at),
	);
}

export async function loadPackagesLite(
	supabase: SupabaseClient,
): Promise<PackageLite[]> {
	const { data, error } = await supabase
		.from("packages")
		.select("id, category, frame_size, duration_hours");
	if (error) throw new Error(`packages: ${error.message}`);
	return (data ?? []) as PackageLite[];
}

/** Booking Masuk klien yang sama (jid / nomor), terbaru dulu. */
export async function findInboxForClient(
	supabase: SupabaseClient,
	q: { wa_jid?: string | null; client_wa?: string | null },
): Promise<InboxRow[]> {
	const ors: string[] = [];
	if (q.wa_jid) ors.push(`wa_jid.eq."${clean(q.wa_jid)}"`);
	const t = phoneTail(q.client_wa);
	if (t.length === 9) ors.push(`client_wa.like.*${t}`);
	if (ors.length === 0) return [];
	const { data, error } = await supabase
		.from("booking_inbox")
		.select("*")
		.or(ors.join(","))
		.gte("created_at", new Date(Date.now() - 180 * 864e5).toISOString())
		.order("updated_at", { ascending: false })
		.limit(10);
	if (error) throw new Error(`booking_inbox: ${error.message}`);
	return (data ?? []) as InboxRow[];
}

/** Isian Booking Masuk dari dokumen acuan klien (untuk tanggal itu). */
export async function inboxDocFill(
	supabase: SupabaseClient,
	q: { wa_jid: string; client_wa: string | null; tanggal_iso: string | null },
): Promise<InboxFill | null> {
	const docs = await loadClientDocs(supabase, {
		jid: q.wa_jid,
		wa: q.client_wa,
	});
	const doc = pickPrimaryDoc(docs, q.tanggal_iso);
	return doc ? docToInboxFill(doc, await loadPackagesLite(supabase)) : null;
}

/**
 * Quotation/invoice baru disimpan → Booking Masuk klien yang sama (masih
 * baru/diproses) diisi kolom kosongnya. Tidak pernah menimpa isian bot/admin.
 * Best-effort: gagal hanya dicatat, simpan dokumen tetap jalan.
 */
export async function syncInboxFromDocument(documentId: string) {
	try {
		const admin = createAdminClient();
		const { data: doc } = await admin
			.from("documents")
			.select(DOC_COLS)
			.eq("id", documentId)
			.maybeSingle();
		const d = doc as DocLike | null;
		if (!d || !["quotation", "invoice"].includes(d.doc_type)) return;
		const rows = (
			await findInboxForClient(admin, {
				wa_jid: d.origin?.wa_jid,
				client_wa: d.client?.phone,
			})
		).filter(
			(r) =>
				(r.status === "baru" || r.status === "diproses") &&
				(!r.data?.tanggal_iso ||
					!d.event_info?.date ||
					r.data.tanggal_iso === d.event_info.date),
		);
		for (const r of rows) {
			const fill = await inboxDocFill(admin, {
				wa_jid: r.wa_jid,
				client_wa: r.client_wa ?? d.client?.phone ?? null,
				tanggal_iso: r.data?.tanggal_iso ?? d.event_info?.date ?? null,
			});
			if (!fill) continue;
			const data = fillEmpty(r.data ?? {}, fill.data);
			const patch = {
				data,
				client_wa: r.client_wa ?? fill.client_wa ?? null,
				client_name: r.client_name ?? fill.client_name ?? null,
			};
			if (
				JSON.stringify(data) === JSON.stringify(r.data ?? {}) &&
				patch.client_wa === r.client_wa &&
				patch.client_name === r.client_name
			)
				continue;
			const { error } = await admin
				.from("booking_inbox")
				.update(patch)
				.eq("id", r.id);
			if (error) throw new Error(error.message);
		}
	} catch (e) {
		console.error("[booking-inbox] sync dari dokumen:", e);
	}
}

/**
 * Data klien untuk bot (GET /api/bot/klien) dan agent (MCP data_klien).
 * Tanpa nominal uang. `supabase` = admin (bot) atau client ber-RLS (MCP/web).
 */
export async function loadDataKlien(
	supabase: SupabaseClient,
	q: { wa?: string | null; nama?: string | null },
): Promise<DataKlien> {
	const docs = await loadClientDocs(supabase, q);
	const phones = [q.wa, ...docs.map((d) => d.client?.phone)];
	const jids = docs.map((d) => d.origin?.wa_jid).filter(Boolean) as string[];
	const inboxRows = (
		await Promise.all([
			...[...new Set(phones.map(phoneTail).filter((t) => t.length === 9))].map(
				(t) => findInboxForClient(supabase, { client_wa: t }),
			),
			...[...new Set(jids)].map((j) =>
				findInboxForClient(supabase, { wa_jid: j }),
			),
		])
	)
		.flat()
		.filter((r) => r.status !== "dibatalkan")
		.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
	return buildDataKlien(
		docs,
		inboxRows[0] ?? null,
		await loadPackagesLite(supabase),
	);
}
