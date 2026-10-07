/**
 * Base URL publik Tetra Ops (DR-036/DR-037).
 * - appUrl(): aplikasi tim (owner/crew, link Telegram, dokumen) = NEXT_PUBLIC_APP_URL
 *   (target: https://team.tetraphoto.com).
 * - portalBase(): halaman klien (booking + portal) = PORTAL_BASE_URL,
 *   cadangan https://booking.tetraphoto.com.
 * Tidak ada alamat vercel.app yang di-hardcode.
 */
export const appUrl = (): string =>
	(process.env.NEXT_PUBLIC_APP_URL || "https://team.tetraphoto.com").replace(
		/\/$/,
		"",
	);

export const portalBase = (): string =>
	(process.env.PORTAL_BASE_URL || "https://booking.tetraphoto.com").replace(
		/\/$/,
		"",
	);
