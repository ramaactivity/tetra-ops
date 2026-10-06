import type { Metadata } from "next";
import { Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./portal.css";

const jakarta = Plus_Jakarta_Sans({
	variable: "--font-jakarta",
	subsets: ["latin"],
	weight: ["400", "500", "600", "700", "800"],
	display: "swap",
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
	weight: ["400", "500"],
	display: "swap",
});

export const metadata: Metadata = {
	title: {
		default: "Booking Tetra Photobooth",
		template: "%s · Tetra Photobooth",
	},
	description:
		"Booking photobooth Tetra langsung: pilih paket, cek jadwal, bayar DP, dan pantau acaramu.",
	robots: { index: false, follow: false },
	manifest: null,
};

/** Halaman klien (booking + portal). Gaya Tetra Booth v2, bukan dashboard admin. */
export default function PortalLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div className={`tp ${jakarta.variable} ${geistMono.variable}`}>
			{children}
		</div>
	);
}
