/**
 * Olah overlay frame di browser sebelum diunggah (admin template & desain klien):
 * baca PNG → kalau belum ada kotak foto transparan, hapus warna penanda
 * (chroma key, #163 Booth) → deteksi slot foto → cek ukuran/rasio (§2.3).
 * Hanya dipanggil dari komponen client (butuh canvas).
 */
import {
	checkDesignFile,
	FRAME_SIZES,
	type FrameSize,
} from "@/lib/portal/design";
import { DEFAULT_TOLERANCE, keyColor, suggestKeyColor } from "./chroma";
import { type DetectedRect, detectSlots } from "./detect";

export type FrameSource = {
	width: number;
	height: number;
	/** Piksel asli (tidak diubah) — chroma key selalu dihitung ulang dari sini. */
	original: Uint8ClampedArray<ArrayBuffer>;
	/** Warna penanda yang disarankan (kalau perlu chroma key). */
	suggested: string;
	/** File asli sudah punya kotak foto transparan. */
	nativeHoles: boolean;
};

export type KeySetting = { color: string; tolerance: number } | null;

export type FrameResult = {
	width: number;
	height: number;
	frameSize: FrameSize | null;
	orientation: "portrait" | "landscape";
	slots: DetectedRect[];
	key: KeySetting;
	/** Piksel hasil (sudah di-key bila perlu). */
	pixels: Uint8ClampedArray<ArrayBuffer>;
	error: string | null;
	warnings: string[];
};

/** Ukuran cetak yang cocok dengan rasio gambar (4R 2:3, 2R 1:3, polaroid 3:4). */
export function inferFrameSize(w: number, h: number): FrameSize | null {
	return FRAME_SIZES.find((f) => checkDesignFile(f, w, h).ok) ?? null;
}

export async function readFrame(file: File): Promise<FrameSource> {
	const bmp = await createImageBitmap(file);
	const canvas = new OffscreenCanvas(bmp.width, bmp.height);
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Browser tidak mendukung pengolahan gambar.");
	ctx.drawImage(bmp, 0, 0);
	const { data } = ctx.getImageData(0, 0, bmp.width, bmp.height);
	bmp.close();
	return {
		width: canvas.width,
		height: canvas.height,
		original: data,
		suggested: suggestKeyColor(data, canvas.width, canvas.height),
		nativeHoles: detectSlots(data, canvas.width, canvas.height).length > 0,
	};
}

/**
 * Proses dengan pengaturan key tertentu. `key === undefined` = otomatis:
 * pakai lubang transparan asli kalau ada, kalau tidak chroma key warna saran.
 */
export function processFrame(src: FrameSource, key?: KeySetting): FrameResult {
	const { width, height } = src;
	const setting: KeySetting =
		key === undefined
			? src.nativeHoles
				? null
				: { color: src.suggested, tolerance: DEFAULT_TOLERANCE }
			: key;
	const pixels = src.original.slice();
	if (setting) keyColor(pixels, width, height, setting);
	const slots = detectSlots(pixels, width, height);
	const frameSize = inferFrameSize(width, height);
	const orientation = width > height ? "landscape" : "portrait";
	const warnings: string[] = [];
	let error: string | null = null;
	if (!frameSize) {
		// Pesan paling membantu: rasio terdekat + ukuran minimalnya.
		const near = FRAME_SIZES.map((f) => checkDesignFile(f, width, height)).find(
			(c) => !c.ok && c.error.startsWith("Resolusi"),
		);
		error =
			near && !near.ok
				? near.error
				: `Ukuran ${width}×${height} tidak cocok untuk 4R (2:3), 2R strip (1:3), atau polaroid (3:4).`;
	} else if (slots.length === 0) {
		error =
			"Kotak foto belum terdeteksi. Buat kotak foto transparan, atau isi dengan satu warna polos (mis. kuning) lalu pilih warnanya di sini.";
	}
	if (frameSize && slots.length > 0 && slots.length > 6)
		warnings.push(
			`${slots.length} kotak foto terdeteksi — pastikan tidak ada area lain yang ikut terhapus.`,
		);
	return {
		width,
		height,
		frameSize,
		orientation,
		slots,
		key: setting,
		pixels,
		error,
		warnings,
	};
}

/** Piksel → PNG Blob untuk diunggah. */
export async function toPngBlob(r: FrameResult): Promise<Blob> {
	const canvas = new OffscreenCanvas(r.width, r.height);
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Browser tidak mendukung pengolahan gambar.");
	ctx.putImageData(new ImageData(r.pixels, r.width, r.height), 0, 0);
	return canvas.convertToBlob({ type: "image/png" });
}

/** Gambar pratinjau: hasil + kotak foto diisi foto contoh abu & garis slot. */
export function drawPreview(
	canvas: HTMLCanvasElement,
	r: FrameResult,
	maxW = 600,
): void {
	const scale = Math.min(1, maxW / r.width);
	canvas.width = Math.round(r.width * scale);
	canvas.height = Math.round(r.height * scale);
	const ctx = canvas.getContext("2d");
	if (!ctx) return;
	const tmp = new OffscreenCanvas(r.width, r.height);
	tmp
		.getContext("2d")
		?.putImageData(new ImageData(r.pixels, r.width, r.height), 0, 0);
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	// Isi slot dengan "foto" contoh supaya terasa seperti hasil cetak.
	r.slots.forEach((s, i) => {
		const g = ctx.createLinearGradient(
			s.x * scale,
			s.y * scale,
			(s.x + s.w) * scale,
			(s.y + s.h) * scale,
		);
		g.addColorStop(0, ["#c9d6ea", "#e6d3c3", "#d3e4cf", "#e8d5e6"][i % 4]);
		g.addColorStop(1, ["#8ea6c8", "#c9a88f", "#9fbf98", "#c29cc0"][i % 4]);
		ctx.fillStyle = g;
		ctx.fillRect(s.x * scale, s.y * scale, s.w * scale, s.h * scale);
	});
	ctx.drawImage(tmp, 0, 0, canvas.width, canvas.height);
	ctx.strokeStyle = "#10b981";
	ctx.lineWidth = 2;
	ctx.setLineDash([6, 4]);
	r.slots.forEach((s, i) => {
		ctx.strokeRect(
			s.x * scale + 1,
			s.y * scale + 1,
			s.w * scale - 2,
			s.h * scale - 2,
		);
		ctx.fillStyle = "#10b981";
		ctx.font = "bold 14px system-ui";
		ctx.fillText(String(i + 1), s.x * scale + 8, s.y * scale + 20);
	});
}
