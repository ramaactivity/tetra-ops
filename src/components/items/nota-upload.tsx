"use client";

import { Loader2, Paperclip, X } from "lucide-react";
import { useRef, useState } from "react";

/**
 * Unggah foto/PDF nota langsung dari form Tambah Item.
 *
 * Sengaja diunggah SAAT FILE DIPILIH, bukan saat submit: form ini memakai
 * server action, jadi tidak ada celah untuk menunggu upload selesai sebelum
 * action jalan. Konsekuensinya kalau form ditinggalkan notanya tetap ada di
 * Arsip Nota — sama persis dengan hasil upload manual, jadi tidak ada yang
 * rusak, cuma perlu dihapus dari sana kalau memang tidak jadi.
 *
 * Setelah pembelian tercatat, server menautkan nota ini ke ref jurnalnya
 * lewat `buy_nota_id` (lihat linkNotaToEntry di lib/inventory/item-origin.ts),
 * jadi di Arsip Nota notanya nyambung ke jurnal pembeliannya.
 */
export function NotaUpload({
	itemName,
	amount,
	category = "Beli alatbarang",
}: {
	/** Nama item — jadi keterangan nota di Arsip Nota. */
	itemName: string;
	/** Nominal nota; 0 = tidak dikirim. */
	amount: number;
	category?: string;
}) {
	const [notaId, setNotaId] = useState("");
	const [fileName, setFileName] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);

	async function handlePick(file: File) {
		setBusy(true);
		setError("");
		try {
			const fd = new FormData();
			fd.set("file", file);
			fd.set("category", category);
			fd.set(
				"description",
				`Pembelian ${itemName.trim() || "item baru"}`.slice(0, 200),
			);
			fd.set("nota_date", new Date().toISOString().slice(0, 10));
			if (amount > 0) fd.set("amount", String(Math.round(amount)));
			const res = await fetch("/api/drive/upload/manual", {
				method: "POST",
				body: fd,
			});
			const json = await res.json();
			if (!res.ok || !json?.id) {
				setError(json?.error ?? "Upload gagal");
				return;
			}
			setNotaId(json.id);
			setFileName(json.name ?? file.name);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Upload gagal");
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="space-y-1.5">
			<input type="hidden" name="buy_nota_id" value={notaId} />
			<input
				ref={inputRef}
				type="file"
				accept="image/*,application/pdf"
				className="hidden"
				onChange={(e) => {
					const f = e.target.files?.[0];
					if (f) handlePick(f);
				}}
			/>
			{notaId ? (
				<div className="border-border-default bg-card flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
					<span className="text-foreground truncate text-[12.5px]">
						{fileName}
					</span>
					<button
						type="button"
						onClick={() => {
							setNotaId("");
							setFileName("");
							if (inputRef.current) inputRef.current.value = "";
						}}
						className="text-muted-foreground hover:text-foreground shrink-0"
						aria-label="Hapus nota"
					>
						<X className="size-4" aria-hidden />
					</button>
				</div>
			) : (
				<button
					type="button"
					disabled={busy}
					onClick={() => inputRef.current?.click()}
					className="press tap border-border-default text-muted-foreground flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-dashed text-[12.5px] transition-colors hover:bg-secondary disabled:opacity-60"
				>
					{busy ? (
						<Loader2 className="size-4 animate-spin" aria-hidden />
					) : (
						<Paperclip className="size-4" aria-hidden />
					)}
					{busy ? "Mengunggah…" : "Lampirkan foto / PDF nota"}
				</button>
			)}
			{error && <p className="text-destructive text-[11px]">{error}</p>}
			<p className="text-muted-foreground text-[11px]">
				Masuk ke Arsip Nota &amp; otomatis tertaut ke jurnal pembeliannya.
			</p>
		</div>
	);
}
