import { BadgeDollarSign } from "lucide-react";
import Link from "next/link";
import { LogPaymentDialog } from "@/components/billing/log-payment-dialog";
import type { BankAccountOption } from "@/components/billing/payment-form";
import { formatDateID, formatRupiah } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

/** DP standar yang diminta bot ke klien. */
const BOT_DP_AMOUNT = 500_000;

/**
 * Event dari Booking Masuk yang belum ada pembayarannya: ingatkan owner
 * mencatat DP yang dilaporkan klien — lewat alur logPayment biasa (semua guard
 * berlaku). Tidak ada pencatatan otomatis.
 */
export async function InboxDpReminder({
	eventId,
	projectId,
	totalPaid,
	grandTotal,
}: {
	eventId: string;
	projectId: string;
	totalPaid: number;
	grandTotal: number;
}) {
	if (totalPaid > 0) return null;
	const supabase = await createClient();
	const { data: inbox } = await supabase
		.from("booking_inbox")
		.select("id, dp_dilaporkan_at, created_at, bukti_url")
		.eq("event_id", eventId)
		.eq("status", "jadi_event")
		.maybeSingle();
	if (!inbox) return null;
	const { data: banks } = await supabase
		.from("bank_accounts")
		.select("id, bank_name, account_number, account_holder, is_default_receive")
		.eq("is_active", true)
		.neq("account_kind", "emoney");
	const reported = (inbox.dp_dilaporkan_at ?? inbox.created_at) as string;

	return (
		<section className="flex flex-wrap items-center gap-3 rounded-[16px] border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
			<BadgeDollarSign className="size-5 shrink-0" />
			<p className="min-w-0 flex-1 text-[13.5px]">
				<span className="font-semibold">
					DP {formatRupiah(BOT_DP_AMOUNT)} dilaporkan klien{" "}
					{formatDateID(reported)}
				</span>{" "}
				— cek mutasi rekening lalu catat.{" "}
				<Link
					href={`/operations/booking-masuk/${inbox.id}`}
					className="underline underline-offset-2"
				>
					Lihat booking masuk
				</Link>
			</p>
			<LogPaymentDialog
				eventId={eventId}
				projectId={projectId}
				bankAccounts={(banks ?? []) as BankAccountOption[]}
				defaultDate={new Date().toISOString().slice(0, 10)}
				suggestedAmount={BOT_DP_AMOUNT}
				grandTotal={grandTotal}
				totalPaid={totalPaid}
				defaultDpAmount={BOT_DP_AMOUNT}
				defaultProofUrl={(inbox.bukti_url as string | null) ?? undefined}
				triggerLabel="Catat DP"
			/>
		</section>
	);
}
