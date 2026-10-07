"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { emitBoothEvent } from "@/lib/booth-sync";
import { clientIp, getPortalPerson, rateLimit } from "@/lib/portal/auth";
import {
	DetailSchema,
	daysUntil,
	missingForDp,
	quoteSelection,
	randomCode,
	refundEstimate,
	rescheduleError,
	SelectionSchema,
	validDp,
	withRundownLine,
} from "@/lib/portal/core";
import {
	configNumber,
	loadCatalog,
	loadMyBooking,
	paidBeyondDp,
	slotAvailable,
	vendorForPhone,
} from "@/lib/portal/data";
import {
	notifyPortalPaymentSubmitted,
	notifyPortalRequest,
	portalUrl,
	sendClientWa,
} from "@/lib/portal/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import { isLikelyWaPhone, toWaPhone } from "@/lib/whatsapp";

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
	/** Dipesan oleh WO/vendor untuk kliennya (DR-028). */
	asWo: z.boolean().optional(),
	/** WO: klien pemilik acara (opsional) — diundang sebagai anggota "pemilik". */
	client: z
		.object({
			name: z.string().trim().min(2).max(80),
			phone: z.string().trim().max(20).optional(),
		})
		.optional(),
	/** WO: siapa yang mengurus detail & desain. */
	managedBy: z.enum(["klien", "wo"]).optional(),
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
	const { selection: sel, detail, asWo, client, managedBy } = parsed.data;
	if (asWo && !detail?.wo_nama?.trim() && !(await vendorForPhone(person.phone)))
		return { ok: false, error: "Isi nama usaha WO/vendor kamu dulu, ya." };
	if (client?.phone && !isLikelyWaPhone(client.phone))
		return { ok: false, error: "Nomor WhatsApp klien belum benar." };

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
	const vendor = asWo ? await vendorForPhone(person.phone) : null;
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
				detail: {
					...detail,
					...(sel.city ? { venue_kota: sel.city } : {}),
					...(vendor ? { wo_nama: vendor.name } : {}),
					...(asWo && client
						? { pemilik_nama: client.name, pemilik_wa: client.phone }
						: {}),
				},
				channel: asWo ? "vendor" : "direct",
				vendor_contact_id: vendor?.id ?? null,
				managed_by: asWo ? (managedBy ?? "wo") : "klien",
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
		await admin.from("booking_members").insert({
			booking_id: data.id,
			person_id: person.id,
			role: asWo ? "wo" : "pemesan",
		});
		if (asWo && client?.phone) {
			const phone = toWaPhone(client.phone);
			await addMember(data.id, person.id, phone, client.name, "pemilik");
			await sendClientWa(
				phone,
				`Halo ${client.name}! ${vendor?.name ?? detail?.wo_nama ?? person.name ?? "WO kamu"} sudah memesan photobooth Tetra untuk acara kamu (${sel.date}).\n\nKamu bisa ikut melihat dan melengkapi detailnya di sini (masuk pakai nomor WA ini): ${portalUrl(code)}`,
			);
		}
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
	if (b.event_id) await syncEventDetail(b.event_id, parsed.data);
	return { ok: true };
}

/**
 * Booking sudah jadi event: isian klien yang aman (non-keuangan) ikut
 * memperbarui event, supaya crew & digest memakai data terbaru. Venue master
 * (venue_id) sengaja tidak disentuh — owner yang merapikan.
 */
