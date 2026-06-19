import { CalendarClock, Clock, MessageCircle, Users } from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import {
	BarList,
	ChartCard,
	DayTrend,
	HourHistogram,
} from "@/components/leads/analytics-charts";
import {
	SEGMENT_DOT,
	STATUS_DOT,
	STATUS_OPTIONS,
	segmentLabel,
	statusLabel,
	topicLabel,
} from "@/components/leads/leads-shared";
import { LeadsTabs } from "@/components/leads/leads-tabs";
import { KpiRow } from "@/components/operations/_shared/kpi-row";
import { KpiCard } from "@/components/operations/kpi-card";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const WIB_OFFSET_H = 7; // received_at is UTC; bucket by WIB (Indonesia).
const DAY_MS = 86_400_000;

const RANGE_OPTIONS = [
	{ value: "7d", label: "7 hari", days: 7 },
	{ value: "30d", label: "30 hari", days: 30 },
	{ value: "90d", label: "90 hari", days: 90 },
	{ value: "all", label: "Semua", days: 0 },
] as const;

type RangeValue = (typeof RANGE_OPTIONS)[number]["value"];

/** Shift a UTC instant into WIB and return its hour + midnight epoch (ms). */
function wibParts(iso: string): { hour: number; ms: number } {
	const d = new Date(new Date(iso).getTime() + WIB_OFFSET_H * 3_600_000);
	return {
		hour: d.getUTCHours(),
		ms: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
	};
}

const ID_MONTHS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"Mei",
	"Jun",
	"Jul",
	"Agu",
	"Sep",
	"Okt",
	"Nov",
	"Des",
];

function dayLabel(ms: number): string {
	const d = new Date(ms);
	return `${d.getUTCDate()} ${ID_MONTHS[d.getUTCMonth()]}`;
}

