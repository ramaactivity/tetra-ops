"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { formatDateID } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import {
	notifyTelegramPaymentReceived,
	notifyTelegramPaymentReversed,
} from "@/lib/telegram/notify";

const PAYMENT_TYPES = ["dp", "partial", "pelunasan"] as const;

const PAYMENT_TYPE_LABEL: Record<(typeof PAYMENT_TYPES)[number], string> = {
	dp: "DP",
	partial: "Cicilan",
	pelunasan: "Pelunasan",
};

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
			.select(
				"grand_total, total_paid, vendor_commission_mode, vendor_commission_amount",
			)
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
		// Guard cutoff: jurnal dibukukan dengan entry_date = payment_date, dan
		// neraca menjumlahkan semua baris tanpa filter tanggal. Uang yang masuk
		// sebelum cutoff sudah tercakup di saldo awal hasil hitung fisik —
		// mencatatnya lagi bikin kas dobel. Backstop-nya ada di
		// record_payment_je_impl; ini supaya pesannya nempel di field tanggal.
		const { data: cutoffCfg } = await supabase
			.from("system_config")
			.select("value")
			.eq("key", "finance_cutoff_date")
			.maybeSingle();
		const cutoff =
			typeof cutoffCfg?.value === "string" && cutoffCfg.value.length > 0
				? cutoffCfg.value
				: null;
		if (cutoff && parsed.data.payment_date < cutoff) {
			return {
				errors: {
					payment_date: [
						`Sebelum cutoff keuangan (${formatDateID(cutoff)}). Uang yang masuk sebelum cutoff sudah termasuk di saldo awal — kalau dicatat lagi kas jadi dobel.`,
					],
				},
				values: snapshotValues(formData),
			};
		}
		// Tagihan efektif: potongan langsung vendor dipotong di muka, jadi kas
		// yang boleh dicatat maksimal grand_total − potongan ("Tetra terima").
		const grand = Number(ev.grand_total) || 0;
		const vendorCut =
			ev.vendor_commission_mode === "upfront_cut"
				? Number(ev.vendor_commission_amount) || 0
				: 0;
		const billable = Math.max(0, grand - vendorCut);
		const sisa = Math.max(0, billable - (Number(ev.total_paid) || 0));
		if (billable > 0 && parsed.data.amount > sisa) {
			return {
				errors: {
					amount: [
						`Melebihi sisa tagihan. Sisa: Rp ${sisa.toLocaleString("id-ID")}`,
					],
				},
				values: snapshotValues(formData),
			};
		}

		// Insert pembayaran + jurnal (Dr Kas/Bank / Cr 4-100) dalam satu RPC atomik
		// → cash-basis: pendapatan diakui saat uang masuk, kas GL = uang riil.
		const { error } = await supabase.rpc("record_payment_je", {
			p_event_id: eventId,
			p_amount: parsed.data.amount,
			p_payment_date: parsed.data.payment_date,
			p_bank_account_id: parsed.data.bank_account_id,
			p_payment_type: parsed.data.payment_type,
			p_proof_url: parsed.data.proof_url,
			p_notes: parsed.data.notes,
			p_actor: me.profile.id,
		});

		if (error) {
			console.error("[logPayment] rpc error:", error);
			return {
				errors: { _form: [`DB: ${error.message}`] },
				values: snapshotValues(formData),
			};
		}

		// Best-effort: kabari grup Telegram owner ada uang masuk. Sisa tagihan
		// dihitung dari `sisa` pra-insert dikurangi jumlah yang baru dicatat.
		const { data: bank } = await supabase
			.from("bank_accounts")
			.select("bank_name, account_name")
			.eq("id", parsed.data.bank_account_id)
			.maybeSingle();
		await notifyTelegramPaymentReceived(eventId, {
			typeLabel: PAYMENT_TYPE_LABEL[parsed.data.payment_type],
			amount: parsed.data.amount,
			bankLabel:
				[bank?.bank_name, bank?.account_name].filter(Boolean).join(" ") || null,
			remaining: Math.max(0, sisa - parsed.data.amount),
		});

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
