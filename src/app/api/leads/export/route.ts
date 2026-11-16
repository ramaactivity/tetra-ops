import { type NextRequest, NextResponse } from "next/server";
import { type LeadRow, periodStartISO } from "@/components/leads/leads-shared";
import { getCurrentUser } from "@/lib/auth/get-user";
import { todayWIB } from "@/lib/dates";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * GET /api/leads/export — stream the WhatsApp bot leads as CSV, honoring the
 * same filters as the /leads page (q, period, topic, status). Reads via the
 * session client (RLS SELECT = any authenticated user), so it never exposes
 * the service_role key. Opens directly in Excel.
 */

function csvCell(value: string | null | undefined): string {
	let s = (value ?? "").toString();
	// Netralkan formula injection: Excel/Sheets mengeksekusi sel yang diawali
	// = + - @ (juga tab/CR yang dipakai sebagai varian bypass). Pesan WhatsApp
	// dari lead adalah teks yang dikirim orang luar, jadi lead yang menulis
	// `=HYPERLINK(...)` akan menjadi formula HIDUP begitu owner membuka hasil
	// ekspor. Awalan kutip satu memaksa Excel memperlakukannya sebagai teks.
	if (/^[=+\-@\t\r]/.test(s)) {
		s = `'${s}`;
	}
	// Quote if the cell contains a comma, quote, or newline; escape quotes.
	if (/[",\n\r]/.test(s)) {
		return `"${s.replace(/"/g, '""')}"`;
	}
	return s;
}

export async function GET(req: NextRequest) {
	const me = await getCurrentUser();
	if (!me) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const sp = req.nextUrl.searchParams;
	const q = sp.get("q")?.trim() ?? "";
	const period = sp.get("period")?.trim() ?? "all";
	const topic = sp.get("topic")?.trim() ?? "";
	const status = sp.get("status")?.trim() ?? "";

	const supabase = await createClient();

	const startISO = periodStartISO(period, new Date());
	const build = (from: number, to: number) => {
		let query = supabase
			.from("whatsapp_bot_leads")
			.select(
				"phone, name, topic, message, is_after_hours, status, received_at",
			)
			.order("received_at", { ascending: false })
			.order("id", { ascending: false })
			.range(from, to);
		if (q) {
			const safe = q.replace(/[%,]/g, " ").trim();
			query = query.or(
				`phone.ilike.%${safe}%,name.ilike.%${safe}%,message.ilike.%${safe}%`,
			);
		}
		if (topic) query = query.eq("topic", topic);
		if (status) query = query.eq("status", status);
		if (startISO) query = query.gte("received_at", startISO);
		return query;
	};
	// Semua baris (bukan .limit — PostgREST memotong di 1.000).
	let data: unknown[];
	try {
		data = await fetchAllRows(build, "export leads");
	} catch (e) {
		return NextResponse.json(
			{ error: e instanceof Error ? e.message : String(e) },
			{ status: 500 },
		);
	}

	const rows = (data ?? []) as Array<
		Pick<
			LeadRow,
			| "phone"
			| "name"
			| "topic"
			| "message"
			| "is_after_hours"
			| "status"
			| "received_at"
		>
	>;

	const header = [
		"phone",
		"name",
		"topic",
		"message",
		"is_after_hours",
		"status",
		"received_at",
	];
	const lines = [header.join(",")];
	for (const r of rows) {
		lines.push(
			[
				csvCell(r.phone),
				csvCell(r.name),
				csvCell(r.topic),
				csvCell(r.message),
				r.is_after_hours ? "yes" : "no",
				csvCell(r.status),
				csvCell(r.received_at),
			].join(","),
		);
	}
	// Prepend a UTF-8 BOM so Excel renders accents/emoji correctly.
	const csv = `﻿${lines.join("\r\n")}`;

	const today = todayWIB().replace(/-/g, "");
	return new NextResponse(csv, {
		status: 200,
		headers: {
			"Content-Type": "text/csv; charset=utf-8",
			"Content-Disposition": `attachment; filename="leads-${today}.csv"`,
			"Cache-Control": "no-store",
		},
	});
}
