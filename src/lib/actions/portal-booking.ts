"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clientIp, getPortalPerson, rateLimit } from "@/lib/portal/auth";
import {
	DetailSchema,
	missingForDp,
	quoteSelection,
	randomCode,
	SelectionSchema,
	validDp,
} from "@/lib/portal/core";
import {
	configNumber,
	loadCatalog,
	loadMyBooking,
	slotAvailable,
} from "@/lib/portal/data";
import { notifyPortalPaymentSubmitted } from "@/lib/portal/notify";
import { createAdminClient } from "@/lib/supabase/admin";

type Fail = { ok: false; error: string };
const BUSY = "Sedang ramai. Coba lagi sebentar lagi, ya.";

/** Cek slot dari halaman booking (publik, tanpa login). */
export async function checkSlot(
	raw: unknown,
): Promise<{ ok: true; available: boolean } | Fail> {
	if (!(await rateLimit(`slot:${await clientIp()}`, 60, 600)))
		return { ok: false, error: BUSY };
	const sel = SelectionSchema.safeParse(raw);
	if (!sel.success) return { ok: false, error: "Pilihan belum lengkap." };
	try {
		return { ok: true, available: await slotAvailable(sel.data) };
	} catch {
		return { ok: false, error: "Gagal cek jadwal. Coba lagi, ya." };
	}
}

const DraftSchema = z.object({
	selection: SelectionSchema,
	consent: z.literal(true, "Persetujuan wajib dicentang"),
	detail: DetailSchema.optional(),
});

/** Simpan pilihan jadi draf (butuh sesi portal). Draf TIDAK mengunci slot. */
export async function createDraftBooking(
	raw: unknown,
): Promise<{ ok: true; code: string } | Fail> {
	const person = await getPortalPerson();
	if (!person)
		return { ok: false, error: "Sesi berakhir. Verifikasi nomor lagi, ya." };
	if (!(await rateLimit(`draft:${person.id}`, 10, 86_400)))
		return { ok: false, error: BUSY };
	const parsed = DraftSchema.safeParse(raw);
	if (!parsed.success)
		return { ok: false, error: parsed.error.issues[0].message };
	const { selection: sel, detail } = parsed.data;

	const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
	if (sel.date <= today)
		return { ok: false, error: "Tanggal acara minimal besok, ya." };
	const catalog = await loadCatalog();
	const q = quoteSelection(sel, catalog.products, catalog.addons);
	if (!q.ok) return q;
	if (!(await slotAvailable(sel)))
		return {
			ok: false,
			error:
				"Yah, slot di tanggal dan jam itu sudah penuh. Coba jam atau tanggal lain, ya.",
		};

	const admin = createAdminClient();
	const [days, terms] = await Promise.all([
		configNumber("booking.lead_expiry_days", 30),
		admin
			.from("system_config")
			.select("value")
			.eq("key", "booking.terms_version")
			.maybeSingle(),
	]);
	for (let attempt = 0; attempt < 3; attempt++) {
		const code = randomCode(6);
		const { data, error } = await admin
			.from("client_bookings")
			.insert({
				public_code: code,
				service_type: sel.category,
				package_hours: sel.hours,
				frame_size: sel.frame,
				unit_count: sel.units,
				addons: sel.addons.map((a) => ({ addon_id: a.id, quantity: a.qty })),
				quoted_total: q.total,
				event_date: sel.date,
				start_time: sel.start,
				end_time: q.end,
				venue_city: sel.city,
				detail: { ...detail, ...(sel.city ? { venue_kota: sel.city } : {}) },
				pdp_consent_at: new Date().toISOString(),
				terms_version: String(terms.data?.value ?? "2026-10-06"),
				expires_at: new Date(Date.now() + days * 86_400_000).toISOString(),
				created_by_person: person.id,
			})
			.select("id")
			.single();
		if (error?.code === "23505") continue; // kode bentrok, ulangi
		if (error)
			return { ok: false, error: "Gagal menyimpan booking. Coba lagi, ya." };
		await admin
			.from("booking_members")
			.insert({ booking_id: data.id, person_id: person.id, role: "pemesan" });
		return { ok: true, code };
	}
	return { ok: false, error: "Gagal menyimpan booking. Coba lagi, ya." };
}

/** Autosave detail acara. Patch: field kosong menghapus isian. */
export async function saveBookingDetail(
	code: string,
	patch: unknown,
): Promise<{ ok: true } | Fail> {
	const person = await getPortalPerson();
	if (!person) return { ok: false, error: "Sesi berakhir. Masuk lagi, ya." };
	const b = await loadMyBooking(person, code);
	if (!b) return { ok: false, error: "Booking tidak ditemukan." };
	if (b.status === "batal" || b.status === "kedaluwarsa")
		return { ok: false, error: "Booking ini sudah tidak aktif." };
	if (!(await rateLimit(`detail:${person.id}`, 120, 600)))
		return { ok: false, error: BUSY };
	const parsed = DetailSchema.safeParse(patch);
	if (!parsed.success) return { ok: false, error: "Isian belum valid." };
	const detail = { ...b.detail, ...parsed.data };
	const { error } = await createAdminClient()
		.from("client_bookings")
		.update({
			detail,
			// Kota ikut dipakai hitung buffer ketersediaan.
			...(parsed.data.venue_kota !== undefined
				? { venue_city: parsed.data.venue_kota || null }
				: {}),
		})
		.eq("id", b.id);
	if (error) return { ok: false, error: "Gagal menyimpan. Coba lagi, ya." };
	return { ok: true };
}

