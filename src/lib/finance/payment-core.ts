import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { offerSendToOwner } from "@/lib/documents/approval";
import {
	getOrCreateInvoice,
	issuePaidDocCore,
	issueReceiptCore,
} from "@/lib/documents/invoice";
import { formatDateID, formatRupiah } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { tgEscape } from "@/lib/telegram/client";
import { notifyTelegramPaymentReceived } from "@/lib/telegram/notify";

/**
 * Catat pembayaran klien — inti tanpa sesi. Dipakai server action logPayment
 * (UI) dan tool MCP catat_pembayaran. Semua guard ada DI SINI supaya tidak
 * ada jalur yang lolos: event settled, cutoff keuangan, dan overpay.
 * Jurnal (Dr Kas/Bank / Cr 4-100) ditulis atomik oleh RPC record_payment_je.
 */

export const PAYMENT_TYPES = ["dp", "partial", "pelunasan"] as const;
export type PaymentType = (typeof PAYMENT_TYPES)[number];

export const PAYMENT_TYPE_LABEL: Record<PaymentType, string> = {
	dp: "DP",
	partial: "Cicilan",
	pelunasan: "Pelunasan",
};

export type PaymentCoreInput = {
	eventId: string;
	amount: number;
	paymentDate: string;
	bankAccountId: string;
	paymentType: PaymentType;
	proofUrl: string | null;
	notes: string | null;
};

export type PaymentGuard =
	| {
			ok: true;
			projectId: string;
			clientName: string;
			billable: number;
			sisaSebelum: number;
			sisaSesudah: number;
	  }
	| { ok: false; field: "_form" | "payment_date" | "amount"; error: string };

/** Semua guard, tanpa menulis — dipakai juga oleh preview `_usulan`. */
export async function checkPayment(
	supabase: SupabaseClient,
	input: Pick<PaymentCoreInput, "eventId" | "amount" | "paymentDate">,
): Promise<PaymentGuard> {
	const { data: ev } = await supabase
		.from("events")
		.select(
			"project_id, client_name, grand_total, total_paid, vendor_commission_mode, vendor_commission_amount",
		)
		.eq("id", input.eventId)
		.maybeSingle();
	if (!ev)
		return { ok: false, field: "_form", error: "Event tidak ditemukan." };
	const { data: settled } = await supabase
		.from("event_settlements")
		.select("id")
		.eq("event_id", input.eventId)
		.eq("is_reopened", false)
		.maybeSingle();
	if (settled)
		return {
			ok: false,
			field: "_form",
			error:
				"Event sudah di-settle — pembayaran terkunci. Reopen settlement dulu kalau perlu koreksi.",
		};
	// Uang sebelum cutoff sudah masuk saldo awal hasil hitung fisik — mencatat
	// lagi bikin kas dobel. Backstop-nya ada di record_payment_je_impl.
	const { data: cutoffCfg } = await supabase
		.from("system_config")
		.select("value")
		.eq("key", "finance_cutoff_date")
		.maybeSingle();
	const cutoff =
		typeof cutoffCfg?.value === "string" && cutoffCfg.value.length > 0
			? cutoffCfg.value
			: null;
	if (cutoff && input.paymentDate < cutoff)
		return {
			ok: false,
			field: "payment_date",
			error: `Sebelum cutoff keuangan (${formatDateID(cutoff)}). Uang yang masuk sebelum cutoff sudah termasuk di saldo awal — kalau dicatat lagi kas jadi dobel.`,
		};
	// Tagihan efektif: potongan langsung vendor dipotong di muka.
	const grand = Number(ev.grand_total) || 0;
	const vendorCut =
		ev.vendor_commission_mode === "upfront_cut"
			? Number(ev.vendor_commission_amount) || 0
			: 0;
	const billable = Math.max(0, grand - vendorCut);
	const sisa = Math.max(0, billable - (Number(ev.total_paid) || 0));
	if (billable > 0 && input.amount > sisa)
		return {
			ok: false,
			field: "amount",
			error: `Melebihi sisa tagihan. Sisa: Rp ${sisa.toLocaleString("id-ID")}`,
		};
	return {
		ok: true,
		projectId: ev.project_id as string,
		clientName: ev.client_name as string,
		billable,
		sisaSebelum: sisa,
		sisaSesudah: Math.max(0, sisa - input.amount),
	};
}

