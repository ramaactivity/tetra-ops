import { Building2, Handshake, TrendingUp, Users } from "lucide-react";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import type { ContactRow, LeadRow } from "@/components/leads/leads-shared";
import { LeadsTabs } from "@/components/leads/leads-tabs";
import {
	type RekananAccount,
	RekananAccounts,
} from "@/components/leads/rekanan-accounts";
import { KpiRow } from "@/components/operations/_shared/kpi-row";
import { KpiCard } from "@/components/operations/kpi-card";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function RekananPage() {
	const supabase = await createClient();
	const me = await getCurrentUser();
	const canManage =
		me?.profile.role === "owner" || me?.profile.role === "super_admin";

	// B2B accounts = every contact whose segment is not 'private'.
	const { data: contactsData, error } = await supabase
		.from("whatsapp_bot_contacts")
		.select("*")
		.neq("segment", "private")
		.order("last_seen_at", { ascending: false })
		.limit(2000);

	if (error) {
		return (
			<Container size="xl">
				<div className="rounded-md border border-destructive bg-destructive/10 p-4">
					<p className="text-fluid-body font-medium text-destructive">
						Gagal memuat rekanan: {error.message}
					</p>
				</div>
			</Container>
		);
	}

	const contacts = (contactsData ?? []) as ContactRow[];
	const jids = contacts.map((c) => c.wa_jid);

	// Pull every lead belonging to these accounts in one shot, then group by jid.
	const leadsByJid = new Map<string, LeadRow[]>();
	if (jids.length) {
		const { data: leadsData } = await supabase
			.from("whatsapp_bot_leads")
			.select("*")
			.in("wa_jid", jids)
			.order("received_at", { ascending: false })
			.limit(10000);
		for (const l of (leadsData ?? []) as LeadRow[]) {
			const arr = leadsByJid.get(l.wa_jid);
			if (arr) arr.push(l);
			else leadsByJid.set(l.wa_jid, [l]);
		}
	}

	const accounts: RekananAccount[] = contacts.map((c) => {
		const leads = leadsByJid.get(c.wa_jid) ?? [];
		return {
			...c,
			leads,
			interactions: leads.length,
			lastTopic: leads[0]?.topic ?? null,
		};
	});

	const totalAccounts = accounts.length;
	const rekananCount = accounts.filter((a) => a.status === "rekanan").length;
	const aktifCount = accounts.filter((a) => a.status === "aktif").length;
	const totalInteractions = accounts.reduce((s, a) => s + a.interactions, 0);

	return (
		<Container size="xl" className="space-y-3">
			<SectionHeader
				title="Rekanan"
				description="Akun B2B & rekanan jangka panjang — corporate, instansi, EO/WO, venue. Klien berulang dengan nilai tinggi, dikelola sebagai akun, bukan lead sekali pakai."
			/>

			<LeadsTabs active="rekanan" rekananCount={totalAccounts} />

			<KpiRow>
				<KpiCard
					label="Total Akun"
					value={totalAccounts.toLocaleString("id-ID")}
					hint="Kontak non-private"
					icon={Building2}
					accent="primary"
				/>
				<KpiCard
					label="Rekanan"
					value={rekananCount.toLocaleString("id-ID")}
					hint="Relasi terjalin"
					icon={Handshake}
					accent="emerald"
				/>
				<KpiCard
					label="Aktif"
					value={aktifCount.toLocaleString("id-ID")}
					hint="Sedang berjalan"
					icon={Users}
					accent="sky"
				/>
				<KpiCard
					label="Total Interaksi"
					value={totalInteractions.toLocaleString("id-ID")}
					hint="Lead dari semua akun"
					icon={TrendingUp}
					accent="amber"
				/>
			</KpiRow>

			{accounts.length === 0 ? (
				<EmptyState
					icon={Building2}
					title="Belum ada rekanan"
					description="Lead B2B muncul di sini begitu bot mendeteksi corporate / instansi / EO-WO / venue, atau saat kamu menandai sebuah kontak sebagai non-private di tab Leads."
				/>
			) : (
				<RekananAccounts accounts={accounts} canManage={canManage} />
			)}
		</Container>
	);
}
