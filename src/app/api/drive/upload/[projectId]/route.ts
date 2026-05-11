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

function safeFileName(original: string, fallbackExt: string): string {
	const cleaned = original
		.replace(/[\\/:*?"<>|]/g, "_")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 80);
	if (cleaned) return cleaned;
	const ts = new Date()
		.toISOString()
		.replace(/[:.]/g, "-")
		.slice(0, 19);
	return `upload-${ts}.${fallbackExt}`;
}

export async function POST(
	req: NextRequest,
	ctx: { params: Promise<{ projectId: string }> },
) {
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

	const { projectId } = await ctx.params;
	if (!projectId) {
		return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
	}

	// Resolve event
	const supabase = await createClient();
	const { data: event, error: evErr } = await supabase
		.from("events")
		.select("id, drive_folder_id, drive_folder_url")
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
	const labelRaw = formData.get("label");
	const label = typeof labelRaw === "string" ? labelRaw.trim() : "";

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

	const ext = mime.split("/")[1] ?? "bin";
	const ts = new Date()
		.toISOString()
		.replace(/[:.]/g, "-")
		.slice(0, 19);
	const baseName = label
		? safeFileName(label, ext)
		: safeFileName(file.name || `upload-${ts}`, ext);
	const finalName = baseName.endsWith(`.${ext}`)
		? baseName
		: `${baseName}.${ext}`;

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
