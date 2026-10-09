import { notFound } from "next/navigation";
import { SectionHeader } from "@/components/layout/section-header";
import { DemoPanel, type DemoSub } from "@/components/system-config/demo-panel";
import { getCurrentUser } from "@/lib/auth/get-user";
import { DEMO_PHONES } from "@/lib/demo-phones";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function DemoSettingsPage() {
	const me = await getCurrentUser();
	if (!me || (me.profile.role !== "owner" && me.profile.role !== "super_admin"))
		notFound();
	const a = createAdminClient();
	const [{ count }, { data: bks }] = await Promise.all([
		a
			.from("portal_people")
			.select("id", { count: "exact", head: true })
			.in("phone", DEMO_PHONES),
		a
			.from("client_bookings")
			.select("id, public_code, detail")
			.eq("is_demo", true),
	]);
	const byId = new Map(
		(bks ?? []).map((b) => [
			b.id as string,
			(b.detail as { nama_acara?: string })?.nama_acara ??
				(b.public_code as string),
		]),
	);
	const { data: subs } = byId.size
		? await a
				.from("payment_submissions")
				.select("id, amount, kind, booking_id")
				.in("booking_id", [...byId.keys()])
				.eq("status", "menunggu")
		: { data: [] };
	return (
		<div className="space-y-3">
			<SectionHeader
				as="h2"
				title="Mode Demo"
				description="Akun & data contoh untuk mencoba dashboard klien dan dasbor rekanan seperti aslinya. Tidak masuk laporan, KPI, digest, jadwal, maupun Booth — dan tidak pernah membuat pembayaran/jurnal."
			/>
			<DemoPanel
				ready={(count ?? 0) > 0}
				subs={(
					(subs ?? []) as Array<{
						id: string;
						amount: number;
						kind: string;
						booking_id: string;
					}>
				).map(
					(s): DemoSub => ({
						id: s.id,
						amount: Number(s.amount),
						kind: s.kind,
						booking: byId.get(s.booking_id) ?? "Booking demo",
					}),
				)}
			/>
		</div>
	);
}
