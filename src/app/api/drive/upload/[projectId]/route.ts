import { type NextRequest, NextResponse } from "next/server";
import {
	createEventFolderInternal,
	ensureEventCategoryFolderInternal,
} from "@/lib/actions/drive";
import { getCurrentUser } from "@/lib/auth/get-user";
import type { DriveCategory } from "@/lib/drive/categories";
import {
	getDriveConfigErrors,
	isDriveConfigured,
	uploadFileToFolder,
} from "@/lib/drive/client";
import {
	buildCommissionProofName,
	buildCrewFeeName,
	buildDesignName,
	buildGenericName,
	buildPaymentProofName,
	buildRekapProofName,
	buildTransportProofName,
} from "@/lib/drive/naming";
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
	"image/gif",
	"application/pdf",
]);

export async function POST(
	req: NextRequest,
	ctx: { params: Promise<{ projectId: string }> },
) {
	const me = await getCurrentUser();
	if (!me) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}
	// Auth gate moved below the multipart parse so we can branch on `kind`:
	// payment proofs are owner-only, rekap proofs allow crew (assigned to the
	// event). We can't read formData before the auth check fully, but role-
	// based check happens here for non-crew roles. Crew authorization for
	// rekap_proof is verified after we parse the kind.
	const isOwnerLevel =
		me.profile.role === "super_admin" || me.profile.role === "owner";
	const isCrew = me.profile.role === "crew";
	if (!isOwnerLevel && !isCrew) {
		return NextResponse.json(
			{ error: "Forbidden — owner or crew only" },
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

	const { projectId } = await ctx.params;
	if (!projectId) {
		return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
	}

	// Resolve event (incl. client_name + event_date for filename)
	const supabase = await createClient();
	const { data: event, error: evErr } = await supabase
		.from("events")
		.select(
			"id, project_id, client_name, event_date, drive_folder_id, drive_folder_url",
		)
		.eq("project_id", projectId)
		.maybeSingle();
	if (evErr) {
		return NextResponse.json({ error: evErr.message }, { status: 500 });
	}
	if (!event) {
		return NextResponse.json({ error: "Event not found" }, { status: 404 });
	}

	// Ensure Drive folder exists (lazy-create idempotently)
	let folderId = event.drive_folder_id as string | null;
	if (!folderId) {
		const fr = await createEventFolderInternal(event.id as string);
		if (fr.error) {
			return NextResponse.json({ error: fr.error }, { status: 500 });
		}
		folderId = fr.folder_id ?? null;
	}
	if (!folderId) {
		return NextResponse.json(
			{ error: "Drive folder tidak bisa dibuat" },
			{ status: 500 },
		);
	}

	// Parse multipart form
	const formData = await req.formData();
	const file = formData.get("file");

	// Optional metadata fields used to build a descriptive filename.
	// Posted alongside the file when called from PaymentForm.
	const kindRaw = formData.get("kind"); // e.g. "payment_proof" | "rekap_proof"
	const kind = typeof kindRaw === "string" ? kindRaw.trim() : "";
	const paymentTypeRaw = formData.get("payment_type");
	const paymentType =
		typeof paymentTypeRaw === "string" ? paymentTypeRaw.trim() : null;
	const paymentDateRaw = formData.get("payment_date");
	const paymentDate =
		typeof paymentDateRaw === "string" ? paymentDateRaw.trim() : null;
	const amountRaw = formData.get("amount");
	const amount =
		typeof amountRaw === "string" && amountRaw.trim()
			? Number(amountRaw)
			: null;
	const seqRaw = formData.get("seq");
	const seq = typeof seqRaw === "string" ? seqRaw.trim() : null;
	// Crew-fee proof: who the fee was transferred to (name + role in event).
	const crewNameRaw = formData.get("crew_name");
	const crewName = typeof crewNameRaw === "string" ? crewNameRaw.trim() : null;
	const roleRaw = formData.get("role");
	const role = typeof roleRaw === "string" ? roleRaw.trim() : null;

	// Authorization branch per kind:
	// - payment_proof: owner-level only (financial data sensitivity)
	// - rekap_proof / transport_proof / nota: crew assigned to event OR owner
	// - other: owner only
	//
	// "nota" = bukti tiap biaya lapangan di rekap (bensin, toll, parkir,
	// konsumsi). Yang mengeluarkan uangnya crew, jadi crew HARUS bisa
	// melampirkannya — sebelumnya kind ini jatuh ke cabang else dan crew
	// ditolak "owner-level only" padahal dialah yang punya notanya.
	if (kind === "rekap_proof" || kind === "transport_proof" || kind === "nota") {
		if (isCrew) {
			const { data: assignment } = await supabase
				.from("crew_assignments")
				.select("id")
				.eq("event_id", event.id as string)
				.eq("user_id", me.profile.id)
				.maybeSingle();
			if (!assignment) {
				return NextResponse.json(
					{ error: "Lo gak di-assign ke event ini." },
					{ status: 403 },
				);
			}
		}
	} else {
		if (!isOwnerLevel) {
			return NextResponse.json(
				{ error: "Forbidden — owner-level only untuk upload ini." },
				{ status: 403 },
			);
		}
	}

	if (!(file instanceof File)) {
		return NextResponse.json(
			{ error: "Field 'file' wajib dan harus berupa file" },
			{ status: 400 },
		);
	}
	if (file.size === 0) {
		return NextResponse.json({ error: "File kosong" }, { status: 400 });
	}
	if (file.size > MAX_BYTES) {
		return NextResponse.json(
			{
				error: `File terlalu besar (${Math.round(file.size / 1024 / 1024)}MB). Max 8 MB.`,
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

	let finalName: string;
	if (kind === "payment_proof") {
		finalName = buildPaymentProofName(
			{
				projectId: event.project_id as string,
				clientName: (event.client_name as string) ?? "",
				paymentType,
				paymentDate,
				amount: amount && Number.isFinite(amount) ? amount : null,
			},
			ext,
		);
	} else if (kind === "rekap_proof") {
		finalName = buildRekapProofName(
			{
				projectId: event.project_id as string,
				eventDate: (event.event_date as string | null) ?? null,
				seq,
			},
			ext,
		);
	} else if (kind === "transport_proof") {
		// `leg` posted as `seq` field — "berangkat" / "pulang" (or fallback HHMMSS).
		finalName = buildTransportProofName(
			{
				projectId: event.project_id as string,
				eventDate: (event.event_date as string | null) ?? null,
				leg: seq,
			},
			ext,
		);
	} else if (kind === "crew_fee") {
		finalName = buildCrewFeeName(
			{
				projectId: event.project_id as string,
				crewName,
				role,
				paymentDate,
				amount: amount && Number.isFinite(amount) ? amount : null,
			},
			ext,
		);
	} else if (kind === "commission") {
		// Bukti transfer komisi — `crew_name` dipakai ulang sebagai nama penerima,
		// `role` sebagai jenis komisi (sales/vendor/relasi).
		finalName = buildCommissionProofName(
			{
				projectId: event.project_id as string,
				kind: role,
				payeeName: crewName,
				paymentDate,
				amount: amount && Number.isFinite(amount) ? amount : null,
			},
			ext,
		);
	} else if (kind === "design_frame") {
		finalName = buildDesignName(
			{
				clientName: (event.client_name as string) ?? "Event",
				eventDate: (event.event_date as string | null) ?? null,
				originalName: file.name ?? null,
			},
			ext,
		);
	} else {
		finalName = buildGenericName(
			{
				projectId: event.project_id as string,
				originalName: file.name ?? null,
			},
			ext,
		);
	}

	// Route into the right per-event subfolder (Nota / Hasil Cetak / Design /
	// Lainnya) so the Drive structure stays organized.
	const CATEGORY_BY_KIND: Record<string, DriveCategory> = {
		payment_proof: "Nota",
		crew_fee: "Nota",
		commission: "Nota",
		transport_proof: "Nota",
		// Tanpa baris ini nota biaya lapangan mendarat di folder "Lainnya".
		nota: "Nota",
		rekap_proof: "Hasil Cetak",
		design_frame: "Design",
	};
	const category: DriveCategory = CATEGORY_BY_KIND[kind] ?? "Lainnya";
	// Resilient: try the organized subfolder, but NEVER fail the upload over it —
	// fall back to the (already-ensured) event root folder. The subfolder
	// resolution adds Drive round-trips; if it's slow/errors we still deliver the
	// file so the crew rekap submit isn't blocked.
	let targetFolderId = folderId;
	try {
		const sub = await ensureEventCategoryFolderInternal(
			event.id as string,
			category,
		);
		if (sub.id) targetFolderId = sub.id;
	} catch {
		// keep root fallback
	}

	const arrayBuffer = await file.arrayBuffer();
	const buf = Buffer.from(arrayBuffer);

	try {
		const uploaded = await uploadFileToFolder(
			targetFolderId,
			finalName,
			mime,
			buf,
		);
		return NextResponse.json({
			ok: true,
			url: uploaded.webViewLink,
			id: uploaded.id,
			name: uploaded.name,
			mimeType: uploaded.mimeType,
		});
	} catch (err) {
		return NextResponse.json(
			{
				error: err instanceof Error ? err.message : "Drive upload failed",
			},
			{ status: 502 },
		);
	}
}
