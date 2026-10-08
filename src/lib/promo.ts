import "server-only";

/**
 * Kode promo tamu `TAMU-XXXXX` milik Tetra Booth (kontrak v0.8, Booth #218).
 * Ops hanya memvalidasi, menghitung potongan, lalu redeem saat DP diterima dan
 * melepas saat batal. Token Booth tidak pernah sampai ke browser.
 */
import type { PromoDiscount } from "@/lib/portal/core";

export type PromoCheck = {
	code: string;
	valid: boolean;
	reason: "not_found" | "rejected" | "redeemed" | "expired" | null;
	label: string | null;
	discount: PromoDiscount | null;
	min_idr: number | null;
	expires_at: string | null;
	redeemed_project_id: string | null;
	whatsapp_match: boolean | null;
};

function booth(): { url: string; token: string } | null {
	const url = process.env.TETRA_BOOTH_URL;
	const token = process.env.TETRA_BOOTH_API_TOKEN;
	return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

/** null = Booth tidak bisa dihubungi / belum dikonfigurasi. */
export async function checkPromo(
	code: string,
	whatsapp?: string | null,
): Promise<PromoCheck | null> {
	const b = booth();
	if (!b) return null;
	try {
		const q = whatsapp ? `?whatsapp=${encodeURIComponent(whatsapp)}` : "";
		const res = await fetch(
			`${b.url}/api/ops/promo/${encodeURIComponent(code)}${q}`,
			{
				headers: { Authorization: `Bearer ${b.token}` },
				cache: "no-store",
				signal: AbortSignal.timeout(6000),
			},
		);
		if (res.status === 404)
			return {
				code,
				valid: false,
				reason: "not_found",
				label: null,
				discount: null,
				min_idr: null,
				expires_at: null,
				redeemed_project_id: null,
				whatsapp_match: null,
			};
		if (!res.ok) return null;
		return (await res.json()) as PromoCheck;
	} catch {
		return null;
	}
}

async function redeemCall(
	method: "POST" | "DELETE",
	code: string,
	projectId: string,
): Promise<{ ok: boolean; reason?: string }> {
	const b = booth();
	if (!b) return { ok: false, reason: "not_configured" };
	try {
		const res = await fetch(
			`${b.url}/api/ops/promo/${encodeURIComponent(code)}/redeem`,
			{
				method,
				headers: {
					Authorization: `Bearer ${b.token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ project_id: projectId }),
				signal: AbortSignal.timeout(6000),
			},
		);
		const j = (await res.json().catch(() => ({}))) as {
			ok?: boolean;
			reason?: string;
		};
		return res.ok
			? { ok: true }
			: { ok: false, reason: j.reason ?? `http_${res.status}` };
	} catch {
		return { ok: false, reason: "network" };
	}
}

/** Tandai kode terpakai untuk project ini (idempoten). Dipanggil saat DP diterima. */
export const redeemPromo = (code: string, projectId: string) =>
	redeemCall("POST", code, projectId);
/** Lepas kode kalau booking dibatalkan setelah DP. */
export const releasePromo = (code: string, projectId: string) =>
	redeemCall("DELETE", code, projectId);

/** Pesan ramah untuk klien per alasan tolak. */
export const PROMO_REASON: Record<string, string> = {
	not_found: "Kode promo tidak ditemukan. Cek lagi penulisannya, ya.",
	rejected:
		"Kode ini belum bisa dipakai karena buktinya belum disetujui admin.",
	redeemed: "Kode ini sudah dipakai untuk booking lain.",
	expired: "Masa berlaku kode ini sudah habis.",
	min_total: "Total booking belum mencapai minimal untuk kode ini.",
	format: "Format kode belum benar. Contoh: TAMU-7KQ2M",
	offline: "Kode belum bisa dicek sekarang. Coba lagi sebentar, ya.",
};

/** Event dibatalkan/dihapus → lepas kode promo booking portal-nya (best effort). */
export async function releasePromoForEvent(eventId: string): Promise<void> {
	try {
		const { createAdminClient } = await import("@/lib/supabase/admin");
		const admin = createAdminClient();
		const { data } = await admin
			.from("client_bookings")
			.select("id, promo")
			.eq("event_id", eventId)
			.not("promo", "is", null);
		for (const b of data ?? []) {
			const p = b.promo as {
				code?: string;
				project_id?: string;
				redeemed_at?: string;
			} | null;
			if (!p?.code || !p.project_id || !p.redeemed_at) continue;
			const r = await releasePromo(p.code, p.project_id);
			if (r.ok)
				await admin
					.from("client_bookings")
					.update({
						promo: {
							...p,
							redeemed_at: null,
							released_at: new Date().toISOString(),
						},
					})
					.eq("id", b.id);
		}
	} catch (e) {
		console.error("[promo] release:", e);
	}
}
