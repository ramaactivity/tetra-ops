import { ArrowUpRight, MessageCircle } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type {
	BackdropOption,
	BookingFormDefaults,
	PackageOption,
} from "@/components/booking/booking-form";
import {
	InboxAckButton,
	InboxOpenActions,
} from "@/components/booking-inbox/inbox-actions";
import { InboxStatusBadge } from "@/components/booking-inbox/inbox-status-badge";
import { Container } from "@/components/layout/container";
import { TopbarEntityPortal } from "@/components/layouts/topbar-entity-portal";
import {
	INBOX_DATA_KEYS,
	INBOX_DATA_LABEL,
	INBOX_REQUIRED,
	type InboxRow,
} from "@/lib/booking-inbox/core";
import { inboxToBookingDefaults } from "@/lib/booking-inbox/defaults";
import { formatDateID, formatPhoneLocal } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { whatsappUrl } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

const CARD =
	"rounded-[16px] border border-border-subtle bg-card p-4 shadow-[var(--shadow-level-1)]";

type EventSnap = {
	project_id: string;
	event_date: string;
	start_time: string | null;
	end_time: string | null;
	venue_name: string | null;
	package_id: string | null;
	frame_size: string | null;
	backdrop_id: string | null;
	pic_name: string | null;
	pic_wa: string | null;
};

