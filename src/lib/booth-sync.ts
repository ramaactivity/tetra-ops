import "server-only";

import { after } from "next/server";
import { portalBase } from "@/lib/app-url";
import {
	BOOTH_EVENT_SELECT,
	type BoothBooking,
	type BoothDesign,
	type BoothEventRow,
	type BoothModule,
	boothSignature,
	type DesignSource,
	type GuestAddon,
	guestCamFields,
	modulesFor,
	toBoothBooking,
	toBoothDesign,
} from "@/lib/booth-api";
import { r2SignedUrl } from "@/lib/storage/r2";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Sisi server integrasi Ops → Tetra Booth (kontrak docs/INTEGRASI-TETRA-BOOTH.md
 * v0.4 §2.2 & §4). Satu bentuk booking untuk GET /api/booth/bookings dan body
 * webhook, supaya Booth boleh memakai salah satunya.
 */

export type BoothBookingFull = BoothBooking & {
	unit_count: number;
	modules: BoothModule[];
	cancelled: boolean;
	design: BoothDesign;
	portal_url: string | null;
	/** Urutan grup foto pelaminan dari portal klien; null = belum diisi / bukan booking portal. */
	stage_groups: string[] | null;
	/** v0.7: akun Instagram klien (tanpa @) untuk halaman foto tamu. */
	client_instagram: string[] | null;
	/** v0.9: tier Guest Cam (null = tak terbatas atau tidak memesan; lihat modules). */
	guest_cam_max_guests: number | null;
	guest_cam_print: boolean;
	/** v0.9 (aditif dari Ops): ukuran cetak foto tamu 2R | polaroid | 4R. */
	guest_cam_print_size: string | null;
	/** v0.9: id desain kartu QR dari katalog Booth GET /api/guest-cards. */
	guest_card_design: string | null;
};

/** Kolom tambahan di atas BOOTH_EVENT_SELECT — tetap tanpa uang/kontak. */
export const BOOTH_FULL_SELECT = `id, status, unit_count, design_status, design_approved_at, design_frame_size, guest_card_design, ${BOOTH_EVENT_SELECT}`;

type FullRow = BoothEventRow & {
	id: string;
	status: string;
	unit_count: number | null;
	design_status: string | null;
	design_approved_at: string | null;
	design_frame_size: string | null;
	guest_card_design?: string | null;
};

const URL_TTL_SEC = 7 * 86_400;

/** Baris event → bentuk lengkap kontrak (desain, modul, link portal). */
export async function enrichBoothBookings(
	rows: FullRow[],
): Promise<BoothBookingFull[]> {
	if (rows.length === 0) return [];
	const admin = createAdminClient();
	const ids = rows.map((r) => r.id);
	const [reqRes, cbRes, addRes, bonusRes] = await Promise.all([
		admin
			.from("design_requests")
			.select(
				"event_id, spot_no, stage, mode, brief, version:design_versions!design_requests_approved_version_fkey(frame_size, orientation, file_path, booth_layout_id, source), template:design_templates(booth_layout_id, booth_preset_id, booth_layout_version)",
			)
			.in("event_id", ids),
		admin
			.from("client_bookings")
			.select(
				"event_id, public_code, stage_groups:detail->stage_groups, instagram:detail->instagram, card:detail->>guest_card_design",
			)
			.in("event_id", ids),
		admin
			.from("event_addons")
			.select("event_id, addon:addons(addon_group, max_guests, print_size)")
			.in("event_id", ids),
		admin
			.from("event_bonuses")
			.select("event_id, addon:addons(addon_group, max_guests, print_size)")
			.in("event_id", ids),
	]);
	type Req = DesignSource & { event_id: string };
	// to-one embeds → object.
	const reqs = (reqRes.data ?? []) as unknown as Req[];
	const approvedPaths = reqs
		.filter((r) => r.stage === "acc" && r.version)
		.map((r) => r.version?.file_path as string);
	const urls = new Map(
		approvedPaths.map((p) => [p, r2SignedUrl(p, URL_TTL_SEC)]),
	);
	const expiresAt = new Date(Date.now() + URL_TTL_SEC * 1000).toISOString();
	const insta = new Map(
		(cbRes.data ?? [])
			.filter((c) => Array.isArray(c.instagram) && c.instagram.length)
			.map((c) => [c.event_id as string, c.instagram as string[]]),
	);
	const groups = new Map(
		(cbRes.data ?? [])
			.filter((c) => Array.isArray(c.stage_groups) && c.stage_groups.length)
			.map((c) => [c.event_id as string, c.stage_groups as string[]]),
	);
	const code = new Map(
		(cbRes.data ?? []).map((c) => [
			c.event_id as string,
			c.public_code as string,
		]),
	);

	// to-one embed → object.
	const guestAddons = new Map<string, GuestAddon[]>();
	for (const a of [...(addRes.data ?? []), ...(bonusRes.data ?? [])]) {
		const g = a.addon as unknown as GuestAddon | null;
		if (g?.addon_group)
			guestAddons.set(a.event_id, [...(guestAddons.get(a.event_id) ?? []), g]);
	}
	const cards = new Map(
		(cbRes.data ?? [])
			.filter((c) => typeof c.card === "string" && c.card)
			.map((c) => [c.event_id as string, c.card as string]),
	);

	return rows.map((r) => ({
		...toBoothBooking(r),
		unit_count: Math.min(3, Math.max(1, Number(r.unit_count ?? 1))),
		modules: modulesFor(r.service_type, guestAddons.get(r.id)),
		...guestCamFields(guestAddons.get(r.id) ?? []),
		guest_card_design: r.guest_card_design ?? cards.get(r.id) ?? null,
		cancelled: r.status === "cancelled",
		design: toBoothDesign(
			r,
			reqs.filter((q) => q.event_id === r.id),
			(p) => urls.get(p) ?? null,
			expiresAt,
		),
		stage_groups: groups.get(r.id) ?? null,
		client_instagram: insta.get(r.id) ?? null,
		portal_url: code.has(r.id)
			? `${portalBase()}/akun/booking/${code.get(r.id)}`
			: null,
	}));
}

