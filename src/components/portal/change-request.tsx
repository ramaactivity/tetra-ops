"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { requestChange } from "@/lib/actions/portal-booking";
import { Calendar, TimeChips } from "./booking-wizard";
import { Err } from "./verify-phone";

const rp = (n: number) => `Rp${n.toLocaleString("id-ID")}`;

export type OpenRequest = {
	kind: "pindah_tanggal" | "batal";
	new_date: string | null;
	created_at: string;
};

/**
 * Pindah tanggal / batal (DR-034). Draf langsung batal; booking resmi jadi
 * permintaan yang diputuskan admin.
 */
export function ChangeRequest({
	code,
	isDraft,
	canCancel,
	refundEstimate,
	openRequest,
}: {
	code: string;
	isDraft: boolean;
	canCancel: boolean;
	/** Perkiraan uang kembali kalau batal sekarang (null = belum ada pembayaran tercatat). */
	refundEstimate: number | null;
	openRequest: OpenRequest | null;
}) {
	const router = useRouter();
	const [mode, setMode] = useState<"pindah_tanggal" | "batal" | null>(null);
	const [date, setDate] = useState("");
	const [start, setStart] = useState<string | null>(null);
	const [reason, setReason] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	if (openRequest)
		return (
			<div className="note" style={{ background: "var(--sky)" }}>
				Permintaan{" "}
				{openRequest.kind === "batal"
					? "pembatalan"
					: `pindah tanggal ke ${openRequest.new_date}`}{" "}
				sedang diproses admin. Kabarnya kami kirim lewat WhatsApp.
			</div>
		);

	async function send() {
		if (!mode) return;
		setBusy(true);
		setError(null);
		const r = await requestChange(code, {
			kind: mode,
			newDate: date || undefined,
			newStart: start,
			reason,
		});
		setBusy(false);
		if (!r.ok) return setError(r.error);
		setMode(null);
		router.refresh();
	}

	return (
		<div className="card" style={{ display: "grid", gap: 12 }}>
			<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
				{!isDraft && (
					<button
						type="button"
						className="chip"
						aria-pressed={mode === "pindah_tanggal"}
						onClick={() =>
							setMode(mode === "pindah_tanggal" ? null : "pindah_tanggal")
						}
					>
						Pindah tanggal
					</button>
				)}
				{canCancel && (
					<button
						type="button"
						className="chip"
						aria-pressed={mode === "batal"}
						onClick={() => setMode(mode === "batal" ? null : "batal")}
					>
						{isDraft ? "Batalkan draf" : "Batalkan booking"}
					</button>
				)}
			</div>

			{mode === "pindah_tanggal" && (
				<>
					<p className="cap">
						Tanpa biaya, diajukan paling lambat 30 hari sebelum acara dan selama
						jadwal baru masih ada.
					</p>
					<Calendar value={date} onChange={setDate} />
					<div className="label" style={{ margin: 0 }}>
						Jam mulai (opsional)
					</div>
					<TimeChips value={start} onChange={setStart} />
				</>
			)}
			{mode === "batal" && !isDraft && (
				<div className="note" style={{ background: "var(--peach)" }}>
					{refundEstimate === null
						? "DP ditahan sebagai biaya pembatalan."
						: refundEstimate > 0
							? `DP ditahan sebagai biaya pembatalan. Perkiraan uang kembali kalau batal sekarang: ${rp(refundEstimate)}.`
							: "Sesuai kebijakan refund, DP ditahan sebagai biaya pembatalan dan pembayaran lain tidak dapat dikembalikan kalau batal sekarang."}{" "}
					<a
						className="link"
						href="https://tetraphoto.com/kebijakan-refund"
						target="_blank"
						rel="noopener"
					>
						Lihat aturan pembatalan
					</a>
				</div>
			)}
			{mode && !isDraft && (
				<textarea
					className="input"
					placeholder={
						mode === "batal"
							? "Alasan batal (opsional)"
							: "Catatan untuk admin (opsional)"
					}
					value={reason}
					maxLength={500}
					onChange={(e) => setReason(e.target.value)}
					aria-label="Catatan"
				/>
			)}
			{error && <Err text={error} />}
			{mode && (
				<button
					type="button"
					className="btn btn-block"
					style={mode === "batal" ? { background: "var(--coral)" } : undefined}
					disabled={busy || (mode === "pindah_tanggal" && !date)}
					onClick={send}
				>
					{busy
						? "Mengirim…"
						: mode === "pindah_tanggal"
							? "Ajukan pindah tanggal"
							: isDraft
								? "Ya, batalkan draf ini"
								: "Ajukan pembatalan"}
				</button>
			)}
		</div>
	);
}
