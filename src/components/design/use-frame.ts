"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_TOLERANCE, rgbToHex } from "@/lib/design/chroma";
import {
	drawPreview,
	type FrameResult,
	type FrameSource,
	type KeySetting,
	processFrame,
	readFrame,
} from "@/lib/design/process-frame";

/**
 * State bersama untuk upload frame (admin template & desain klien):
 * baca file → otomatis (lubang transparan / chroma key warna saran) →
 * bisa diatur ulang (warna, toleransi, ambil warna dengan klik pratinjau).
 */
export function useFrame(maxPreview = 560) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [src, setSrc] = useState<FrameSource | null>(null);
	const [key, setKey] = useState<KeySetting | undefined>(undefined);
	const [result, setResult] = useState<FrameResult | null>(null);
	const [busy, setBusy] = useState(false);
	const [loadError, setLoadError] = useState<string | null>(null);

	const load = useCallback(async (file: File) => {
		setBusy(true);
		setLoadError(null);
		setResult(null);
		try {
			if (!/^image\/(png|jpeg|webp)$/.test(file.type))
				throw new Error("File harus PNG (disarankan), JPG, atau WebP.");
			if (file.size > 25 * 1024 * 1024)
				throw new Error("Ukuran file maksimal 25 MB.");
			const s = await readFrame(file);
			setSrc(s);
			setKey(undefined);
		} catch (e) {
			setSrc(null);
			setLoadError(e instanceof Error ? e.message : "File tidak bisa dibaca.");
		}
		setBusy(false);
	}, []);

	// Hitung ulang setiap pengaturan berubah (ditunda sedikit supaya slider tidak berat).
	useEffect(() => {
		if (!src) return;
		setBusy(true);
		const t = setTimeout(() => {
			const r = processFrame(src, key);
			setResult(r);
			setBusy(false);
		}, 120);
		return () => clearTimeout(t);
	}, [src, key]);

	useEffect(() => {
		if (result && canvasRef.current)
			drawPreview(canvasRef.current, result, maxPreview);
	}, [result, maxPreview]);

	/** Klik pratinjau = ambil warna penanda dari gambar asli di titik itu. */
	const pickAt = useCallback(
		(e: React.MouseEvent<HTMLCanvasElement>) => {
			if (!src || !canvasRef.current) return;
			const r = canvasRef.current.getBoundingClientRect();
			const x = Math.floor(((e.clientX - r.left) / r.width) * src.width);
			const y = Math.floor(((e.clientY - r.top) / r.height) * src.height);
			const o = (y * src.width + x) * 4;
			if ((src.original[o + 3] ?? 0) < 128) return; // sudah transparan
			setKey({
				color: rgbToHex(
					src.original[o] ?? 0,
					src.original[o + 1] ?? 0,
					src.original[o + 2] ?? 0,
				),
				tolerance: (key ?? result?.key)?.tolerance ?? DEFAULT_TOLERANCE,
			});
		},
		[src, key, result],
	);

	return {
		canvasRef,
		src,
		result,
		key: result?.key ?? null,
		setKey,
		pickAt,
		load,
		busy,
		loadError,
		reset: () => {
			setSrc(null);
			setResult(null);
			setKey(undefined);
		},
	};
}
