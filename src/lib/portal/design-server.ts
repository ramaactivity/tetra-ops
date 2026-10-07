import "server-only";

import { ensureEventCategoryFolderInternal } from "@/lib/actions/drive";
import { isDriveConfigured, uploadFileToFolder } from "@/lib/drive/client";
import { buildDesignName } from "@/lib/drive/naming";
import { eventSpots, spotsNeedingOwnDesign } from "@/lib/events/spots";
import { designStatusFor, type Stage } from "@/lib/portal/design";
import { createAdminClient } from "@/lib/supabase/admin";
import { tgEscape } from "@/lib/telegram/client";
import {
	notifyTelegramDesignApproved,
	sendToOwnerGroup,
} from "@/lib/telegram/notify";

/**
 * Bagian server modul desain yang dipakai portal klien & antrean designer
 * (DR-031). File di bucket portal-private; URL ke browser selalu signed.
 */

const BUCKET = "portal-private";
const appUrl = () =>
	process.env.NEXT_PUBLIC_APP_URL ?? "https://tetra-ops-lac.vercel.app";

type EventForDesign = {
	id: string;
	project_id: string;
	client_name: string | null;
	event_date: string;
	frame_size: string | null;
	unit_count: number | null;
	spots: unknown;
	design_status: string | null;
	design_brief_at: string | null;
};

const EVENT_COLS =
	"id, project_id, client_name, event_date, frame_size, unit_count, spots, design_status, design_brief_at";

async function loadEvent(eventId: string): Promise<EventForDesign | null> {
	const { data } = await createAdminClient()
		.from("events")
		.select(EVENT_COLS)
		.eq("id", eventId)
		.maybeSingle();
	return (data as EventForDesign) ?? null;
}

/** Spot yang butuh desain sendiri: spot 1 + spot berukuran beda. */
export function designSpots(
	ev: EventForDesign,
): Array<{ spot: number; size: string | null }> {
	return [
		{ spot: 1, size: ev.frame_size },
		...spotsNeedingOwnDesign(ev).map((o) => ({ spot: o.spot, size: o.size })),
	];
}

/** Buat baris permintaan desain yang belum ada (idempoten, spot_no stabil). */
export async function ensureDesignRequests(
	bookingId: string,
	eventId: string,
): Promise<void> {
	const ev = await loadEvent(eventId);
	if (!ev) return;
	const admin = createAdminClient();
	const { data: designers } = await admin
		.from("users")
		.select("id")
		.eq("is_designer", true)
		.eq("is_active", true)
		.limit(1);
	await admin.from("design_requests").upsert(
		designSpots(ev).map((s) => ({
			booking_id: bookingId,
			event_id: eventId,
			spot_no: s.spot,
			designer_user_id: designers?.[0]?.id ?? null,
		})),
		{ onConflict: "event_id,spot_no", ignoreDuplicates: true },
	);
}

export async function signedUrl(
	path: string | null,
	seconds = 3600,
): Promise<string | null> {
	if (!path) return null;
	const { data } = await createAdminClient()
		.storage.from(BUCKET)
		.createSignedUrl(path, seconds);
	return data?.signedUrl ?? null;
}

export async function signedUrls(
	paths: string[],
	seconds = 3600,
): Promise<Map<string, string>> {
	if (paths.length === 0) return new Map();
	const { data } = await createAdminClient()
		.storage.from(BUCKET)
		.createSignedUrls(paths, seconds);
	const m = new Map<string, string>();
	for (const d of data ?? [])
		if (d.path && d.signedUrl) m.set(d.path, d.signedUrl);
	return m;
}

export type DesignVersion = {
	id: string;
	version_no: number;
	file_path: string;
	frame_size: string;
	orientation: string;
	width: number;
	height: number;
	has_transparency: boolean | null;
	note: string | null;
	created_at: string;
	url: string | null;
};
export type DesignComment = {
	id: string;
	version_id: string | null;
	body: string;
	is_revision_request: boolean;
	created_at: string;
	author: string;
	fromClient: boolean;
};
export type DesignFile = {
	id: string;
	kind: string;
	file_name: string | null;
	url: string | null;
};
export type DesignRequestView = {
	id: string;
	spot_no: number;
	size: string | null;
	mode: "template" | "custom" | null;
	template_id: string | null;
	brief: Record<string, string>;
	stage: Stage;
	revision_count: number;
	approved_version_id: string | null;
	versions: DesignVersion[];
	comments: DesignComment[];
	files: DesignFile[];
};

