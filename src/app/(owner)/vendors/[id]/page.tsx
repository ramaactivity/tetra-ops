import {
	ArrowRight,
	Banknote,
	CalendarClock,
	CalendarRange,
	Check,
	Coins,
	Pencil,
	UserPlus,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatRow } from "@/components/catalog/stat-tile";
import { Container } from "@/components/layout/container";
import { TopbarEntityPortal } from "@/components/layouts/topbar-entity-portal";
import { TabNav } from "@/components/ui/tab-nav";
import { VendorFeatures } from "@/components/vendors/vendor-features";
import {
	type VendorPerson,
	VendorTeam,
} from "@/components/vendors/vendor-team";
import { getCurrentUser } from "@/lib/auth/get-user";
import {
	type CommissionStatus,
	getCommissionsOverview,
} from "@/lib/finance/commissions-data";
import { formatDateID, formatRupiah, formatRupiahCompact } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { PARTNER_LEVELS, vendorSettings } from "@/lib/vendor-settings";

export const dynamic = "force-dynamic";

const TABS = ["ringkasan", "acara", "tim", "pengaturan"] as const;
type Tab = (typeof TABS)[number];
const FILTERS = {
	semua: "Semua",
	tindakan: "Perlu tindakan",
	mendatang: "Mendatang",
	selesai: "Sudah lewat",
} as const;
type Filter = keyof typeof FILTERS;

type Ev = {
	id: string;
	project_id: string;
	event_title: string | null;
	client_name: string | null;
	event_date: string;
	status: string;
	grand_total: number | null;
	remaining_balance: number | null;
	vendor_commission_mode: string | null;
	vendor_commission_amount: number | null;
};

type Tone = "ok" | "warn" | "due" | "muted";
type Money = { label: string; amount: number | null; tone: Tone };

const TONE: Record<Tone, string> = {
	ok: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
	warn: "bg-amber-500/14 text-amber-800 dark:text-amber-400",
	due: "bg-rose-500/12 text-rose-700 dark:text-rose-400",
	muted: "bg-secondary text-muted-foreground",
};

/**
 * Status uang satu acara, dalam satu kalimat: siapa bayar ke siapa.
 * Komisi memakai status yang sama dengan Finance → Komisi.
 */
function moneyOf(
	e: Ev,
	today: string,
	comm: Map<string, CommissionStatus>,
): Money {
	if (e.status === "cancelled")
		return { label: "Acara batal", amount: null, tone: "muted" };
	if (e.vendor_commission_mode === "upfront_cut") {
		const sisa = Math.max(0, Number(e.remaining_balance ?? 0));
		if (sisa === 0)
			return { label: "Vendor sudah lunas", amount: null, tone: "ok" };
		return {
			label: e.event_date < today ? "Vendor telat bayar" : "Vendor belum lunas",
			amount: sisa,
			tone: e.event_date < today ? "due" : "warn",
		};
	}
	const amount = Number(e.vendor_commission_amount ?? 0);
	const st = comm.get(e.id);
	if (!st || amount <= 0)
		return { label: "Tanpa komisi", amount: null, tone: "muted" };
	if (st === "payable")
		return { label: "Komisi siap dibayar", amount, tone: "warn" };
	if (st === "paid") return { label: "Komisi dibayar", amount, tone: "ok" };
	if (st === "advance")
		return { label: "Komisi dibayar di muka", amount, tone: "ok" };
	return { label: "Komisi menunggu acara ditutup", amount, tone: "muted" };
}

function MoneyPill({ m }: { m: Money }) {
	return (
		<span
			className={cn(
				"inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium leading-none",
				TONE[m.tone],
			)}
		>
			<span className="truncate">{m.label}</span>
			{m.amount !== null && (
				<span className="tabular shrink-0" data-nominal>
					· {formatRupiah(m.amount)}
				</span>
			)}
		</span>
	);
}

const card =
	"border-border-default bg-card rounded-2xl border shadow-[var(--shadow-level-2)]";

