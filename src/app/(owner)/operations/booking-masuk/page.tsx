import {
	AlertCircle,
	CalendarDays,
	Inbox,
	MapPin,
	Package,
} from "lucide-react";
import Link from "next/link";
import { InboxStatusBadge } from "@/components/booking-inbox/inbox-status-badge";
import { Container } from "@/components/layout/container";
import { DpDraftsSection } from "@/components/payment-drafts/dp-drafts-section";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterSearchInput } from "@/components/ui/filter-search-input";
import {
	INBOX_DATA_LABEL,
	type InboxRow,
	missingFields,
} from "@/lib/booking-inbox/core";
import { formatDateID } from "@/lib/format";
import type { DraftRow } from "@/lib/payment-drafts/core";
import {
	type EventByPhone,
	type SenderHit,
	searchSender,
	upcomingEventsForPhones,
} from "@/lib/payment-drafts/server";
import { draftViewsAndBanks } from "@/lib/payment-drafts/view";
import { phoneTail } from "@/lib/portal/vendor-signup-core";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Booking yang sudah DP dari bot WA, menunggu owner membuat event-nya. */
export default async function BookingMasukPage({
	searchParams,
}: {
	searchParams: Promise<{ q?: string }>;
}) {
	const { q = "" } = await searchParams;
	const supabase = await createClient();
	const { data, error } = await supabase
		.from("booking_inbox")
		.select("*")
		.order("created_at", { ascending: false })
		.limit(200);
	const items = (data ?? []) as InboxRow[];

	// Bukti DP dari WA (DR-055): hitungan per booking + yang belum tertaut
	// booking mana pun (kalau tidak ditampilkan di sini, tak terlihat di mana-mana).
	const { data: openDrafts, error: draftErr } = await supabase
		.from("payment_drafts")
		.select("*")
		.in("status", ["menunggu", "disetujui"])
		.order("created_at", { ascending: false });
	const drafts = (openDrafts ?? []) as DraftRow[];
	const dpWaiting = new Map<string, number>();
	for (const d of drafts)
		if (d.status === "menunggu" && d.booking_inbox_id)
			dpWaiting.set(
				d.booking_inbox_id,
				(dpWaiting.get(d.booking_inbox_id) ?? 0) + 1,
			);
	// Yang sudah tertaut langsung ke event ditangani di Uang Masuk.
	const orphans = drafts.filter((d) => !d.booking_inbox_id && !d.event_id);
	// Cari nama pengirim (mutasi bank → klien mana).
	let hits: SenderHit[] = [];
	let searchErr: string | null = null;
	if (q.trim().length >= 3)
		hits = await searchSender(supabase, q).catch((e) => {
			searchErr = e instanceof Error ? e.message : String(e);
			return [];
		});
	const orphanView = orphans.length
		? await draftViewsAndBanks(supabase, orphans)
		: null;
	// Kartu terbuka tanpa event yang nomornya sudah punya acara mendatang
	// (hermes-ff 25 Nov) → ditandai; Gabungkan/Batalkan di halaman detailnya.
	const terbuka = items.filter(
		(it) => (it.status === "baru" || it.status === "diproses") && !it.event_id,
	);
	const eventOf = await upcomingEventsForPhones(
		supabase,
		terbuka.map((it) => it.client_wa),
	).catch((e) => {
		console.error("[booking-masuk] event klien:", e);
		return new Map<string, EventByPhone[]>();
	});
	const eventLain = (it: InboxRow) =>
		terbuka.includes(it) ? (eventOf.get(phoneTail(it.client_wa)) ?? []) : [];

	return (
		<Container size="lg" className="space-y-3 pb-6">
			<div>
				<h1 className="text-[20px] font-semibold tracking-[-0.01em]">
					Booking Masuk
				</h1>
				<p className="text-[13px] text-muted-foreground">
					Klien yang sudah DP lewat bot WA. Cek bukti transfer, lalu buat
					event-nya — form booking sudah terisi.
				</p>
			</div>

			<form method="get" className="max-w-md">
				<FilterSearchInput
					name="q"
					defaultValue={q}
					placeholder="Cari nama pengirim transfer (dari mutasi bank)…"
					className="w-full"
				/>
			</form>
			{q.trim().length >= 3 ? (
				<SenderResults q={q} hits={hits} error={searchErr} />
			) : null}

			{draftErr ? (
				<p className="rounded-xl bg-rose-50 px-4 py-3 text-[13px] text-rose-800">
					Bukti transfer gagal dimuat: {draftErr.message}
				</p>
			) : null}
			{orphanView ? (
				<div className="space-y-1.5">
					<p className="text-[13px] text-muted-foreground">
						Bukti transfer yang belum tertaut ke booking mana pun — cocokkan
						klien lewat nama pengirim, lalu konfirmasi atau batalkan.
					</p>
					<DpDraftsSection
						drafts={orphanView.views}
						banks={orphanView.banks}
						hasEvent={false}
					/>
				</div>
			) : null}

			{error ? (
				<p className="rounded-xl bg-rose-50 px-4 py-3 text-[13px] text-rose-800">
					Gagal memuat: {error.message}
				</p>
			) : items.length === 0 ? (
				<EmptyState
					icon={Inbox}
					title="Belum ada booking masuk"
					description="Booking dari bot WA muncul di sini setelah klien DP."
				/>
			) : (
				<ul className="space-y-2">
					{items.map((it) => (
						<InboxCard
							key={it.id}
							item={it}
							dpWaiting={dpWaiting.get(it.id) ?? 0}
							eventLain={eventLain(it).map((e) => e.project_id)}
						/>
					))}
				</ul>
			)}
		</Container>
	);
}

