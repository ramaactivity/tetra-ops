"use client";

/**
 * Form daftar rekanan mandiri (DR-050): data usaha → verifikasi nomor WA
 * (kode portal yang sama dengan booking) → akun dibuat → dasbor rekanan.
 * Sudah masuk portal = nomor sudah terbukti, langsung daftar.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { daftarRekanan } from "@/lib/actions/portal-rekanan";
import {
	JENIS_REKANAN,
	type JenisRekanan,
	SignupSchema,
} from "@/lib/portal/vendor-signup-core";
import { Err, VerifyPhone } from "./verify-phone";

const FIELDS = [
	["nama_usaha", "Nama usaha", "Mis. Bunga Wedding Organizer", "organization"],
	["nama_pic", "Nama kamu (PIC)", "Nama lengkap", "name"],
	["kota", "Kota", "Mis. Bogor", "address-level2"],
	["instagram", "Instagram usaha (opsional)", "@namausaha", "off"],
] as const;

export function DaftarRekanan({ phone }: { phone: string | null }) {
	const router = useRouter();
	const [f, setF] = useState({
		nama_usaha: "",
		nama_pic: "",
		kota: "",
		instagram: "",
	});
	const [jenis, setJenis] = useState<JenisRekanan | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const form = () => ({ ...f, jenis, kota: f.kota || null });
	// Cek isian sebelum minta kode WA (nomornya diisi di bawah).
	const check = () => {
		const r = SignupSchema.omit({ phone: true }).safeParse(form());
		return r.success
			? null
			: (r.error.issues[0]?.message ?? "Isian belum lengkap.");
	};
	const submit = async () => {
		setBusy(true);
		setError(null);
		const r = await daftarRekanan(form());
		if (!r.ok) {
			setBusy(false);
			setError(r.error);
			// Verifikasi barusan sudah membuka sesi → tampilan "sudah masuk".
			return router.refresh();
		}
		router.push("/akun");
	};

	return (
		<div style={{ display: "grid", gap: 14 }}>
			<div style={{ display: "grid", gap: 6 }}>
				<span className="label">Jenis usaha</span>
				<div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
					{(Object.keys(JENIS_REKANAN) as JenisRekanan[]).map((k) => (
						<button
							key={k}
							type="button"
							className="chip"
							aria-pressed={jenis === k}
							onClick={() => setJenis(k)}
						>
							{JENIS_REKANAN[k]}
						</button>
					))}
				</div>
			</div>
			{FIELDS.map(([k, label, ph, ac]) => (
				<div key={k}>
					<label className="label" htmlFor={`r-${k}`}>
						{label}
					</label>
					<input
						id={`r-${k}`}
						className="input"
						autoComplete={ac}
						placeholder={ph}
						maxLength={k === "kota" || k === "instagram" ? 60 : 80}
						value={f[k]}
						onChange={(e) => setF({ ...f, [k]: e.target.value })}
					/>
				</div>
			))}
			{phone ? (
				<>
					{error && <Err text={error} />}
					<button
						type="button"
						className="btn btn-primary btn-block"
						disabled={busy}
						onClick={() => {
							const blocked = check();
							if (blocked) return setError(blocked);
							void submit();
						}}
					>
						{busy ? "Sebentar…" : "Buat akun rekanan"}
					</button>
					<p className="auth-help" style={{ textAlign: "left" }}>
						Didaftarkan dengan nomor WhatsApp{" "}
						<span className="mono">{phone}</span> yang sedang masuk.
					</p>
				</>
			) : (
				<>
					{error && <Err text={error} />}
					<VerifyPhone
						askName={false}
						cta="Verifikasi & buat akun"
						beforeStart={check}
						allowEmail={false}
						onDone={submit}
					/>
				</>
			)}
		</div>
	);
}
