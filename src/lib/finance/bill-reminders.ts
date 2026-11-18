import "server-only";

import { todayWIB } from "@/lib/dates";
import {
	type BillStatus,
	loadBillStatuses,
	reminderLine,
} from "@/lib/finance/recurring-bills";
import { notifyAdminWaGroup } from "@/lib/portal/notify";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Pengingat tagihan rutin di luar Telegram (owner 18 Nov 2026: "ke grup owner
 * Tetra Photobooth, bukan cuma ke admin"):
 *   1. grup WA "Tetra Photobooth" lewat bot (send-grup-admin) — sekali sehari;
 *   2. lonceng in-app tiap owner — satu notifikasi per tagihan per jatuh tempo,
 *      otomatis selesai begitu tagihannya lunas.
 * Telegram tetap lewat digest pagi (gatherRenewalLines). Dijalankan cron harian.
 */

type Admin = ReturnType<typeof createAdminClient>;

/** Klaim sekali kirim (tabel dedup yang sama dengan digest Telegram). */
async function claim(admin: Admin, kind: string, key: string) {
	const { data, error } = await admin
		.from("telegram_sent_log")
		.upsert(
			{ kind, dedup_key: key },
			{ onConflict: "kind,dedup_key", ignoreDuplicates: true },
		)
		.select("id");
	if (error) throw new Error(`dedup ${kind}: ${error.message}`);
	return (data?.length ?? 0) > 0;
}

export function waReminderText(due: BillStatus[], appUrl: string): string[] {
	return [
		"🔔 *Pengingat tagihan rutin Tetra*",
		...due.map((s) => `• ${reminderLine(s)}`),
		"",
		"Sudah dibayar? Catat di Tetra Ops (Catat transaksi) — pengingatnya berhenti sendiri.",
		...(appUrl ? [`${appUrl}/finance/tagihan-rutin`] : []),
	];
}

/**
 * Tagihan yang sudah lunas / belum mendesak → selesaikan notifikasinya (badge
 * menu ikut turun). Dipanggil cron dan saat halaman Tagihan rutin dibuka.
 */
export async function resolveBillNotifications(
	statuses: BillStatus[],
): Promise<number> {
	const tenang = statuses
		.filter((s) => s.urgency === "nanti")
		.map((s) => s.bill.id);
	if (!tenang.length) return 0;
	const now = new Date().toISOString();
	const { data, error } = await createAdminClient()
		.from("notifications")
		.update({
			is_resolved: true,
			resolved_at: now,
			is_read: true,
			read_at: now,
		})
		.eq("entity_type", "recurring_bill")
		.in("entity_id", tenang)
		.eq("is_resolved", false)
		.select("id");
	if (error) throw new Error(`resolve notif: ${error.message}`);
	return data?.length ?? 0;
}

export async function runBillReminders(today = todayWIB()): Promise<{
	wa: "sent" | "skipped" | "none";
	notified: number;
	resolved: number;
}> {
	const admin = createAdminClient();
	const { active } = await loadBillStatuses(admin, today);
	const resolved = await resolveBillNotifications(active);

	const due = active.filter((s) => s.remindToday);
	if (due.length === 0) return { wa: "none", notified: 0, resolved };

	// Lonceng: satu per tagihan per jatuh tempo.
	const { data: owners, error: ownErr } = await admin
		.from("users")
		.select("id")
		.eq("is_active", true)
		.is("deleted_at", null)
		.in("role", ["owner", "super_admin"]);
	if (ownErr) throw new Error(`owners: ${ownErr.message}`);
	let notified = 0;
	for (const s of due) {
		if (!(await claim(admin, "bill_notif", `${s.bill.id}:${s.due}`))) continue;
		const { error } = await admin.from("notifications").insert(
			(owners ?? []).map((u) => ({
				user_id: u.id,
				severity: s.daysLeft < 0 ? "alert" : "warning",
				category: "financial",
				title: `Tagihan: ${s.bill.name}`,
				body: reminderLine(s),
				entity_type: "recurring_bill",
				entity_id: s.bill.id,
				action_url: "/finance/tagihan-rutin",
			})),
		);
		if (error) throw new Error(`notif ${s.bill.name}: ${error.message}`);
		notified++;
	}

	// Grup WA: satu pesan per hari berisi semua yang perlu diingat.
	const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
	if (!(await claim(admin, "bills_wa", today)))
		return { wa: "skipped", notified, resolved };
	await notifyAdminWaGroup(waReminderText(due, appUrl));
	return { wa: "sent", notified, resolved };
}
