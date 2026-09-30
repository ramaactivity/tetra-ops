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

/** Dokumen yang langsung terbit saat pembayaran dicatat. */
export type IssuedPaymentDoc = {
	id: string;
	docType: "receipt" | "invoice" | "nota_lunas";
	docNumber: string;
};

export type PaymentCoreResult =
	| (Extract<PaymentGuard, { ok: true }> & {
			paymentId: string;
			/** Kuitansi (+ invoice sisa / nota lunas) — kosong bila gagal terbit. */
			docs: IssuedPaymentDoc[];
			lunas: boolean;
	  })
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

	// Dokumen terbit SEKARANG (bukan di latar belakang) supaya form bisa
	// langsung menawarkan unduh/kirim kuitansi. Gagal terbit ≠ gagal bayar:
	// pembayaran sudah tercatat, dokumen bisa diterbitkan ulang dari Billing.
	const pid = paymentId as string;
	const issued = await issuePaymentDocs(input.eventId, pid, actorId).catch(
		(e) => {
			console.error("[payment-core] dokumen otomatis:", e);
			return null;
		},
	);

	// Tawaran kirim ke klien lewat grup owner (1 tap) — setelah respons.
	if (issued) {
		after(() =>
			offerPaymentDocsToOwner(
				input.eventId,
				issued,
				input.paymentType,
				input.amount,
			).catch((e) => console.error("[payment-core] tawaran dokumen:", e)),
		);
	}

	return {
		...guard,
		paymentId: pid,
		docs: issued?.docs ?? [],
		lunas: issued?.lunas ?? guard.sisaSesudah <= 0,
	};
}

/**
 * Terbitkan dokumen untuk satu pembayaran. Semua idempoten.
 *   selalu        → kuitansi pembayaran ini
 *   belum lunas   → + invoice (sisa tagihan)
 *   lunas         → + nota lunas
 * Tidak ada yang dikirim ke klien.
 */
export async function issuePaymentDocs(
	eventId: string,
	paymentId: string,
	actorId: string,
): Promise<{ docs: IssuedPaymentDoc[]; lunas: boolean; remaining: number }> {
	const admin = createAdminClient();
	const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
	const { data: ev } = await admin
		.from("events")
		.select("remaining_balance")
		.eq("id", eventId)
		.maybeSingle();
	const remaining = Number(ev?.remaining_balance ?? 0);
	const lunas = remaining <= 0;
	const [receipt, follow] = await Promise.all([
		issueReceiptCore(admin, paymentId, actorId, today),
		lunas
			? issuePaidDocCore(admin, eventId, "nota_lunas", actorId, today)
			: getOrCreateInvoice(admin, eventId, actorId, today),
	]);
	const docs: IssuedPaymentDoc[] = [];
	if (receipt.ok)
		docs.push({
			id: receipt.id,
			docType: "receipt",
			docNumber: receipt.docNumber,
		});
	if (follow.ok)
		docs.push({
			id: follow.id,
			docType: lunas ? "nota_lunas" : "invoice",
			docNumber: follow.docNumber,
		});
	return { docs, lunas, remaining };
}

/** Tawarkan dokumen yang baru terbit ke grup owner (kirim ke klien 1 tap). */
async function offerPaymentDocsToOwner(
	eventId: string,
	issued: Awaited<ReturnType<typeof issuePaymentDocs>>,
	paymentType: PaymentType,
	amount: number,
): Promise<void> {
	if (issued.docs.length === 0) return;
	const admin = createAdminClient();
	const { data: ev } = await admin
		.from("events")
		.select("client_name")
		.eq("id", eventId)
		.maybeSingle();
	if (!ev) return;
	const client = tgEscape(ev.client_name as string);
	const receipt = issued.docs.find((d) => d.docType === "receipt");
	const nota = issued.docs.find((d) => d.docType === "nota_lunas");
	const invoice = issued.docs.find((d) => d.docType === "invoice");
	// Lunas: yang ditawarkan nota lunas (kuitansi pelunasan tetap ada di app).
	if (issued.lunas && nota) {
		await offerSendToOwner(admin, {
			documentIds: [nota.id],
			headerHtml: `🧾 <b>${client} lunas</b> (${PAYMENT_TYPE_LABEL[paymentType]} ${formatRupiah(amount)}).\nNota lunas <b>${nota.docNumber}</b> siap. Kirim ke klien?`,
		});
		return;
	}
	if (!receipt) return;
	await offerSendToOwner(admin, {
		documentIds: [receipt.id, ...(invoice ? [invoice.id] : [])],
		headerHtml: `💵 <b>${PAYMENT_TYPE_LABEL[paymentType]} ${formatRupiah(amount)}</b> dari ${client} tercatat.\nKuitansi <b>${receipt.docNumber}</b>${invoice ? ` + invoice sisa <b>${invoice.docNumber}</b> (${formatRupiah(issued.remaining)})` : ""}. Kirim ke klien?`,
	});
}
