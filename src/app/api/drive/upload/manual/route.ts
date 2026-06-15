import { revalidatePath } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-user";
import {
	ensureManualNotaMonthFolder,
	getDriveConfigErrors,
	isDriveConfigured,
	uploadFileToFolder,
} from "@/lib/drive/client";
import { buildManualNotaName } from "@/lib/drive/naming";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

const ALLOWED_MIME = new Set([
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/heic",
	"image/heif",
	"application/pdf",
]);

/**
 * Upload nota manual (di luar sistem) → Drive folder bulanan + insert row.
 * Owner-only. File di-auto-rename rapi (tanggal di depan) apa pun nama aslinya.
 */
export async function POST(req: NextRequest) {
	const me = await getCurrentUser();
	if (!me) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		return NextResponse.json(
			{ error: "Forbidden — owner-level only" },
			{ status: 403 },
		);
	}

	if (!isDriveConfigured()) {
		return NextResponse.json(
			{
				error: `Drive belum di-set di env: ${getDriveConfigErrors().join(", ")}`,
			},
			{ status: 503 },
		);
	}

	const formData = await req.formData();
	const file = formData.get("file");

	const category = String(formData.get("category") ?? "").trim();
	const description = String(formData.get("description") ?? "").trim();
	const notaDateRaw = String(formData.get("nota_date") ?? "").trim();
	const notaDate = notaDateRaw || null;
	const amountRaw = String(formData.get("amount") ?? "").trim();
	const amount = amountRaw ? Number(amountRaw) : null;
	const eventIdRaw = String(formData.get("event_id") ?? "").trim();
	const eventId = eventIdRaw || null;

	if (!category) {
		return NextResponse.json(
			{ error: "Kategori wajib diisi" },
			{ status: 400 },
		);
	}
	if (!description) {
		return NextResponse.json(
			{ error: "Keterangan wajib diisi" },
			{ status: 400 },
		);
	}
	if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
		return NextResponse.json({ error: "Nominal tidak valid" }, { status: 400 });
	}

	if (!(file instanceof File)) {
		return NextResponse.json(
			{ error: "File nota wajib di-upload" },
			{ status: 400 },
		);
	}
	if (file.size === 0) {
		return NextResponse.json({ error: "File kosong" }, { status: 400 });
	}
	if (file.size > MAX_BYTES) {
		return NextResponse.json(
			{
				error: `File terlalu besar (${Math.round(file.size / 1024 / 1024)}MB). Max 8 MB. Coba kompres dulu.`,
			},
			{ status: 413 },
		);
	}

	const mime = file.type || "application/octet-stream";
	if (!ALLOWED_MIME.has(mime)) {
		return NextResponse.json(
			{
				error: `Tipe file tidak didukung (${mime}). Pakai JPG/PNG/WEBP/HEIC/PDF.`,
			},
			{ status: 415 },
		);
	}

	const ext = (mime.split("/")[1] ?? "bin").toLowerCase();
	const uploadDate = new Date();
	const finalName = buildManualNotaName(
		{ category, description, notaDate, amount, uploadDate },
		ext,
	);

	// Folder bulanan (by tanggal upload) — idempotent.
	let folder: { id: string };
	try {
		folder = await ensureManualNotaMonthFolder(uploadDate);
	} catch (err) {
		return NextResponse.json(
			{
				error:
					err instanceof Error ? err.message : "Gagal menyiapkan folder Drive",
			},
			{ status: 500 },
		);
	}

	const buf = Buffer.from(await file.arrayBuffer());

	let uploaded: { id: string; webViewLink: string; name: string };
	try {
		uploaded = await uploadFileToFolder(folder.id, finalName, mime, buf);
	} catch (err) {
		return NextResponse.json(
			{ error: err instanceof Error ? err.message : "Drive upload gagal" },
			{ status: 502 },
		);
	}

	// Insert row SETELAH upload sukses (hindari orphan row).
	const supabase = await createClient();
	const { data: inserted, error: dbErr } = await supabase
		.from("manual_notas")
		.insert({
			category,
			nota_date: notaDate,
			amount,
			description,
			drive_url: uploaded.webViewLink,
			drive_file_id: uploaded.id,
			file_name: uploaded.name,
			drive_folder_id: folder.id,
			upload_year: uploadDate.getFullYear(),
			upload_month: uploadDate.getMonth() + 1,
			event_id: eventId,
			uploaded_by: me.profile.id,
		})
		.select("id")
		.single();

	if (dbErr) {
		// File sudah ke-upload tapi DB gagal — surface error, file tetap di Drive.
		return NextResponse.json(
			{ error: `Tersimpan di Drive tapi gagal catat DB: ${dbErr.message}` },
			{ status: 500 },
		);
	}

	revalidatePath("/finance/arsip-nota");
	return NextResponse.json({
		ok: true,
		id: inserted.id,
		url: uploaded.webViewLink,
		name: uploaded.name,
	});
}