// ── Webhook keluar (§4) ─────────────────────────────────────────────────────

export type BoothEventKind =
	| "booking.confirmed"
	| "booking.updated"
	| "booking.cancelled"
	| "design.approved";

export function boothWebhookOn(): boolean {
	return (
		!!process.env.TETRA_BOOTH_URL && !!process.env.TETRA_BOOTH_WEBHOOK_SECRET
	);
}

/**
 * Catat & kirim satu kabar ke Booth. Mati diam-diam kalau env kosong. Tidak
 * pernah throw: kegagalan kirim tidak boleh menggagalkan aksi pemicunya.
 * Pengiriman berjalan setelah respons (after) — langsung, +1 dtk, +5 dtk;
 * sisanya disapu cron harian (sweepBoothOutbox) selama 7 hari.
 */
export async function emitBoothEvent(
	kind: BoothEventKind,
	eventId: string,
): Promise<void> {
	if (!boothWebhookOn()) return;
	try {
		const admin = createAdminClient();
		const { data: ev } = await admin
			.from("events")
			.select(BOOTH_FULL_SELECT)
			.eq("id", eventId)
			.eq("is_migrated_legacy", false)
			.eq("is_demo", false) // Mode Demo tidak pernah dikirim ke Booth
			.maybeSingle();
		if (!ev) return;
		const [booking] = await enrichBoothBookings([ev as unknown as FullRow]);
		if (kind === "booking.cancelled") booking.cancelled = true; // termasuk event yang dihapus
		const { data: row, error } = await admin
			.from("booth_webhook_outbox")
			.insert({
				event: kind,
				event_id: eventId,
				payload: {
					event: kind,
					occurred_at: new Date().toISOString(),
					booking,
				},
			})
			.select("id")
			.single();
		if (error || !row) return console.error("[booth] outbox:", error?.message);
		after(async () => {
			for (const wait of [0, 1000, 5000]) {
				if (wait) await new Promise((r) => setTimeout(r, wait));
				if (await deliverBoothWebhook(row.id)) return;
			}
		});
	} catch (e) {
		console.error("[booth] emit:", e);
	}
}

