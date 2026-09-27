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
import { EmptyState } from "@/components/ui/empty-state";
import {
	INBOX_DATA_LABEL,
	type InboxRow,
	missingFields,
} from "@/lib/booking-inbox/core";
import { formatDateID } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Booking yang sudah DP dari bot WA, menunggu owner membuat event-nya. */
export default async function BookingMasukPage() {
	const supabase = await createClient();
	const { data, error } = await supabase
		.from("booking_inbox")
		.select("*")
		.order("created_at", { ascending: false })
		.limit(200);
	const items = (data ?? []) as InboxRow[];

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
						<InboxCard key={it.id} item={it} />
					))}
				</ul>
			)}
		</Container>
	);
}

function InboxCard({ item }: { item: InboxRow }) {
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
								? ` · DP dilaporkan ${formatDateID(item.dp_dilaporkan_at)}`
								: ""}
						</p>
					</div>
					<div className="flex shrink-0 flex-col items-end gap-1">
						<InboxStatusBadge status={item.status} />
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
