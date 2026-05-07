import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Playfair_Display } from "next/font/google";
import { cookies } from "next/headers";
import { ServiceWorkerRegister } from "@/components/push/sw-register";
import "./globals.css";

const inter = Inter({
	variable: "--font-inter",
	subsets: ["latin"],
	display: "swap",
});

const playfair = Playfair_Display({
	variable: "--font-playfair",
	subsets: ["latin"],
	display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
	variable: "--font-jetbrains-mono",
	subsets: ["latin"],
	display: "swap",
});

export const metadata: Metadata = {
	title: "Tetra Ops",
	description: "Internal operating system for Tetra Photobooth",
	manifest: "/manifest.json",
	appleWebApp: {
		capable: true,
		title: "Tetra Ops",
		statusBarStyle: "black-translucent",
	},
	icons: {
		icon: [
			{ url: "/pwa-icons/icon-192.png", sizes: "192x192", type: "image/png" },
			{ url: "/pwa-icons/icon-512.png", sizes: "512x512", type: "image/png" },
		],
		apple: [{ url: "/pwa-icons/icon-192.png", sizes: "192x192" }],
	},
	formatDetection: {
		telephone: false,
	},
};

export const viewport: Viewport = {
	width: "device-width",
	initialScale: 1,
	viewportFit: "cover",
	themeColor: [
		{ media: "(prefers-color-scheme: light)", color: "#FAFAF9" },
		{ media: "(prefers-color-scheme: dark)", color: "#0A0A0F" },
	],
};

export default async function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	const cookieStore = await cookies();
	const theme = cookieStore.get("theme")?.value === "light" ? "light" : "dark";

	return (
		<html
			lang="id"
			className={`${inter.variable} ${playfair.variable} ${jetbrainsMono.variable} ${theme === "dark" ? "dark" : ""} h-full antialiased`}
		>
			<body className="bg-background text-foreground flex min-h-full flex-col">
				<ServiceWorkerRegister />
				{children}
			</body>
		</html>
	);
}