/** Semua permintaan desain sebuah event lengkap dengan versi, komentar, file. */
export async function loadDesignState(
	eventId: string,
): Promise<DesignRequestView[]> {
	const admin = createAdminClient();
	const ev = await loadEvent(eventId);
	if (!ev) return [];
	const { data: reqs } = await admin
		.from("design_requests")
		.select(
			"id, spot_no, mode, template_id, brief, stage, revision_count, approved_version_id",
		)
		.eq("event_id", eventId)
		.order("spot_no");
	const ids = (reqs ?? []).map((r) => r.id);
	if (ids.length === 0) return [];
	const [vRes, cRes, fRes] = await Promise.all([
		admin
			.from("design_versions")
			.select("*")
			.in("request_id", ids)
			.order("version_no", { ascending: false }),
		admin
			.from("design_comments")
			.select(
				"id, request_id, version_id, body, is_revision_request, created_at, person:portal_people(name), user:users(full_name)",
			)
			.in("request_id", ids)
			.order("created_at"),
		admin
			.from("design_files")
			.select("id, request_id, kind, path, file_name")
			.in("request_id", ids)
			.order("created_at"),
	]);
	const urls = await signedUrls([
		...(vRes.data ?? []).map((v) => v.file_path as string),
		...(fRes.data ?? []).map((f) => f.path as string),
	]);
	const sizeOf = new Map(eventSpots(ev).map((s) => [s.spot, s.frame_size]));
	return (reqs ?? []).map((r) => ({
		...(r as Omit<
			DesignRequestView,
			"versions" | "comments" | "files" | "size"
		>),
		brief: (r.brief ?? {}) as Record<string, string>,
		size: sizeOf.get(r.spot_no) ?? null,
		versions: (vRes.data ?? [])
			.filter((v) => v.request_id === r.id)
			.map((v) => ({
				...(v as DesignVersion),
				url: urls.get(v.file_path as string) ?? null,
			})),
		comments: (cRes.data ?? [])
			.filter((c) => c.request_id === r.id)
			.map((c) => {
				const p = c.person as unknown as { name: string | null } | null;
				const u = c.user as unknown as { full_name: string | null } | null;
				return {
					id: c.id,
					version_id: c.version_id,
					body: c.body,
					is_revision_request: c.is_revision_request,
					created_at: c.created_at,
					author: p ? (p.name ?? "Klien") : `${u?.full_name ?? "Tim"} (Tetra)`,
					fromClient: !!p,
				};
			}),
		files: (fRes.data ?? [])
			.filter((f) => f.request_id === r.id)
			.map((f) => ({
				id: f.id,
				kind: f.kind,
				file_name: f.file_name,
				url: urls.get(f.path as string) ?? null,
			})),
	}));
}

/**
 * Ringkas tahap semua permintaan ke events.design_status (belum / proses).
 * Tidak pernah menurunkan "approved" — itu urusan owner di Design Hub.
 */
export async function syncEventDesignStatus(eventId: string): Promise<void> {
	const admin = createAdminClient();
	const ev = await loadEvent(eventId);
	if (!ev || ev.design_status === "approved") return;
	const { data } = await admin
		.from("design_requests")
		.select("stage")
		.eq("event_id", eventId);
	const status = designStatusFor((data ?? []).map((r) => r.stage as Stage));
	const now = new Date().toISOString();
	await admin
		.from("events")
		.update({
			design_status: status,
			...(status === "proses" && !ev.design_brief_at
				? { design_brief_at: now }
				: {}),
		})
		.eq("id", eventId);
}

/**
 * Semua spot sudah di-ACC klien → gerbang ukuran yang sama dengan approveDesign:
 * ukuran file tiap spot HARUS sama dengan pesanan. Cocok → event approved,
 * file final diarsip ke Drive folder Design. Tidak cocok / ukuran pesanan masih
 * menyusul → event tetap "proses" dan owner diminta ACC di Design Hub.
 */
