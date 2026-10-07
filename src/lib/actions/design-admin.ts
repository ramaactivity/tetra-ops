"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { checkDesignFile, FRAME_SIZES, readPngInfo } from "@/lib/portal/design";
import { syncEventDesignStatus } from "@/lib/portal/design-server";
import { portalUrl, sendClientWa } from "@/lib/portal/notify";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Sisi designer / owner modul desain (DR-031). Iqbal = owner + is_designer,
 * jadi gerbangnya owner-level. Role designer non-owner dibuat saat ada
 * karyawan designer (DR-031).
 */

type Result = { ok: true } | { ok: false; error: string };
const BUCKET = "portal-private";

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
	{ ok: true; path: string; token: string } | { ok: false; error: string }
> {
	await requireOwnerLevel();
	const r = await loadReq(requestId);
	if (!r) return { ok: false, error: "Permintaan desain tidak ditemukan." };
	if (size <= 0 || size > 25 * 1024 * 1024)
		return { ok: false, error: "File maksimal 25 MB." };
	const path = `bookings/${r.booking_id}/desain/${r.id}/versi/${crypto.randomUUID()}.png`;
	const { data, error } = await createAdminClient()
		.storage.from(BUCKET)
		.createSignedUploadUrl(path);
	if (error || !data) return { ok: false, error: "Gagal menyiapkan upload." };
	return { ok: true, path, token: data.token };
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
	const { data: blob } = await admin.storage.from(BUCKET).download(path);
	if (!blob) return { ok: false, error: "File belum terupload." };
	const info = readPngInfo(
		new Uint8Array(await blob.slice(0, 4096).arrayBuffer()),
	);
	if (!info) {
		await admin.storage.from(BUCKET).remove([path]);
		return {
			ok: false,
			error: "File harus PNG (overlay dengan kotak foto transparan).",
		};
	}
	const check = checkDesignFile(frameSize, info.width, info.height);
	if (!check.ok) {
		await admin.storage.from(BUCKET).remove([path]);
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
	{ ok: true; path: string; token: string } | { ok: false; error: string }
> {
	await requireOwnerLevel();
	const ext = PREVIEW_MIME[file.type];
	if (!ext) return { ok: false, error: "Pratinjau harus JPG/PNG/WebP." };
	if (file.size <= 0 || file.size > 10 * 1024 * 1024)
		return { ok: false, error: "Maksimal 10 MB." };
	const path = `templates/${crypto.randomUUID()}.${ext}`;
	const { data, error } = await createAdminClient()
		.storage.from(BUCKET)
		.createSignedUploadUrl(path);
	if (error || !data) return { ok: false, error: "Gagal menyiapkan upload." };
	return { ok: true, path, token: data.token };
}

const TemplateSchema = z.object({
	name: z.string().trim().min(2).max(80),
	category: z.string().trim().max(40).optional(),
	frameSize: z.enum(FRAME_SIZES),
	orientation: z.enum(["portrait", "landscape"]),
	previewPath: z.string().startsWith("templates/").max(200),
	boothLayoutId: z.union([z.uuid(), z.literal("")]).optional(),
	boothPresetId: z.string().trim().max(60).optional(),
});

export async function createDesignTemplate(raw: unknown): Promise<Result> {
	await requireOwnerLevel();
	const p = TemplateSchema.safeParse(raw);
	if (!p.success) return { ok: false, error: p.error.issues[0].message };
	const { error } = await createAdminClient()
		.from("design_templates")
		.insert({
			name: p.data.name,
			category: p.data.category || null,
			frame_size: p.data.frameSize,
			orientation: p.data.orientation,
			preview_path: p.data.previewPath,
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
	await requireOwnerLevel();
	if (!z.uuid().safeParse(id).success)
		return { ok: false, error: "Template tidak ditemukan." };
	await createAdminClient()
		.from("design_templates")
		.update({ is_active: active })
		.eq("id", id);
	revalidatePath("/design/templates");
	return { ok: true };
}
