import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { ServiceWorkerRegister } from "@/components/push/sw-register";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";

const inter = Inter({
	variable: "--font-inter",
	subsets: ["latin"],
	display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
	variable: "--font-jetbrains-mono",
	subsets: ["latin"],
	display: "swap",
});

// Google Search Console verification — required for OAuth consent screen
// branding verification. Set GOOGLE_SITE_VERIFICATION in env (Vercel +
// .env.local) with the value from Search Console "HTML tag" method, then
// re-verify in Google Auth Platform → Branding.
const googleSiteVerification = process.env.GOOGLE_SITE_VERIFICATION;

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
	...(googleSiteVerification && {
		verification: { google: googleSiteVerification },
	}),
};

export const viewport: Viewport = {
	width: "device-width",
	initialScale: 1,
	viewportFit: "cover",
	// Match the canvas exactly so the native status bar / address bar blends
	// seamlessly into the app surface (edge-to-edge, no seam).
	themeColor: [
		{ media: "(prefers-color-scheme: light)", color: "#fafafa" },
		{ media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
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
			className={`${inter.variable} ${jetbrainsMono.variable} ${theme === "dark" ? "dark" : ""} h-full antialiased`}
		>
			<body className="flex min-h-dvh flex-col bg-background text-foreground">
				<ServiceWorkerRegister />
				{children}
				<Toaster />
			</body>
		</html>
	);
}
