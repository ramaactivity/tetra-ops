"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { checkDesignFile, FRAME_SIZES, readPngInfo } from "@/lib/portal/design";
import { syncEventDesignStatus } from "@/lib/portal/design-server";
import { portalUrl, sendClientWa } from "@/lib/portal/notify";
import { r2Delete, r2Get, r2UploadUrl } from "@/lib/storage/r2";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Sisi designer / owner modul desain (DR-031). Iqbal = owner + is_designer,
 * jadi gerbangnya owner-level. Role designer non-owner dibuat saat ada
 * karyawan designer (DR-031).
 */

type Result = { ok: true } | { ok: false; error: string };

async function requireOwnerLevel() {
	const me = await getCurrentUser();
	if (!me || (me.profile.role !== "owner" && me.profile.role !== "super_admin"))
		throw new Error("Forbidden — owner-level only");
	return me;
}

async function loadReq(requestId: string) {
	if (!z.uuid().safeParse(requestId).success) return null;
	const { data } = await createAdminClient()
		.from("design_requests")
		.select("id, booking_id, event_id, spot_no, stage")
		.eq("id", requestId)
		.maybeSingle();
	return data;
}

/** Signed upload URL untuk PNG versi desain (maks 25 MB, batas bucket). */
export async function requestVersionUpload(
	requestId: string,
	size: number,
): Promise<
	{ ok: true; path: string; uploadUrl: string } | { ok: false; error: string }
> {
	await requireOwnerLevel();
	const r = await loadReq(requestId);
	if (!r) return { ok: false, error: "Permintaan desain tidak ditemukan." };
	if (size <= 0 || size > 25 * 1024 * 1024)
		return { ok: false, error: "File maksimal 25 MB." };
	const path = `bookings/${r.booking_id}/desain/${r.id}/versi/${crypto.randomUUID()}.png`;
	return { ok: true, path, uploadUrl: r2UploadUrl(path, "image/png", size) };
}

const VersionSchema = z.object({
	path: z.string().max(300),
	frameSize: z.enum(FRAME_SIZES),
	note: z.string().trim().max(1000).optional(),
	hasTransparency: z.boolean().nullable(),
	boothLayoutId: z.uuid().nullable().optional(),
});

/**
 * Daftarkan PNG yang sudah terupload sebagai versi baru. Ukuran & rasio dicek
 * di server dari header PNG (kontrak Booth §2.3); area transparan dicek di
 * browser dan hanya jadi peringatan.
 */
