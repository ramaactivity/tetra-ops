"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createBooking } from "@/lib/actions/bookings";
import { ensureEventCategoryFolderInternal } from "@/lib/actions/drive";
import { getCurrentUser } from "@/lib/auth/get-user";
import { isDriveConfigured, uploadFileToFolder } from "@/lib/drive/client";
import { buildPaymentProofName } from "@/lib/drive/naming";
import { logPaymentCore } from "@/lib/finance/payment-core";
import { formatRupiah } from "@/lib/format";
import type { Detail } from "@/lib/portal/core";
import { portalUrl, sendClientWa } from "@/lib/portal/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Owner/admin memutuskan DP yang diajukan dari portal (DR-029).
 * Terima = event dibuat lewat createBooking yang SAMA dengan form booking
 * (harga, gate frame↔paket, invoice, folder Drive, notif Telegram semua ikut),
 * lalu pembayaran dicatat lewat logPaymentCore (jurnal + kuitansi).
 */

type Result =
	| { ok: true; projectId?: string; note?: string }
	| { ok: false; error: string };

async function requireOwnerLevel() {
	const me = await getCurrentUser();
	if (!me || (me.profile.role !== "owner" && me.profile.role !== "super_admin"))
		throw new Error("Forbidden — owner-level only");
	return me;
}

type Sub = {
	id: string;
	status: string;
	kind: string;
	amount: number;
	bank_account_id: string;
	proof_path: string | null;
	booking: {
		id: string;
		public_code: string;
		status: string;
		service_type: string;
		package_hours: number;
		frame_size: string | null;
		unit_count: number;
		addons: Array<{ addon_id: string; quantity: number }>;
		quoted_total: number;
		event_date: string;
		start_time: string | null;
		end_time: string | null;
		venue_city: string | null;
		detail: Detail;
		event_id: string | null;
	};
	person: { name: string | null; phone: string } | null;
};

async function loadSub(id: string): Promise<Sub | null> {
	if (!z.uuid().safeParse(id).success) return null;
	const { data } = await createAdminClient()
		.from("payment_submissions")
		.select(
			"id, status, kind, amount, bank_account_id, proof_path, booking:client_bookings(id, public_code, status, service_type, package_hours, frame_size, unit_count, addons, quoted_total, event_date, start_time, end_time, venue_city, detail, event_id), person:portal_people!payment_submissions_submitted_by_fkey(name, phone)",
		)
		.eq("id", id)
		.maybeSingle();
	// to-one embeds → object.
	return (data as unknown as Sub) ?? null;
}

const hhmm = (t: string | null) => t?.slice(0, 5) ?? "";

async function bookingFormData(s: Sub): Promise<FormData> {
	const b = s.booking;
	const d = b.detail ?? {};
	const { data: cat } = await createAdminClient()
		.from("event_types")
		.select("code")
		.eq("code", d.kategori ?? "")
		.eq("is_active", true)
		.maybeSingle();
	const pemesan = s.person?.name ?? "";
	const pemilik = d.pemilik_nama?.trim() || pemesan;
	const notes = [
		`Booking portal ${b.public_code}.`,
		d.catatan ? `Catatan klien: ${d.catatan}` : "",
	]
		.filter(Boolean)
		.join(" ")
		.slice(0, 500);
	const fields: Record<string, string> = {
		channel: "direct",
		client_name: pemilik,
		client_wa: d.pemilik_wa?.trim() || s.person?.phone || "",
		event_title: d.nama_acara ?? "",
		booker_name: pemesan && pemesan !== pemilik ? pemesan : "",
		service_type: b.service_type,
		pending_package_hours: String(b.package_hours),
		frame_size: b.frame_size ?? "",
		unit_count: String(b.unit_count),
		event_category: (cat?.code as string) ?? "event",
		event_date: b.event_date,
		start_time: hhmm(b.start_time),
		end_time: hhmm(b.end_time),
		venue_name: d.venue_nama ?? "",
		venue_address: d.venue_alamat ?? "",
		venue_city: d.venue_kota ?? b.venue_city ?? "",
		google_maps_url: d.maps_url ?? "",
		pic_name: d.pic_nama ?? "",
		pic_wa: d.pic_wa ?? "",
		crew_notes: notes,
		include_flashdisk_pouch: "on",
		addons_json: JSON.stringify(b.addons),
	};
	const fd = new FormData();
	for (const [k, v] of Object.entries(fields)) fd.set(k, v);
	return fd;
}

/** Salin bukti dari Storage portal ke folder Nota event di Drive (arsip, DR-030). */
async function archiveProof(
	s: Sub,
	eventId: string,
	projectId: string,
	today: string,
): Promise<string | null> {
	if (!s.proof_path || !isDriveConfigured()) return null;
	try {
		const admin = createAdminClient();
		const { data: blob } = await admin.storage
			.from("portal-private")
			.download(s.proof_path);
		if (!blob) return null;
		const folder = await ensureEventCategoryFolderInternal(eventId, "Nota");
		if (!folder.id) return null;
		const ext = s.proof_path.split(".").pop() ?? "jpg";
		const name = buildPaymentProofName(
			{
				projectId,
				clientName: s.booking.detail?.pemilik_nama ?? s.person?.name ?? "",
				paymentType: s.kind,
				paymentDate: today,
				amount: Number(s.amount),
			},
			ext,
		);
		const up = await uploadFileToFolder(
			folder.id,
			name,
			blob.type || "application/octet-stream",
			Buffer.from(await blob.arrayBuffer()),
		);
		return up.webViewLink;
	} catch (e) {
		console.error("[portal-admin] arsip bukti:", e);
		return null;
	}
}

