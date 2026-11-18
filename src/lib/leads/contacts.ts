import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeadStage } from "@/components/leads/leads-shared";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

/**
 * Leads per KONTAK (wa_jid), bukan per baris pesan. whatsapp_bot_leads berisi
 * satu baris per pesan masuk (±2.000 baris, ±500 kontak) — dulu KPI & pil
 * status menghitung baris pesan dan tabel hanya 200 pesan terbaru (spek
 * Hermes SPEC-LEADS-HERMES A1/A2). Tahap kontak diturunkan dari data, tidak
 * diisi manual.
 */

export type LeadAggRow = {
	wa_jid: string;
	phone: string | null;
	name: string | null;
	topic: string;
	status: string;
	received_at: string;
	segment: string | null;
	event_date: string | null;
	converted_event_id: string | null;
	converted_at: string | null;
};

export type LeadContact = {
	jid: string;
	/** Nomor asli 62… terbaru (null = hanya LID). */
	phone: string | null;
	name: string | null;
	firstAt: string;
	lastAt: string;
	count: number;
	/** Topik unik, terbaru dulu. */
	topics: string[];
	/** Segmen dari bot (label "Pribadi"/"Corporate"…), sudah jadi key. */
	segment: string;
	/** Tanggal acara yang ditanyakan (YYYY-MM-DD) terbaru, kalau bot menangkapnya. */
	eventDate: string | null;
	convertedEventId: string | null;
	convertedAt: string | null;
	ignored: boolean;
};

export type StageEvent = {
	id: string;
	project_id: string;
	status: string;
	payment_status: string | null;
	deleted_at: string | null;
};

export type StageDoc = {
	id: string;
	doc_type: "quotation" | "invoice";
	doc_number: string;
	status: string;
	event_id: string | null;
	created_at: string;
	jid: string | null;
	tail: string | null;
};

export type ContactStage = {
	stage: LeadStage;
	ref: { label: string; href: string } | null;
};

const LEAD_SEGMENT_KEY: Record<string, string> = {
	pribadi: "private",
	corporate: "corporate",
	"eo/wo": "eo_wo",
	instansi: "instansi",
	venue: "venue",
	osis: "osis",
	bem: "bem",
	sekolah: "sekolah",
	kampus: "kampus",
};

/** Segmen kontak: setelan di whatsapp_bot_contacts menang, lalu tebakan bot di baris lead. */
export function segmentKey(
	leadSegment: string | null | undefined,
	contactSegment?: string | null,
): string {
	return (
		contactSegment ||
		LEAD_SEGMENT_KEY[(leadSegment ?? "").trim().toLowerCase()] ||
		"private"
	);
}

/** 9 digit terakhir — kunci pencocokan nomor yang sama dengan trigger wa_lead_convert. */
export function phoneTail(p: string | null | undefined): string | null {
	const d = (p ?? "").replace(/\D/g, "");
	return d.length >= 9 ? d.slice(-9) : null;
}

const realPhone = (p: string | null) =>
	p && /^62\d{8,13}$/.test(p.replace(/\D/g, "")) ? p.replace(/\D/g, "") : null;

/** Kelompokkan baris pesan (urut terbaru dulu) jadi satu entri per kontak. */
export function groupLeadRows(rows: LeadAggRow[]): LeadContact[] {
	const out = new Map<string, LeadContact>();
	for (const r of rows) {
		const key = r.wa_jid || r.phone || "";
		let c = out.get(key);
		if (!c) {
			c = {
				jid: key,
				phone: null,
				name: null,
				firstAt: r.received_at,
				lastAt: r.received_at,
				count: 0,
				topics: [],
				segment: "private",
				eventDate: null,
				convertedEventId: null,
				convertedAt: null,
				ignored: false,
			};
			c.segment = segmentKey(r.segment);
			out.set(key, c);
		}
		c.count++;
		c.firstAt = r.received_at;
		c.phone ??= realPhone(r.phone);
		c.name ??= r.name?.trim() || null;
		if (!c.topics.includes(r.topic)) c.topics.push(r.topic);
		if (!c.eventDate && /^\d{4}-\d{2}-\d{2}$/.test(r.event_date ?? ""))
			c.eventDate = r.event_date;
		c.convertedEventId ??= r.converted_event_id;
		c.convertedAt ??= r.converted_at;
		if (r.status === "ignored") c.ignored = true;
	}
	return [...out.values()];
}

function eventStage(e: StageEvent): ContactStage {
	const ref = { label: "Lihat acara", href: `/operations/${e.project_id}` };
	if (e.deleted_at || e.status === "cancelled") return { stage: "batal", ref };
	if (!e.payment_status || e.payment_status === "unpaid")
		return { stage: "invoice", ref };
	return { stage: "booking", ref };
}

