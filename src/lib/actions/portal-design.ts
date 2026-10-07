"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getPortalPerson, rateLimit } from "@/lib/portal/auth";
import { configNumber, loadMyBooking } from "@/lib/portal/data";
import { revisionLeft } from "@/lib/portal/design";
import {
	approveFromPortal,
	notifyDesigner,
	syncEventDesignStatus,
} from "@/lib/portal/design-server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Desain frame dari sisi klien (DR-031). Semua anggota booking boleh mengisi
 * brief, berkomentar, minta revisi, dan ACC — pembagian peran cukup di UI.
 */

type Fail = { ok: false; error: string };
const BUSY = "Sedang ramai. Coba lagi sebentar lagi, ya.";

type Req = {
	id: string;
	event_id: string;
	stage: string;
	revision_count: number;
	booking_id: string;
};

type Mine =
	| { error: string }
	| {
			person: NonNullable<Awaited<ReturnType<typeof getPortalPerson>>>;
			booking: NonNullable<Awaited<ReturnType<typeof loadMyBooking>>>;
			req: Req;
	  };

async function myRequest(code: string, requestId: string): Promise<Mine> {
	const person = await getPortalPerson();
	if (!person) return { error: "Sesi berakhir. Masuk lagi, ya." };
	const b = await loadMyBooking(person, code);
	if (!b || b.status !== "resmi" || !z.uuid().safeParse(requestId).success)
		return { error: "Desain dibuka setelah DP diterima." };
	const { data } = await createAdminClient()
		.from("design_requests")
		.select("id, event_id, stage, revision_count, booking_id")
		.eq("id", requestId)
		.eq("booking_id", b.id)
		.maybeSingle();
	if (!data) return { error: "Permintaan desain tidak ditemukan." };
	return { person, booking: b, req: data as Req };
}

const BriefSchema = z.object({
	mode: z.enum(["template", "custom"]),
	templateId: z.uuid().nullable().optional(),
	brief: z
		.object({
			tema: z.string().trim().max(120).optional(),
			warna: z.string().trim().max(120).optional(),
			teks_frame: z.string().trim().max(160).optional(),
			tanggal_frame: z.string().trim().max(60).optional(),
			catatan: z.string().trim().max(1000).optional(),
		})
		.default({}),
});

/** Simpan pilihan template / brief custom. Boleh diubah selama belum dikirim. */
export async function saveDesignBrief(
	code: string,
	requestId: string,
	raw: unknown,
): Promise<{ ok: true } | Fail> {
	const r = await myRequest(code, requestId);
	if ("error" in r) return { ok: false, error: r.error };
	if (r.req.stage !== "brief")
		return { ok: false, error: "Brief sudah dikirim ke designer." };
	if (!(await rateLimit(`brief:${r.person.id}`, 120, 600)))
		return { ok: false, error: BUSY };
	const parsed = BriefSchema.safeParse(raw);
	if (!parsed.success) return { ok: false, error: "Isian brief belum valid." };
	const { mode, templateId, brief } = parsed.data;
	const { error } = await createAdminClient()
		.from("design_requests")
		.update({
			mode,
			template_id: mode === "template" ? (templateId ?? null) : null,
			brief,
		})
		.eq("id", r.req.id);
	return error
		? { ok: false, error: "Gagal menyimpan. Coba lagi, ya." }
		: { ok: true };
}

