/**
 * Client-side image compression using Canvas API.
 *
 * Resizes images down to maxWidthPx (longest edge) and re-encodes as JPEG
 * at the given quality. Skips PDFs and small images (already < targetMaxBytes).
 *
 * Why client-side: mobile photos from modern phones are 5-12 MB each. Sending
 * raw to Drive eats crew data + slow on cellular. Compressing to ~600 KB JPEG
 * preserves enough detail for proof photos (counter screen, receipts) while
 * cutting upload payload ~10-20x.
 */
export type CompressOptions = {
	maxWidthPx?: number;
	quality?: number;
	targetMaxBytes?: number;
};

const DEFAULTS: Required<CompressOptions> = {
	maxWidthPx: 1920,
	quality: 0.82,
	targetMaxBytes: 1024 * 1024,
};

export async function compressImage(
	file: File,
	options: CompressOptions = {},
): Promise<File> {
	const opts = { ...DEFAULTS, ...options };

	if (!file.type.startsWith("image/")) return file;
	if (file.type === "image/gif") return file;
	if (file.size <= opts.targetMaxBytes) return file;

	const bitmap = await loadBitmap(file);
	if (!bitmap) return file;

	const { width, height } = scaleToMax(
		bitmap.width,
		bitmap.height,
		opts.maxWidthPx,
	);

	const canvas =
		typeof OffscreenCanvas !== "undefined"
			? new OffscreenCanvas(width, height)
			: (() => {
					const c = document.createElement("canvas");
					c.width = width;
					c.height = height;
					return c;
				})();

	const ctx = (
		canvas as HTMLCanvasElement | OffscreenCanvas
	).getContext("2d") as
		| CanvasRenderingContext2D
		| OffscreenCanvasRenderingContext2D
		| null;
	if (!ctx) {
		bitmap.close?.();
		return file;
	}

	ctx.drawImage(bitmap, 0, 0, width, height);
	bitmap.close?.();

	const blob = await canvasToBlob(canvas, opts.quality);
	if (!blob) return file;
	if (blob.size >= file.size) return file;

	const originalName = file.name.replace(/\.(heic|heif|png|webp)$/i, ".jpg");
	const finalName = originalName.match(/\.jpg$/i)
		? originalName
		: `${originalName.replace(/\.[^.]+$/, "")}.jpg`;

	return new File([blob], finalName, {
		type: "image/jpeg",
		lastModified: file.lastModified,
	});
}

async function loadBitmap(file: File): Promise<ImageBitmap | null> {
	if (typeof createImageBitmap !== "function") return null;
	try {
		return await createImageBitmap(file);
	} catch {
		return null;
	}
}

function scaleToMax(
	srcW: number,
	srcH: number,
	maxEdge: number,
): { width: number; height: number } {
	const longest = Math.max(srcW, srcH);
	if (longest <= maxEdge) return { width: srcW, height: srcH };
	const ratio = maxEdge / longest;
	return {
		width: Math.round(srcW * ratio),
		height: Math.round(srcH * ratio),
	};
}

async function canvasToBlob(
	canvas: HTMLCanvasElement | OffscreenCanvas,
	quality: number,
): Promise<Blob | null> {
	if (canvas instanceof OffscreenCanvas) {
		try {
			return await canvas.convertToBlob({ type: "image/jpeg", quality });
		} catch {
			return null;
		}
	}
	return new Promise((resolve) => {
		canvas.toBlob((b) => resolve(b), "image/jpeg", quality);
	});
}
