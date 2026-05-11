import { type NextRequest, NextResponse } from "next/server";
import { createEventFolderInternal } from "@/lib/actions/drive";
import { getCurrentUser } from "@/lib/auth/get-user";
import {
	getDriveConfigErrors,
	isDriveConfigured,
	uploadFileToFolder,
} from "@/lib/drive/client";
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

function safeSegment(raw: string, maxLen = 60): string {
	return raw
		.replace(/[\\/:*?"<>|]/g, "")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, maxLen);
}

const PAYMENT_TYPE_LABEL: Record<string, string> = {
	dp: "DP",
	partial: "Partial",
	pelunasan: "Pelunasan",
};

function formatPaymentDate(iso: string | null): string | null {
	if (!iso) return null;
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return null;
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

function buildPaymentProofName(
	meta: {
		projectId: string;
		clientName: string;
		paymentType: string | null;
		paymentDate: string | null;
		amount: number | null;
	},
	ext: string,
): string {
	const parts: string[] = [];

	parts.push(safeSegment(meta.projectId, 30));

	// "Pelunasan Rp1.500.000" or "DP" or "Pembayaran"
	const typeLabel = meta.paymentType
		? PAYMENT_TYPE_LABEL[meta.paymentType.toLowerCase()]
		: null;
	let middle = typeLabel ?? "Pembayaran";
	if (meta.amount && meta.amount > 0) {
		middle += ` Rp${meta.amount.toLocaleString("id-ID")}`;
	}
	parts.push(safeSegment(middle, 60));

	if (meta.clientName) {
		parts.push(safeSegment(meta.clientName, 50));
	}

	const dateStr = formatPaymentDate(meta.paymentDate);
	if (dateStr) parts.push(dateStr);

	const name = parts.filter(Boolean).join(" - ");
	const safe = name.slice(0, 180).trim();
	return `${safe}.${ext}`;
}

/**
 * Rekap proof naming: `{PRJ-ID} - REKAP - {YYYY-MM-DD} - {seq}.{ext}`
 * - date defaults to today (upload time, in WIB-relevant local zone via ISO)
 * - seq is supplied by client (multi-file upload session counter); falls back
 *   to HHMMSS timestamp when missing to guarantee uniqueness
 */
function buildRekapProofName(
	meta: {
		projectId: string;
		eventDate: string | null;
		seq: string | null;
	},
	ext: string,
): string {
	const parts: string[] = [safeSegment(meta.projectId, 30), "REKAP"];
	const dateStr = formatPaymentDate(meta.eventDate) ?? formatPaymentDate(new Date().toISOString());
	if (dateStr) parts.push(dateStr);
	const seqClean = meta.seq?.replace(/\D/g, "").padStart(2, "0").slice(0, 4);
	if (seqClean && seqClean !== "00") {
		parts.push(seqClean);
	} else {
		const now = new Date();
		const hhmmss = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
		parts.push(hhmmss);
	}
	const name = parts.join(" - ").slice(0, 180).trim();
	return `${name}.${ext}`;
}

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

	// Authorization branch per kind:
	// - payment_proof: owner-level only (financial data sensitivity)
	// - rekap_proof: crew assigned to event OR owner
	// - other: owner only
	if (kind === "rekap_proof") {
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
	} else {
		// Generic fallback: project + original name (sanitized)
		const ts = new Date()
			.toISOString()
			.replace(/[:.]/g, "-")
			.slice(0, 19);
		const baseOriginal = safeSegment(
			file.name?.replace(/\.[^.]+$/, "") || `upload-${ts}`,
			120,
		);
		finalName = `${event.project_id as string} - ${baseOriginal}.${ext}`;
	}

	const arrayBuffer = await file.arrayBuffer();
	const buf = Buffer.from(arrayBuffer);

	try {
		const uploaded = await uploadFileToFolder(folderId, finalName, mime, buf);
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