export async function acceptPortalPayment(
	submissionId: string,
): Promise<Result> {
	const me = await requireOwnerLevel();
	const s = await loadSub(submissionId);
	if (!s || s.status !== "menunggu")
		return {
			ok: false,
			error: "Pengajuan tidak ditemukan atau sudah diputuskan.",
		};
	const admin = createAdminClient();
	const b = s.booking;
	const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

	// 1. Event — dibuat sekali. Kalau langkah bayar gagal, klik ulang hanya mengulang pembayaran.
	let eventId = b.event_id;
	let projectId: string | undefined;
	if (!eventId) {
		const res = await createBooking(undefined, await bookingFormData(s));
		if (!res || !("ok" in res) || !res.ok) {
			const errs =
				res && "errors" in res ? Object.values(res.errors ?? {}).flat() : [];
			return {
				ok: false,
				error: `Gagal membuat event: ${errs.join(" · ") || "periksa data booking"}`,
			};
		}
		projectId = res.projectId;
		const { data: ev } = await admin
			.from("events")
			.select("id")
			.eq("project_id", projectId)
			.single();
		eventId = ev?.id as string;
		await admin
			.from("client_bookings")
			.update({ event_id: eventId })
			.eq("id", b.id);
	} else {
		const { data: ev } = await admin
			.from("events")
			.select("project_id")
			.eq("id", eventId)
			.single();
		projectId = ev?.project_id as string;
	}

	// 2. Pembayaran + jurnal + kuitansi.
	const proofUrl = await archiveProof(s, eventId, projectId as string, today);
	const pay = await logPaymentCore(
		await createClient(),
		{
			eventId,
			amount: Number(s.amount),
			paymentDate: today,
			bankAccountId: s.bank_account_id,
			paymentType: s.kind === "dp" ? "dp" : "pelunasan",
			proofUrl,
			notes: `${s.kind === "dp" ? "DP" : "Pembayaran"} lewat portal (${b.public_code})`,
		},
		me.profile.id,
	);
	if (!pay.ok)
		return {
			ok: false,
			error: `Event sudah dibuat (${projectId}), tapi pembayaran gagal dicatat: ${pay.error}`,
		};

	await admin
		.from("payment_submissions")
		.update({
			status: "diterima",
			payment_id: pay.paymentId,
			reviewed_by: me.profile.id,
			reviewed_at: new Date().toISOString(),
		})
		.eq("id", s.id);
	await admin
		.from("client_bookings")
		.update({ status: "resmi" })
		.eq("id", b.id);

	const { data: ev } = await admin
		.from("events")
		.select("grand_total")
		.eq("id", eventId)
		.single();
	const grand = Number(ev?.grand_total ?? 0);
	if (s.person?.phone)
		await sendClientWa(
			s.person.phone,
			`Halo ${s.person.name ?? ""}! DP ${formatRupiah(Number(s.amount))} untuk ${b.detail?.nama_acara ?? "acara kamu"} sudah kami terima. Booking kamu resmi 🎉\n\nKuitansi dan langkah berikutnya ada di portal: ${portalUrl(b.public_code)}`,
		);

	revalidatePath("/operations/portal");
	return {
		ok: true,
		projectId,
		note:
			grand !== Number(b.quoted_total)
				? `Total event ${formatRupiah(grand)} berbeda dari perkiraan di portal ${formatRupiah(Number(b.quoted_total))}. Cek harga di halaman event.`
				: undefined,
	};
}

export async function rejectPortalPayment(
	submissionId: string,
	reason: string,
): Promise<Result> {
	const me = await requireOwnerLevel();
	const why = reason.trim();
	if (why.length < 5)
		return { ok: false, error: "Tulis alasan penolakan (minimal 5 huruf)." };
	const s = await loadSub(submissionId);
	if (!s || s.status !== "menunggu")
		return {
			ok: false,
			error: "Pengajuan tidak ditemukan atau sudah diputuskan.",
		};
	const admin = createAdminClient();
	await admin
		.from("payment_submissions")
		.update({
			status: "ditolak",
			reject_reason: why.slice(0, 500),
			reviewed_by: me.profile.id,
			reviewed_at: new Date().toISOString(),
		})
		.eq("id", s.id);
	// Belum jadi event → kembali draf dan slot dilepas.
	if (!s.booking.event_id)
		await admin
			.from("client_bookings")
			.update({ status: "draft" })
			.eq("id", s.booking.id)
			.eq("status", "menunggu_konfirmasi");
	if (s.person?.phone)
		await sendClientWa(
			s.person.phone,
			`Halo ${s.person.name ?? ""}, bukti pembayaran untuk booking ${s.booking.public_code} belum bisa kami terima.\nAlasan: ${why}\n\nSilakan unggah ulang di portal: ${portalUrl(s.booking.public_code)}`,
		);
	revalidatePath("/operations/portal");
	return { ok: true };
}

/** Link sementara (10 menit) untuk melihat bukti transfer. */
export async function proofSignedUrl(
	submissionId: string,
): Promise<string | null> {
	await requireOwnerLevel();
	const s = await loadSub(submissionId);
	if (!s?.proof_path) return null;
	const { data } = await createAdminClient()
		.storage.from("portal-private")
		.createSignedUrl(s.proof_path, 600);
	return data?.signedUrl ?? null;
}
