/**
 * Modul desain frame — logika murni (DR-031, kontrak Booth §2.3).
 * Booth mencetak 1200×1800 @300dpi dan memperkecil file sendiri, jadi Ops
 * cukup memastikan rasio cocok (toleransi <1%) dan resolusi minimal 1×.
 */

export const FRAME_SIZES = ["2R", "4R", "polaroid"] as const;
export type FrameSize = (typeof FRAME_SIZES)[number];
export type Orientation = "portrait" | "landscape";

/** Kanvas minimal (portrait). Landscape = lebar & tinggi ditukar. */
const MIN: Record<FrameSize, { w: number; h: number }> = {
	"4R": { w: 1200, h: 1800 }, // 2:3
	"2R": { w: 600, h: 1800 }, // 1:3, satu strip
	polaroid: { w: 900, h: 1200 }, // 3:4
};

export type DesignFileCheck =
	| { ok: true; orientation: Orientation }
	| { ok: false; error: string };

export function checkDesignFile(
	frame: FrameSize,
	width: number,
	height: number,
): DesignFileCheck {
	if (!(width > 0 && height > 0))
		return { ok: false, error: "Ukuran gambar tidak terbaca." };
	const orientation: Orientation = width > height ? "landscape" : "portrait";
	const m = MIN[frame];
	const [w, h] = orientation === "portrait" ? [m.w, m.h] : [m.h, m.w];
	if (Math.abs(width / height - w / h) / (w / h) > 0.01)
		return {
			ok: false,
			error: `Rasio ${width}×${height} tidak cocok untuk ${frame} (${w}:${h} atau kelipatannya, mis. ${w * 2}×${h * 2}).`,
		};
	if (width < w || height < h)
		return {
			ok: false,
			error: `Resolusi minimal ${frame} ${orientation} adalah ${w}×${h}.`,
		};
	return { ok: true, orientation };
}

export type PngInfo = {
	width: number;
	height: number;
	hasAlphaChannel: boolean;
};

/**
 * Baca ukuran dari header PNG (IHDR) tanpa decoder. Cukup 33 byte pertama.
 * hasAlphaChannel = color type RGBA/gray+alpha atau ada chunk tRNS di awal.
 */
export function readPngInfo(bytes: Uint8Array): PngInfo | null {
	const sig = [137, 80, 78, 71, 13, 10, 26, 10];
	if (bytes.length < 33 || sig.some((b, i) => bytes[i] !== b)) return null;
	const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (String.fromCharCode(...bytes.slice(12, 16)) !== "IHDR") return null;
	const colorType = bytes[25];
	const text = String.fromCharCode(
		...bytes.slice(33, Math.min(bytes.length, 4096)),
	);
	return {
		width: dv.getUint32(16),
		height: dv.getUint32(20),
		hasAlphaChannel:
			colorType === 4 || colorType === 6 || text.includes("tRNS"),
	};
}

export type Stage =
	| "brief"
	| "dikerjakan"
	| "menunggu_review"
	| "revisi"
	| "acc";

export const STAGE_LABEL: Record<Stage, string> = {
	brief: "Menunggu brief",
	dikerjakan: "Sedang didesain",
	menunggu_review: "Menunggu review klien",
	revisi: "Revisi diminta",
	acc: "ACC",
};

/**
 * events.design_status dari tahap semua permintaan desain event itu.
 * "approved" TIDAK diturunkan dari sini — itu hanya lewat gerbang ukuran
 * (lihat approveFromPortal), karena ACC klien bisa saja ukurannya belum cocok.
 */
export function designStatusFor(stages: Stage[]): "belum" | "proses" {
	return stages.length === 0 || stages.every((s) => s === "brief")
		? "belum"
		: "proses";
}

/** Klien boleh minta revisi lagi? `used` = revisi yang sudah dipakai. */
export function revisionLeft(used: number, limit: number): number {
	return Math.max(0, limit - used);
}
