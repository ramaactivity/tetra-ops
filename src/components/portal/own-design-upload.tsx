"use client";

import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFrame } from "@/components/design/use-frame";
import {
	requestOwnDesignUpload,
	submitOwnDesign,
} from "@/lib/actions/portal-design";
import { DEFAULT_TOLERANCE } from "@/lib/design/chroma";
import { toPngBlob } from "@/lib/design/process-frame";
import { Err } from "./verify-phone";

const checker =
	"repeating-conic-gradient(#efede8 0% 25%, #fff 0% 50%) 50% / 16px 16px";

/**
 * Klien mengunggah desain buatannya sendiri (Canva/Photoshop, teks sudah di
 * dalam). Kotak foto boleh transparan atau diisi satu warna polos — warnanya
 * dihapus otomatis (chroma key) lalu kotak foto dideteksi. Lolos cek → langsung
 * dipakai, designer dikabari.
 */
export function OwnDesignUpload({
	code,
	requestId,
	size,
}: {
	code: string;
	requestId: string;
	size: string | null;
}) {
	const router = useRouter();
	const f = useFrame(520);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [confirm, setConfirm] = useState(false);
	const r = f.result;
	const sizeMismatch =
		r?.frameSize && size && r.frameSize !== size
			? `Pesananmu ukuran ${size}, desain ini ${r.frameSize}.`
			: null;
	const problem = r?.error ?? sizeMismatch;

	async function send() {
		if (!r || problem) return;
		setBusy(true);
		setError(null);
		try {
			const blob = await toPngBlob(r);
			const up = await requestOwnDesignUpload(code, requestId, blob.size);
			if (!up.ok) throw new Error(up.error);
			const put = await fetch(up.uploadUrl, {
				method: "PUT",
				body: blob,
				headers: { "content-type": "image/png" },
			});
			if (!put.ok) throw new Error("Upload gagal. Cek koneksi lalu coba lagi.");
			const res = await submitOwnDesign(code, requestId, {
				path: up.path,
				slotCount: r.slots.length,
			});
			if (!res.ok) throw new Error(res.error);
			router.refresh();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Gagal mengunggah.");
		}
		setBusy(false);
	}

	if (!f.src)
		return (
			<div style={{ display: "grid", gap: 10 }}>
				<div className="note">
					Punya desain sendiri dari Canva/Photoshop? Unggah PNG-nya di sini.
					Kotak foto boleh <b>transparan</b> atau diisi <b>satu warna polos</b>{" "}
					(mis. kuning) — warnanya kami hapus otomatis.
					{size
						? ` Ukuran pesananmu ${size}${size === "4R" ? " (1200×1800 atau kelipatannya)" : size === "2R" ? " (strip 600×1800)" : " (900×1200)"}.`
						: ""}
				</div>
				<label
					className="card"
					style={{
						display: "grid",
						placeItems: "center",
						gap: 8,
						padding: "28px 16px",
						borderStyle: "dashed",
						cursor: "pointer",
						textAlign: "center",
						opacity: f.busy ? 0.6 : 1,
					}}
				>
					<Upload size={22} />
					<span style={{ fontWeight: 800 }}>
						{f.busy ? "Membaca desain…" : "Pilih file desain (PNG)"}
					</span>
					<span className="cap">Maksimal 25 MB</span>
					<input
						type="file"
						accept="image/png,image/jpeg,image/webp"
						style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
						onChange={(e) => {
							const file = e.target.files?.[0];
							if (file) f.load(file);
							e.target.value = "";
						}}
					/>
				</label>
				{f.loadError && <Err text={f.loadError} />}
			</div>
		);

	return (
		<div style={{ display: "grid", gap: 12 }}>
			<div
				style={{
					display: "grid",
					placeItems: "center",
					padding: 10,
					borderRadius: 14,
					border: "1.5px solid var(--ink)",
					background: checker,
				}}
			>
				<canvas
					ref={f.canvasRef}
					onClick={f.pickAt}
					style={{
						maxWidth: "100%",
						maxHeight: "60vh",
						borderRadius: 8,
						cursor: "crosshair",
					}}
				/>
			</div>
			<div className="cap">
				Kotak hijau bernomor = tempat foto tamu. Kalau ada kotak yang belum
				terbaca, ketuk warnanya di gambar.
			</div>

			{r && (
				<div
					className="note"
					style={{
						background: problem ? "var(--peach)" : "var(--mint-soft)",
						borderStyle: "solid",
					}}
				>
					<b>
						{problem
							? "Belum bisa dipakai"
							: `Siap dipakai · ${r.frameSize} · ${r.slots.length} kotak foto`}
					</b>
					<div>{problem ?? `${r.width}×${r.height} px.`}</div>
					{!problem &&
						r.warnings.map((w) => (
							<div key={w} className="cap">
								{w}
							</div>
						))}
				</div>
			)}

			<div style={{ display: "grid", gap: 8 }}>
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
						gap: 8,
					}}
				>
					<span className="label" style={{ margin: 0 }}>
						Hapus warna kotak foto
					</span>
					<button
						type="button"
						className="link cap"
						onClick={() =>
							f.setKey(
								f.key
									? null
									: {
											color: f.src?.suggested ?? "#00ff00",
											tolerance: DEFAULT_TOLERANCE,
										},
							)
						}
					>
						{f.key ? "Matikan" : "Nyalakan"}
					</button>
				</div>
				{f.key ? (
					<div style={{ display: "grid", gap: 8 }}>
						<div style={{ display: "flex", gap: 10, alignItems: "center" }}>
							<input
								type="color"
								value={f.key.color}
								aria-label="Warna kotak foto"
								onChange={(e) =>
									f.setKey({
										color: e.target.value,
										tolerance: f.key?.tolerance ?? DEFAULT_TOLERANCE,
									})
								}
								style={{
									width: 40,
									height: 40,
									border: "1.5px solid var(--ink)",
									borderRadius: 10,
									padding: 2,
									background: "#fff",
								}}
							/>
							<span className="cap mono">{f.key.color}</span>
							<button
								type="button"
								className="chip"
								style={{ marginLeft: "auto" }}
								onClick={() => f.setKey(undefined)}
							>
								Otomatis
							</button>
						</div>
						<label className="cap" style={{ display: "grid", gap: 4 }}>
							Kepekaan warna: {f.key.tolerance}
							<input
								type="range"
								min={2}
								max={40}
								value={f.key.tolerance}
								onChange={(e) =>
									f.setKey({
										color: f.key?.color ?? "#00ff00",
										tolerance: Number(e.target.value),
									})
								}
							/>
						</label>
					</div>
				) : (
					<div className="cap">
						{f.src.nativeHoles
							? "Kotak foto sudah transparan — tidak perlu dihapus warnanya."
							: "Mati. Nyalakan kalau kotak foto diisi warna polos."}
					</div>
				)}
			</div>

			{error && <Err text={error} />}
			{!confirm ? (
				<div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
					<button
						type="button"
						className="btn btn-primary"
						style={{ flex: 1 }}
						disabled={busy || f.busy || !r || !!problem}
						onClick={() => setConfirm(true)}
					>
						Pakai desain ini
					</button>
					<button type="button" className="chip" onClick={f.reset}>
						Ganti file
					</button>
				</div>
			) : (
				<div
					className="note"
					style={{ background: "var(--mint-soft)", display: "grid", gap: 10 }}
				>
					<span>
						Desain ini yang dicetak di acaramu, persis seperti pratinjau
						(termasuk teks di dalamnya). Tim kami tetap mengecek sebelum
						dipasang. Lanjut?
					</span>
					<div style={{ display: "flex", gap: 10 }}>
						<button
							type="button"
							className="btn btn-primary"
							disabled={busy}
							onClick={send}
						>
							{busy ? "Mengunggah…" : "Ya, pakai"}
						</button>
						<button
							type="button"
							className="link cap"
							onClick={() => setConfirm(false)}
						>
							Batal
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