/** Kirim brief ke designer → tahap "sedang didesain". */
export async function submitDesignBrief(
	code: string,
	requestId: string,
): Promise<{ ok: true } | Fail> {
	const r = await myRequest(code, requestId);
	if ("error" in r) return { ok: false, error: r.error };
	const admin = createAdminClient();
	const { data: cur } = await admin
		.from("design_requests")
		.select("mode, template_id")
		.eq("id", r.req.id)
		.single();
	if (!cur?.mode)
		return {
			ok: false,
			error: "Pilih template atau isi brief custom dulu, ya.",
		};
	if (cur.mode === "template" && !cur.template_id)
		return { ok: false, error: "Pilih salah satu template dulu, ya." };
	const { data: moved } = await admin
		.from("design_requests")
		.update({
			stage: "dikerjakan",
			brief_submitted_at: new Date().toISOString(),
		})
		.eq("id", r.req.id)
		.eq("stage", "brief")
		.select("id")
		.maybeSingle();
	if (!moved) return { ok: false, error: "Brief sudah dikirim." };
	await syncEventDesignStatus(r.req.event_id);
	await notifyDesigner(
		r.req.event_id,
		"Brief desain masuk",
		`${r.booking.detail.nama_acara ?? r.booking.public_code} — ${cur.mode === "template" ? "pilih template" : "desain custom"}`,
	);
	revalidatePath(`/akun/booking/${code}`);
	return { ok: true };
}

const FILE_MIME: Record<string, string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
	"image/heic": "heic",
	"image/heif": "heif",
	"application/pdf": "pdf",
};

/** Upload referensi / logo langsung ke Storage privat (signed upload URL). */
export async function requestDesignFileUpload(
	code: string,
	requestId: string,
	file: { type: string; size: number },
): Promise<{ ok: true; path: string; token: string } | Fail> {
	const r = await myRequest(code, requestId);
	if ("error" in r) return { ok: false, error: r.error };
	const ext = FILE_MIME[file.type];
	if (!ext)
		return { ok: false, error: "Format harus gambar (JPG/PNG/HEIC) atau PDF." };
	if (file.size <= 0 || file.size > 25 * 1024 * 1024)
		return { ok: false, error: "Ukuran file maksimal 25 MB." };
	if (!(await rateLimit(`dfile:${r.person.id}`, 30, 3600)))
		return { ok: false, error: BUSY };
	const path = `bookings/${r.booking.id}/desain/${r.req.id}/klien/${crypto.randomUUID()}.${ext}`;
	const { data, error } = await createAdminClient()
		.storage.from("portal-private")
		.createSignedUploadUrl(path);
	if (error || !data)
		return { ok: false, error: "Gagal menyiapkan upload. Coba lagi, ya." };
	return { ok: true, path, token: data.token };
}

export async function addDesignFile(
	code: string,
	requestId: string,
	raw: { kind: string; path: string; name: string },
): Promise<{ ok: true } | Fail> {
	const r = await myRequest(code, requestId);
	if ("error" in r) return { ok: false, error: r.error };
	const kind = raw.kind === "logo" ? "logo" : "referensi";
	const prefix = `bookings/${r.booking.id}/desain/${r.req.id}/klien/`;
	if (!raw.path.startsWith(prefix))
		return { ok: false, error: "File tidak valid." };
	const admin = createAdminClient();
	const { data: files } = await admin.storage
		.from("portal-private")
		.list(prefix.slice(0, -1), { search: raw.path.slice(prefix.length) });
	if (!files?.length)
		return { ok: false, error: "File belum terupload. Coba lagi, ya." };
	await admin.from("design_files").insert({
		request_id: r.req.id,
		kind,
		path: raw.path,
		file_name: raw.name.slice(0, 120),
		uploaded_by: r.person.id,
	});
	revalidatePath(`/akun/booking/${code}`);
	return { ok: true };
}

const CommentSchema = z.object({
	versionId: z.uuid().nullable(),
	body: z.string().trim().min(1).max(2000),
});

export async function commentDesign(
	code: string,
	requestId: string,
	raw: unknown,
): Promise<{ ok: true } | Fail> {
	const r = await myRequest(code, requestId);
	if ("error" in r) return { ok: false, error: r.error };
	const parsed = CommentSchema.safeParse(raw);
	if (!parsed.success) return { ok: false, error: "Komentar kosong." };
	if (!(await rateLimit(`dcomment:${r.person.id}`, 60, 600)))
		return { ok: false, error: BUSY };
	await createAdminClient().from("design_comments").insert({
		request_id: r.req.id,
		version_id: parsed.data.versionId,
		author_person: r.person.id,
		body: parsed.data.body,
	});
	revalidatePath(`/akun/booking/${code}`);
	return { ok: true };
}

