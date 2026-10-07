/**
 * Base URL publik Tetra Ops (DR-036): admin + booking + portal klien.
 * Selalu dari NEXT_PUBLIC_APP_URL; cadangannya domain resmi, bukan alamat vercel.app.
 */
export const appUrl = (): string =>
	(process.env.NEXT_PUBLIC_APP_URL || "https://booking.tetraphoto.com").replace(
		/\/$/,
		"",
	);
