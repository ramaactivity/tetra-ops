"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

const PAYMENT_TYPES = ["dp", "partial", "pelunasan"] as const;

const PaymentInputSchema = z.object({
	amount: z.coerce.number().int().positive("Jumlah harus lebih dari 0"),
	payment_date: z.iso.date("Format tanggal tidak valid"),
	bank_account_id: z.uuid("Pilih bank account"),
	payment_type: z.enum(PAYMENT_TYPES, "Pilih tipe pembayaran"),
	proof_url: z
		.string()
		.trim()
		.url("Harus URL valid")
		.max(500)
		.optional()
		.or(z.literal(""))
		.transform((v) => (v ? v : null)),
	notes: z
		.string()
		.trim()
		.max(500)
		.optional()
		.or(z.literal(""))
		.transform((v) => (v ? v : null)),
});

export type PaymentInput = z.infer<typeof PaymentInputSchema>;

type PaymentErrors = Partial<Record<keyof PaymentInput | "_form", string[]>>;

export type PaymentFormState =
	| {
			errors?: PaymentErrors;
			values?: Record<string, string>;
			success?: true;
	  }
	| undefined;

async function requireOwnerLevel() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Unauthorized");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		throw new Error("Forbidden — owner-level only");
	}
	return me;
}

function generatePaymentRefId(date: string): string {
	const compact = date.replaceAll("-", "");
	return `PAY-${compact}-${randomInt(1000, 10000)}`;
}

function snapshotValues(formData: FormData): Record<string, string> {
	const keys = [
		"amount",
		"payment_date",
		"bank_account_id",
		"payment_type",
		"proof_url",
		"notes",
	];
	return Object.fromEntries(
		keys.map((k) => [k, String(formData.get(k) ?? "")]),
	);
}

export async function logPayment(
	eventId: string,
	projectId: string,
	_prev: PaymentFormState,
	formData: FormData,
): Promise<PaymentFormState> {
	try {
		const me = await requireOwnerLevel();

		const parsed = PaymentInputSchema.safeParse({
			amount: formData.get("amount"),
			payment_date: formData.get("payment_date"),
			bank_account_id: formData.get("bank_account_id"),
			payment_type: formData.get("payment_type"),
			proof_url: formData.get("proof_url") ?? "",
			notes: formData.get("notes") ?? "",
		});
		if (!parsed.success) {
			return {
				errors: parsed.error.flatten().fieldErrors as PaymentErrors,
				values: snapshotValues(formData),
			};
		}

		const supabase = await createClient();

		// Guard: event ada + belum settled + tidak overpayment.
		const { data: ev } = await supabase
			.from("events")
			.select("grand_total, total_paid")
			.eq("id", eventId)
			.maybeSingle();
		if (!ev) {
			return {
				errors: { _form: ["Event tidak ditemukan."] },
				values: snapshotValues(formData),
			};
		}
		const { data: settled } = await supabase
			.from("event_settlements")
			.select("id")
			.eq("event_id", eventId)
			.eq("is_reopened", false)
			.maybeSingle();
		if (settled) {
			return {
				errors: {
					_form: [
						"Event sudah di-settle — pembayaran terkunci. Reopen settlement dulu kalau perlu koreksi.",
					],
				},
				values: snapshotValues(formData),
			};
		}
		const grand = Number(ev.grand_total) || 0;
		const sisa = Math.max(0, grand - (Number(ev.total_paid) || 0));
		if (grand > 0 && parsed.data.amount > sisa) {
			return {
				errors: {
					amount: [
						`Melebihi sisa tagihan. Sisa: Rp ${sisa.toLocaleString("id-ID")}`,
					],
				},
				values: snapshotValues(formData),
			};
		}

		const refId = generatePaymentRefId(parsed.data.payment_date);

		const { error } = await supabase.from("payments").insert({
			ref_id: refId,
			event_id: eventId,
			amount: parsed.data.amount,
			payment_date: parsed.data.payment_date,
			bank_account_id: parsed.data.bank_account_id,
			payment_type: parsed.data.payment_type,
			proof_url: parsed.data.proof_url,
			notes: parsed.data.notes,
			recorded_by: me.profile.id,
		});

		if (error) {
			console.error("[logPayment] supabase insert error:", error);
			return {
				errors: { _form: [`DB: ${error.message}`] },
				values: snapshotValues(formData),
			};
		}

		revalidatePath(`/operations/${projectId}`);
		revalidatePath(`/operations/${projectId}/payments`);
		return { success: true };
	} catch (err) {
		// Catch-all so an unhandled throw never bubbles to the global error
		// boundary (which shows the generic "Ada yang ngga beres" page). Surface
		// the actual message inline so user can react. Also logs to Vercel.
		console.error("[logPayment] unexpected throw:", err);
		const message = err instanceof Error ? err.message : String(err);
		return {
			errors: { _form: [`Unexpected: ${message}`] },
			values: snapshotValues(formData),
		};
	}
}

export async function reversePayment(
	projectId: string,
	id: string,
	reason: string,
): Promise<{ error?: string }> {
	try {
		const me = await requireOwnerLevel();

		const supabase = await createClient();

		// Guard: pembayaran ada, belum di-reverse, & event belum settled.
		// Mirror logPayment — kalau event sudah settle, pembayaran terkunci;
		// reverse di sini menaikkan kembali remaining_balance & memunculkan
		// event yang sudah selesai sebagai piutang lagi (desync AR vs settlement).
		const { data: pay } = await supabase
			.from("payments")
			.select("event_id, is_reversed")
			.eq("id", id)
			.maybeSingle();
		if (!pay) return { error: "Pembayaran tidak ditemukan." };
		if (pay.is_reversed) return { error: "Pembayaran ini sudah di-reverse." };
		const { data: settled } = await supabase
			.from("event_settlements")
			.select("id")
			.eq("event_id", pay.event_id)
			.eq("is_reopened", false)
			.maybeSingle();
		if (settled) {
			return {
				error:
					"Event sudah di-settle — pembayaran terkunci. Reopen settlement dulu kalau perlu koreksi.",
			};
		}

		const { error } = await supabase
			.from("payments")
			.update({
				is_reversed: true,
				reversed_at: new Date().toISOString(),
				reversed_by: me.profile.id,
				reversal_reason: reason,
			})
			.eq("id", id);

		if (error) {
			console.error("[reversePayment] supabase error:", error);
			return { error: error.message };
		}

		revalidatePath(`/operations/${projectId}`);
		revalidatePath(`/operations/${projectId}/payments`);
		return {};
	} catch (err) {
		console.error("[reversePayment] unexpected throw:", err);
		return {
			error: err instanceof Error ? err.message : String(err),
		};
	}
}
