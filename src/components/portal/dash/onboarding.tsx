"use client";

/**
 * Panduan pertama masuk dashboard (owner 9 Okt 2026): 4 langkah singkat, isinya
 * beda untuk WO/vendor, klien undangan WO, dan pemesan biasa. Muncul otomatis
 * sekali (portal_people.onboarded_at), bisa dibuka lagi lewat menu "Panduan".
 */
import {
	CalendarCheck,
	EyeOff,
	Images,
	LayoutDashboard,
	type LucideIcon,
	MessageCircle,
	Palette,
	Sparkles,
	UserPlus,
	Wallet,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { markOnboarded } from "@/lib/actions/portal-booking";

export type GuideRole = "wo" | "klien_wo" | "pemesan";

type Slide = {
	icon: LucideIcon;
	tint: string;
	title: string;
	body: string;
	points?: string[];
};

function slides(x: {
	role: GuideRole;
	name: string | null;
	woName: string | null;
	eventName: string | null;
	priceVisible: boolean;
}): Slide[] {
	const hi = x.name ? `Halo, ${x.name.split(" ")[0]}!` : "Halo!";
	const wo = x.woName ?? "WO kamu";
	if (x.role === "wo")
		return [
			{
				icon: Sparkles,
				tint: "#F8D98B",
				title: `${hi} Ini dasbor rekanan Tetra`,
				body: "Semua booking photobooth klien kamu ada di sini: status, jadwal, desain, sampai galeri foto.",
			},
			{
				icon: LayoutDashboard,
				tint: "#CEC8F6",
				title: "Satu booking, satu dashboard",
				body: "Buka booking dari menu Booking saya. Di tiap booking:",
				points: [
					"Ringkasan: langkah berikutnya yang perlu dikerjakan",
					"Pembayaran & Dokumen: tagihan Tetra ke kamu, invoice, kuitansi",
					"Data acara & Desain frame: bisa kamu isi atau serahkan ke klien",
				],
			},
			{
				icon: UserPlus,
				tint: "#D6F1EA",
				title: "Undang klien kamu",
				body: "Di menu Orang & akses, isi nama dan WhatsApp klien. Mereka dapat link lewat WhatsApp dan masuk tanpa password.",
				points: [
					"Klien bisa melengkapi data acara & memilih desain",
					"Klien tidak bisa mengubah atau membatalkan booking",
				],
			},
			{
				icon: EyeOff,
				tint: "#FCE3C6",
				title: "Harga tetap rahasia kamu",
				body: "Bawaannya, klien yang kamu undang tidak melihat harga, tagihan, maupun invoice Tetra. Mau ditampilkan? Ubah kapan saja di Orang & akses → Yang dilihat klien.",
			},
		];
	if (x.role === "klien_wo")
		return [
			{
				icon: Sparkles,
				tint: "#F8D98B",
				title: `${hi} Selamat datang`,
				body: `${wo} mengundangmu ke dashboard ${x.eventName ?? "acaramu"} di Tetra Photobooth.`,
			},
			{
				icon: CalendarCheck,
				tint: "#D6F1EA",
				title: "Lengkapi data acara",
				body: "Isi lokasi, PIC di lapangan, susunan acara, dan akun Instagram supaya tim Tetra siap di hari H.",
			},
			{
				icon: Palette,
				tint: "#CEC8F6",
				title: "Pilih desain frame",
				body: "Pilih template atau ceritakan desain yang kamu mau, lalu setujui drafnya. Setelah acara, galeri foto muncul di sini.",
			},
			x.priceVisible
				? {
						icon: Wallet,
						tint: "#FCE3C6",
						title: "Tagihan bisa kamu lihat",
						body: `Rincian harga, riwayat bayar, dan dokumen ada di menu Pembayaran. Urusan pembayaran tetap lewat ${wo}.`,
					}
				: {
						icon: MessageCircle,
						tint: "#FCE3C6",
						title: `Pembayaran lewat ${wo}`,
						body: `Urusan harga dan pembayaran diatur langsung oleh ${wo}. Masuk lagi kapan saja di booking.tetraphoto.com pakai nomor WhatsApp ini.`,
					},
		];
	return [
		{
			icon: Sparkles,
			tint: "#F8D98B",
			title: `${hi} Ini dashboard acaramu`,
			body: "Semua tentang booking photobooth-mu ada di sini, dari pembayaran sampai galeri foto.",
		},
		{
			icon: LayoutDashboard,
			tint: "#CEC8F6",
			title: "Ikuti Langkah berikutnya",
			body: "Di Ringkasan selalu ada satu langkah yang perlu kamu kerjakan sekarang: lengkapi data, bayar DP, pilih desain, lalu pelunasan.",
		},
		{
			icon: Wallet,
			tint: "#FCE3C6",
			title: "Bayar & simpan dokumen",
			body: "Transfer lalu unggah bukti di menu Pembayaran. Invoice dan kuitansi tersimpan di menu Dokumen.",
		},
		{
			icon: Images,
			tint: "#D6F1EA",
			title: "Ajak keluarga atau WO",
			body: "Di Orang & akses kamu bisa mengundang pemilik acara atau WO untuk ikut mengisi data dan desain. Galeri foto muncul setelah acara.",
		},
	];
}

export function Onboarding({
	role,
	name,
	woName = null,
	eventName = null,
	priceVisible = false,
	autoOpen,
	clearHref,
}: {
	role: GuideRole;
	name: string | null;
	woName?: string | null;
	eventName?: string | null;
	priceVisible?: boolean;
	/** Buka otomatis (belum pernah dilihat, atau dibuka lewat menu Panduan). */
	autoOpen: boolean;
	/** Ganti URL setelah ditutup (buang ?panduan=1). */
	clearHref?: string;
}) {
	const router = useRouter();
	const dlg = useRef<HTMLDialogElement>(null);
	const [i, setI] = useState(0);
	const list = slides({ role, name, woName, eventName, priceVisible });
	const s = list[i];
	const last = i === list.length - 1;

	useEffect(() => {
		if (autoOpen) dlg.current?.showModal();
	}, [autoOpen]);

	function close() {
		dlg.current?.close();
	}

	const Icon = s.icon;
	return (
		<dialog
			ref={dlg}
			className="dash-guide"
			aria-labelledby="guide-title"
			onClose={() => {
				void markOnboarded();
				setI(0);
				if (clearHref) router.replace(clearHref, { scroll: false });
			}}
		>
			<div style={{ display: "grid", gap: 16, padding: 24 }}>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
					}}
				>
					<span
						style={{
							display: "flex",
							width: 52,
							height: 52,
							alignItems: "center",
							justifyContent: "center",
							borderRadius: 14,
							border: "1.5px solid #1D1D1B",
							background: s.tint,
						}}
					>
						<Icon aria-hidden size={26} strokeWidth={2} />
					</span>
					<span className="mono" style={{ fontSize: 12, color: "#5F5E5A" }}>
						{i + 1}/{list.length}
					</span>
				</div>
				<div style={{ display: "grid", gap: 8 }}>
					<h2
						id="guide-title"
						style={{
							margin: 0,
							fontSize: 22,
							fontWeight: 800,
							letterSpacing: "-0.02em",
							lineHeight: 1.15,
						}}
					>
						{s.title}
					</h2>
					<p
						style={{
							margin: 0,
							fontSize: 15,
							lineHeight: 1.5,
							color: "#3A3936",
						}}
					>
						{s.body}
					</p>
					{s.points && (
						<ul
							style={{
								margin: 0,
								paddingLeft: 18,
								display: "grid",
								gap: 6,
								fontSize: 14,
								lineHeight: 1.45,
								color: "#3A3936",
							}}
						>
							{s.points.map((p) => (
								<li key={p}>{p}</li>
							))}
						</ul>
					)}
				</div>
				<div aria-hidden style={{ display: "flex", gap: 6 }}>
					{list.map((x, n) => (
						<span
							key={x.title}
							style={{
								height: 6,
								width: n === i ? 22 : 6,
								borderRadius: 3,
								background: n === i ? "#1D1D1B" : "#D6D3CC",
								transition: "width 200ms",
							}}
						/>
					))}
				</div>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						gap: 12,
					}}
				>
					<button
						type="button"
						onClick={() => (i === 0 ? close() : setI(i - 1))}
						style={{
							minHeight: 44,
							border: 0,
							background: "transparent",
							padding: "0 4px",
							fontSize: 14,
							fontWeight: 700,
							color: "#5F5E5A",
						}}
					>
						{i === 0 ? "Lewati" : "Kembali"}
					</button>
					<button
						type="button"
						onClick={() => (last ? close() : setI(i + 1))}
						style={{
							height: 46,
							padding: "0 22px",
							borderRadius: 12,
							border: "1.5px solid #1D1D1B",
							background: last ? "#1D1D1B" : "#F8D98B",
							color: last ? "#fff" : "#1D1D1B",
							fontSize: 15,
							fontWeight: 800,
						}}
					>
						{last ? "Mulai pakai" : "Lanjut"}
					</button>
				</div>
			</div>
		</dialog>
	);
}