async function syncEventDetail(
	eventId: string,
	patch: Record<string, unknown>,
) {
	const map: Record<string, string> = {
		nama_acara: "event_title",
		pic_nama: "pic_name",
		pic_wa: "pic_wa",
		venue_nama: "venue_name",
		venue_alamat: "venue_address",
		venue_kota: "venue_city",
		maps_url: "google_maps_url",
	};
	const upd: Record<string, string | null> = {};
	for (const [k, col] of Object.entries(map))
		if (typeof patch[k] === "string")
			upd[col] = (patch[k] as string).trim() || null;
	const admin = createAdminClient();
	// Rundown → satu baris di catatan crew (catatan owner lain tidak disentuh).
	if (Array.isArray(patch.rundown)) {
		const { data: ev } = await admin
			.from("events")
			.select("crew_notes")
			.eq("id", eventId)
			.maybeSingle();
		upd.crew_notes = withRundownLine(
			(ev?.crew_notes as string | null) ?? null,
			patch.rundown as Array<{ jam: string; acara: string }>,
		);
	}
	if (Object.keys(upd).length === 0) return;
	const { error } = await admin.from("events").update(upd).eq("id", eventId);
	if (error) console.error("[portal] sync event:", error.message);
	else await emitBoothEvent("booking.updated", eventId);
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

/** Bukti benar-benar terupload + rekening tujuan sah. null = aman. */
async function checkProofAndBank(
	path: string,
	bankAccountId: string,
): Promise<string | null> {
	const admin = createAdminClient();
	const folder = path.slice(0, path.lastIndexOf("/"));
	const { data: files } = await admin.storage
		.from("portal-private")
		.list(folder, { search: path.slice(folder.length + 1) });
	if (!files?.length) return "Bukti transfer belum terupload. Coba lagi, ya.";
	const { data: bank } = await admin
		.from("bank_accounts")
		.select("id")
		.eq("id", bankAccountId)
		.eq("is_active", true)
		.eq("account_kind", "bank")
		.maybeSingle();
	return bank ? null : "Rekening tujuan tidak valid.";
}

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
	const proofErr = await checkProofAndBank(path, bankAccountId);
	if (proofErr) return { ok: false, error: proofErr };

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

/** Sisa tagihan event (tagihan efektif: potongan langsung vendor sudah dikurangi). */
async function eventRemaining(eventId: string): Promise<number> {
	const { data } = await createAdminClient()
		.from("events")
		.select("remaining_balance")
		.eq("id", eventId)
		.maybeSingle();
	return Number(data?.remaining_balance ?? 0);
}

/** Pelunasan (atau cicilan) lewat transfer untuk booking yang sudah resmi. */
export async function submitPelunasanTransfer(
	code: string,
	raw: unknown,
): Promise<{ ok: true } | Fail> {
	const person = await getPortalPerson();
	if (!person) return { ok: false, error: "Sesi berakhir. Masuk lagi, ya." };
	const b = await loadMyBooking(person, code);
	if (!b || b.role === "pemilik")
		return { ok: false, error: "Booking tidak ditemukan." };
	if (b.status !== "resmi" || !b.event_id)
		return { ok: false, error: "Pelunasan dibuka setelah DP diterima." };
	const parsed = SubmitSchema.safeParse(raw);
	if (!parsed.success)
		return { ok: false, error: "Data pembayaran belum lengkap." };
	const { amount, bankAccountId, path } = parsed.data;
	if (!path.startsWith(`bookings/${b.id}/bukti/`))
		return { ok: false, error: "Bukti tidak valid." };
	const sisa = await eventRemaining(b.event_id);
	if (sisa <= 0)
		return { ok: false, error: "Tagihan sudah lunas. Terima kasih!" };
	if (amount > sisa)
		return {
			ok: false,
			error: `Nominal melebihi sisa tagihan (Rp${sisa.toLocaleString("id-ID")}).`,
		};
	const proofErr = await checkProofAndBank(path, bankAccountId);
	if (proofErr) return { ok: false, error: proofErr };

	const admin = createAdminClient();
	const { count } = await admin
		.from("payment_submissions")
		.select("id", { count: "exact", head: true })
		.eq("booking_id", b.id)
		.eq("status", "menunggu");
	if (count)
		return { ok: false, error: "Masih ada bukti yang sedang dicek admin." };
	const { data: sub, error } = await admin
		.from("payment_submissions")
		.insert({
			booking_id: b.id,
			kind: "pelunasan",
			method: "transfer",
			amount,
			bank_account_id: bankAccountId,
			proof_path: path,
			submitted_by: person.id,
		})
		.select("id")
		.single();
	if (error) return { ok: false, error: "Gagal mengirim. Coba lagi, ya." };
	await notifyPortalPaymentSubmitted(sub.id);
	revalidatePath(`/akun/booking/${code}`);
	return { ok: true };
}

// ── Anggota booking (DR-028) ────────────────────────────────────────────────

const ROLE_LABEL = {
	pemesan: "pemesan",
	pemilik: "pemilik acara",
	wo: "WO",
} as const;

/** Tambah orang (dibuat kalau belum ada) ke booking. Diam kalau sudah anggota. */
async function addMember(
	bookingId: string,
	invitedBy: string,
	phone: string,
	name: string,
	role: "pemilik" | "wo",
): Promise<string> {
	const admin = createAdminClient();
	let { data: p } = await admin
		.from("portal_people")
		.select("id")
		.eq("phone", phone)
		.maybeSingle();
	if (!p) {
		const ins = await admin
			.from("portal_people")
			.insert({ phone, name })
			.select("id")
			.single();
		p = ins.data;
	}
	if (!p) throw new Error("Gagal menambah orang");
	await admin
		.from("booking_members")
		.upsert(
			{ booking_id: bookingId, person_id: p.id, role, invited_by: invitedBy },
			{ onConflict: "booking_id,person_id", ignoreDuplicates: true },
		);
	return p.id;
}

const InviteSchema = z.object({
	name: z.string().trim().min(2, "Nama minimal 2 huruf").max(80),
	phone: z.string().trim().min(8).max(20),
	role: z.enum(["pemilik", "wo"]),
});

/** Pemesan / WO mengundang orang lain lewat nomor WA-nya. */
export async function inviteMember(
	code: string,
	raw: unknown,
): Promise<{ ok: true } | Fail> {
	const person = await getPortalPerson();
	if (!person) return { ok: false, error: "Sesi berakhir. Masuk lagi, ya." };
	const b = await loadMyBooking(person, code);
	if (!b || b.role === "pemilik")
		return { ok: false, error: "Hanya pemesan atau WO yang bisa mengundang." };
	if (b.status === "batal" || b.status === "kedaluwarsa")
		return { ok: false, error: "Booking ini sudah tidak aktif." };
	const parsed = InviteSchema.safeParse(raw);
	if (!parsed.success)
		return { ok: false, error: parsed.error.issues[0].message };
	if (!isLikelyWaPhone(parsed.data.phone))
		return { ok: false, error: "Nomor WhatsApp belum benar." };
	if (!(await rateLimit(`invite:${person.id}`, 10, 86_400)))
		return { ok: false, error: BUSY };
	const phone = toWaPhone(parsed.data.phone);
	if (phone === person.phone)
		return { ok: false, error: "Itu nomor kamu sendiri." };
	await addMember(b.id, person.id, phone, parsed.data.name, parsed.data.role);
	await sendClientWa(
		phone,
		`Halo ${parsed.data.name}! ${person.name ?? "Pemesan"} menambahkan kamu sebagai ${ROLE_LABEL[parsed.data.role]} untuk ${b.detail.nama_acara ?? "acara"} (${b.event_date}) di Tetra Photobooth.\n\nLihat dan lengkapi detailnya di sini (masuk pakai nomor WA ini): ${portalUrl(b.public_code)}`,
	);
	revalidatePath(`/akun/booking/${code}`);
	return { ok: true };
}

/** Pemesan / WO mengeluarkan anggota lain (tidak bisa mengeluarkan diri sendiri). */
export async function removeMember(
	code: string,
	personId: string,
): Promise<{ ok: true } | Fail> {
	const person = await getPortalPerson();
	if (!person) return { ok: false, error: "Sesi berakhir. Masuk lagi, ya." };
	const b = await loadMyBooking(person, code);
	if (!b || b.role === "pemilik")
		return { ok: false, error: "Tidak diizinkan." };
	if (!z.uuid().safeParse(personId).success || personId === person.id)
		return { ok: false, error: "Tidak diizinkan." };
	await createAdminClient()
		.from("booking_members")
		.delete()
		.eq("booking_id", b.id)
		.eq("person_id", personId)
		.neq("role", "pemesan");
	revalidatePath(`/akun/booking/${code}`);
	return { ok: true };
}

// ── Pindah tanggal / batal (DR-034) ─────────────────────────────────────────

const ChangeSchema = z.object({
	kind: z.enum(["pindah_tanggal", "batal"]),
	newDate: z.iso.date().optional(),
	newStart: z
		.string()
		.regex(/^([01]\d|2[0-3]):[0-5]\d$/)
		.nullable()
		.optional(),
	reason: z.string().trim().max(500).optional(),
});

const todayWib = () =>
	new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

/**
 * Draf: batal langsung (belum ada uang). Sudah resmi / DP dicek: jadi
 * permintaan yang diputuskan admin (refund & ubah jadwal dijalankan manual).
 */
export async function requestChange(
	code: string,
	raw: unknown,
): Promise<{ ok: true; direct?: boolean } | Fail> {
	const person = await getPortalPerson();
	if (!person) return { ok: false, error: "Sesi berakhir. Masuk lagi, ya." };
	const b = await loadMyBooking(person, code);
	if (!b) return { ok: false, error: "Booking tidak ditemukan." };
	const parsed = ChangeSchema.safeParse(raw);
	if (!parsed.success) return { ok: false, error: "Isian belum lengkap." };
	const { kind, newDate, newStart, reason } = parsed.data;
	if (kind === "batal" && b.role === "pemilik")
		return { ok: false, error: "Pembatalan diajukan oleh pemesan, ya." };
	if (b.status === "batal" || b.status === "kedaluwarsa")
		return { ok: false, error: "Booking ini sudah tidak aktif." };
	const admin = createAdminClient();

	if (b.status === "draft") {
		if (kind !== "batal")
			return {
				ok: false,
				error: "Draf bisa langsung dibatalkan lalu dibuat ulang.",
			};
		await admin
			.from("client_bookings")
			.update({ status: "batal" })
			.eq("id", b.id)
			.eq("status", "draft");
		revalidatePath(`/akun/booking/${code}`);
		return { ok: true, direct: true };
	}

	if (kind === "pindah_tanggal") {
		if (!newDate) return { ok: false, error: "Pilih tanggal baru, ya." };
		const err = rescheduleError(newDate, b.event_date, todayWib());
		if (err) return { ok: false, error: err };
	}
	const { count } = await admin
		.from("booking_requests")
		.select("id", { count: "exact", head: true })
		.eq("booking_id", b.id)
		.eq("status", "baru");
	if (count)
		return {
			ok: false,
			error: "Masih ada permintaan yang sedang diproses admin.",
		};

	let estimate: number | null = null;
	if (kind === "batal" && b.event_id) {
		estimate = refundEstimate(
			await paidBeyondDp(b.event_id),
			daysUntil(b.event_date, todayWib()),
		);
	}
	const available =
		kind === "pindah_tanggal" && newDate
			? await slotAvailable(
					{
						date: newDate,
						start: newStart ?? null,
						hours: b.package_hours,
						units: b.unit_count,
						city: b.venue_city,
					},
					b.id,
				).catch(() => null)
			: null;
	const { data: req, error } = await admin
		.from("booking_requests")
		.insert({
			booking_id: b.id,
			kind,
			new_date: newDate ?? null,
			new_start: newStart ?? null,
			reason: reason || null,
			refund_estimate: estimate,
			requested_by: person.id,
		})
		.select("id")
		.single();
	if (error) return { ok: false, error: "Gagal mengirim. Coba lagi, ya." };
	await notifyPortalRequest(req.id, available);
	revalidatePath(`/akun/booking/${code}`);
	return { ok: true };
}
