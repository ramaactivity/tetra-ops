import {
	Banknote,
	CalendarClock,
	CalendarRange,
	Coins,
	Handshake,
	Pencil,
	Settings2,
	Users,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatRow } from "@/components/catalog/stat-tile";
import { Container } from "@/components/layout/container";
import { TopbarEntityPortal } from "@/components/layouts/topbar-entity-portal";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { TabNav } from "@/components/ui/tab-nav";
import { VendorFeatures } from "@/components/vendors/vendor-features";
import {
	type VendorPerson,
	VendorTeam,
} from "@/components/vendors/vendor-team";
import { getCurrentUser } from "@/lib/auth/get-user";
import { formatDateID, formatRupiah } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { PARTNER_LEVELS, vendorSettings } from "@/lib/vendor-settings";

export const dynamic = "force-dynamic";

const TABS = ["ringkasan", "acara", "tim", "fitur", "kerjasama"] as const;
type Tab = (typeof TABS)[number];

export default async function VendorHubPage({
	params,
	searchParams,
}: {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ tab?: string }>;
}) {
	const me = await getCurrentUser();
	if (!me || (me.profile.role !== "owner" && me.profile.role !== "super_admin"))
		notFound();
	const { id } = await params;
	const sp = await searchParams;
	const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "")
		? (sp.tab as Tab)
		: "ringkasan";
	const admin = createAdminClient();
	const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
	const ytd = `${today.slice(0, 4)}-01-01`;

	const [{ data: v }, { data: evs }, { data: vm }] = await Promise.all([
		admin
			.from("contacts")
			.select(
				"id, name, phone, email, notes, is_active, commission_mode, commission_value_type, commission_value_default, payment_terms, company_address, vendor_pics, vendor_settings",
			)
			.eq("id", id)
			.eq("type", "vendor")
			.maybeSingle(),
		admin
			.from("events")
			.select(
				"id, project_id, event_title, client_name, event_date, status, grand_total, remaining_balance, payment_status, vendor_commission_mode, vendor_commission_amount",
			)
			.eq("vendor_contact_id", id)
			.is("deleted_at", null)
			.order("event_date", { ascending: false }),
		admin
			.from("vendor_members")
			.select("person:portal_people(id, name, phone)")
			.eq("contact_id", id),
	]);
	if (!v) notFound();
	const set = vendorSettings(v.vendor_settings);
	const events = (evs ?? []) as Array<{
		id: string;
		project_id: string;
		event_title: string | null;
		client_name: string | null;
		event_date: string;
		status: string;
		grand_total: number | null;
		remaining_balance: number | null;
		payment_status: string | null;
		vendor_commission_mode: string | null;
		vendor_commission_amount: number | null;
	}>;
	const evIds = events.map((e) => e.id);
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
	const [{ data: pays }, { data: sess }] = await Promise.all([
		evIds.length
			? admin
					.from("commission_payouts")
					.select("event_id, amount, payment_date")
					.in("event_id", evIds)
					.eq("kind", "vendor")
					.eq("is_reversed", false)
			: Promise.resolve({ data: [] }),
		persons.length
			? admin
					.from("portal_sessions")
					.select("person_id, last_seen_at, created_at")
					.in(
						"person_id",
						persons.map((p) => p.id),
					)
			: Promise.resolve({ data: [] }),
	]);
	const paidAt = new Map(
		(pays ?? []).map((p) => [p.event_id as string, p.payment_date as string]),
	);
	const lastSeen = new Map<string, string>();
	for (const s of sess ?? []) {
		const t = (s.last_seen_at ?? s.created_at) as string;
		const k = s.person_id as string;
		if (!lastSeen.has(k) || (lastSeen.get(k) ?? "") < t) lastSeen.set(k, t);
	}

	const live = events.filter((e) => e.status !== "cancelled");
	const upcoming = live.filter((e) => e.event_date >= today);
	const ytdEv = live.filter((e) => e.event_date >= ytd);
	const commissionEvents = live.filter(
		(e) => e.vendor_commission_mode === "commission",
	);
	const commOpen = commissionEvents
		.filter((e) => !paidAt.has(e.id))
		.reduce((t, e) => t + Number(e.vendor_commission_amount ?? 0), 0);
	const owe = live
		.filter((e) => e.vendor_commission_mode === "upfront_cut")
		.reduce((t, e) => t + Math.max(0, Number(e.remaining_balance ?? 0)), 0);
	const mode =
		v.commission_mode === "upfront_cut"
			? "Potongan langsung — klien bayar ke vendor, vendor bayar ke Tetra"
			: "Komisi — klien bayar ke Tetra, Tetra kirim komisi ke vendor";
	const value =
		v.commission_value_type === "percent"
			? `${v.commission_value_default ?? 0}%`
			: formatRupiah(Number(v.commission_value_default ?? 0));
	const base = `/vendors/${id}`;
	const to = (t: Tab) => (t === "ringkasan" ? base : `${base}?tab=${t}`);

	return (
		<Container size="lg" className="space-y-3">
			<TopbarEntityPortal name={v.name as string} />
			<section className="overflow-hidden rounded-[20px] bg-[#059669] p-5 text-white shadow-[var(--shadow-level-3)]">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">
							Vendor ·{" "}
							{v.commission_mode === "upfront_cut"
								? "Potongan langsung"
								: "Komisi"}
						</p>
						<h1 className="mt-2 break-words text-[28px] font-bold leading-[1.08] tracking-[-0.02em] sm:text-[34px]">
							{v.name as string}
						</h1>
						<p className="mt-2 text-[13px] text-white/75">{mode}</p>
					</div>
					<div className="flex shrink-0 flex-col items-end gap-1.5">
						<span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[12.5px] font-semibold backdrop-blur-sm">
							<span
								className={`size-1.5 rounded-full ${set.partner_level === "prioritas" ? "bg-amber-300" : set.partner_level === "jeda" ? "bg-rose-300" : "bg-white"}`}
								aria-hidden
							/>
							{PARTNER_LEVELS[set.partner_level]}
						</span>
						{!v.is_active && (
							<span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium">
								Diarsipkan
							</span>
						)}
					</div>
				</div>
				<div className="mt-4 flex flex-wrap items-center gap-1.5 text-[12px]">
					<span className="rounded-full bg-white/15 px-2.5 py-1 font-medium">
						{set.portal_enabled
							? `Dasbor rekanan aktif · ${persons.length} orang`
							: "Dasbor rekanan dimatikan"}
					</span>
					{(v.phone as string | null) && (
						<span className="rounded-full bg-white/15 px-2.5 py-1 font-mono">
							{v.phone as string}
						</span>
					)}
				</div>
			</section>

			<div className="hide-scrollbar -mx-1 flex items-center gap-2 overflow-x-auto px-1 [&>*]:shrink-0">
				<Link
					href={`/vendors/${id}/edit`}
					className={buttonVariants({ variant: "outline", size: "sm" })}
				>
					<Pencil className="size-4" /> Ubah profil & komisi
				</Link>
				<Link
					href={to("tim")}
					className={buttonVariants({ variant: "outline", size: "sm" })}
				>
					<Users className="size-4" /> Undang tim vendor
				</Link>
				<Link
					href="/finance/vendors"
					className={buttonVariants({ variant: "outline", size: "sm" })}
				>
					<Coins className="size-4" /> Bayar komisi
				</Link>
			</div>

			<TabNav
				aria-label="Bagian vendor"
				items={[
					{
						label: "Ringkasan",
						href: to("ringkasan"),
						active: tab === "ringkasan",
						icon: <Handshake className="size-4" />,
					},
					{
						label: "Acara",
						href: to("acara"),
						active: tab === "acara",
						icon: <CalendarRange className="size-4" />,
						count: events.length,
					},
					{
						label: "Tim & akses",
						href: to("tim"),
						active: tab === "tim",
						icon: <Users className="size-4" />,
						count: persons.length,
					},
					{
						label: "Fitur rekanan",
						href: to("fitur"),
						active: tab === "fitur",
						icon: <Settings2 className="size-4" />,
					},
					{
						label: "Kerjasama & komisi",
						href: to("kerjasama"),
						active: tab === "kerjasama",
						icon: <Coins className="size-4" />,
					},
				]}
			/>

			{tab === "ringkasan" && (
				<>
					<StatRow
						stats={[
							{
								label: "Acara mendatang",
								value: String(upcoming.length),
								hint: `${live.length} total`,
								icon: CalendarClock,
								accent: "info",
							},
							{
								label: "Pendapatan tahun ini",
								value: formatRupiah(
									ytdEv.reduce((t, e) => t + Number(e.grand_total ?? 0), 0),
								),
								hint: `${ytdEv.length} acara`,
								icon: CalendarRange,
								accent: "default",
							},
							{
								label: "Komisi belum dibayar",
								value: formatRupiah(commOpen),
								hint: `${commissionEvents.length} acara mode komisi`,
								icon: Coins,
								accent: "amber",
							},
							{
								label: "Tagihan potongan langsung",
								value: formatRupiah(owe),
								hint: "Sisa yang belum dibayar vendor",
								icon: Banknote,
								accent: "emerald",
							},
						]}
					/>
					<div className="grid gap-3 lg:grid-cols-2">
						<section className="border-border-default bg-card space-y-3 rounded-2xl border p-5 shadow-[var(--shadow-level-2)]">
							<div className="flex items-center justify-between">
								<h3 className="type-heading">Acara terdekat</h3>
								<Link href={to("acara")} className="text-[13px] font-medium">
									Semua acara →
								</Link>
							</div>
							{upcoming.length === 0 ? (
								<p className="type-secondary">Belum ada acara mendatang.</p>
							) : (
								<ul className="divide-border-default divide-y">
									{[...upcoming]
										.sort((a, b) => a.event_date.localeCompare(b.event_date))
										.slice(0, 6)
										.map((e) => (
											<li
												key={e.id}
												className="flex items-center justify-between gap-3 py-2 text-sm"
											>
												<Link
													href={`/operations/${e.project_id}`}
													className="min-w-0 truncate font-medium"
												>
													{e.event_title || e.client_name}
												</Link>
												<span className="text-muted-foreground shrink-0 text-[13px]">
													{formatDateID(e.event_date)}
												</span>
											</li>
										))}
								</ul>
							)}
						</section>
						<section className="border-border-default bg-card space-y-3 rounded-2xl border p-5 shadow-[var(--shadow-level-2)]">
							<h3 className="type-heading">Rekanan sekilas</h3>
							<dl className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-2 text-sm">
								<dt className="text-muted-foreground">Kerja sama</dt>
								<dd>
									{v.commission_mode === "upfront_cut"
										? "Potongan langsung"
										: "Komisi"}{" "}
									·{" "}
									<span className="tabular" data-nominal>
										{value}
									</span>
								</dd>
								<dt className="text-muted-foreground">Dasbor rekanan</dt>
								<dd>
									{set.portal_enabled
										? `Aktif · ${persons.length} orang punya akses`
										: "Dimatikan"}
								</dd>
								<dt className="text-muted-foreground">Komisi di dasbor</dt>
								<dd>{set.show_commission ? "Ditampilkan" : "Disembunyikan"}</dd>
								<dt className="text-muted-foreground">Undang klien</dt>
								<dd>
									{set.can_invite_clients ? "Vendor boleh" : "Hanya admin"}
								</dd>
								<dt className="text-muted-foreground">Termin bayar</dt>
								<dd>{(v.payment_terms as string | null) || "—"}</dd>
								<dt className="text-muted-foreground">Kontak</dt>
								<dd className="font-mono">
									{(v.phone as string | null) || "—"}
								</dd>
							</dl>
						</section>
					</div>
				</>
			)}

			{tab === "acara" && (
				<section className="border-border-default bg-card overflow-hidden rounded-2xl border shadow-[var(--shadow-level-2)]">
					{events.length === 0 ? (
						<p className="type-secondary p-5">
							Belum ada acara untuk vendor ini.
						</p>
					) : (
						<ul className="divide-border-default divide-y">
							{events.map((e) => {
								const comm = e.vendor_commission_mode === "commission";
								return (
									<li
										key={e.id}
										className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-sm"
									>
										<span className="text-muted-foreground w-28 shrink-0 text-[13px]">
											{formatDateID(e.event_date)}
										</span>
										<Link
											href={`/operations/${e.project_id}`}
											className="min-w-0 flex-1 truncate font-medium"
										>
											{e.event_title || e.client_name}
										</Link>
										{e.status === "cancelled" && (
											<Badge variant="outline" className="text-[11px]">
												Batal
											</Badge>
										)}
										<span className="text-muted-foreground text-[12px]">
											{comm ? "Komisi" : "Potongan langsung"}
										</span>
										{comm ? (
											<span className="tabular text-[13px]" data-nominal>
												{formatRupiah(Number(e.vendor_commission_amount ?? 0))}
												<span
													className={
														paidAt.has(e.id)
															? "text-emerald-600"
															: "text-amber-700"
													}
												>
													{paidAt.has(e.id) ? " · dibayar" : " · belum"}
												</span>
											</span>
										) : (
											<span className="tabular text-[13px]" data-nominal>
												{Number(e.remaining_balance ?? 0) > 0
													? `Sisa ${formatRupiah(Number(e.remaining_balance))}`
													: "Lunas"}
											</span>
										)}
									</li>
								);
							})}
						</ul>
					)}
				</section>
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

			{tab === "fitur" && <VendorFeatures contactId={id} settings={set} />}

			{tab === "kerjasama" && (
				<section className="border-border-default bg-card space-y-4 rounded-2xl border p-5 shadow-[var(--shadow-level-2)]">
					<div className="grid gap-3 md:grid-cols-2">
						<div
							className={`rounded-xl border p-4 ${v.commission_mode !== "upfront_cut" ? "border-foreground" : "border-border-default opacity-60"}`}
						>
							<p className="font-medium">Komisi</p>
							<p className="type-caption text-muted-foreground">
								Klien bayar penuh ke Tetra (klien melihat & membayar tagihan di
								dashboard-nya). Tetra kirim komisi ke vendor setelah acara —
								tercatat di Finance → Komisi.
							</p>
						</div>
						<div
							className={`rounded-xl border p-4 ${v.commission_mode === "upfront_cut" ? "border-foreground" : "border-border-default opacity-60"}`}
						>
							<p className="font-medium">Potongan langsung</p>
							<p className="type-caption text-muted-foreground">
								Klien bayar ke vendor, vendor bayar ke Tetra sejumlah tagihan
								bersih. Vendor yang membayar di dasbornya; harga Tetra bisa
								disembunyikan dari klien.
							</p>
						</div>
					</div>
					<dl className="grid grid-cols-[160px_1fr] gap-x-3 gap-y-2 text-sm">
						<dt className="text-muted-foreground">Mode aktif</dt>
						<dd>
							{v.commission_mode === "upfront_cut"
								? "Potongan langsung"
								: "Komisi"}
						</dd>
						<dt className="text-muted-foreground">Nilai bawaan</dt>
						<dd className="tabular" data-nominal>
							{value}
							{v.commission_value_type === "percent"
								? " dari grand total"
								: " per acara"}
						</dd>
						<dt className="text-muted-foreground">Termin bayar</dt>
						<dd>{(v.payment_terms as string | null) || "—"}</dd>
					</dl>
					<p className="type-caption text-muted-foreground">
						Mode & nilai ini jadi bawaan booking baru vendor. Acara yang sudah
						ada menyimpan angkanya sendiri. Per booking portal, vendor
						menetapkan siapa yang membayar saat setup (terkunci setelah resmi).
					</p>
					<div className="flex flex-wrap gap-2">
						<Link
							href={`/vendors/${id}/edit`}
							className={buttonVariants({ size: "sm" })}
						>
							<Pencil className="size-4" /> Ubah kerjasama & komisi
						</Link>
						<Link
							href="/finance/vendors"
							className={buttonVariants({ variant: "outline", size: "sm" })}
						>
							<Coins className="size-4" /> Bayar komisi
						</Link>
					</div>
				</section>
			)}
		</Container>
	);
}
