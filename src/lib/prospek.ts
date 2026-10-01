import { isLikelyWaPhone, toWaPhone } from "@/lib/whatsapp";

/**
 * Bagian polos (tanpa server-only) dari pipeline prospek outbound, supaya
 * bisa diuji dengan node --test. Tool MCP-nya di lib/ai/tools/prospek.ts.
 */

export const SEGMEN = [
	"corporate",
	"venue",
	"eo_wo",
	"instansi",
	"kampus",
] as const;
export const STATUS_PROSPEK = [
	"kandidat",
	"disapa",
	"follow_up",
	"membalas",
	"deal",
	"tolak",
	"jangan_hubungi",
] as const;

export type Prospek = {
	id: string;
	nama: string;
	email: string | null;
	telepon: string | null;
	draf_subjek: string | null;
	draf_pesan: string | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export function emailValid(e: unknown): e is string {
	return typeof e === "string" && EMAIL_RE.test(e.trim());
}

/** Link aplikasi pengirim berisi draf: mailto untuk email, wa.me untuk WA. */
export function sapaHref(p: Prospek, ke: "email" | "wa"): string | null {
	const pesan = p.draf_pesan ?? "";
	if (ke === "email") {
		if (!emailValid(p.email)) return null;
		const q = new URLSearchParams();
		q.set("subject", p.draf_subjek ?? "");
		q.set("body", pesan);
		// URLSearchParams menulis spasi sebagai "+", mail client butuh %20.
		return `mailto:${p.email.trim()}?${q.toString().replace(/\+/g, "%20")}`;
	}
	// Hanya nomor HP (62 8…): telepon kantor 021/031 dst. tidak ada di WhatsApp.
	if (
		!isLikelyWaPhone(p.telepon) ||
		!toWaPhone(p.telepon as string).startsWith("628")
	)
		return null;
	return `https://wa.me/${toWaPhone(p.telepon as string)}?text=${encodeURIComponent(pesan)}`;
}

/** Link pendek yang dikirim agent ke Telegram; halaman /api/s/<id> membuka draf. */
export function sapaLinks(p: Prospek, baseUrl: string) {
	const base = `${baseUrl.replace(/\/$/, "")}/api/s/${p.id}`;
	return {
		link_email: sapaHref(p, "email") ? `${base}?ke=email` : null,
		link_wa: sapaHref(p, "wa") ? `${base}?ke=wa` : null,
	};
}

/**
 * Kunci anti-duplikat untuk prospek tanpa place_id (hasil web search):
 * nama tanpa badan hukum/tanda baca, dan domain website tanpa www.
 */
export function kunciProspek(
	nama?: string | null,
	website?: string | null,
): string[] {
	const out: string[] = [];
	const n = (nama ?? "")
		.toLowerCase()
		.replace(/\b(pt|cv|tbk|persero|indonesia)\b/g, "")
		.replace(/[^a-z0-9]/g, "");
	if (n.length >= 3) out.push(`n:${n}`);
	try {
		const raw = (website ?? "").trim();
		if (raw) {
			const host = new URL(raw.includes("://") ? raw : `https://${raw}`)
				.hostname;
			out.push(`d:${host.replace(/^www\./, "")}`);
		}
	} catch {}
	return out;
}