function InboxCard({
	item,
	dpWaiting,
	eventLain,
}: {
	item: InboxRow;
	dpWaiting: number;
	eventLain: string[];
}) {
	const d = item.data ?? {};
	const missing = missingFields(d);
	const open = item.status === "baru" || item.status === "diproses";
	const title =
		d.nama_acara || item.client_name || item.client_wa || "Tanpa nama";
	return (
		<li>
			<Link
				href={`/operations/booking-masuk/${item.id}`}
				className="block rounded-[16px] border border-border-subtle bg-card p-4 shadow-[var(--shadow-level-1)] transition-colors hover:bg-secondary/40"
			>
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<p className="truncate text-[15px] font-semibold">{title}</p>
						<p className="truncate text-[12.5px] text-muted-foreground">
							{item.client_name ?? "—"}
							{item.dp_dilaporkan_at
								? ` · ${eventLain.length ? "Bukti transfer" : "DP"} dilaporkan ${formatDateID(item.dp_dilaporkan_at)}`
								: ""}
						</p>
					</div>
					<div className="flex shrink-0 flex-col items-end gap-1">
						<InboxStatusBadge status={item.status} />
						{dpWaiting > 0 ? (
							<span className="inline-flex h-6 items-center rounded-full bg-amber-100 px-2.5 text-[12px] font-semibold text-amber-800">
								{dpWaiting > 1
									? `${dpWaiting} bukti transfer menunggu`
									: "Bukti transfer menunggu"}
							</span>
						) : null}
						{eventLain.length ? (
							<span className="inline-flex h-6 items-center rounded-full bg-sky-100 px-2.5 text-[12px] font-semibold text-sky-800">
								Klien sudah punya event {eventLain.join(", ")}
							</span>
						) : null}
						{item.berubah_setelah_event ? (
							<span className="inline-flex h-6 items-center rounded-full bg-orange-100 px-2.5 text-[12px] font-semibold text-orange-800">
								Ada perubahan
							</span>
						) : null}
					</div>
				</div>
				<div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-foreground/80">
					<span className="inline-flex items-center gap-1.5">
						<CalendarDays className="size-3.5 text-muted-foreground" />
						{d.tanggal_iso
							? formatDateID(d.tanggal_iso)
							: (d.tanggal ?? "Tanggal ?")}
						{d.jam ? ` · ${d.jam}` : ""}
					</span>
					<span className="inline-flex items-center gap-1.5">
						<MapPin className="size-3.5 text-muted-foreground" />
						{d.lokasi ?? "Lokasi ?"}
					</span>
					<span className="inline-flex items-center gap-1.5">
						<Package className="size-3.5 text-muted-foreground" />
						{d.paket ?? "Paket ?"}
					</span>
				</div>
				{open && missing.length > 0 ? (
					<p className="mt-2 inline-flex items-start gap-1.5 text-[12.5px] text-amber-800">
						<AlertCircle className="mt-0.5 size-3.5 shrink-0" />
						Belum lengkap: {missing.map((k) => INBOX_DATA_LABEL[k]).join(", ")}
					</p>
				) : open ? (
					<p className="mt-2 text-[12.5px] font-medium text-emerald-700">
						Lengkap
					</p>
				) : null}
			</Link>
		</li>
	);
}

const rpOf = (n: number | null) => (n ? `Rp${n.toLocaleString("id-ID")}` : "—");

function SenderResults({
	q,
	hits,
	error,
}: {
	q: string;
	hits: SenderHit[];
	error: string | null;
}) {
	return (
		<section className="space-y-1.5 rounded-[16px] border border-border-subtle bg-card p-4 shadow-[var(--shadow-level-1)]">
			<h2 className="text-[15px] font-semibold">Nama pengirim “{q.trim()}”</h2>
			{error ? (
				<p className="text-[13px] text-rose-700">Gagal mencari: {error}</p>
			) : hits.length === 0 ? (
				<p className="text-[13px] text-muted-foreground">
					Tidak ada bukti DP atau pembayaran dengan nama pengirim ini.
				</p>
			) : (
				<ul className="divide-y divide-border-subtle">
					{hits.map((h) => (
						<li key={h.key}>
							<Link
								href={h.href}
								className="flex items-baseline justify-between gap-3 py-2 hover:text-link"
							>
								<span className="min-w-0 truncate text-[14px]">
									<span className="font-medium">{h.nama}</span>
									<span className="text-muted-foreground"> → </span>
									<span className="font-semibold">{h.klien}</span>
									<span className="block truncate text-[12.5px] text-muted-foreground">
										{formatDateID(h.tanggal)} · {h.keterangan}
									</span>
								</span>
								<span
									data-nominal
									className="tabular shrink-0 text-[14px] font-semibold"
								>
									{rpOf(h.nominal)}
								</span>
							</Link>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
