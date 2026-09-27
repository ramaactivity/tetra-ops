/**
 * POST /api/bot/quotation — bot WA meminta draft quotation. Handler murni
 * (penyimpanan disuntikkan) supaya auth & validasi bisa dites tanpa DB.
 * Endpoint HANYA membuat draft; pengiriman ke klien menunggu tap owner.
 */
import { z } from "zod";
import { QuotationRequestSchema } from "./quotation-plan";

export const BotQuotationSchema = QuotationRequestSchema.extend({
	external_id: z.string().trim().min(3).max(200),
});

type Created =
	| {
			id: string;
			doc_number: string;
			butuh_isian_admin: string[];
			url_editor: string;
	  }
	| { error: string };

export async function handleBotQuotation(params: {
	authorized: boolean;
	json: unknown;
	create: (input: unknown, externalId: string) => Promise<Created>;
}): Promise<{ status: number; body: Record<string, unknown> }> {
	if (!params.authorized)
		return { status: 401, body: { error: "Unauthorized" } };
	const parsed = BotQuotationSchema.safeParse(params.json);
	if (!parsed.success)
		return {
			status: 400,
			body: { error: "Body tidak valid", issues: parsed.error.issues },
		};
	const { external_id, ...input } = params.json as Record<string, unknown>;
	const res = await params.create(input, parsed.data.external_id);
	// Validasi bisnis (paket tak ada, add-on ambigu, …) → 422 dengan alasannya.
	if ("error" in res) return { status: 422, body: { error: res.error } };
	return {
		status: 200,
		body: {
			id: res.id,
			doc_number: res.doc_number,
			butuh_isian_admin: res.butuh_isian_admin,
			url_editor: res.url_editor,
		},
	};
}
