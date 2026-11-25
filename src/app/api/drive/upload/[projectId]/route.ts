import { type NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-user";
import {
	buildCommissionProofName,
	buildCrewFeeName,
	buildDesignName,
	buildEventTxnProofName,
	buildGenericName,
	buildPaymentProofName,
	buildRekapProofName,
	buildTransportProofName,
} from "@/lib/drive/naming";
import { simpanBerkas } from "@/lib/storage/berkas";
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
	// "uang_jalan" = bukti terima / pengembalian uang jalan (crew & owner).
	if (
		kind === "rekap_proof" ||
		kind === "transport_proof" ||
		kind === "nota" ||
		kind === "uang_jalan"
	) {
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
	} else if (kind === "event_txn") {
		// Bukti transaksi lain di event — `crew_name` dipakai ulang sbg label
		// kategori transaksinya.
		finalName = buildEventTxnProofName(
			{
				projectId: event.project_id as string,
				label: crewName,
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

	// DR-066: Drive Tetra penuh → semua unggahan per event disimpan privat di
	// R2. Bukti uang (bayar klien, komisi, transaksi) hanya owner; foto rekap,
	// nota lapangan, uang jalan, fee crew, desain → owner + crew.
	const KHUSUS_OWNER = new Set(["payment_proof", "commission", "event_txn"]);
	const FOLDER_BY_KIND: Record<string, string> = {
		payment_proof: "bukti-bayar",
		crew_fee: "fee-crew",
		commission: "komisi",
		event_txn: "transaksi",
		transport_proof: "nota",
		nota: "nota",
		uang_jalan: "uang-jalan",
		rekap_proof: "rekap",
		design_frame: "desain",
	};
	const arrayBuffer = await file.arrayBuffer();
	const buf = Buffer.from(arrayBuffer);

	try {
		const saved = await simpanBerkas(
			KHUSUS_OWNER.has(kind) ? "owner" : "tim",
			`event/${event.project_id}/${FOLDER_BY_KIND[kind] ?? "lainnya"}`,
			finalName,
			buf,
			mime,
			req.nextUrl.origin,
		);
		return NextResponse.json({
			ok: true,
			url: saved.url,
			id: saved.key,
			name: finalName,
			mimeType: mime,
		});
	} catch (err) {
		console.error("[upload event]", err);
		return NextResponse.json(
			{
				error: err instanceof Error ? err.message : "Upload gagal",
			},
			{ status: 502 },
		);
	}
}
