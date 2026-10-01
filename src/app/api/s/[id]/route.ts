import type { NextRequest } from "next/server";
import { type Prospek, sapaHref } from "@/lib/prospek";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/s/<id>?ke=email|wa — link "sapa" yang dikirim agent sales ke
 * Telegram Rama. Menampilkan draf + satu tombol yang membuka aplikasi email/WA
 * dengan pesan sudah terisi. Rama yang menekan kirim: itulah gerbang
 * persetujuannya. Sengaja tanpa efek samping (pratinjau link Telegram ikut
 * membuka URL ini); status diubah lewat agent.
 *
 * Tanpa login: id uuid tak tertebak, isinya hanya kontak publik bisnis + draf.
 */
const UUID_RE = /^[0-9a-f-]{36}$/i;

const esc = (s: string) =>
	s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export async function GET(
	req: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	const ke = req.nextUrl.searchParams.get("ke") === "wa" ? "wa" : "email";
	if (!UUID_RE.test(id))
		return new Response("Tidak ditemukan", { status: 404 });

	const { data } = await createAdminClient()
		.from("prospek")
		.select("id, nama, email, telepon, draf_subjek, draf_pesan")
		.eq("id", id)
		.maybeSingle();
	const p = data as Prospek | null;
	const href = p ? sapaHref(p, ke) : null;
	if (!p || !href) return new Response("Tidak ditemukan", { status: 404 });

	const tujuan = ke === "wa" ? (p.telepon ?? "") : (p.email ?? "");
	const html = `<!doctype html><html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Sapa ${esc(p.nama)}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:560px;margin:0 auto;padding:16px;background:#fafafa;color:#111}
pre{white-space:pre-wrap;background:#fff;border:1px solid #ddd;border-radius:8px;padding:12px;font:inherit}
a.b{display:block;text-align:center;padding:14px;border-radius:10px;background:#111;color:#fff;text-decoration:none;font-weight:600}
small{color:#666}</style></head><body>
<h2>${esc(p.nama)}</h2><small>${ke === "wa" ? "WhatsApp" : "Email"}: ${esc(tujuan)}</small>
${ke === "email" ? `<p><b>${esc(p.draf_subjek ?? "")}</b></p>` : ""}
<pre>${esc(p.draf_pesan ?? "")}</pre>
<a class="b" href="${esc(href)}">Buka ${ke === "wa" ? "WhatsApp" : "aplikasi email"}</a>
<p><small>Edit seperlunya sebelum kirim. Setelah terkirim, bilang ke Bruno di topic Sales "sudah kirim".</small></p>
</body></html>`;
	return new Response(html, {
		headers: {
			"content-type": "text/html; charset=utf-8",
			"x-robots-tag": "noindex",
			"cache-control": "no-store",
		},
	});
}
