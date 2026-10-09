"use client";

/**
 * Halaman masuk portal (DR-045): satu pintu untuk klien & rekanan (vendor/WO),
 * dengan penjelasan apa yang didapat masing-masing dan cara masuk 3 langkah.
 * Login tetap sama (nomor WhatsApp, tanpa password) — pilihan peran hanya
 * mengarahkan penjelasan, dashboard yang tampil ditentukan nomornya.
 */
import {
	Briefcase,
	CalendarCheck,
	Images,
	Palette,
	Receipt,
	UserPlus,
	Wallet,
} from "lucide-react";
import { useState } from "react";
import { type AuthFeature, AuthShell } from "./dash/auth-shell";
import { PortalLogin } from "./portal-login";

const FEATURES: Record<"klien" | "vendor", AuthFeature[]> = {
	klien: [
		{
			icon: CalendarCheck,
			tint: "#D6F1EA",
			title: "Pantau booking & jadwal",
			body: "Status, langkah berikutnya, dan data acara di satu tempat.",
		},
		{
			icon: Wallet,
			tint: "#FCE3C6",
			title: "Bayar & simpan dokumen",
			body: "Unggah bukti transfer, invoice & kuitansi tersimpan rapi.",
		},
		{
			icon: Palette,
			tint: "#CEC8F6",
			title: "Desain frame & galeri",
			body: "Pilih desain, setujui draf, lalu unduh foto setelah acara.",
		},
	],
	vendor: [
		{
			icon: Briefcase,
			tint: "#F8D98B",
			title: "Semua klien di satu dasbor",
			body: "Setiap acara klien yang memakai Tetra, lengkap dengan status & yang perlu ditindaklanjuti.",
		},
		{
			icon: Receipt,
			tint: "#FCE3C6",
			title: "Tagihan & komisi",
			body: "Sisa tagihan ke Tetra dan rekap komisi per acara.",
		},
		{
			icon: UserPlus,
			tint: "#D6F1EA",
			title: "Undang klien kamu",
			body: "Klien mengisi data acara & memilih desain sendiri — harga tetap urusanmu.",
		},
		{
			icon: Images,
			tint: "#CEC8F6",
			title: "Galeri foto",
			body: "Foto booth tiap acara bisa dibuka setelah acara selesai.",
		},
	],
};

export function LoginScreen({ adminWa }: { adminWa: string | null }) {
	const [role, setRole] = useState<"klien" | "vendor">("klien");
	const help = adminWa
		? `https://wa.me/${adminWa}?text=${encodeURIComponent(
				role === "vendor"
					? "Halo Tetra, saya vendor/WO dan mau minta akses dasbor rekanan."
					: "Halo Tetra, saya mau masuk ke dashboard booking saya.",
			)}`
		: null;
	return (
		<AuthShell
			tone={role === "vendor" ? "#FFF0C2" : "#D6EEF8"}
			eyebrow={
				role === "vendor" ? "Dasbor rekanan Tetra" : "Dashboard acara Tetra"
			}
			title={
				role === "vendor"
					? "Kelola semua klien kamu yang memakai Tetra"
					: "Semua tentang acaramu, di satu tempat"
			}
			lead={
				role === "vendor"
					? "Untuk WO, EO, dan vendor rekanan Tetra Photobooth."
					: "Untuk pemesan, pengantin, dan keluarga yang mengurus acara."
			}
			features={FEATURES[role]}
		>
			<div className="auth-seg">
				<button
					type="button"
					aria-pressed={role === "klien"}
					onClick={() => setRole("klien")}
				>
					Saya klien acara
				</button>
				<button
					type="button"
					aria-pressed={role === "vendor"}
					onClick={() => setRole("vendor")}
				>
					Saya vendor / WO
				</button>
			</div>
			<div style={{ display: "grid", gap: 6 }}>
				<h2
					style={{
						margin: 0,
						fontSize: 22,
						fontWeight: 800,
						letterSpacing: "-0.02em",
					}}
				>
					Masuk pakai WhatsApp
				</h2>
				<p
					style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: "#3A3936" }}
				>
					{role === "vendor"
						? "Pakai nomor yang didaftarkan atau diundang admin Tetra. Tanpa password."
						: "Pakai nomor yang kamu pakai waktu booking atau yang diundang. Tanpa password."}
				</p>
			</div>
			<ol className="auth-steps">
				<li>Isi nomor WhatsApp, lalu ketuk Masuk.</li>
				<li>
					WhatsApp terbuka dengan pesan kode yang sudah terisi — tinggal kirim.
				</li>
				<li>Halaman ini otomatis masuk ke dashboard kamu.</li>
			</ol>
			<PortalLogin />
			<p className="auth-help">
				{role === "vendor" ? (
					<>
						Belum punya akses?{" "}
						{help ? (
							<a href={help} target="_blank" rel="noopener noreferrer">
								Minta ke admin Tetra
							</a>
						) : (
							"Minta ke admin Tetra."
						)}
					</>
				) : (
					<>
						Belum pernah booking? <a href="/booking">Mulai booking</a>
						{help && (
							<>
								{" · "}
								<a href={help} target="_blank" rel="noopener noreferrer">
									Butuh bantuan?
								</a>
							</>
						)}
					</>
				)}
			</p>
		</AuthShell>
	);
}
