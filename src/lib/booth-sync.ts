import "server-only";

import { after } from "next/server";
import { appUrl } from "@/lib/app-url";
import {
	BOOTH_EVENT_SELECT,
	type BoothBooking,
	type BoothDesign,
	type BoothEventRow,
	type BoothModule,
	boothSignature,
	type DesignSource,
	modulesFor,
	toBoothBooking,
	toBoothDesign,
} from "@/lib/booth-api";
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
};

/** Kolom tambahan di atas BOOTH_EVENT_SELECT — tetap tanpa uang/kontak. */
export const BOOTH_FULL_SELECT = `id, status, unit_count, design_status, design_approved_at, design_frame_size, ${BOOTH_EVENT_SELECT}`;

type FullRow = BoothEventRow & {
	id: string;
	status: string;
	unit_count: number | null;
	design_status: string | null;
	design_approved_at: string | null;
	design_frame_size: string | null;
};

const URL_TTL_SEC = 7 * 86_400;

/** Baris event → bentuk lengkap kontrak (desain, modul, link portal). */
export async function enrichBoothBookings(
	rows: FullRow[],
): Promise<BoothBookingFull[]> {
	if (rows.length === 0) return [];
	const admin = createAdminClient();
	const ids = rows.map((r) => r.id);
	const [reqRes, cbRes] = await Promise.all([
		admin
			.from("design_requests")
			.select(
				"event_id, spot_no, stage, version:design_versions!design_requests_approved_version_fkey(frame_size, orientation, file_path, booth_layout_id), template:design_templates(booth_layout_id, booth_preset_id)",
			)
			.in("event_id", ids),
		admin
			.from("client_bookings")
			.select("event_id, public_code")
			.in("event_id", ids),
	]);
	type Req = DesignSource & { event_id: string };
	// to-one embeds → object.
	const reqs = (reqRes.data ?? []) as unknown as Req[];
	const approvedPaths = reqs
		.filter((r) => r.stage === "acc" && r.version)
		.map((r) => r.version?.file_path as string);
	const urls = new Map<string, string>();
	if (approvedPaths.length) {
		const { data } = await admin.storage
			.from("portal-private")
			.createSignedUrls(approvedPaths, URL_TTL_SEC);
		for (const d of data ?? [])
			if (d.path && d.signedUrl) urls.set(d.path, d.signedUrl);
	}
	const expiresAt = new Date(Date.now() + URL_TTL_SEC * 1000).toISOString();
	const code = new Map(
		(cbRes.data ?? []).map((c) => [
			c.event_id as string,
			c.public_code as string,
		]),
	);

	return rows.map((r) => ({
		...toBoothBooking(r),
		unit_count: Math.min(3, Math.max(1, Number(r.unit_count ?? 1))),
		modules: modulesFor(r.service_type),
		cancelled: r.status === "cancelled",
		design: toBoothDesign(
			r,
			reqs.filter((q) => q.event_id === r.id),
			(p) => urls.get(p) ?? null,
			expiresAt,
		),
		portal_url: code.has(r.id)
			? `${appUrl()}/akun/booking/${code.get(r.id)}`
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
	client_expires_at: string | null;
	purge_at: string | null;
	session_count?: number;
	photo_count?: number;
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