export async function approveFromPortal(
	eventId: string,
): Promise<{ approved: boolean; reason?: string }> {
	const admin = createAdminClient();
	const ev = await loadEvent(eventId);
	if (!ev) return { approved: false, reason: "Event tidak ditemukan" };
	const { data: reqs } = await admin
		.from("design_requests")
		.select(
			"spot_no, stage, approved_version_id, version:design_versions!design_requests_approved_version_fkey(frame_size, file_path)",
		)
		.eq("event_id", eventId);
	if (!reqs?.length || reqs.some((r) => r.stage !== "acc"))
		return { approved: false };

	const need = new Map(designSpots(ev).map((s) => [s.spot, s.size]));
	const mismatch: string[] = [];
	for (const r of reqs) {
		const v = r.version as unknown as {
			frame_size: string;
			file_path: string;
		} | null;
		const want = need.get(r.spot_no);
		if (!want)
			mismatch.push(`spot ${r.spot_no}: ukuran pesanan masih menyusul`);
		else if (v?.frame_size !== want)
			mismatch.push(
				`spot ${r.spot_no}: desain ${v?.frame_size} ≠ pesanan ${want}`,
			);
	}
	if (mismatch.length) {
		await sendToOwnerGroup(
			`🎨 <b>Klien sudah ACC desain</b> ${tgEscape(ev.client_name ?? ev.project_id)}, tapi belum bisa otomatis disetujui:\n${mismatch.map((m) => `• ${tgEscape(m)}`).join("\n")}\nSamakan ukurannya lalu ACC di <a href="${appUrl()}/design/${ev.project_id}">Design Hub</a>.`,
		);
		return { approved: false, reason: mismatch.join("; ") };
	}

	const spot1 = reqs.find((r) => r.spot_no === 1);
	const spot1Frame =
		(spot1?.version as unknown as { frame_size: string } | null)?.frame_size ??
		null;
	const spotSizes = Object.fromEntries(
		reqs
			.filter((r) => r.spot_no > 1)
			.map((r) => [
				String(r.spot_no),
				(r.version as unknown as { frame_size: string }).frame_size,
			]),
	);
	const now = new Date().toISOString();
	const { error } = await admin
		.from("events")
		.update({
			design_status: "approved",
			design_approved_at: now,
			design_approved_by: null, // di-ACC klien lewat portal
			design_frame_size: spot1Frame,
			design_spot_sizes: Object.keys(spotSizes).length ? spotSizes : null,
			...(ev.design_brief_at ? {} : { design_brief_at: now }),
		})
		.eq("id", eventId);
	if (error) return { approved: false, reason: error.message };

	// Arsip file final ke Drive (Design) + catat sebagai aset desain event.
	if (isDriveConfigured()) {
		const folder = await ensureEventCategoryFolderInternal(eventId, "Design");
		for (const r of reqs) {
			const v = r.version as unknown as { file_path: string } | null;
			if (!folder.id || !v) continue;
			try {
				const { data: blob } = await admin.storage
					.from(BUCKET)
					.download(v.file_path);
				if (!blob) continue;
				const name = buildDesignName(
					{
						clientName: ev.client_name ?? "",
						eventDate: ev.event_date,
						originalName: `ACC spot ${r.spot_no}`,
					},
					"png",
				);
				const up = await uploadFileToFolder(
					folder.id,
					name,
					"image/png",
					Buffer.from(await blob.arrayBuffer()),
				);
				await admin.from("event_assets").insert({
					event_id: eventId,
					asset_type: "design_frame",
					label: `Desain ACC klien${r.spot_no > 1 ? ` (spot ${r.spot_no})` : ""}`,
					url: up.webViewLink,
					drive_file_id: up.id,
				});
				await admin
					.from("events")
					.update({ design_drive_folder_url: up.webViewLink })
					.eq("id", eventId);
			} catch (e) {
				console.error("[design] arsip Drive:", e);
			}
		}
	}
	await notifyTelegramDesignApproved(eventId, spot1Frame, "klien (portal)");
	return { approved: true };
}

/** Kabari designer (in-app) + grup owner: ada brief / revisi yang perlu dikerjakan. */
export async function notifyDesigner(
	eventId: string,
	title: string,
	body: string,
): Promise<void> {
	try {
		const admin = createAdminClient();
		const ev = await loadEvent(eventId);
		const { data: designers } = await admin
			.from("users")
			.select("id")
			.eq("is_designer", true)
			.eq("is_active", true);
		const rows = (designers ?? []).map((u) => ({
			user_id: u.id,
			severity: "info",
			category: "operational",
			title,
			body,
			entity_type: "design_request",
			entity_id: eventId,
			action_url: "/design/portal",
		}));
		if (rows.length) await admin.from("notifications").insert(rows);
		await sendToOwnerGroup(
			`🎨 <b>${tgEscape(title)}</b>\n${tgEscape(ev?.client_name ?? "")} · ${tgEscape(body)}\n<a href="${appUrl()}/design/portal">Antrean desain</a>`,
		);
	} catch (e) {
		console.error("[design] notify designer:", e);
	}
}