/** Kirim satu baris outbox. true = terkirim (2xx). */
export async function deliverBoothWebhook(id: string): Promise<boolean> {
	const url = process.env.TETRA_BOOTH_URL;
	const secret = process.env.TETRA_BOOTH_WEBHOOK_SECRET;
	if (!url || !secret) return false;
	const admin = createAdminClient();
	const { data: row } = await admin
		.from("booth_webhook_outbox")
		.select("id, delivery_id, event, payload, attempts, delivered_at")
		.eq("id", id)
		.maybeSingle();
	if (!row || row.delivered_at) return !!row?.delivered_at;
	const body = JSON.stringify({
		...(row.payload as object),
		delivery_id: row.delivery_id,
	});
	const t = Math.floor(Date.now() / 1000);
	let status = 0;
	let err: string | null = null;
	try {
		const res = await fetch(
			`${url.replace(/\/$/, "")}/api/webhooks/tetra-ops`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Tetra-Event": row.event,
					"X-Tetra-Delivery": row.delivery_id,
					"X-Tetra-Signature": boothSignature(secret, t, body),
				},
				body,
				signal: AbortSignal.timeout(10_000),
			},
		);
		status = res.status;
		if (!res.ok)
			err =
				(await res.text().catch(() => "")).slice(0, 300) ||
				`HTTP ${res.status}`;
	} catch (e) {
		err = e instanceof Error ? e.message : String(e);
	}
	const ok = status >= 200 && status < 300;
	await admin
		.from("booth_webhook_outbox")
		.update({
			attempts: row.attempts + 1,
			last_status: status || null,
			last_error: ok ? null : err,
			...(ok ? { delivered_at: new Date().toISOString() } : {}),
		})
		.eq("id", row.id);
	return ok;
}

/** Cron harian: coba ulang yang belum terkirim (maks 7 hari, 20 percobaan). */
export async function sweepBoothOutbox(): Promise<{
	retried: number;
	delivered: number;
}> {
	if (!boothWebhookOn()) return { retried: 0, delivered: 0 };
	const { data } = await createAdminClient()
		.from("booth_webhook_outbox")
		.select("id")
		.is("delivered_at", null)
		.lt("attempts", 20)
		.gte("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString())
		.order("created_at")
		.limit(50);
	let delivered = 0;
	for (const r of data ?? []) if (await deliverBoothWebhook(r.id)) delivered++;
	return { retried: data?.length ?? 0, delivered };
}

// ── Ops membaca Booth (§5) ──────────────────────────────────────────────────

export type BoothEventSummary = {
	id: string;
	name: string;
	event_date: string;
	status: string;
	phase?: "upcoming" | "live" | "done";
	modules?: string[];
	gallery_url: string | null;
	/** Galeri publik tamu (/l/{slug}); null = mati/kedaluwarsa. Usulan Ops 2026-10-10. */
	guest_gallery_url?: string | null;
	guest_expires_at?: string | null;
	client_expires_at: string | null;
	purge_at: string | null;
	session_count?: number;
	photo_count?: number;
	/** Aditif (diminta Ops 2026-10-07): sampul + ≤6 thumbnail, presigned ±1 hari — jangan disimpan. */
	cover_url?: string | null;
	thumbs?: Array<{ url: string; kind?: string }>;
};

/** null = fitur mati / Booth tidak bisa dihubungi (portal menampilkan pesan ramah). */
export async function fetchBoothEvents(
	projectId: string,
): Promise<BoothEventSummary[] | null> {
	const url = process.env.TETRA_BOOTH_URL;
	const token = process.env.TETRA_BOOTH_API_TOKEN;
	if (!url || !token) return null;
	try {
		const res = await fetch(
			`${url.replace(/\/$/, "")}/api/ops/events/${encodeURIComponent(projectId)}`,
			{
				headers: { Authorization: `Bearer ${token}` },
				cache: "no-store",
				signal: AbortSignal.timeout(5000),
			},
		);
		if (!res.ok) return null;
		const json = (await res.json()) as { events?: BoothEventSummary[] };
		return Array.isArray(json.events) ? json.events : [];
	} catch {
		return null;
	}
}

export type GuestCard = {
	id: string;
	name: string;
	/** Keterangan singkat gaya desain (Booth #227). */
	hint?: string;
	/** Pratinjau kartu meja (A6/A5). */
	preview_url: string;
	/** Pratinjau kartu nama 90×55. */
	card_preview_url?: string;
};

/** v0.9: katalog desain kartu QR Guest Cam (publik di Booth, cache 1 jam). [] kalau gagal. */
export async function fetchGuestCards(): Promise<GuestCard[]> {
	const base = (
		process.env.TETRA_BOOTH_URL || "https://booth.tetraphoto.com"
	).replace(/\/$/, "");
	try {
		const res = await fetch(`${base}/api/guest-cards`, {
			next: { revalidate: 3_600 },
			signal: AbortSignal.timeout(4000),
		});
		if (!res.ok) return [];
		const j = (await res.json()) as { designs?: GuestCard[] };
		return (j.designs ?? []).filter((d) => /^[a-z0-9_-]{1,30}$/.test(d.id));
	} catch {
		return [];
	}
}
