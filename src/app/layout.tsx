import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Playfair_Display } from "next/font/google";
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
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html
			lang="id"
			className={`${inter.variable} ${playfair.variable} ${jetbrainsMono.variable} dark h-full antialiased`}
		>
			<body className="bg-background text-foreground flex min-h-full flex-col">
				{children}
			</body>
		</html>
	);
}