/**
 * Tahap kontak, langkah paling maju menang:
 * acara terhubung (trigger wa_lead_convert) → batal / tunggu DP / booking;
 * diabaikan → batal; invoice → (acaranya); quotation diterima → tunggu DP;
 * quotation terkirim → quotation; selain itu baru tanya (1 pesan) / ngobrol.
 * Dokumen hanya dihitung kalau dibuat setelah pesan pertama kontak — supaya
 * klien lama yang chat lagi tidak tampil "Booking" dari acara tahun lalu.
 */
export function contactStage(
	c: LeadContact,
	events: Map<string, StageEvent>,
	docs: StageDoc[],
): ContactStage {
	const ev = c.convertedEventId ? events.get(c.convertedEventId) : undefined;
	if (ev) return eventStage(ev);
	if (c.ignored) return { stage: "batal", ref: null };
	const tail = phoneTail(c.phone);
	const mine = docs
		.filter(
			(d) =>
				d.created_at >= c.firstAt &&
				((d.jid && d.jid === c.jid) || (tail && d.tail === tail)),
		)
		.sort((a, b) => b.created_at.localeCompare(a.created_at));
	const inv = mine.find((d) => d.doc_type === "invoice");
	if (inv) {
		const e = inv.event_id ? events.get(inv.event_id) : undefined;
		if (e) return eventStage(e);
		return {
			stage: "invoice",
			ref: { label: inv.doc_number, href: `/finance/dokumen/${inv.id}` },
		};
	}
	const quo = mine.find((d) => d.doc_type === "quotation");
	if (quo)
		return {
			stage: quo.status === "accepted" ? "invoice" : "quotation",
			ref: { label: quo.doc_number, href: `/finance/dokumen/${quo.id}` },
		};
	return { stage: c.count > 1 ? "ngobrol" : "baru", ref: null };
}

export type LeadContactWithStage = LeadContact & ContactStage;

/**
 * Semua kontak + tahapnya, terbaru dulu.
 * ponytail: memuat semua baris pesan (tanpa isi pesan) lalu dikelompokkan di
 * server; ±2.000 baris = 2 halaman PostgREST. Kalau sudah puluhan ribu baris,
 * pindahkan pengelompokan ke view SQL.
 */
export async function loadLeadContacts(
	supabase: SupabaseClient,
): Promise<LeadContactWithStage[]> {
	const [rows, botContacts, docRows] = await Promise.all([
		fetchAllRows<LeadAggRow>(
			(from, to) =>
				supabase
					.from("whatsapp_bot_leads")
					.select(
						"wa_jid, phone, name, topic, status, received_at, segment, event_date, converted_event_id, converted_at",
					)
					.order("received_at", { ascending: false })
					.order("id", { ascending: false })
					.range(from, to),
			"leads per kontak",
		),
		fetchAllRows<{ wa_jid: string; segment: string | null }>(
			(from, to) =>
				supabase
					.from("whatsapp_bot_contacts")
					.select("wa_jid, segment")
					.order("wa_jid")
					.range(from, to),
			"kontak bot",
		),
		fetchAllRows<{
			id: string;
			doc_type: "quotation" | "invoice";
			doc_number: string;
			status: string;
			event_id: string | null;
			created_at: string;
			origin: { wa_jid?: string | null } | null;
			client: { phone?: string | null } | null;
		}>(
			(from, to) =>
				supabase
					.from("documents")
					.select(
						"id, doc_type, doc_number, status, event_id, created_at, origin, client",
					)
					.in("doc_type", ["quotation", "invoice"])
					.in("status", ["sent", "accepted"])
					.order("id")
					.range(from, to),
			"dokumen leads",
		),
	]);

	const contacts = groupLeadRows(rows);
	const segByJid = new Map(botContacts.map((c) => [c.wa_jid, c.segment]));
	for (const c of contacts) {
		const s = segByJid.get(c.jid);
		if (s) c.segment = s;
	}
	const docs: StageDoc[] = docRows.map((d) => ({
		id: d.id,
		doc_type: d.doc_type,
		doc_number: d.doc_number,
		status: d.status,
		event_id: d.event_id,
		created_at: d.created_at,
		jid: d.origin?.wa_jid ?? null,
		tail: phoneTail(d.client?.phone),
	}));

	const eventIds = [
		...new Set(
			[
				...contacts.map((c) => c.convertedEventId),
				...docs.map((d) => d.event_id),
			].filter((x): x is string => Boolean(x)),
		),
	];
	const events = new Map<string, StageEvent>();
	for (let i = 0; i < eventIds.length; i += 200) {
		const { data, error } = await supabase
			.from("events")
			.select("id, project_id, status, payment_status, deleted_at")
			.in("id", eventIds.slice(i, i + 200));
		if (error) throw new Error(`Gagal membaca acara leads: ${error.message}`);
		for (const e of (data ?? []) as StageEvent[]) events.set(e.id, e);
	}

	return contacts.map((c) => ({ ...c, ...contactStage(c, events, docs) }));
}
