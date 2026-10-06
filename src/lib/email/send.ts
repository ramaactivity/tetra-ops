import "server-only";

/**
 * Kirim email lewat Resend (HTTP API, tanpa SDK). Mati kalau RESEND_API_KEY
 * kosong. EMAIL_FROM harus memakai domain yang sudah diverifikasi di Resend,
 * mis. "Tetra Photobooth <halo@tetraphoto.com>".
 */
export function isEmailConfigured(): boolean {
	return !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;
}

export async function sendEmail(
	to: string,
	subject: string,
	text: string,
): Promise<boolean> {
	if (!isEmailConfigured()) return false;
	const res = await fetch("https://api.resend.com/emails", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject, text }),
		signal: AbortSignal.timeout(10_000),
	}).catch(() => null);
	if (!res?.ok)
		console.error(
			"[email] gagal kirim:",
			res?.status,
			await res?.text().catch(() => ""),
		);
	return !!res?.ok;
}