const PROOF_MIME: Record<string, string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
	"image/heic": "heic",
	"image/heif": "heif",
	"application/pdf": "pdf",
};
const PROOF_MAX = 10 * 1024 * 1024;

/**
 * Upload langsung dari browser ke Storage privat lewat signed upload URL
 * (melewati batas body 4,5 MB Vercel). Bucket sendiri menegakkan tipe & ukuran
 * maksimum; di sini dicek lagi sebelum URL diberikan.
 */
export async function requestProofUpload(
	code: string,
	file: { type: string; size: number },
): Promise<{ ok: true; path: string; token: string } | Fail> {
	const person = await getPortalPerson();
	if (!person) return { ok: false, error: "Sesi berakhir. Masuk lagi, ya." };
	const b = await loadMyBooking(person, code);
	if (!b || b.role === "pemilik")
		return { ok: false, error: "Booking tidak ditemukan." };
	const ext = PROOF_MIME[file.type];
	if (!ext)
		return {
			ok: false,
			error: "Format bukti harus foto (JPG/PNG/HEIC) atau PDF.",
		};
	if (file.size <= 0 || file.size > PROOF_MAX)
		return { ok: false, error: "Ukuran file maksimal 10 MB." };
	if (!(await rateLimit(`upload:${person.id}`, 20, 3600)))
		return { ok: false, error: BUSY };
	const path = `bookings/${b.id}/bukti/${crypto.randomUUID()}.${ext}`;
	const { data, error } = await createAdminClient()
		.storage.from("portal-private")
		.createSignedUploadUrl(path);
	if (error || !data)
		return { ok: false, error: "Gagal menyiapkan upload. Coba lagi, ya." };
	return { ok: true, path, token: data.token };
}

const SubmitSchema = z.object({
	amount: z.number().int().positive(),
	bankAccountId: z.uuid(),
	path: z.string().max(300),
});

/** Ajukan DP transfer. Mulai saat ini slot DITAHAN sampai admin memutuskan. */
export async function submitDpTransfer(
	code: string,
	raw: unknown,
): Promise<{ ok: true } | Fail> {
	const person = await getPortalPerson();
	if (!person) return { ok: false, error: "Sesi berakhir. Masuk lagi, ya." };
	const b = await loadMyBooking(person, code);
	if (!b || b.role === "pemilik")
		return { ok: false, error: "Booking tidak ditemukan." };
	if (b.status !== "draft")
		return { ok: false, error: "DP untuk booking ini sudah diajukan." };
	const parsed = SubmitSchema.safeParse(raw);
	if (!parsed.success)
		return { ok: false, error: "Data pembayaran belum lengkap." };
	const { amount, bankAccountId, path } = parsed.data;
	if (!path.startsWith(`bookings/${b.id}/bukti/`))
		return { ok: false, error: "Bukti tidak valid." };

	const missing = missingForDp(b.detail);
	if (missing.length)
		return { ok: false, error: `Lengkapi dulu: ${missing.join(", ")}.` };
	const dpErr = validDp(
		amount,
		b.quoted_total,
		await configNumber("booking.dp_minimum", 500_000),
	);
	if (dpErr) return { ok: false, error: dpErr };

	const admin = createAdminClient();
	const folder = path.slice(0, path.lastIndexOf("/"));
	const { data: files } = await admin.storage
		.from("portal-private")
		.list(folder, { search: path.slice(folder.length + 1) });
	if (!files?.length)
		return {
			ok: false,
			error: "Bukti transfer belum terupload. Coba lagi, ya.",
		};
	const { data: bank } = await admin
		.from("bank_accounts")
		.select("id")
		.eq("id", bankAccountId)
		.eq("is_active", true)
		.eq("account_kind", "bank")
		.maybeSingle();
	if (!bank) return { ok: false, error: "Rekening tujuan tidak valid." };

	if (
		!(await slotAvailable(
			{
				date: b.event_date,
				start: b.start_time?.slice(0, 5) ?? null,
				hours: b.package_hours,
				units: b.unit_count,
				city: b.venue_city,
			},
			b.id,
		))
	)
		return {
			ok: false,
			error:
				"Maaf, slot di tanggal dan jam itu baru saja terisi. Hubungi admin lewat WhatsApp untuk cari jadwal lain, ya.",
		};

	// Pindah status dulu (atomik terhadap pengajuan ganda), baru catat pengajuan.
	const { data: moved } = await admin
		.from("client_bookings")
		.update({ status: "menunggu_konfirmasi" })
		.eq("id", b.id)
		.eq("status", "draft")
		.select("id")
		.maybeSingle();
	if (!moved)
		return { ok: false, error: "DP untuk booking ini sudah diajukan." };
	const { data: sub, error } = await admin
		.from("payment_submissions")
		.insert({
			booking_id: b.id,
			kind: "dp",
			method: "transfer",
			amount,
			bank_account_id: bankAccountId,
			proof_path: path,
			submitted_by: person.id,
		})
		.select("id")
		.single();
	if (error) {
		await admin
			.from("client_bookings")
			.update({ status: "draft" })
			.eq("id", b.id);
		return { ok: false, error: "Gagal mengirim. Coba lagi, ya." };
	}
	await notifyPortalPaymentSubmitted(sub.id);
	revalidatePath(`/akun/booking/${code}`);
	return { ok: true };
}
