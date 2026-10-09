"use server";

/** Mode Demo (DR-047): reset data demo, link masuk akun demo, simulasi DP. Owner saja. */
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/get-user";
import { demoLoginLink, resetDemo } from "@/lib/demo";
import { createAdminClient } from "@/lib/supabase/admin";

type Result =
	| { ok: true; url?: string; note?: string }
	| { ok: false; error: string };

async function owner() {
	const me = await getCurrentUser();
	return me &&
		(me.profile.role === "owner" || me.profile.role === "super_admin")
		? me
		: null;
}

export async function resetDemoAction(): Promise<Result> {
	const me = await owner();
	if (!me) return { ok: false, error: "Hanya owner." };
	try {
		await resetDemo(me.profile.id);
	} catch (e) {
		return {
			ok: false,
			error: e instanceof Error ? e.message : "Gagal reset demo.",
		};
	}
	revalidatePath("/settings/demo");
	return { ok: true, note: "Data demo dibuat ulang." };
}

export async function demoLinkAction(who: "vendor" | "klien"): Promise<Result> {
	if (!(await owner())) return { ok: false, error: "Hanya owner." };
	const url = await demoLoginLink(who);
	return url
		? { ok: true, url }
		: { ok: false, error: "Data demo belum ada. Klik Reset data demo dulu." };
}

/** DP/pelunasan demo "diterima" tanpa pembayaran & jurnal: hanya angka event demo. */
export async function simulateDemoPayment(
	submissionId: string,
): Promise<Result> {
	if (!(await owner())) return { ok: false, error: "Hanya owner." };
	const a = createAdminClient();
	const { data: s } = await a
		.from("payment_submissions")
		.select(
			"id, amount, kind, status, booking:client_bookings(id, is_demo, event_id, status)",
		)
		.eq("id", submissionId)
		.maybeSingle();
	// to-one embed → object.
	const b = s?.booking as unknown as {
		id: string;
		is_demo: boolean;
		event_id: string | null;
		status: string;
	} | null;
	if (!s || !b?.is_demo) return { ok: false, error: "Bukan pengajuan demo." };
	if (s.status !== "menunggu") return { ok: false, error: "Sudah diputuskan." };
	if (!b.event_id)
		return {
			ok: false,
			error:
				"Booking demo draf belum punya event — simulasi hanya untuk booking demo resmi.",
		};
	const { data: ev } = await a
		.from("events")
		.select("grand_total, total_paid, is_demo")
		.eq("id", b.event_id)
		.single();
	if (!ev?.is_demo) return { ok: false, error: "Event bukan demo." };
	const paid = Number(ev.total_paid ?? 0) + Number(s.amount);
	const grand = Number(ev.grand_total ?? 0);
	await a
		.from("events")
		.update({
			total_paid: paid,
			remaining_balance: Math.max(0, grand - paid),
			payment_status: paid >= grand ? "paid" : paid > 0 ? "partial" : "unpaid",
		})
		.eq("id", b.event_id);
	await a
		.from("payment_submissions")
		.update({ status: "diterima" })
		.eq("id", submissionId);
	revalidatePath("/settings/demo");
	return {
		ok: true,
		note: "Pembayaran demo diterima (simulasi, tanpa jurnal).",
	};
}