export async function addDesignVersion(
	requestId: string,
	raw: unknown,
): Promise<Result> {
	const me = await requireOwnerLevel();
	const r = await loadReq(requestId);
	if (!r) return { ok: false, error: "Permintaan desain tidak ditemukan." };
	if (r.stage === "acc")
		return { ok: false, error: "Desain ini sudah di-ACC." };
	const parsed = VersionSchema.safeParse(raw);
	if (!parsed.success) return { ok: false, error: "Data versi belum lengkap." };
	const { path, frameSize, note, hasTransparency, boothLayoutId } = parsed.data;
	if (!path.startsWith(`bookings/${r.booking_id}/desain/${r.id}/versi/`))
		return { ok: false, error: "File tidak valid." };

	const admin = createAdminClient();
	const head = await r2Get(path, 4096);
	if (!head) return { ok: false, error: "File belum terupload." };
	const info = readPngInfo(head.bytes);
	if (!info) {
		await r2Delete([path]);
		return {
			ok: false,
			error: "File harus PNG (overlay dengan kotak foto transparan).",
		};
	}
	const check = checkDesignFile(frameSize, info.width, info.height);
	if (!check.ok) {
		await r2Delete([path]);
		return { ok: false, error: check.error };
	}

	const { data: last } = await admin
		.from("design_versions")
		.select("version_no")
		.eq("request_id", r.id)
		.order("version_no", { ascending: false })
		.limit(1)
		.maybeSingle();
	const versionNo = (last?.version_no ?? 0) + 1;
	const { error } = await admin.from("design_versions").insert({
		request_id: r.id,
		version_no: versionNo,
		file_path: path,
		frame_size: frameSize,
		orientation: check.orientation,
		width: info.width,
		height: info.height,
		has_transparency: hasTransparency ?? info.hasAlphaChannel,
		booth_layout_id: boothLayoutId ?? null,
		note: note || null,
		uploaded_by: me.profile.id,
	});
	if (error) return { ok: false, error: error.message };
	await admin
		.from("design_requests")
		.update({ stage: "menunggu_review" })
		.eq("id", r.id);
	await syncEventDesignStatus(r.event_id);

	// Kabari yang mengurus desain: pemilik acara / WO; kalau tidak ada, pemesan.
	const { data: b } = await admin
		.from("client_bookings")
		.select(
			"public_code, detail, members:booking_members(role, person:portal_people!booking_members_person_id_fkey(name, phone))",
		)
		.eq("id", r.booking_id)
		.single();
	const members = (b?.members ?? []) as unknown as Array<{
		role: string;
		person: { name: string | null; phone: string };
	}>;
	const targets = members.filter((m) => m.role !== "pemesan");
	for (const m of targets.length ? targets : members)
		await sendClientWa(
			m.person.phone,
			`Halo ${m.person.name ?? ""}! Draf desain frame v${versionNo} untuk ${(b?.detail as { nama_acara?: string })?.nama_acara ?? "acara kamu"} sudah siap 🎨\n\nCek, beri komentar, minta revisi, atau ACC di sini: ${portalUrl(b?.public_code)}`,
		);
	revalidatePath("/design/portal");
	return { ok: true };
}

export async function adminCommentDesign(
	requestId: string,
	body: string,
): Promise<Result> {
	const me = await requireOwnerLevel();
	const r = await loadReq(requestId);
	const text = body.trim();
	if (!r || !text) return { ok: false, error: "Komentar kosong." };
	await createAdminClient()
		.from("design_comments")
		.insert({
			request_id: r.id,
			author_user: me.profile.id,
			body: text.slice(0, 2000),
		});
	revalidatePath("/design/portal");
	return { ok: true };
}

/** Designer mulai mengerjakan tanpa menunggu brief (mis. brief lewat WA). */
export async function startDesignWork(requestId: string): Promise<Result> {
	await requireOwnerLevel();
	const r = await loadReq(requestId);
	if (!r || r.stage !== "brief")
		return { ok: false, error: "Tidak bisa diubah." };
	await createAdminClient()
		.from("design_requests")
		.update({ stage: "dikerjakan" })
		.eq("id", r.id);
	await syncEventDesignStatus(r.event_id);
	revalidatePath("/design/portal");
	return { ok: true };
}

// ── Katalog template ────────────────────────────────────────────────────────

const PREVIEW_MIME: Record<string, string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
};

export async function requestTemplatePreviewUpload(file: {
	type: string;
	size: number;
}): Promise<
	{ ok: true; path: string; uploadUrl: string } | { ok: false; error: string }
> {
	await requireOwnerLevel();
	const ext = PREVIEW_MIME[file.type];
	if (!ext) return { ok: false, error: "Pratinjau harus JPG/PNG/WebP." };
	if (file.size <= 0 || file.size > 25 * 1024 * 1024)
		return { ok: false, error: "Maksimal 25 MB." };
	const path = `templates/${crypto.randomUUID()}.${ext}`;
	return { ok: true, path, uploadUrl: r2UploadUrl(path, file.type, file.size) };
}

const TemplateSchema = z.object({
	name: z.string().trim().min(2).max(80),
	category: z.string().trim().max(40).optional(),
	frameSize: z.enum(FRAME_SIZES),
	orientation: z.enum(["portrait", "landscape"]),
	previewPath: z.string().startsWith("templates/").max(200),
	textMode: z.enum(["native", "baked"]).default("baked"),
	slotCount: z.number().int().min(0).max(12).optional(),
	boothLayoutId: z.union([z.uuid(), z.literal("")]).optional(),
	boothPresetId: z.string().trim().max(60).optional(),
});

