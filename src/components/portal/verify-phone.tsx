"use client";

import { MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";
import {
	checkVerification,
	startEmailVerification,
	startWaVerification,
	submitEmailCode,
} from "@/lib/actions/portal-auth";

/**
 * Verifikasi nomor WA tanpa password (DR-027). Klien mengirim kode ke nomor
 * Tetra; tab ini menunggu sampai bot meneruskannya. Cadangan: kode lewat email.
 * `beforeStart` dipakai pemanggil untuk menolak lanjut (mis. belum centang
 * persetujuan); kembalikan pesan error atau null.
 */
export function VerifyPhone({
	askName,
	cta,
	beforeStart,
	onDone,
}: {
	askName: boolean;
	cta: string;
	beforeStart?: () => string | null;
	onDone: () => void | Promise<void>;
}) {
	const [name, setName] = useState("");
	const [phone, setPhone] = useState("");
	const [email, setEmail] = useState("");
	const [mode, setMode] = useState<"wa" | "email">("wa");
	const [pending, setPending] = useState<{
		id: string;
		code?: string;
		waUrl?: string;
	} | null>(null);
	const [emailCode, setEmailCode] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	// Tunggu bot meneruskan kode. Berhenti kalau selesai / kedaluwarsa.
	useEffect(() => {
		if (!pending?.code) return;
		let stop = false;
		const t = setInterval(async () => {
			const r = await checkVerification(pending.id).catch(() => null);
			if (stop || !r) return;
			if (r.status === "selesai") {
				stop = true;
				clearInterval(t);
				await onDone();
			} else if (r.status === "kedaluwarsa") {
				stop = true;
				clearInterval(t);
				setPending(null);
				setError("Kode sudah kedaluwarsa. Coba lagi, ya.");
			}
		}, 3000);
		return () => {
			stop = true;
			clearInterval(t);
		};
	}, [pending, onDone]);

	async function start() {
		const blocked = beforeStart?.();
		if (blocked) return setError(blocked);
		setBusy(true);
		setError(null);
		const input = { phone, name: askName ? name : undefined };
		const r =
			mode === "wa"
				? await startWaVerification(input)
				: await startEmailVerification({ ...input, email });
		setBusy(false);
		if (!r.ok) return setError(r.error);
		setPending(r);
		const waUrl = (r as { waUrl?: string }).waUrl;
		if (waUrl) window.open(waUrl, "_blank", "noopener");
	}

	async function confirmEmail() {
		if (!pending) return;
		setBusy(true);
		const r = await submitEmailCode(pending.id, emailCode);
		setBusy(false);
		if (!r.ok) return setError(r.error);
		await onDone();
	}

	if (pending?.code)
		return (
			<div className="card layered enter" style={{ display: "grid", gap: 14 }}>
				<div className="h2">Kirim kode ini lewat WhatsApp</div>
				<div
					className="mono"
					style={{
						fontSize: 30,
						fontWeight: 500,
						letterSpacing: "0.08em",
						textAlign: "center",
						padding: "10px 0",
					}}
				>
					{pending.code}
				</div>
				<p className="body">
					WhatsApp sudah kami bukakan dengan pesan berisi kode. Tinggal tekan
					kirim. Halaman ini lanjut sendiri setelah pesannya masuk.
				</p>
				<a
					className="btn btn-primary btn-block"
					href={pending.waUrl}
					target="_blank"
					rel="noopener"
				>
					<MessageCircle size={18} strokeWidth={2} /> Buka WhatsApp
				</a>
				<div className="note" style={{ background: "var(--sky)" }}>
					Kirim dari nomor <span className="mono">{phone}</span>, ya. Menunggu
					pesanmu…
				</div>
				<button
					type="button"
					className="link cap"
					onClick={() => setPending(null)}
				>
					Ganti nomor
				</button>
			</div>
		);

	if (pending && mode === "email")
		return (
			<div className="card layered enter" style={{ display: "grid", gap: 12 }}>
				<div className="h2">Cek email kamu</div>
				<p className="body">
					Kode 6 angka sudah dikirim ke <b>{email}</b>.
				</p>
				<input
					className="input mono"
					inputMode="numeric"
					autoComplete="one-time-code"
					maxLength={6}
					placeholder="123456"
					value={emailCode}
					onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, ""))}
				/>
				{error && <Err text={error} />}
				<button
					type="button"
					className="btn btn-primary btn-block"
					disabled={busy || emailCode.length !== 6}
					onClick={confirmEmail}
				>
					Masuk
				</button>
			</div>
		);

	return (
		<div style={{ display: "grid", gap: 14 }}>
			{askName && (
				<div>
					<label className="label" htmlFor="v-name">
						Nama kamu
					</label>
					<input
						id="v-name"
						className="input"
						autoComplete="name"
						placeholder="Nama lengkap"
						value={name}
						onChange={(e) => setName(e.target.value)}
					/>
				</div>
			)}
			<div>
				<label className="label" htmlFor="v-phone">
					Nomor WhatsApp
				</label>
				<input
					id="v-phone"
					className="input mono"
					type="tel"
					inputMode="tel"
					autoComplete="tel"
					placeholder="0812 3456 7890"
					value={phone}
					onChange={(e) => setPhone(e.target.value)}
				/>
			</div>
			{mode === "email" && (
				<div>
					<label className="label" htmlFor="v-email">
						Email
					</label>
					<input
						id="v-email"
						className="input"
						type="email"
						autoComplete="email"
						placeholder="nama@email.com"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
					/>
				</div>
			)}
			{error && <Err text={error} />}
			<button
				type="button"
				className="btn btn-primary btn-block"
				disabled={
					busy ||
					phone.trim().length < 8 ||
					(askName && name.trim().length < 2) ||
					(mode === "email" && !email.includes("@"))
				}
				onClick={start}
			>
				{busy ? "Sebentar…" : mode === "wa" ? cta : "Kirim kode ke email"}
			</button>
			<button
				type="button"
				className="link cap"
				style={{ justifySelf: "center" }}
				onClick={() => {
					setMode(mode === "wa" ? "email" : "wa");
					setError(null);
				}}
			>
				{mode === "wa"
					? "Tidak bisa pakai WhatsApp? Pakai email"
					: "Pakai WhatsApp saja"}
			</button>
		</div>
	);
}

export function Err({ text }: { text: string }) {
	return (
		<div className="note" role="alert" style={{ background: "var(--coral)" }}>
			{text}
		</div>
	);
}