/** Minta revisi versi terbaru (wajib komentar). Dibatasi design.revision_limit. */
export async function requestDesignRevision(
	code: string,
	requestId: string,
	raw: unknown,
): Promise<{ ok: true } | Fail> {
	const r = await myRequest(code, requestId);
	if ("error" in r) return { ok: false, error: r.error };
	if (r.req.stage !== "menunggu_review")
		return { ok: false, error: "Belum ada draf baru untuk direvisi." };
	const parsed = CommentSchema.safeParse(raw);
	if (!parsed.success || !parsed.data.versionId)
		return { ok: false, error: "Tulis apa yang perlu diubah, ya." };
	const limit = await configNumber("design.revision_limit", 3);
	if (revisionLeft(r.req.revision_count, limit) <= 0)
		return {
			ok: false,
			error: `Jatah revisi (${limit}x) sudah habis. ACC desain ini, atau hubungi admin lewat WhatsApp untuk revisi tambahan.`,
		};
	const admin = createAdminClient();
	const { data: moved } = await admin
		.from("design_requests")
		.update({ stage: "revisi", revision_count: r.req.revision_count + 1 })
		.eq("id", r.req.id)
		.eq("stage", "menunggu_review")
		.select("id")
		.maybeSingle();
	if (!moved)
		return {
			ok: false,
			error: "Status desain sudah berubah. Muat ulang halaman, ya.",
		};
	await admin.from("design_comments").insert({
		request_id: r.req.id,
		version_id: parsed.data.versionId,
		author_person: r.person.id,
		body: parsed.data.body,
		is_revision_request: true,
	});
	await notifyDesigner(
		r.req.event_id,
		`Revisi desain diminta (${r.req.revision_count + 1}/${limit})`,
		`${r.booking.detail.nama_acara ?? r.booking.public_code}: ${parsed.data.body.slice(0, 200)}`,
	);
	revalidatePath(`/akun/booking/${code}`);
	return { ok: true };
}

/** ACC versi ini. Kalau semua spot sudah ACC, event ikut disetujui (gerbang ukuran). */
export async function approveDesignVersion(
	code: string,
	requestId: string,
	versionId: string,
): Promise<{ ok: true; eventApproved: boolean } | Fail> {
	const r = await myRequest(code, requestId);
	if ("error" in r) return { ok: false, error: r.error };
	if (r.req.stage !== "menunggu_review")
		return { ok: false, error: "Tidak ada draf yang menunggu ACC." };
	const admin = createAdminClient();
	const { data: v } = await admin
		.from("design_versions")
		.select("id")
		.eq("id", versionId)
		.eq("request_id", r.req.id)
		.maybeSingle();
	if (!v) return { ok: false, error: "Versi desain tidak ditemukan." };
	const { data: latest } = await admin
		.from("design_versions")
		.select("id")
		.eq("request_id", r.req.id)
		.order("version_no", { ascending: false })
		.limit(1)
		.single();
	if (latest?.id !== v.id)
		return { ok: false, error: "ACC hanya untuk versi terbaru." };
	await admin
		.from("design_requests")
		.update({
			stage: "acc",
			approved_version_id: v.id,
			approved_at: new Date().toISOString(),
		})
		.eq("id", r.req.id)
		.eq("stage", "menunggu_review");
	const res = await approveFromPortal(r.req.event_id);
	if (!res.approved) await syncEventDesignStatus(r.req.event_id);
	revalidatePath(`/akun/booking/${code}`);
	return { ok: true, eventApproved: res.approved };
}
