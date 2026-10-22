import { Briefcase, HandCoins, Receipt, UserPlus } from "lucide-react";
import { redirect } from "next/navigation";
import { DaftarRekanan } from "@/components/portal/daftar-rekanan";
import {
	type AuthFeature,
	AuthShell,
} from "@/components/portal/dash/auth-shell";
import { getPortalPerson } from "@/lib/portal/auth";
import { vendorContactsOf } from "@/lib/portal/vendor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Daftar rekanan" };

// Skema resmi (owner 8 & 22 Okt 2026): satu angka untuk semua rekanan, tidak
// pernah harga khusus vendor lain.
const FEATURES: AuthFeature[] = [
	{
		icon: HandCoins,
		tint: "#F8D98B",
		title: "Komisi 10% atau potongan 10%",
		body: "Dari harga publish Tetra. Pilih: klien bayar ke Tetra lalu kamu dapat komisi, atau kamu bayar ke Tetra 10% lebih murah.",
	},
	{
		icon: Briefcase,
		tint: "#D6F1EA",
		title: "Semua klien di satu dasbor",
		body: "Tiap acara klien kamu yang memakai Tetra otomatis masuk, lengkap dengan status & yang perlu ditindaklanjuti.",
	},
	{
		icon: Receipt,
		tint: "#FCE3C6",
		title: "Tagihan & komisi tercatat",
		body: "Sisa tagihan ke Tetra dan rekap komisi per acara, tanpa tanya-tanya admin.",
	},
	{
		icon: UserPlus,
		tint: "#CEC8F6",
		title: "Undang klien kamu",
		body: "Klien mengisi data acara & memilih desain frame sendiri. Harga tetap urusanmu.",
	},
];

export default async function DaftarRekananPage() {
	const person = await getPortalPerson();
	// Sudah rekanan → tidak membuat akun kedua.
	if (person && (await vendorContactsOf(person.id)).length) redirect("/akun");
	return (
		<AuthShell
			tone="#FFF0C2"
			eyebrow="Rekanan Tetra Photobooth"
			title="Jadi rekanan Tetra, kelola semua klien photobooth kamu"
			lead="Untuk WO, EO, venue, dan vendor acara. Gratis, tanpa password — masuk pakai WhatsApp."
			features={FEATURES}
		>
			<div style={{ display: "grid", gap: 6 }}>
				<h2
					style={{
						margin: 0,
						fontSize: 22,
						fontWeight: 800,
						letterSpacing: "-0.02em",
					}}
				>
					Buat akun rekanan
				</h2>
				<p
					style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: "#3A3936" }}
				>
					Isi data usaha, lalu verifikasi nomor WhatsApp. Dasbor rekanan
					langsung terbuka; tim Tetra menghubungi kamu untuk mengatur kerja
					samanya.
				</p>
			</div>
			<DaftarRekanan phone={person?.phone ?? null} />
			<p className="auth-help">
				Sudah punya akun? <a href="/akun">Masuk</a>
			</p>
		</AuthShell>
	);
}
