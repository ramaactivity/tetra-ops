import type { NextRequest } from "next/server";
import { runAgent } from "@/lib/ai/agent";
import { isAiConfigured } from "@/lib/ai/config";
import type { AiChatMessage, AiStreamEvent } from "@/lib/ai/types";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { isoDateUTC, wibNow } from "@/lib/telegram/digest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Jawaban dengan beberapa putaran tool bisa makan puluhan detik.
export const maxDuration = 60;

/**
 * POST /api/ai/chat — streaming jawaban "Tanya Tetra".
 *
 * Formatnya NDJSON (satu objek JSON per baris), bukan SSE: klien kita satu-
 * satunya dan `fetch` + ReadableStream sudah cukup, jadi tak perlu overhead
 * protokol SSE.
 *
 * Client Supabase-nya sengaja yang ber-RLS (cookie user), BUKAN admin —
 * dengan begitu batas akses baris tetap ditegakkan database, bukan cuma oleh
 * gating tool di lapisan aplikasi.
 */
export async function POST(req: NextRequest) {
	if (!isAiConfigured()) {
		return Response.json(
			{ error: "Fitur AI belum diaktifkan (GEMINI_API_KEY belum diset)." },
			{ status: 503 },
		);
	}

	const me = await getCurrentUser();
	if (!me) return Response.json({ error: "Unauthorized" }, { status: 401 });
	if (me.profile.role === "pending_approval" || !me.profile.is_active) {
		return Response.json({ error: "Akun belum aktif" }, { status: 403 });
	}

	let messages: AiChatMessage[];
	try {
		const body = (await req.json()) as { messages?: unknown };
		if (!Array.isArray(body.messages) || body.messages.length === 0) {
			return Response.json({ error: "messages kosong" }, { status: 400 });
		}
		messages = body.messages
			.filter(
				(m): m is AiChatMessage =>
					typeof m === "object" &&
					m !== null &&
					typeof (m as AiChatMessage).content === "string" &&
					((m as AiChatMessage).role === "user" ||
						(m as AiChatMessage).role === "assistant"),
			)
			.map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
		if (messages.length === 0) {
			return Response.json({ error: "messages tidak valid" }, { status: 400 });
		}
	} catch {
		return Response.json({ error: "Body bukan JSON" }, { status: 400 });
	}

	const supabase = await createClient();
	const todayISO = isoDateUTC(wibNow());

	const encoder = new TextEncoder();
	// Sekali stream ditutup/dibatalkan, enqueue & close akan MELEMPAR. Tanpa
	// penjaga ini, setiap kali user menekan Escape rantainya jadi: AbortError →
	// catch memanggil send() → melempar lagi → finally memanggil close() →
	// melempar lagi → start() reject tanpa penangkap → unhandled rejection plus
	// stack "[ai/chat]" yang menyesatkan di log, seolah ada gangguan server.
	let closed = false;
	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const send = (event: AiStreamEvent) => {
				if (closed || req.signal.aborted) return;
				try {
					controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
				} catch {
					// Consumer sudah pergi — berhenti diam-diam, bukan error.
					closed = true;
				}
			};
			try {
				for await (const event of runAgent({
					messages,
					toolCtx: {
						supabase,
						role: me.profile.role,
						todayISO,
						surface: "web",
					},
					promptCtx: {
						todayISO,
						role: me.profile.role,
						userName: me.profile.full_name,
						surface: "web",
					},
					signal: req.signal,
				})) {
					send(event);
				}
			} catch (err) {
				// Pembatalan oleh user BUKAN error — jangan dicatat sebagai gangguan.
				const aborted =
					req.signal.aborted ||
					(err instanceof Error && err.name === "AbortError");
				if (!aborted) {
					// Jangan bocorkan stack ke browser — cukup kalimat yang bisa ditindak.
					console.error("[ai/chat]", err);
					send({
						type: "error",
						message: "Ada gangguan di server. Coba lagi sebentar lagi.",
					});
				}
			} finally {
				if (!closed) {
					closed = true;
					try {
						controller.close();
					} catch {
						// Sudah tertutup dari sisi consumer.
					}
				}
			}
		},
		cancel() {
			// Dipanggil saat browser membatalkan (tombol Escape di tanya-chat).
			closed = true;
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "application/x-ndjson; charset=utf-8",
			"Cache-Control": "no-store, no-transform",
			"X-Content-Type-Options": "nosniff",
		},
	});
}
