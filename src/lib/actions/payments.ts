"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import {
	type IssuedPaymentDoc,
	logPaymentCore,
	PAYMENT_TYPES,
} from "@/lib/finance/payment-core";
import { createClient } from "@/lib/supabase/server";
import { notifyTelegramPaymentReversed } from "@/lib/telegram/notify";

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
			/** Dokumen yang langsung terbit (kuitansi + invoice sisa / nota). */
			docs?: IssuedPaymentDoc[];
			lunas?: boolean;
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
		// Guard (settled/cutoff/overpay) + RPC jurnal + notif + dokumen otomatis
		// ada di satu inti yang juga dipakai tool agent catat_pembayaran.
		const res = await logPaymentCore(
			supabase,
			{
				eventId,
				amount: parsed.data.amount,
				paymentDate: parsed.data.payment_date,
				bankAccountId: parsed.data.bank_account_id,
				paymentType: parsed.data.payment_type,
				proofUrl: parsed.data.proof_url,
				notes: parsed.data.notes,
			},
			me.profile.id,
		);
		if (!res.ok) {
			return {
				errors: { [res.field]: [res.error] } as PaymentErrors,
				values: snapshotValues(formData),
			};
		}

		revalidatePath(`/operations/${projectId}`);
		revalidatePath(`/operations/${projectId}/payments`);
		if (res.docs.length > 0) revalidatePath("/finance/dokumen");
		return { success: true, docs: res.docs, lunas: res.lunas };
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
			.select("event_id, is_reversed, amount")
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

		// Tandai reversed + jurnal pembalik (Dr 4-100 / Cr Kas) dalam satu RPC atomik.
		const { error } = await supabase.rpc("reverse_payment_je", {
			p_payment_id: id,
			p_actor: me.profile.id,
			p_reason: reason,
		});

		if (error) {
			console.error("[reversePayment] rpc error:", error);
			return { error: error.message };
		}

		// Best-effort: kabari grup Telegram owner pembayaran dibatalkan.
		await notifyTelegramPaymentReversed(pay.event_id, {
			amount: Number(pay.amount) || 0,
			reason,
		});

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
