"use client";

/**
 * Setup booking WO ↔ klien (owner 9 Okt 2026): siapa yang membayar ke Tetra
 * (klien langsung = komisi; WO = potongan langsung) dan apakah klien undangan
 * melihat harga & dokumen Tetra. Dipakai sebagai kartu setup pertama di
 * Ringkasan dan sebagai pengaturan tetap di Orang & akses.
 */
import { Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { setBookingArrangement } from "@/lib/actions/portal-booking";

type Payer = "klien" | "wo";

function Opt({
	on,
	title,
	hint,
	disabled,
	onClick,
}: {
	on: boolean;
	title: string;
	hint: string;
	disabled?: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			className="opt"
			aria-pressed={on}
			disabled={disabled}
			onClick={onClick}
			style={disabled && !on ? { opacity: 0.5 } : undefined}
		>
			<span style={{ display: "block", fontSize: 14, fontWeight: 800 }}>
				{title}
			</span>
			<span className="cap" style={{ display: "block", marginTop: 2 }}>
				{hint}
			</span>
		</button>
	);
}

export function ArrangementCard({
	code,
	payer: initialPayer,
	priceVisible: initialVisible,
	locked,
	setup,
	inviteHref,
}: {
	code: string;
	/** Pembayar saat ini (tersimpan atau bawaan dari mode komisi); null = belum. */
	payer: Payer | null;
	priceVisible: boolean;
	/** Booking sudah resmi: pembayar tidak bisa diubah dari dashboard. */
	locked: boolean;
	/** Mode setup pertama (tombol simpan + lanjut undang klien). */
	setup?: boolean;
	inviteHref: string;
}) {
	const router = useRouter();
	const [payer, setPayer] = useState<Payer | null>(initialPayer);
	const [visible, setVisible] = useState(initialVisible);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [saved, setSaved] = useState(false);

	async function save(p: Payer | null, v: boolean, go?: boolean) {
		setBusy(true);
		setError(null);
		const r = await setBookingArrangement(code, {
			...(p ? { payer: p } : {}),
			priceVisible: v,
		});
		setBusy(false);
		if (!r.ok) return setError(r.error);
		setSaved(true);
		if (go) router.push(inviteHref);
		else router.refresh();
	}

	// Mode tetap: simpan langsung setiap kali pilihan berubah.
	const pick = (p: Payer | null, v: boolean) => {
		setPayer(p);
		setVisible(v);
		setSaved(false);
		if (!setup) void save(p, v);
	};

	const sees = (ok: boolean, text: string) => (
		<li key={text} style={{ display: "flex", gap: 8, alignItems: "center" }}>
			{ok ? (
				<Check aria-hidden size={16} strokeWidth={3} color="#2F8F55" />
			) : (
				<X aria-hidden size={16} strokeWidth={3} color="#B4442F" />
			)}
			<span>{text}</span>
		</li>
	);
	const clientPays = payer === "klien";
	const clientSeesMoney = clientPays || visible;

	return (
		<div className="tp" style={{ minHeight: 0, background: "transparent" }}>
			<div className="card" style={{ display: "grid", gap: 14 }}>
				<div>
					<h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>
						{setup ? "Atur dulu booking ini" : "Pengaturan klien"}
					</h2>
					{setup && (
						<p className="cap" style={{ margin: "4px 0 0" }}>
							Dua pertanyaan singkat supaya dashboard kamu dan klien tampil
							sesuai kesepakatan kalian.
						</p>
					)}
				</div>

				<div style={{ display: "grid", gap: 8 }}>
					<div className="label" style={{ margin: 0 }}>
						1. Siapa yang membayar ke Tetra?
					</div>
					<div
						style={{
							display: "grid",
							gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
							gap: 10,
						}}
					>
						<Opt
							on={payer === "klien"}
							disabled={locked && payer !== "klien"}
							title="Klien bayar langsung ke Tetra"
							hint="Klien bayar DP & pelunasan di dashboard ini. Komisi kamu dikirim Tetra setelah acara."
							onClick={() => pick("klien", visible)}
						/>
						<Opt
							on={payer === "wo"}
							disabled={locked && payer !== "wo"}
							title="Klien bayar ke saya"
							hint="Kamu yang bayar ke Tetra di dashboard ini (potongan langsung). Harga Tetra tetap urusan kamu."
							onClick={() => pick("wo", visible)}
						/>
					</div>
					{locked && (
						<p className="cap" style={{ margin: 0 }}>
							Booking sudah resmi, jadi cara bayar terkunci. Chat admin Tetra
							kalau perlu diubah.
						</p>
					)}
				</div>

				{payer === "wo" && (
					<div style={{ display: "grid", gap: 8 }}>
						<div className="label" style={{ margin: 0 }}>
							2. Klien boleh melihat harga Tetra?
						</div>
						<div
							style={{
								display: "grid",
								gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
								gap: 10,
							}}
						>
							<Opt
								on={!visible}
								title="Sembunyikan (disarankan)"
								hint="Klien hanya melihat data acara, desain, dan galeri."
								onClick={() => pick(payer, false)}
							/>
							<Opt
								on={visible}
								title="Tampilkan harga asli"
								hint="Klien melihat total, riwayat bayar, invoice & kuitansi, tanpa bisa membayar."
								onClick={() => pick(payer, true)}
							/>
						</div>
					</div>
				)}

				{payer && (
					<div
						className="note"
						style={{ background: "#F8F7F4", display: "grid", gap: 6 }}
					>
						<b>Yang dilihat klien kamu:</b>
						<ul
							style={{
								listStyle: "none",
								margin: 0,
								padding: 0,
								display: "grid",
								gap: 4,
							}}
						>
							{sees(true, "Data acara, desain frame, galeri foto")}
							{sees(clientSeesMoney, "Harga, tagihan & riwayat bayar")}
							{sees(clientSeesMoney, "Invoice & kuitansi Tetra")}
							{sees(clientPays, "Tombol bayar DP & pelunasan")}
							{sees(false, "Komisi atau potongan kamu dengan Tetra")}
						</ul>
					</div>
				)}

				{error && (
					<p role="alert" style={{ margin: 0, fontSize: 13, color: "#B4442F" }}>
						{error}
					</p>
				)}
				{setup ? (
					<button
						type="button"
						className="btn btn-primary"
						disabled={!payer || busy}
						onClick={() => save(payer, visible, true)}
					>
						{busy ? "Menyimpan…" : "Simpan & undang klien"}
					</button>
				) : (
					saved && (
						<p className="cap" role="status" style={{ margin: 0 }}>
							Tersimpan.
						</p>
					)
				)}
			</div>
		</div>
	);
}