/** Template manual (PNG overlay, biasanya teks bawaan). Ukuran dicek dari header PNG. */
export async function createDesignTemplate(raw: unknown): Promise<Result> {
	await requireOwnerLevel();
	const p = TemplateSchema.safeParse(raw);
	if (!p.success) return { ok: false, error: p.error.issues[0].message };
	if (p.data.previewPath.endsWith(".png")) {
		const head = await r2Get(p.data.previewPath, 4096);
		const info = head ? readPngInfo(head.bytes) : null;
		const check = info
			? checkDesignFile(p.data.frameSize, info.width, info.height)
			: null;
		if (!check?.ok) {
			await r2Delete([p.data.previewPath]);
			return {
				ok: false,
				error: check && !check.ok ? check.error : "File belum terupload.",
			};
		}
	}
	const { error } = await createAdminClient()
		.from("design_templates")
		.insert({
			name: p.data.name,
			category: p.data.category || null,
			frame_size: p.data.frameSize,
			orientation: p.data.orientation,
			preview_path: p.data.previewPath,
			text_mode: p.data.textMode,
			slot_count: p.data.slotCount ?? null,
			source: "manual",
			booth_layout_id: p.data.boothLayoutId || null,
			booth_preset_id: p.data.boothPresetId || null,
		});
	if (error) return { ok: false, error: error.message };
	revalidatePath("/design/templates");
	return { ok: true };
}

export async function setDesignTemplateActive(
	id: string,
	active: boolean,
): Promise<Result> {
	return updateDesignTemplate(id, { is_active: active });
}

const PatchSchema = z
	.object({
		name: z.string().trim().min(2).max(80),
		category: z.string().trim().max(40).nullable(),
		is_active: z.boolean(),
		featured: z.boolean(),
		sort: z.number().int().min(-9999).max(9999),
	})
	.partial();

/** Kurasi etalase: tampil/tidak, unggulan, tema, urutan, nama. */
export async function updateDesignTemplate(
	id: string,
	raw: unknown,
): Promise<Result> {
	await requireOwnerLevel();
	if (!z.uuid().safeParse(id).success)
		return { ok: false, error: "Template tidak ditemukan." };
	const p = PatchSchema.safeParse(raw);
	if (!p.success) return { ok: false, error: p.error.issues[0].message };
	const { error } = await createAdminClient()
		.from("design_templates")
		.update({
			...p.data,
			...(p.data.category !== undefined
				? { category: p.data.category || null }
				: {}),
			updated_at: new Date().toISOString(),
		})
		.eq("id", id);
	if (error) return { ok: false, error: error.message };
	revalidatePath("/design/templates");
	return { ok: true };
}

/**
 * Hapus template manual. Yang sudah pernah dipilih klien atau berasal dari
 * Booth tidak dihapus — cukup disembunyikan (riwayat desain tetap utuh).
 */
export async function deleteDesignTemplate(
	id: string,
): Promise<Result & { hidden?: boolean }> {
	await requireOwnerLevel();
	if (!z.uuid().safeParse(id).success)
		return { ok: false, error: "Template tidak ditemukan." };
	const admin = createAdminClient();
	const { data: t } = await admin
		.from("design_templates")
		.select("source, preview_path")
		.eq("id", id)
		.maybeSingle();
	if (!t) return { ok: false, error: "Template tidak ditemukan." };
	const { count } = await admin
		.from("design_requests")
		.select("id", { count: "exact", head: true })
		.eq("template_id", id);
	if (t.source === "booth" || (count ?? 0) > 0) {
		await admin
			.from("design_templates")
			.update({ is_active: false })
			.eq("id", id);
		revalidatePath("/design/templates");
		return { ok: true, hidden: true };
	}
	const { error } = await admin.from("design_templates").delete().eq("id", id);
	if (error) return { ok: false, error: error.message };
	if (t.preview_path) await r2Delete([t.preview_path as string]);
	revalidatePath("/design/templates");
	return { ok: true };
}

