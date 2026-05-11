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
		return undefined;
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
