import { type NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-user";
import { simpanBerkas } from "@/lib/storage/berkas";
import { createClient } from "@/lib/supabase/server";

/**
 * Generic Drive upload untuk inventory item images (terutama Aset Tetap
 * photo). Berbeda dari event-scoped route — item tidak punya event/project
 * folder. Pakai dedicated subfolder "Items" di root Drive parent.
 *
 * Naming: `{SKU} - {NAME} - {YYYY-MM-DD}.{ext}`
 * Auth: owner-level only.
 */

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

function buildItemImageName(
	meta: { sku: string; name: string },
	ext: string,
): string {
	const d = new Date();
	const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
	const parts = [
		safeSegment(meta.sku, 40),
		safeSegment(meta.name, 80),
		dateStr,
	];
	const joined = parts.filter(Boolean).join(" - ").slice(0, 180).trim();
	return `${joined}.${ext}`;
}

export async function POST(
	req: NextRequest,
	ctx: { params: Promise<{ itemId: string }> },
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

	const { itemId } = await ctx.params;
	if (!itemId) {
		return NextResponse.json({ error: "Missing itemId" }, { status: 400 });
	}

	const supabase = await createClient();
	const { data: item } = await supabase
		.from("inventory_items")
		.select("id, sku, name")
		.eq("id", itemId)
		.is("deleted_at", null)
		.maybeSingle();
	if (!item) {
		return NextResponse.json({ error: "Item not found" }, { status: 404 });
	}

	const formData = await req.formData();
	const file = formData.get("file");

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
	const finalName = buildItemImageName(
		{ sku: item.sku as string, name: item.name as string },
		ext,
	);

	const arrayBuffer = await file.arrayBuffer();
	const buf = Buffer.from(arrayBuffer);

	try {
		// DR-066: Drive Tetra penuh → foto alat di R2 (owner + crew).
		const saved = await simpanBerkas(
			"tim",
			"alat",
			finalName,
			buf,
			mime,
			req.nextUrl.origin,
		);
		const uploaded = {
			id: saved.key,
			webViewLink: saved.url,
			name: finalName,
			mimeType: mime,
		};

		// Persist image_url ke base record sekaligus (UX: user upload = image
		// langsung ke-set tanpa perlu submit form lagi)
		await supabase
			.from("inventory_items")
			.update({
				image_url: uploaded.webViewLink,
				updated_at: new Date().toISOString(),
			})
			.eq("id", itemId);

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