export default async function LeadsAnalyticsPage({
	searchParams,
}: {
	searchParams: Promise<{ range?: string }>;
}) {
	const params = await searchParams;
	const range: RangeValue =
		(RANGE_OPTIONS.find((r) => r.value === params.range)
			?.value as RangeValue) ?? "30d";
	const rangeDef =
		RANGE_OPTIONS.find((r) => r.value === range) ?? RANGE_OPTIONS[1];

	const supabase = await createClient();
	const now = new Date();
	const startISO =
		rangeDef.days > 0
			? new Date(now.getTime() - rangeDef.days * DAY_MS).toISOString()
			: null;

	let leadsQuery = supabase
		.from("whatsapp_bot_leads")
		.select("received_at, topic, status, phone, wa_jid, is_after_hours")
		.order("received_at", { ascending: true })
		.limit(20000);
	if (startISO) leadsQuery = leadsQuery.gte("received_at", startISO);

	const [leadsRes, contactsRes] = await Promise.all([
		leadsQuery,
		supabase
			.from("whatsapp_bot_contacts")
			.select("wa_jid, segment")
			.limit(20000),
	]);

	const leads = (leadsRes.data ?? []) as Array<{
		received_at: string;
		topic: string;
		status: string;
		phone: string;
		wa_jid: string;
		is_after_hours: boolean;
	}>;
	const contacts = (contactsRes.data ?? []) as Array<{
		wa_jid: string;
		segment: string;
	}>;
	const segmentByJid = new Map(contacts.map((c) => [c.wa_jid, c.segment]));
	const rekananCount = contacts.filter((c) => c.segment !== "private").length;

	// ── KPIs ──────────────────────────────────────────────────────────────
	const total = leads.length;
	const uniquePhones = new Set(leads.map((l) => l.phone)).size;
	const afterHours = leads.filter((l) => l.is_after_hours).length;
	const afterHoursPct = total ? Math.round((afterHours / total) * 100) : 0;

	// Days in range — fixed window, or earliest→today for "all".
	let spanDays: number = rangeDef.days;
	if (spanDays === 0) {
		const earliest = leads.length ? wibParts(leads[0].received_at).ms : null;
		const todayMs = wibParts(now.toISOString()).ms;
		spanDays = earliest ? Math.round((todayMs - earliest) / DAY_MS) + 1 : 1;
	}
	const avgPerDay = total ? total / Math.max(1, spanDays) : 0;

	// ── Per day (filled buckets so gaps show as zero) ───────────────────────
	const perDayMap = new Map<number, number>();
	const hourCounts = new Array<number>(24).fill(0);
	const segmentCounts = new Map<string, number>();
	const topicCounts = new Map<string, number>();
	const statusCounts = new Map<string, number>();

	for (const l of leads) {
		const { hour, ms } = wibParts(l.received_at);
		perDayMap.set(ms, (perDayMap.get(ms) ?? 0) + 1);
		hourCounts[hour] += 1;
		const seg = segmentByJid.get(l.wa_jid) ?? "private";
		segmentCounts.set(seg, (segmentCounts.get(seg) ?? 0) + 1);
		topicCounts.set(l.topic, (topicCounts.get(l.topic) ?? 0) + 1);
		statusCounts.set(l.status, (statusCounts.get(l.status) ?? 0) + 1);
	}

	// Fill day buckets from window start (or earliest) to today.
	const todayMs = wibParts(now.toISOString()).ms;
	const firstMs =
		rangeDef.days > 0
			? todayMs - (rangeDef.days - 1) * DAY_MS
			: leads.length
				? wibParts(leads[0].received_at).ms
				: todayMs;
	const dayPoints: Array<{ id: number; label: string; value: number }> = [];
	for (let ms = firstMs; ms <= todayMs; ms += DAY_MS) {
		dayPoints.push({
			id: ms,
			label: dayLabel(ms),
			value: perDayMap.get(ms) ?? 0,
		});
	}

	const segmentBars = [...segmentCounts.entries()]
		.sort((a, b) => b[1] - a[1])
		.map(([seg, value]) => ({
			label: segmentLabel(seg, true),
			value,
			colorClass: SEGMENT_DOT[seg] ?? "bg-foreground",
		}));

	const topicBars = [...topicCounts.entries()]
		.sort((a, b) => b[1] - a[1])
		.map(([t, value]) => ({ label: topicLabel(t), value }));

	const converted = statusCounts.get("converted") ?? 0;
	const closingPct = total ? Math.round((converted / total) * 100) : 0;
	const funnelBars = STATUS_OPTIONS.map((s) => {
		const value = statusCounts.get(s.value) ?? 0;
		return {
			label: statusLabel(s.value),
			value,
			colorClass: STATUS_DOT[s.value] ?? "bg-foreground",
			note: total ? `${Math.round((value / total) * 100)}%` : undefined,
		};
	});

	const chipClass = (active: boolean) =>
		cn(
			"inline-flex h-8 shrink-0 items-center rounded-full border px-3.5 text-[13px] font-medium transition-colors",
			active
				? "border-[#059669] bg-[#059669] text-white"
				: "border-border-default bg-card text-foreground/70 hover:bg-secondary hover:text-foreground",
		);

	return (
		<Container size="xl" className="space-y-3">
			<SectionHeader
				title="Analitik Leads"
				description="Tren & komposisi lead WhatsApp dari bot Tetra. Dasar untuk atur standby admin dan baca segmen yang tumbuh."
				actions={<LeadsTabs active="analitik" rekananCount={rekananCount} />}
			/>

			{/* Range filter */}
			<div className="flex flex-wrap items-center gap-1.5">
				{RANGE_OPTIONS.map((r) => (
					<Link
						key={r.value}
						href={`/leads/analitik?range=${r.value}`}
						aria-current={range === r.value ? "true" : undefined}
						className={chipClass(range === r.value)}
					>
						{r.label}
					</Link>
				))}
			</div>

			<KpiRow>
				<KpiCard
					label="Total Lead"
					value={total.toLocaleString("id-ID")}
					hint={rangeDef.days ? `${rangeDef.label} terakhir` : "Semua waktu"}
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
					label="Rata-rata / Hari"
					value={avgPerDay.toLocaleString("id-ID", {
						maximumFractionDigits: 1,
					})}
					hint={`Selama ${spanDays} hari`}
					icon={CalendarClock}
					accent="emerald"
				/>
				<KpiCard
					label="Di Luar Jam"
					value={`${afterHoursPct}%`}
					hint={`${afterHours.toLocaleString("id-ID")} lead luar jam kerja`}
					icon={Clock}
					accent="amber"
				/>
			</KpiRow>

			<ChartCard
				title="Lead per hari"
				subtitle="Volume harian — lihat tren naik/turun dan hari puncak."
			>
				<DayTrend points={dayPoints} />
			</ChartCard>

			<div className="grid gap-3 lg:grid-cols-2">
				<ChartCard
					title="Lead per segmen"
					subtitle="Komposisi B2C (Private) vs rekanan B2B & dunia pendidikan."
				>
					<BarList items={segmentBars} emptyLabel="Belum ada lead bersegmen" />
				</ChartCard>
				<ChartCard
					title="Lead per topik"
					subtitle="Apa yang paling sering ditanyakan calon customer."
				>
					<BarList items={topicBars} emptyLabel="Belum ada topik" />
				</ChartCard>
			</div>

			<div className="grid gap-3 lg:grid-cols-2">
				<ChartCard
					title="Jam ramai (WIB)"
					subtitle="Sebaran lead per jam — buat atur jadwal standby admin."
				>
					<HourHistogram counts={hourCounts} />
				</ChartCard>
				<ChartCard
					title="Funnel konversi"
					subtitle="Status lead dari Baru sampai Closing."
					right={
						<span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-300/40 px-2.5 py-1 text-[12px] font-semibold text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200">
							<span className="tabular">{closingPct}%</span> closing
						</span>
					}
				>
					<BarList items={funnelBars} emptyLabel="Belum ada lead" />
				</ChartCard>
			</div>
		</Container>
	);
}
