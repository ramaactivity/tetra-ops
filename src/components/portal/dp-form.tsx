"use client";

import { Copy, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
	requestProofUpload,
	submitDpTransfer,
} from "@/lib/actions/portal-booking";
import { compressImage } from "@/lib/crew/image-compression";
import { createClient } from "@/lib/supabase/client";
import { Err } from "./verify-phone";

export type PortalBank = {
	id: string;
	bank_name: string;
	account_number: string;
	account_holder: string | null;
};

const rp = (n: number) => `Rp${n.toLocaleString("id-ID")}`;

/** Bayar DP lewat transfer: pilih rekening, isi nominal, unggah bukti. */
export function DpForm({
	code,
	banks,
	dpMin,
	total,
	missing,
}: {
	code: string;
	banks: PortalBank[];
	dpMin: number;
	total: number;
	/** Detail wajib yang belum diisi — DP ditahan sampai lengkap. */
	missing: string[];
}) {
	const router = useRouter();
	const min = Math.min(dpMin, total);
	const [bankId, setBankId] = useState(banks.length === 1 ? banks[0].id : "");
	const [amount, setAmount] = useState(String(min));
	const [file, setFile] = useState<File | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [copied, setCopied] = useState<string | null>(null);
	const nominal = Number(amount.replace(/\D/g, "")) || 0;

	async function submit() {
		if (!file) return;
		setBusy(true);
		setError(null);
		try {
			const f = await compressImage(file, { targetMaxBytes: 2 * 1024 * 1024 });
			const up = await requestProofUpload(code, { type: f.type, size: f.size });
			if (!up.ok) throw new Error(up.error);
			const { error: upErr } = await createClient()
				.storage.from("portal-private")
				.uploadToSignedUrl(up.path, up.token, f, { contentType: f.type });
			if (upErr)
				throw new Error("Upload bukti gagal. Cek koneksi lalu coba lagi.");
			const r = await submitDpTransfer(code, {
				amount: nominal,
				bankAccountId: bankId,
				path: up.path,
			});
			if (!r.ok) throw new Error(r.error);
			router.refresh();
		} catch (e) {
			setError(
				e instanceof Error ? e.message : "Gagal mengirim. Coba lagi, ya.",
			);
			setBusy(false);
		}
	}

	if (missing.length)
		return (
			<div className="note" style={{ background: "var(--peach)" }}>
				Sebelum bayar DP, lengkapi dulu: <b>{missing.join(", ")}</b>. Isiannya
				ada di bagian Detail acara di bawah.
			</div>
		);

	return (
		<div style={{ display: "grid", gap: 14 }}>
			<div>
				<div className="label">Transfer ke</div>
				<div style={{ display: "grid", gap: 8 }}>
					{banks.map((b) => (
						<div
							key={b.id}
							style={{ display: "flex", gap: 8, alignItems: "stretch" }}
						>
							<button
								type="button"
								className="opt"
								aria-pressed={bankId === b.id}
								onClick={() => setBankId(b.id)}
							>
								<div style={{ fontWeight: 800 }}>{b.bank_name}</div>
								<div className="mono" style={{ fontSize: 17, margin: "2px 0" }}>
									{b.account_number}
								</div>
								<div className="cap">a.n. {b.account_holder}</div>
							</button>
							<button
								type="button"
								className="chip"
								style={{ alignSelf: "center", flex: "none" }}
								onClick={() => {
									navigator.clipboard?.writeText(
										b.account_number.replace(/\s/g, ""),
									);
									setCopied(b.id);
								}}
							>
								<Copy size={14} /> {copied === b.id ? "Tersalin" : "Salin"}
							</button>
						</div>
					))}
				</div>
			</div>
			<div>
				<label className="label" htmlFor="dp-amount">
					Nominal yang ditransfer
				</label>
				<input
					id="dp-amount"
					className="input mono"
					inputMode="numeric"
					value={nominal ? nominal.toLocaleString("id-ID") : ""}
					onChange={(e) => setAmount(e.target.value)}
				/>
				<div className="cap" style={{ marginTop: 4 }}>
					Minimal {rp(min)}. Boleh lebih, maksimal {rp(total)}.
				</div>
			</div>
			<label
				className="note"
				style={{
					display: "flex",
					gap: 12,
					alignItems: "center",
					cursor: "pointer",
					background: "#fff",
				}}
			>
				<Upload size={20} />
				<span style={{ flex: 1 }}>
					{file ? file.name : "Unggah bukti transfer (foto atau PDF)"}
				</span>
				<input
					type="file"
					accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
					style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
					onChange={(e) => setFile(e.target.files?.[0] ?? null)}
				/>
			</label>
			{error && <Err text={error} />}
			<button
				type="button"
				className="btn btn-primary btn-block"
				disabled={busy || !file || !bankId || nominal < min || nominal > total}
				onClick={submit}
			>
				{busy ? "Mengirim…" : "Kirim bukti DP"}
			</button>
			<p className="cap">
				Setelah bukti terkirim, jadwal kamu kami tahan sambil admin mengecek.
				Biasanya tidak lama.
			</p>
		</div>
	);
}