export default async function VendorHubPage({
	params,
	searchParams,
}: {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ tab?: string; f?: string }>;
}) {
	const me = await getCurrentUser();
	if (!me || (me.profile.role !== "owner" && me.profile.role !== "super_admin"))
		notFound();
	const { id } = await params;
	const sp = await searchParams;
	// Tab lama (fitur/kerjasama) kini digabung di Pengaturan.
	const rawTab =
		sp.tab === "fitur" || sp.tab === "kerjasama" ? "pengaturan" : sp.tab;
	const tab: Tab = (TABS as readonly string[]).includes(rawTab ?? "")
		? (rawTab as Tab)
		: "ringkasan";
	const filter: Filter = sp.f && sp.f in FILTERS ? (sp.f as Filter) : "semua";
	const admin = createAdminClient();
	const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
	const ytd = `${today.slice(0, 4)}-01-01`;

	const [{ data: v }, { data: evs }, { data: vm }, overview] =
		await Promise.all([
			admin
				.from("contacts")
				.select(
					"id, name, phone, is_active, commission_mode, commission_value_type, commission_value_default, payment_terms, vendor_pics, vendor_settings",
				)
				.eq("id", id)
				.eq("type", "vendor")
				.maybeSingle(),
			admin
				.from("events")
				.select(
					"id, project_id, event_title, client_name, event_date, status, grand_total, remaining_balance, vendor_commission_mode, vendor_commission_amount",
				)
				.eq("vendor_contact_id", id)
				.or("deleted_at.is.null,is_demo.eq.true")
				.order("event_date", { ascending: false }),
			admin
				.from("vendor_members")
				.select("person:portal_people(id, name, phone)")
				.eq("contact_id", id),
			getCommissionsOverview(await createClient(), { vendorContactId: id }),
		]);
	if (!v) notFound();
	const set = vendorSettings(v.vendor_settings);
	const events = (evs ?? []) as Ev[];
	const persons = (vm ?? [])
		.map(
			(m) =>
				m.person as unknown as {
					id: string;
					name: string | null;
					phone: string;
				} | null,
		)
		.filter(
			(p): p is { id: string; name: string | null; phone: string } => !!p,
		);
	const { data: sess } = persons.length
		? await admin
				.from("portal_sessions")
				.select("person_id, last_seen_at, created_at")
				.in(
					"person_id",
					persons.map((p) => p.id),
				)
		: { data: [] };
	const lastSeen = new Map<string, string>();
	for (const s of sess ?? []) {
		const t = (s.last_seen_at ?? s.created_at) as string;
		const k = s.person_id as string;
		if (!lastSeen.has(k) || (lastSeen.get(k) ?? "") < t) lastSeen.set(k, t);
	}

	// Komisi: satu sumber dengan Finance → Komisi.
	const comm = new Map(overview.rows.map((r) => [r.eventId, r.status]));
	const t = overview.totals;
	const live = events.filter((e) => e.status !== "cancelled");
	const upcoming = live
		.filter((e) => e.event_date >= today)
		.sort((a, b) => a.event_date.localeCompare(b.event_date));
	const ytdEv = live.filter((e) => e.event_date >= ytd);
	const cut = live.filter((e) => e.vendor_commission_mode === "upfront_cut");
	const owe = cut.reduce(
		(s, e) => s + Math.max(0, Number(e.remaining_balance ?? 0)),
		0,
	);
	const oweLate = cut.filter(
		(e) => e.event_date < today && Number(e.remaining_balance ?? 0) > 0,
	);
	const money = new Map(events.map((e) => [e.id, moneyOf(e, today, comm)]));
	const needsAction = (e: Ev) => {
		const m = money.get(e.id);
		return m?.tone === "due" || m?.label === "Komisi siap dibayar";
	};
	const actions = live.filter(needsAction);
	const shown = events.filter((e) =>
		filter === "tindakan"
			? needsAction(e)
			: filter === "mendatang"
				? e.event_date >= today
				: filter === "selesai"
					? e.event_date < today
					: true,
	);

	const isCut = v.commission_mode === "upfront_cut";
	const value =
		v.commission_value_type === "percent"
			? `${v.commission_value_default ?? 0}%`
			: formatRupiah(Number(v.commission_value_default ?? 0));
	const base = `/vendors/${id}`;
	const to = (tb: Tab, f?: Filter) =>
		tb === "ringkasan"
			? base
			: `${base}?tab=${tb}${f && f !== "semua" ? `&f=${f}` : ""}`;
	const payHref = `/finance/vendors?vendor=${id}`;

	return (
		<Container size="lg" className="space-y-3">
			<TopbarEntityPortal name={v.name as string} />

			{/* Hero: identitas + aksi utama */}
			<section className="overflow-hidden rounded-[20px] bg-[#059669] p-5 text-white shadow-[var(--shadow-level-3)] sm:p-6">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="min-w-0 flex-1">
						<p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">
							Pusat Vendor
						</p>
						<h1 className="mt-1.5 break-words text-[26px] font-bold leading-[1.1] tracking-[-0.02em] sm:text-[32px]">
							{v.name as string}
						</h1>
						<p className="mt-1.5 max-w-xl text-[13.5px] leading-snug text-white/80">
							{isCut
								? "Potongan langsung: klien bayar ke vendor, vendor setor ke Tetra."
								: "Komisi: klien bayar ke Tetra, Tetra kirim komisi ke vendor."}
						</p>
					</div>
					<span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[12.5px] font-semibold">
						<span
							className={cn(
								"size-1.5 rounded-full",
								set.partner_level === "prioritas"
									? "bg-amber-300"
									: set.partner_level === "jeda"
										? "bg-rose-300"
										: "bg-white",
							)}
							aria-hidden
						/>
						{PARTNER_LEVELS[set.partner_level]}
						{!v.is_active && " · Diarsipkan"}
					</span>
				</div>

				<div className="mt-4 flex flex-wrap items-center gap-1.5 text-[12px]">
					<span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 font-medium">
						<span
							className={cn(
								"size-1.5 rounded-full",
								set.portal_enabled ? "bg-lime-300" : "bg-white/50",
							)}
							aria-hidden
						/>
						{set.portal_enabled
							? `Dasbor rekanan aktif · ${persons.length} orang`
							: "Dasbor rekanan dimatikan"}
					</span>
					<span
						className="tabular rounded-full bg-white/15 px-2.5 py-1 font-medium"
						data-nominal
					>
						{isCut ? "Potongan" : "Komisi"} {value}
						{v.commission_value_type === "percent" ? "" : " / acara"}
					</span>
					{(v.phone as string | null) && (
						<span className="rounded-full bg-white/15 px-2.5 py-1 font-medium">
							{v.phone as string}
						</span>
					)}
				</div>

				<div className="mt-4 flex flex-wrap gap-2">
					<Link
						href={to("tim")}
						className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-4 text-[13px] font-semibold text-[#047857] hover:bg-white/90"
					>
						<UserPlus className="size-4 shrink-0" /> Undang tim vendor
					</Link>
					<Link
						href={`/vendors/${id}/edit`}
						className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white/15 px-4 text-[13px] font-medium hover:bg-white/25"
					>
						<Pencil className="size-4 shrink-0" /> Ubah profil & komisi
					</Link>
				</div>
			</section>

			<TabNav
				aria-label="Bagian vendor"
				items={[
					{
						label: "Ringkasan",
						href: to("ringkasan"),
						active: tab === "ringkasan",
					},
					{
						label: "Acara",
						href: to("acara"),
						active: tab === "acara",
						count: events.length,
					},
					{
						label: "Tim",
						href: to("tim"),
						active: tab === "tim",
						count: persons.length,
					},
					{
						label: "Pengaturan",
						href: to("pengaturan"),
						active: tab === "pengaturan",
					},
				]}
			/>

			{tab === "ringkasan" && (
				<>
					<StatRow
						stats={[
							{
								label: "Mendatang",
								value: `${upcoming.length} acara`,
								hint: `${live.length} acara sejak awal`,
								icon: CalendarClock,
								accent: "info",
							},
							{
								label: `Nilai ${ytd.slice(0, 4)}`,
								value: formatRupiahCompact(
									ytdEv.reduce((s, e) => s + Number(e.grand_total ?? 0), 0),
								),
								hint: `${ytdEv.length} acara tahun ini`,
								icon: CalendarRange,
								accent: "default",
							},
							{
								label: "Belum disetor",
								value: formatRupiahCompact(owe),
								hint: oweLate.length
									? `${oweLate.length} acara telat setor`
									: "Tidak ada yang telat",
								icon: Banknote,
								accent: "emerald",
							},
							{
								label: "Komisi",
								value: formatRupiahCompact(t.payableAmount),
								hint: `Siap dibayar · ${t.payableCount} acara`,
								icon: Coins,
								accent: "amber",
							},
						]}
					/>

					{/* Arus uang: dua arah, dijelaskan dengan kalimat. */}
					<section className={cn(card, "p-5")}>
						<h3 className="type-heading">Arus uang dengan vendor ini</h3>
						<p className="type-secondary mt-0.5">
							Tiap acara mengikuti mode yang tercatat di acaranya, jadi satu
							vendor bisa punya keduanya.
						</p>
						<div className="mt-4 grid gap-3 md:grid-cols-2">
							<div className="bg-secondary/60 rounded-xl p-4">
								<p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
									Vendor → Tetra · potongan langsung
								</p>
								<dl className="mt-3 space-y-2 text-[14px]">
									<Line
										k="Sisa yang belum disetor"
										v={formatRupiah(owe)}
										strong
									/>
									<Line
										k="Acara sudah lewat, belum lunas"
										v={`${oweLate.length} acara`}
									/>
									<Line k="Acara potongan langsung" v={`${cut.length} acara`} />
								</dl>
								<Link
									href={to("acara", "tindakan")}
									className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium hover:underline"
								>
									Lihat yang perlu ditagih{" "}
									<ArrowRight className="size-3.5 shrink-0" />
								</Link>
							</div>
							<div className="bg-secondary/60 rounded-xl p-4">
								<p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
									Tetra → Vendor · komisi
								</p>
								<dl className="mt-3 space-y-2 text-[14px]">
									<Line
										k="Siap dibayar (acara ditutup)"
										v={formatRupiah(t.payableAmount)}
										strong
									/>
									<Line
										k="Menunggu acara ditutup"
										v={formatRupiah(t.notSettledAmount)}
									/>
									<Line
										k="Sudah dibayar"
										v={formatRupiah(t.paidAmount + t.advanceAmount)}
									/>
								</dl>
								<Link
									href={payHref}
									className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium hover:underline"
								>
									Bayar di Finance → Komisi{" "}
									<ArrowRight className="size-3.5 shrink-0" />
								</Link>
							</div>
						</div>
					</section>

					<div className="grid items-start gap-3 lg:grid-cols-2">
						<EventList
							title="Perlu tindakan"
							empty="Aman. Tidak ada tagihan telat atau komisi yang menunggu dibayar."
							more={actions.length > 5 ? to("acara", "tindakan") : null}
							rows={actions.slice(0, 5)}
							money={money}
						/>
						<EventList
							title="Acara terdekat"
							empty="Belum ada acara mendatang."
							more={upcoming.length > 5 ? to("acara", "mendatang") : null}
							rows={upcoming.slice(0, 5)}
							money={money}
						/>
					</div>
				</>
			)}

			{tab === "acara" && (
				<>
					<div className="hide-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
						{(Object.keys(FILTERS) as Filter[]).map((f) => {
							const n =
								f === "tindakan"
									? actions.length
									: f === "mendatang"
										? events.filter((e) => e.event_date >= today).length
										: f === "selesai"
											? events.filter((e) => e.event_date < today).length
											: events.length;
							return (
								<Link
									key={f}
									href={to("acara", f)}
									aria-current={filter === f ? "page" : undefined}
									className={cn(
										"inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium",
										filter === f
											? "border-transparent bg-foreground text-background"
											: "border-border-default bg-card text-muted-foreground hover:text-foreground",
									)}
								>
									{FILTERS[f]}
									<span className="tabular text-[11px] opacity-70">{n}</span>
								</Link>
							);
						})}
					</div>
					<section className={cn(card, "overflow-hidden")}>
						{shown.length === 0 ? (
							<p className="type-secondary p-5">
								{filter === "tindakan"
									? "Tidak ada yang perlu ditindaklanjuti."
									: "Belum ada acara di sini."}
							</p>
						) : (
							<ul className="divide-border-default divide-y">
								{shown.map((e) => (
									<EventRow
										key={e.id}
										e={e}
										m={money.get(e.id)}
										past={e.event_date < today}
									/>
								))}
							</ul>
						)}
					</section>
					<p className="type-caption text-muted-foreground px-1">
						Komisi bisa dibayar setelah acaranya ditutup (settle) di halaman
						acara. Bayar komisi di{" "}
						<Link href={payHref} className="font-medium underline">
							Finance → Komisi
						</Link>
						.
					</p>
				</>
			)}

			{tab === "tim" && (
				<VendorTeam
					contactId={id}
					portalEnabled={set.portal_enabled}
					people={((v.vendor_pics ?? []) as VendorPerson[]).map((p) => ({
						name: p.name,
						contact: p.contact ?? null,
						role: p.role ?? null,
					}))}
					access={persons.map((p) => ({
						personId: p.id,
						name: p.name,
						phone: p.phone,
						lastSeen: lastSeen.get(p.id) ?? null,
					}))}
				/>
			)}

			{tab === "pengaturan" && (
				<>
					<section className={cn(card, "space-y-4 p-5")}>
						<div className="flex flex-wrap items-start justify-between gap-3">
							<div className="min-w-0">
								<h3 className="type-heading">Cara kerja sama</h3>
								<p className="type-secondary mt-0.5">
									Bawaan untuk booking baru vendor ini. Acara yang sudah ada
									menyimpan angkanya sendiri.
								</p>
							</div>
							<Link
								href={`/vendors/${id}/edit`}
								className="border-border-default hover:bg-secondary inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium"
							>
								<Pencil className="size-4 shrink-0" /> Ubah
							</Link>
						</div>
						<div className="grid gap-3 md:grid-cols-2">
							<ModeCard
								active={!isCut}
								title="Komisi"
								flow="Klien → Tetra, lalu Tetra → vendor"
								body="Klien membayar tagihan penuh ke Tetra lewat dashboard-nya. Setelah acara ditutup, Tetra mengirim komisi ke vendor dari Finance → Komisi."
							/>
							<ModeCard
								active={isCut}
								title="Potongan langsung"
								flow="Klien → vendor, lalu vendor → Tetra"
								body="Klien membayar ke vendor. Vendor menyetor tagihan bersih (sudah dipotong) ke Tetra lewat dasbor rekanannya; harga Tetra bisa disembunyikan dari klien."
							/>
						</div>
						<dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 border-t border-border-default pt-4 text-[14px] sm:grid-cols-[180px_1fr]">
							<dt className="text-muted-foreground">Nilai bawaan</dt>
							<dd className="tabular font-medium" data-nominal>
								{value}
								{v.commission_value_type === "percent"
									? " dari total acara"
									: " per acara"}
							</dd>
							<dt className="text-muted-foreground">Termin bayar</dt>
							<dd className="font-medium">
								{(v.payment_terms as string | null) || "—"}
							</dd>
						</dl>
					</section>
					<VendorFeatures contactId={id} settings={set} />
				</>
			)}
		</Container>
	);
}

function Line({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
	return (
		<div className="flex items-baseline justify-between gap-3">
			<dt className="text-muted-foreground min-w-0">{k}</dt>
			<dd
				className={cn(
					"tabular shrink-0",
					strong ? "text-[16px] font-semibold" : "font-medium",
				)}
				data-nominal
			>
				{v}
			</dd>
		</div>
	);
}

function ModeCard({
	active,
	title,
	flow,
	body,
}: {
	active: boolean;
	title: string;
	flow: string;
	body: string;
}) {
	return (
		<div
			className={cn(
				"rounded-xl border p-4",
				active
					? "border-[#059669] bg-emerald-500/5"
					: "border-border-default opacity-70",
			)}
		>
			<div className="flex items-center justify-between gap-2">
				<p className="font-semibold">{title}</p>
				{active && (
					<span className="inline-flex items-center gap-1 rounded-full bg-[#059669] px-2 py-0.5 text-[11px] font-semibold text-white">
						<Check className="size-3 shrink-0" /> Dipakai
					</span>
				)}
			</div>
			<p className="mt-1 text-[12.5px] font-medium text-foreground/80">
				{flow}
			</p>
			<p className="type-caption text-muted-foreground mt-1.5">{body}</p>
		</div>
	);
}

function EventRow({
	e,
	m,
	past,
}: {
	e: Ev;
	m: Money | undefined;
	past: boolean;
}) {
	return (
		<li className="grid gap-x-4 gap-y-2 px-5 py-3.5 sm:grid-cols-[104px_minmax(0,1fr)_auto] sm:items-center">
			<div className="flex items-baseline gap-2 sm:block">
				<p className="text-[13px] font-medium">{formatDateID(e.event_date)}</p>
				<p className="text-muted-foreground text-[11.5px]">
					{past ? "Sudah lewat" : "Mendatang"}
				</p>
			</div>
			<div className="min-w-0">
				<Link
					href={`/operations/${e.project_id}`}
					className="block truncate text-[14px] font-medium hover:underline"
				>
					{e.event_title || e.client_name}
				</Link>
				<p className="text-muted-foreground truncate text-[12px]">
					{e.vendor_commission_mode === "upfront_cut"
						? "Potongan langsung · vendor setor ke Tetra"
						: "Komisi · Tetra bayar ke vendor"}
				</p>
			</div>
			<div className="min-w-0 sm:text-right">{m && <MoneyPill m={m} />}</div>
		</li>
	);
}

function EventList({
	title,
	empty,
	more,
	rows,
	money,
}: {
	title: string;
	empty: string;
	more: string | null;
	rows: Ev[];
	money: Map<string, Money>;
}) {
	return (
		<section className={cn(card, "overflow-hidden")}>
			<div className="flex items-center justify-between gap-3 px-5 pt-5 pb-2">
				<h3 className="type-heading">{title}</h3>
				{more && (
					<Link
						href={more}
						className="inline-flex shrink-0 items-center gap-1 text-[13px] font-medium hover:underline"
					>
						Semua <ArrowRight className="size-3.5 shrink-0" />
					</Link>
				)}
			</div>
			{rows.length === 0 ? (
				<p className="type-secondary px-5 pb-5">{empty}</p>
			) : (
				<ul className="divide-border-default divide-y">
					{rows.map((e) => {
						const m = money.get(e.id);
						return (
							<li key={e.id} className="space-y-1.5 px-5 py-3">
								<div className="flex items-baseline justify-between gap-3">
									<Link
										href={`/operations/${e.project_id}`}
										className="min-w-0 truncate text-[14px] font-medium hover:underline"
									>
										{e.event_title || e.client_name}
									</Link>
									<span className="text-muted-foreground shrink-0 text-[12.5px]">
										{formatDateID(e.event_date)}
									</span>
								</div>
								{m && <MoneyPill m={m} />}
							</li>
						);
					})}
				</ul>
			)}
		</section>
	);
}
