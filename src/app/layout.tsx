import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Manrope } from "next/font/google";
import { cookies } from "next/headers";
import { ServiceWorkerRegister } from "@/components/push/sw-register";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";

const inter = Inter({
	variable: "--font-inter",
	subsets: ["latin"],
	display: "swap",
});

// Manrope — display/heading/number voice (shared mobile + desktop per MOBILE.md
// + DESIGN.md). Variable font; its lining figures keep stat/money columns aligned.
const manrope = Manrope({
	variable: "--font-manrope",
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
	// Lock zoom so the app stays fit-to-screen like a native app: no pinch-zoom,
	// and no iOS "zoom on focus" when tapping inputs < 16px. (Internal ops PWA —
	// the usual a11y caveat about user-scalable doesn't apply here.)
	maximumScale: 1,
	userScalable: false,
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
			className={`${inter.variable} ${manrope.variable} ${jetbrainsMono.variable} ${theme === "dark" ? "dark" : ""} h-full antialiased`}
		>
			<body className="flex min-h-dvh flex-col bg-background text-foreground">
				<ServiceWorkerRegister />
				<ConfirmProvider>{children}</ConfirmProvider>
				<Toaster />
			</body>
		</html>
	);
}