const BoothTemplate = z.object({
	id: z.uuid(),
	version: z.number().int().optional(),
	name: z.string().min(1).max(200),
	frame_size: z.enum(FRAME_SIZES),
	orientation: z.enum(["portrait", "landscape"]),
	category: z.string().max(60).nullish(),
	text_mode: z.enum(["native", "baked"]).catch("native"),
	slot_count: z.number().int().nullish(),
	text_fields: z.array(z.string().max(40)).max(20).catch([]),
	preview_url: z.url(),
	archived: z.boolean().catch(false),
});

/**
 * Tarik katalog template dari Booth (GET /api/ops/templates, papan
 * OPS-BOOTH-SYNC 2026-10-09). Booth = studio; data desain (nama, ukuran, tema,
 * mode teks, pratinjau) ikut Booth, kurasi etalase (tampil, unggulan, urutan)
 * tetap milik Ops. Template baru langsung tampil.
 */
export async function syncBoothTemplates(): Promise<
	{ ok: true; note: string } | { ok: false; error: string }
> {
	await requireOwnerLevel();
	const url = process.env.TETRA_BOOTH_URL;
	const token = process.env.TETRA_BOOTH_API_TOKEN;
	if (!url || !token)
		return { ok: false, error: "Koneksi ke Booth belum diatur." };
	let list: unknown;
	try {
		const res = await fetch(`${url.replace(/\/$/, "")}/api/ops/templates`, {
			headers: { Authorization: `Bearer ${token}` },
			cache: "no-store",
			signal: AbortSignal.timeout(15000),
		});
		if (res.status === 404)
			return {
				ok: false,
				error:
					"Katalog template Booth belum tersedia. Sesi Booth sedang menyiapkannya.",
			};
		if (!res.ok) return { ok: false, error: `Booth menjawab ${res.status}.` };
		list = ((await res.json()) as { templates?: unknown }).templates;
	} catch {
		return { ok: false, error: "Booth tidak bisa dihubungi. Coba lagi nanti." };
	}
	if (!Array.isArray(list))
		return { ok: false, error: "Format katalog Booth tidak dikenali." };

	const admin = createAdminClient();
	const now = new Date().toISOString();
	let baru = 0;
	let diperbarui = 0;
	let dilewati = 0;
	const { data: existing } = await admin
		.from("design_templates")
		.select("id, booth_layout_id")
		.eq("source", "booth");
	const byLayout = new Map(
		(existing ?? []).map((e) => [e.booth_layout_id as string, e.id as string]),
	);
	for (const raw of list) {
		const p = BoothTemplate.safeParse(raw);
		if (!p.success) {
			dilewati++;
			continue;
		}
		const t = p.data;
		const data = {
			name: t.name,
			frame_size: t.frame_size,
			orientation: t.orientation,
			category: t.category ?? null,
			text_mode: t.text_mode,
			text_fields: t.text_fields,
			slot_count: t.slot_count ?? null,
			preview_url: t.preview_url,
			booth_layout_version: t.version ?? null,
			booth_archived: t.archived,
			synced_at: now,
			updated_at: now,
		};
		const id = byLayout.get(t.id);
		if (id) {
			await admin.from("design_templates").update(data).eq("id", id);
			diperbarui++;
		} else if (!t.archived) {
			await admin
				.from("design_templates")
				.insert({ ...data, source: "booth", booth_layout_id: t.id });
			baru++;
		}
	}
	revalidatePath("/design/templates");
	return {
		ok: true,
		note: `${baru} template baru, ${diperbarui} diperbarui${dilewati ? `, ${dilewati} dilewati (format tidak cocok)` : ""}.`,
	};
}