export default async function BookingMasukDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const supabase = await createClient();
	const { data } = await supabase
		.from("booking_inbox")
		.select("*")
		.eq("id", id)
		.maybeSingle();
	if (!data) notFound();
	const item = data as InboxRow;
	const d = item.data ?? {};
	const open = item.status === "baru" || item.status === "diproses";

	const { data: ev } = item.event_id
		? await supabase
				.from("events")
				.select(
					"project_id, event_date, start_time, end_time, venue_name, package_id, frame_size, backdrop_id, pic_name, pic_wa",
				)
				.eq("id", item.event_id)
				.maybeSingle()
		: { data: null };
	const event = ev as EventSnap | null;

	const diffs =
		event && item.berubah_setelah_event ? await diffWithEvent(item, event) : [];

	const title = d.nama_acara || item.client_name || "Booking masuk";
	const waLink = item.client_wa
		? whatsappUrl(item.client_wa, `Halo ${item.client_name ?? ""}`.trim())
		: null;

	return (
		<Container size="lg" className="space-y-3 pb-6">
			<TopbarEntityPortal name={title} />

			<section className={cn(CARD, "space-y-3")}>
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
							Booking masuk · bot WA
						</p>
						<h1 className="mt-1 break-words text-[22px] font-bold leading-tight tracking-[-0.02em]">
							{title}
						</h1>
						<p className="mt-1 text-[13px] text-muted-foreground">
							{item.client_name ?? "—"}
							{item.client_wa ? ` · ${formatPhoneLocal(item.client_wa)}` : ""}
							{item.dp_dilaporkan_at
								? ` · DP dilaporkan ${formatDateID(item.dp_dilaporkan_at)}`
								: ""}
							{item.sumber === "admin" ? " (dikonfirmasi admin)" : ""}
						</p>
					</div>
					<InboxStatusBadge status={item.status} />
				</div>

				<div className="flex flex-wrap items-center gap-2">
					{open ? <InboxOpenActions id={item.id} /> : null}
					{event ? (
						<Link
							href={`/operations/${event.project_id}`}
							className="inline-flex h-9 items-center gap-1.5 rounded-full bg-secondary px-3.5 text-[13px] font-medium hover:bg-secondary/70"
						>
							Buka event {event.project_id}
							<ArrowUpRight className="size-3.5" />
						</Link>
					) : null}
					{waLink ? (
						<a
							href={waLink}
							target="_blank"
							rel="noreferrer"
							className="inline-flex h-9 items-center gap-1.5 rounded-full bg-secondary px-3.5 text-[13px] font-medium hover:bg-secondary/70"
						>
							<MessageCircle className="size-3.5" /> Chat klien
						</a>
					) : null}
				</div>
			</section>

			{item.berubah_setelah_event && event ? (
				<section
					className={cn(CARD, "space-y-3 border-orange-200 bg-orange-50/60")}
				>
					<div className="flex flex-wrap items-center justify-between gap-2">
						<div>
							<h2 className="text-[15px] font-semibold">
								Klien mengubah isian setelah event dibuat
							</h2>
							<p className="text-[12.5px] text-muted-foreground">
								Event tidak diubah otomatis. Sesuaikan di event bila perlu.
							</p>
						</div>
						<InboxAckButton id={item.id} />
					</div>
					{diffs.length > 0 ? (
						<div className="overflow-x-auto">
							<table className="w-full text-[13px]">
								<thead>
									<tr className="text-left text-[12px] text-muted-foreground">
										<th className="py-1 pr-3 font-medium">Kolom</th>
										<th className="py-1 pr-3 font-medium">Di event</th>
										<th className="py-1 font-medium">Isian terbaru</th>
									</tr>
								</thead>
								<tbody>
									{diffs.map((r) => (
										<tr key={r.label} className="border-t border-orange-200/70">
											<td className="py-1.5 pr-3 font-medium">{r.label}</td>
											<td className="py-1.5 pr-3 text-muted-foreground">
												{r.event || "—"}
											</td>
											<td className="py-1.5 font-medium">{r.inbox}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					) : (
						<p className="text-[13px] text-muted-foreground">
							Perubahan ada di kolom yang tidak tersimpan di event (mis.
							catatan, desain frame) — lihat isian di bawah.
						</p>
					)}
				</section>
			) : null}

			<section className={cn(CARD, "space-y-2")}>
				<h2 className="text-[15px] font-semibold">Isian klien</h2>
				<dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
					{INBOX_DATA_KEYS.filter((k) => k !== "tanggal_iso").map((k) => {
						const v = d[k];
						const required = INBOX_REQUIRED.includes(k) && k !== "nama_acara";
						return (
							<div key={k} className="min-w-0">
								<dt className="text-[12px] text-muted-foreground">
									{INBOX_DATA_LABEL[k]}
								</dt>
								<dd
									className={cn(
										"break-words text-[14px]",
										!v && "text-muted-foreground/60",
										!v && required && open && "text-amber-700",
									)}
								>
									{k === "maps" && v && /^https?:/.test(v) ? (
										<a
											href={v}
											target="_blank"
											rel="noreferrer"
											className="text-link hover:underline"
										>
											Buka peta
										</a>
									) : (
										(v ?? (required && open ? "Belum diisi" : "—"))
									)}
								</dd>
							</div>
						);
					})}
				</dl>
			</section>

			<section className={cn(CARD, "space-y-2")}>
				<h2 className="text-[15px] font-semibold">Bukti transfer</h2>
				{item.bukti_url ? (
					<a href={item.bukti_url} target="_blank" rel="noreferrer">
						{/* biome-ignore lint/performance/noImgElement: URL eksternal dari bot, ukuran tak diketahui */}
						<img
							src={item.bukti_url}
							alt="Bukti transfer DP"
							className="max-h-[420px] rounded-xl border border-border-subtle"
						/>
					</a>
				) : (
					<p className="text-[13px] text-muted-foreground">
						Foto bukti dikirim bot ke WA owner. Cek mutasi rekening sebelum
						mencatat DP di event.
					</p>
				)}
			</section>
		</Container>
	);
}

/** Kolom event vs isian terbaru bot (hanya yang bot isi dan berbeda). */
async function diffWithEvent(item: InboxRow, ev: EventSnap) {
	const supabase = await createClient();
	const [{ data: packages }, { data: backdrops }] = await Promise.all([
		supabase
			.from("packages")
			.select("id, name, category, frame_size, duration_hours, base_price")
			.is("deleted_at", null),
		supabase.from("backdrops").select("id, code, name, type, rental_price"),
	]);
	const pkgs = (packages ?? []) as PackageOption[];
	const bds = (backdrops ?? []) as BackdropOption[];
	const want: BookingFormDefaults = inboxToBookingDefaults(item, pkgs, bds);
	const pkgName = (id?: string | null) =>
		pkgs.find((p) => p.id === id)?.name ?? "";
	const bdName = (id?: string | null) =>
		bds.find((b) => b.id === id)?.name ?? "";
	const hhmm = (t?: string | null) => (t ?? "").slice(0, 5);

	const rows: Array<{ label: string; event: string; inbox: string }> = [
		{
			label: "Tanggal",
			event: ev.event_date ? formatDateID(ev.event_date) : "",
			inbox: want.event_date ? formatDateID(want.event_date) : "",
		},
		{
			label: "Jam mulai",
			event: hhmm(ev.start_time),
			inbox: want.start_time ?? "",
		},
		{
			label: "Jam selesai",
			event: hhmm(ev.end_time),
			inbox: want.end_time ?? "",
		},
		{
			label: "Venue",
			event: ev.venue_name ?? "",
			inbox: want.venue_name ?? "",
		},
		{
			label: "Paket",
			event: pkgName(ev.package_id),
			inbox: pkgName(want.package_id),
		},
		{
			label: "Ukuran frame",
			event: ev.frame_size ?? "",
			inbox: want.frame_size ?? "",
		},
		{
			label: "Backdrop",
			event: bdName(ev.backdrop_id),
			inbox: bdName(want.backdrop_id),
		},
		{ label: "PIC", event: ev.pic_name ?? "", inbox: want.pic_name ?? "" },
		{
			label: "WA PIC",
			event: ev.pic_wa ? formatPhoneLocal(ev.pic_wa) : "",
			inbox: want.pic_wa ?? "",
		},
	];
	return rows.filter(
		(r) => r.inbox && r.inbox.toLowerCase() !== r.event.toLowerCase(),
	);
}