export type PaymentCoreResult =
	| (Extract<PaymentGuard, { ok: true }> & { paymentId: string })
	| Extract<PaymentGuard, { ok: false }>;

export async function logPaymentCore(
	supabase: SupabaseClient,
	input: PaymentCoreInput,
	actorId: string,
): Promise<PaymentCoreResult> {
	const guard = await checkPayment(supabase, input);
	if (!guard.ok) return guard;

	const { data: paymentId, error } = await supabase.rpc("record_payment_je", {
		p_event_id: input.eventId,
		p_amount: input.amount,
		p_payment_date: input.paymentDate,
		p_bank_account_id: input.bankAccountId,
		p_payment_type: input.paymentType,
		p_proof_url: input.proofUrl,
		p_notes: input.notes,
		p_actor: actorId,
	});
	if (error) {
		console.error("[logPaymentCore] rpc error:", error);
		return { ok: false, field: "_form", error: `DB: ${error.message}` };
	}

	// Best-effort: kabari grup owner ada uang masuk.
	const { data: bank } = await supabase
		.from("bank_accounts")
		.select("bank_name, account_name")
		.eq("id", input.bankAccountId)
		.maybeSingle();
	await notifyTelegramPaymentReceived(input.eventId, {
		typeLabel: PAYMENT_TYPE_LABEL[input.paymentType],
		amount: input.amount,
		bankLabel:
			[bank?.bank_name, bank?.account_name].filter(Boolean).join(" ") || null,
		remaining: guard.sisaSesudah,
	});

	// B4: dokumen otomatis + tawaran kirim ke klien (1 tap owner). Setelah
	// respons dikirim, supaya form pembayaran tidak ikut menunggu.
	const pid = paymentId as string;
	after(() =>
		offerPaymentDocs(
			input.eventId,
			pid,
			input.paymentType,
			input.amount,
			actorId,
		).catch((e) => console.error("[payment-core] dokumen otomatis:", e)),
	);

	return { ...guard, paymentId: pid };
}

/**
 * DP/cicilan → kuitansi + invoice sisa; lunas → nota lunas. Semua idempoten.
 * Tidak ada yang dikirim ke klien — hanya ditawarkan ke grup owner.
 */
export async function offerPaymentDocs(
	eventId: string,
	paymentId: string,
	paymentType: PaymentType,
	amount: number,
	actorId: string,
): Promise<void> {
	const admin = createAdminClient();
	const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
	const { data: ev } = await admin
		.from("events")
		.select("client_name, remaining_balance")
		.eq("id", eventId)
		.maybeSingle();
	if (!ev) return;
	const lunas = Number(ev.remaining_balance) <= 0;
	const client = tgEscape(ev.client_name as string);

	if (lunas) {
		const nota = await issuePaidDocCore(
			admin,
			eventId,
			"nota_lunas",
			actorId,
			today,
		);
		if (!nota.ok) return;
		await offerSendToOwner(admin, {
			documentIds: [nota.id],
			headerHtml: `🧾 <b>${client} lunas</b> (${PAYMENT_TYPE_LABEL[paymentType]} ${formatRupiah(amount)}).\nNota lunas <b>${nota.docNumber}</b> siap. Kirim ke klien?`,
		});
		return;
	}

	const [receipt, invoice] = await Promise.all([
		issueReceiptCore(admin, paymentId, actorId, today),
		getOrCreateInvoice(admin, eventId, actorId, today),
	]);
	if (!receipt.ok) return;
	const ids = [receipt.id, ...(invoice.ok ? [invoice.id] : [])];
	await offerSendToOwner(admin, {
		documentIds: ids,
		headerHtml: `💵 <b>${PAYMENT_TYPE_LABEL[paymentType]} ${formatRupiah(amount)}</b> dari ${client} tercatat.\nKuitansi <b>${receipt.docNumber}</b>${invoice.ok ? ` + invoice sisa <b>${invoice.docNumber}</b> (${formatRupiah(Number(ev.remaining_balance))})` : ""}. Kirim ke klien?`,
	});
}
