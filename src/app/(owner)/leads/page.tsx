import { Clock, MessageCircle, Settings2, Tag, Users } from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { LeadsFilterBar } from "@/components/leads/leads-filter-bar";
import { LeadsListTable } from "@/components/leads/leads-list-table";
import {
	type LeadRow,
	periodStartISO,
	topicLabel,
} from "@/components/leads/leads-shared";
import { KpiRow } from "@/components/operations/_shared/kpi-row";
import { KpiCard } from "@/components/operations/kpi-card";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LeadsPage({
	searchParams,
}: {
	searchParams: Promise<{
		q?: string;
		period?: string;
		topic?: string;
		status?: string;
	}>;
}) {
	const params = await searchParams;
	const q = params.q?.trim() ?? "";
	const period = params.period?.trim() ?? "all";
	const topic = params.topic?.trim() ?? "";
	const status = params.status?.trim() ?? "";

	const supabase = await createClient();
	const me = await getCurrentUser();
	const canManage =
		me?.profile.role === "owner" || me?.profile.role === "super_admin";
	const now = new Date();

	// List query — filtered, capped at 200 most-recent.
	let listQuery = supabase
		.from("whatsapp_bot_leads")
		.select("*")
		.order("received_at", { ascending: false })
		.limit(200);

	if (q) {
		const safe = q.replace(/[%,]/g, " ").trim();
		listQuery = listQuery.or(
			`phone.ilike.%${safe}%,name.ilike.%${safe}%,message.ilike.%${safe}%`,
		);
	}
	if (topic) listQuery = listQuery.eq("topic", topic);
	if (status) listQuery = listQuery.eq("status", status);
	const startISO = periodStartISO(period, now);
	if (startISO) listQuery = listQuery.gte("received_at", startISO);

	// Aggregate query — all-time lightweight rows for KPIs + topic dropdown.
	const aggQuery = supabase
		.from("whatsapp_bot_leads")
		.select("phone, topic, received_at")
		.order("received_at", { ascending: false })
		.limit(10000);

	const [listResult, aggResult] = await Promise.all([listQuery, aggQuery]);

	if (listResult.error) {
		return (
			<Container size="xl">
				<div className="rounded-md border border-destructive bg-destructive/10 p-4">
					<p className="text-fluid-body font-medium text-destructive">
						Gagal memuat leads: {listResult.error.message}
					</p>
				</div>
			</Container>
		);
	}

	const leads = (listResult.data ?? []) as LeadRow[];
	const agg = (aggResult.data ?? []) as Array<{
		phone: string;
		topic: string;
		received_at: string;
	}>;

	// KPIs (all-time)
	const totalLeads = agg.length;
	const uniquePhones = new Set(agg.map((r) => r.phone)).size;
	const todayStart = new Date(now);
	todayStart.setHours(0, 0, 0, 0);
	const todayCount = agg.filter(
		(r) => new Date(r.received_at) >= todayStart,
	).length;

	const topicCounts = new Map<string, number>();
	for (const r of agg) {
		topicCounts.set(r.topic, (topicCounts.get(r.topic) ?? 0) + 1);
	}
	let topTopic = "";
	let topTopicCount = 0;
	for (const [t, c] of topicCounts) {
		if (c > topTopicCount) {
			topTopic = t;
			topTopicCount = c;
		}
	}
	const topics = [...topicCounts.keys()].sort();

	return (
		<Container size="xl" className="space-y-3">
			<SectionHeader
				title="Leads"
				description="Lead WhatsApp yang ditangkap otomatis oleh bot Tetra. Follow-up internal saja — jangan untuk blast."
				actions={
					canManage ? (
						<Link
							href="/leads/settings"
							className={buttonVariants({ variant: "outline", className: "h-9" })}
						>
							<Settings2 className="size-3.5" />
							<span className="hidden sm:inline">Setting Bot</span>
						</Link>
					) : undefined
				}
			/>

			<KpiRow>
				<KpiCard
					label="Total Lead"
					value={totalLeads.toLocaleString("id-ID")}
					hint="Semua interaksi tercatat"
					icon={MessageCircle}
					accent="primary"
				/>
				<KpiCard
					label="Lead Unik"
					value={uniquePhones.toLocaleString("id-ID")}
					hint="Nomor berbeda"
					icon={Users}
					accent="sky"
				/>
				<KpiCard
					label="Hari Ini"
					value={todayCount.toLocaleString("id-ID")}
					hint="Lead masuk hari ini"
					icon={Clock}
					accent="emerald"
				/>
				<KpiCard
					label="Topik Terpopuler"
					value={topTopic ? topicLabel(topTopic) : "—"}
					hint={topTopic ? `${topTopicCount} lead` : "Belum ada data"}
					icon={Tag}
					accent="amber"
				/>
			</KpiRow>

			<div className="space-y-3">
				<LeadsFilterBar
					defaultQ={q}
					period={period}
					topic={topic}
					status={status}
					topics={topics}
				/>

				{leads.length === 0 ? (
					<EmptyState
						icon={MessageCircle}
						title="Belum ada lead"
						description={
							q || topic || status || period !== "all"
								? "Coba ubah filter atau hapus pencarian."
								: "Lead akan muncul otomatis di sini saat bot WhatsApp membalas calon customer."
						}
					/>
				) : (
					<LeadsListTable leads={leads} canManage={canManage} />
				)}
			</div>
		</Container>
	);
}
