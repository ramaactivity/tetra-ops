import {
	Bot,
	CalendarClock,
	CircleCheck,
	Download,
	FileText,
	MessageCircle,
	Settings2,
	Users,
} from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { LeadsFilterBar } from "@/components/leads/leads-filter-bar";
import { LeadsListTable } from "@/components/leads/leads-list-table";
import {
	type ContactRow,
	type LeadRow,
	type LeadStage,
	periodStartISO,
	STAGE_OPTIONS,
} from "@/components/leads/leads-shared";
import { LeadsTabs } from "@/components/leads/leads-tabs";
import { KpiRow } from "@/components/operations/_shared/kpi-row";
import { KpiCard } from "@/components/operations/kpi-card";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUser } from "@/lib/auth/get-user";
import { isoDateWIB, shiftISODate, todayWIB } from "@/lib/dates";
import {
	followupBrief,
	loadFollowupsByNomor,
	loadLeadContacts,
} from "@/lib/leads/contacts";
import { saldoAiView } from "@/lib/leads/saldo-ai";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function LeadsPage({
	searchParams,
}: {
	searchParams: Promise<{
		q?: string;
		period?: string;
		topic?: string;
		segment?: string;
		stage?: string;
		page?: string;
		view?: string;
	}>;
}) {
	const params = await searchParams;
	const q = params.q?.trim() ?? "";
	const period = params.period?.trim() ?? "all";
	const topic = params.topic?.trim() ?? "";
	const segment = params.segment?.trim() ?? "";
	const stage = (params.stage?.trim() ?? "") as LeadStage | "";
	const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
	const view =
		params.view === "menunggu" || params.view === "acara" ? params.view : "";

	const supabase = await createClient();
	const me = await getCurrentUser();
	const canManage =
		me?.profile.role === "owner" || me?.profile.role === "super_admin";
	const now = new Date();
	const today = todayWIB();

	// Cari juga di isi pesan (bukan cuma nama/nomor) → kumpulan wa_jid yang cocok.
	const searchJids = async () => {
		if (!q) return null;
		const safe = q.replace(/[%,()]/g, " ").trim();
		const hits = await fetchAllRows<{ wa_jid: string }>(
			(from, to) =>
				supabase
					.from("whatsapp_bot_leads")
					.select("wa_jid")
					.or(
						`phone.ilike.%${safe}%,name.ilike.%${safe}%,message.ilike.%${safe}%`,
					)
					.order("id")
					.range(from, to),
			"cari leads",
		);
		return new Set(hits.map((h) => h.wa_jid));
	};

	const [all, { data: contactsData }, qJids, followupByNomor, saldoRes] =
		await Promise.all([
			loadLeadContacts(supabase),
			// segment_source untuk SegmentSelect (setelan manual per kontak).
			supabase.from("whatsapp_bot_contacts").select("*").limit(10000),
			searchJids(),
			loadFollowupsByNomor(supabase),
			// Saldo AI Sumopod dari penjaga Hermes (spek §6) — owner saja.
			canManage
				? supabase
						.from("system_config")
						.select("value")
						.eq("key", "saldo_ai")
						.maybeSingle()
				: null,
		]);
	const saldo = saldoRes
		? saldoRes.error
			? {
					value: "—",
					hint: `gagal dibaca: ${saldoRes.error.message}`,
					merah: true,
				}
			: saldoAiView(saldoRes.data?.value ?? null)
		: null;
	const contactByJid: Record<string, ContactRow> = {};
	for (const c of (contactsData ?? []) as ContactRow[])
		contactByJid[c.wa_jid] = c;

	// KPI per kontak, semua waktu (tidak ikut filter).
	const since30 = new Date(now.getTime() - 30 * 86_400_000).toISOString();
	const in30 = shiftISODate(today, 30);
	const thisMonth = today.slice(0, 7);
	const aktif = all.filter((c) => c.lastAt >= since30).length;
	const isMenunggu = (c: (typeof all)[number]) =>
		c.stage === "quotation" || c.stage === "invoice";
	const isMendekat = (c: (typeof all)[number]) =>
		Boolean(c.eventDate) &&
		(c.eventDate as string) >= today &&
		(c.eventDate as string) <= in30 &&
		c.stage !== "booking" &&
		c.stage !== "batal";
	const menunggu = all.filter(isMenunggu).length;
	const mendekat = all.filter(isMendekat).length;
	const bookingBulanIni = all.filter(
		(c) =>
			c.convertedAt &&
			isoDateWIB(new Date(c.convertedAt)).startsWith(thisMonth),
	).length;

	// Filter tetap (cari, periode, topik, segmen) → hitungan pil tahap → pil tahap.
	const startISO = periodStartISO(period, now);
	const scoped = all.filter(
		(c) =>
			(view !== "menunggu" || isMenunggu(c)) &&
			(view !== "acara" || isMendekat(c)) &&
			(!qJids || qJids.has(c.jid)) &&
			(!startISO || c.lastAt >= startISO) &&
			(!topic || c.topics.includes(topic)) &&
			(!segment || c.segment === segment),
	);
	const stageCounts: Record<string, number> = {};
	for (const c of scoped)
		stageCounts[c.stage] = (stageCounts[c.stage] ?? 0) + 1;
	const filtered = stage ? scoped.filter((c) => c.stage === stage) : scoped;
	// Acara mendekat: yang paling dekat dulu.
	if (view === "acara")
		filtered.sort((a, b) =>
			(a.eventDate ?? "").localeCompare(b.eventDate ?? ""),
		);
	const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
	const cur = Math.min(page, pages);
	const pageRows = filtered.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE);

	// Isi pesan hanya untuk kontak di halaman ini.
	const pageJids = pageRows.map((c) => c.jid);
	const messages = pageJids.length
		? await fetchAllRows<LeadRow>(
				(from, to) =>
					supabase
						.from("whatsapp_bot_leads")
						.select("*")
						.in("wa_jid", pageJids)
						.order("received_at", { ascending: false })
						.order("id", { ascending: false })
						.range(from, to),
				"pesan leads",
			)
		: [];
	const msgsByJid = new Map<string, LeadRow[]>();
	for (const m of messages) {
		const list = msgsByJid.get(m.wa_jid) ?? [];
		list.push(m);
		msgsByJid.set(m.wa_jid, list);
	}

	const topics = [...new Set(all.flatMap((c) => c.topics))].sort();
	const b2bCount = Object.values(contactByJid).filter(
		(c) => c.segment !== "private",
	).length;

	const exportParams = new URLSearchParams();
	if (q) exportParams.set("q", q);
	if (period && period !== "all") exportParams.set("period", period);
	if (topic) exportParams.set("topic", topic);
	if (segment) exportParams.set("segment", segment);
	const exportQs = exportParams.toString();
	const exportHref = exportQs
		? `/api/leads/export?${exportQs}`
		: "/api/leads/export";

	const viewHref = (v: string) => {
		const sp = new URLSearchParams();
		for (const [k, val] of Object.entries({ q, topic, segment }))
			if (val) sp.set(k, val);
		if (period !== "all") sp.set("period", period);
		if (v) sp.set("view", v);
		const qs = sp.toString();
		return qs ? `/leads?${qs}` : "/leads";
	};
	const pageHref = (n: number) => {
		const sp = new URLSearchParams();
		for (const [k, v] of Object.entries({ q, topic, segment, stage, view }))
			if (v) sp.set(k, v);
		if (period !== "all") sp.set("period", period);
		if (n > 1) sp.set("page", String(n));
		const s = sp.toString();
		return s ? `/leads?${s}` : "/leads";
	};

	return (
		<Container size="xl" className="space-y-3">
			<SectionHeader
				title="Leads"
				description="Calon klien yang chat bot WhatsApp Tetra, satu baris per kontak. Tahapnya terisi otomatis dari quotation, invoice, dan acara."
				actions={
					<>
						<LeadsTabs active="leads" rekananCount={b2bCount} />
						<a
							href={exportHref}
							className={buttonVariants({
								variant: "outline",
								className: "h-9",
							})}
						>
							<Download className="size-3.5" />
							<span className="hidden sm:inline">Export</span>
						</a>
						{canManage ? (
							<Link
								href="/leads/settings"
								className={buttonVariants({
									variant: "outline",
									className: "h-9",
								})}
							>
								<Settings2 className="size-3.5" />
								<span className="hidden sm:inline">Setting Bot</span>
							</Link>
						) : null}
					</>
				}
			/>

			{/* Kartu angka = pilihan tampilan (dulu ada baris tab terpisah dengan
			    angka yang sama — owner 18 Nov: "bertumpuk-tumpuk"). */}
			<KpiRow className={saldo ? "lg:grid-cols-5" : undefined}>
				{(
					[
						{
							v: "",
							label: "Semua kontak",
							value: all.length,
							hint: `${aktif.toLocaleString("id-ID")} aktif 30 hari`,
							icon: Users,
							accent: "sky",
						},
						{
							v: "menunggu",
							label: "Menunggu keputusan",
							value: menunggu,
							hint: "belum DP",
							icon: FileText,
							accent: "amber",
						},
						{
							v: "acara",
							label: "Acara mendekat",
							value: mendekat,
							hint: "≤ 30 hari, belum booking",
							icon: CalendarClock,
							accent: "rose",
						},
					] as const
				).map((k) => (
					<Link
						key={k.v || "semua"}
						href={viewHref(k.v)}
						aria-current={view === k.v ? "page" : undefined}
						className="block rounded-[16px] outline-none focus-visible:ring-2 focus-visible:ring-[#059669]/40"
					>
						<KpiCard
							label={k.label}
							value={k.value.toLocaleString("id-ID")}
							hint={k.hint}
							icon={k.icon}
							accent={k.accent}
							className={cn(
								"h-full hover:border-border-default",
								view === k.v &&
									"border-[#059669] ring-1 ring-[#059669] hover:border-[#059669]",
							)}
						/>
					</Link>
				))}
				<KpiCard
					label="Booking bulan ini"
					value={bookingBulanIni.toLocaleString("id-ID")}
					hint="dari chat bot"
					icon={CircleCheck}
					accent="emerald"
				/>
				{saldo ? (
					<KpiCard
						label="Saldo AI"
						value={saldo.value}
						hint={saldo.hint}
						icon={Bot}
						accent={saldo.merah ? "rose" : "emerald"}
						badge={"badge" in saldo ? saldo.badge : undefined}
						badgeTone="red"
					/>
				) : null}
			</KpiRow>

			<div className="space-y-3">
				<LeadsFilterBar
					defaultQ={q}
					period={period}
					topic={topic}
					segment={segment}
					stage={stage}
					topics={topics}
					totalScoped={scoped.length}
					stageCounts={stageCounts}
				/>

				{pageRows.length === 0 ? (
					<EmptyState
						icon={MessageCircle}
						title="Belum ada kontak"
						description={
							q || topic || segment || stage || period !== "all"
								? "Coba ubah filter atau hapus pencarian."
								: "Kontak muncul otomatis di sini saat ada yang chat bot WhatsApp Tetra."
						}
					/>
				) : (
					<>
						<LeadsListTable
							contacts={pageRows.map((c) => ({
								...c,
								...followupBrief(c, today),
								followup: c.phone
									? (followupByNomor.get(c.phone) ?? null)
									: null,
								messages: msgsByJid.get(c.jid) ?? [],
							}))}
							contactByJid={contactByJid}
							canManage={canManage}
							today={today}
						/>
						<div className="flex items-center justify-between gap-3 px-1 text-[12.5px] text-muted-foreground">
							<span className="tabular">
								{(cur - 1) * PAGE_SIZE + 1}–
								{(cur - 1) * PAGE_SIZE + pageRows.length} dari{" "}
								{filtered.length.toLocaleString("id-ID")} kontak
								{stage
									? ` · ${STAGE_OPTIONS.find((s) => s.value === stage)?.label}`
									: ""}
							</span>
							{pages > 1 ? (
								<div className="flex gap-2">
									<Link
										href={pageHref(cur - 1)}
										aria-disabled={cur <= 1}
										className={cn(
											buttonVariants({ variant: "secondary", size: "sm" }),
											"rounded-full",
											cur <= 1 && "pointer-events-none opacity-40",
										)}
									>
										Sebelumnya
									</Link>
									<Link
										href={pageHref(cur + 1)}
										aria-disabled={cur >= pages}
										className={cn(
											buttonVariants({ variant: "secondary", size: "sm" }),
											"rounded-full",
											cur >= pages && "pointer-events-none opacity-40",
										)}
									>
										Berikutnya
									</Link>
								</div>
							) : null}
						</div>
					</>
				)}
			</div>
		</Container>
	);
}
