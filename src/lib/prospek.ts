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

type BarisStatistik = {
	segmen: string;
	status: string;
	sumber: string | null;
	email: string | null;
	telepon: string | null;
	catatan: string | null;
};

/** Ringkasan untuk tinjauan mingguan Bruno; kueri asal dibaca dari catatan "kueri: …". */
export function ringkasStatistik(rows: BarisStatistik[]) {
	const hitung = (m: Record<string, number>, k: string) => {
		m[k] = (m[k] ?? 0) + 1;
	};
	const perSegmen: Record<string, number> = {};
	const perStatus: Record<string, number> = {};
	const perKueri: Record<
		string,
		{ total: number; berkontak: number; disapa: number; membalas: number }
	> = {};
	let berkontak = 0;
	for (const r of rows) {
		hitung(perSegmen, r.segmen);
		hitung(perStatus, r.status);
		const ada = emailValid(r.email) || isLikelyWaPhone(r.telepon);
		if (ada) berkontak++;
		const kueri =
			r.catatan
				?.match(/kueri:\s*([^;\n]+)/i)?.[1]
				?.trim()
				.toLowerCase() ?? "(tanpa kueri)";
		const k = (perKueri[kueri] ??= {
			total: 0,
			berkontak: 0,
			disapa: 0,
			membalas: 0,
		});
		k.total++;
		if (ada) k.berkontak++;
		if (["disapa", "follow_up", "membalas", "deal"].includes(r.status))
			k.disapa++;
		if (["membalas", "deal"].includes(r.status)) k.membalas++;
	}
	return {
		total: rows.length,
		berkontak,
		per_segmen: perSegmen,
		per_status: perStatus,
		per_kueri: perKueri,
	};
}
