import { CalendarDays, Globe, Package, User } from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import {
	PortalRequestActions,
	PortalReviewActions,
} from "@/components/portal/admin-review-actions";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateID, formatRupiah } from "@/lib/format";
import { PRODUCT_LABELS } from "@/lib/portal/core";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Booking = {
	id: string;
	public_code: string;
	status: string;
	service_type: string;
	package_hours: number;
	unit_count: number;
	quoted_total: number;
	event_date: string;
	start_time: string | null;
	venue_city: string | null;
	detail: { nama_acara?: string; pemilik_nama?: string; venue_nama?: string };
	expires_at: string;
	created_at: string;
	event: { project_id: string } | null;
	members: Array<{
		role: string;
		person: { name: string | null; phone: string } | null;
	}>;
};

/**
 * Booking dari portal klien (DR-026). Fase 1: cek bukti DP transfer, terima
 * (event dibuat + DP dicatat) atau tolak. Draf belum DP tidak menahan slot.
 */
export default async function PortalBookingsPage() {
	const supabase = await createClient();
	const [subsRes, bookingsRes, reqRes] = await Promise.all([
		supabase
			.from("payment_submissions")
			.select(
				"id, amount, kind, created_at, booking_id, bank:bank_accounts(bank_name)",
			)
			.eq("status", "menunggu")
			.order("created_at"),
		supabase
			.from("client_bookings")
			.select(
				"id, public_code, status, service_type, package_hours, unit_count, quoted_total, event_date, start_time, venue_city, detail, expires_at, created_at, event:events(project_id), members:booking_members(role, person:portal_people!booking_members_person_id_fkey(name, phone))",
			)
			.in("status", ["draft", "menunggu_konfirmasi", "resmi"])
			.order("event_date")
			.limit(300),
		supabase
			.from("booking_requests")
			.select(
				"id, kind, new_date, new_start, reason, refund_estimate, created_at, booking_id",
			)
			.eq("status", "baru")
			.order("created_at"),
	]);
	const requests = reqRes.data ?? [];
	const bookings = (bookingsRes.data ?? []) as unknown as Booking[];
	const byId = new Map(bookings.map((b) => [b.id, b]));
	const subs = subsRes.data ?? [];
	const drafts = bookings.filter((b) => b.status === "draft");
	const resmi = bookings.filter((b) => b.status === "resmi");
	const error = subsRes.error ?? bookingsRes.error ?? reqRes.error;

	return (
		<Container size="lg" className="space-y-3 pb-6">
			<div>
				<h1 className="text-[20px] font-semibold tracking-[-0.01em]">
					Booking Portal
				</h1>
				<p className="text-[13px] text-muted-foreground">
					Booking yang dibuat klien sendiri di halaman booking. Cek bukti DP
					lalu terima — event langsung dibuat dan DP tercatat.
				</p>
			</div>

			{error && (
				<p className="rounded-xl bg-rose-50 px-4 py-3 text-[13px] text-rose-800">
					Gagal memuat: {error.message}
				</p>
			)}

			<h2 className="pt-2 text-[15px] font-semibold">
				Perlu dicek ({subs.length})
			</h2>
			{subs.length === 0 ? (
				<EmptyState
					icon={Globe}
					title="Tidak ada bukti DP yang menunggu"
					description="Bukti DP dari portal muncul di sini."
				/>
			) : (
				<ul className="space-y-2">
					{subs.map((s) => {
						const b = byId.get(s.booking_id);
						if (!b) return null;
						const bank = (s.bank as unknown as { bank_name: string } | null)
							?.bank_name;
						return (
							<li
								key={s.id}
								className="space-y-3 rounded-[16px] border border-border-subtle bg-card p-4 shadow-[var(--shadow-level-1)]"
							>
								<BookingSummary b={b} />
								<p className="text-[13px]">
									{s.kind === "dp" ? "DP" : "Pembayaran"}{" "}
									<span data-nominal className="font-semibold tabular-nums">
										{formatRupiah(Number(s.amount))}
									</span>{" "}
									ke {bank ?? "?"} · dari total{" "}
									<span data-nominal className="tabular-nums">
										{formatRupiah(Number(b.quoted_total))}
									</span>{" "}
									· diajukan {formatDateID(s.created_at)}
								</p>
								<PortalReviewActions
									id={s.id}
									kind={s.kind}
									summary={`${b.detail.nama_acara ?? b.public_code} — ${s.kind === "dp" ? "DP" : "pembayaran"} ${formatRupiah(Number(s.amount))}`}
								/>
							</li>
						);
					})}
				</ul>
			)}

			{requests.length > 0 && (
				<>
					<h2 className="pt-2 text-[15px] font-semibold">
						Permintaan klien ({requests.length})
					</h2>
					<p className="text-[12.5px] text-muted-foreground">
						Ubah tanggal atau batalkan event di halaman event seperti biasa
						(refund juga manual), lalu tandai selesai di sini. Jadwal baru
						disalin otomatis ke portal.
					</p>
					<ul className="space-y-2">
						{requests.map((r) => {
							const b = byId.get(r.booking_id);
							return (
								<li
									key={r.id}
									className="space-y-3 rounded-[16px] border border-border-subtle bg-card p-4"
								>
									{b && <BookingSummary b={b} />}
									<p className="text-[13px]">
										{r.kind === "batal" ? (
											<>
												<b>Minta batal</b> · perkiraan refund (DR-034){" "}
												<span data-nominal className="tabular-nums">
													{formatRupiah(Number(r.refund_estimate ?? 0))}
												</span>
											</>
										) : (
											<>
												<b>Minta pindah tanggal</b> ke{" "}
												{formatDateID(r.new_date as string)}
												{r.new_start
													? ` jam ${String(r.new_start).slice(0, 5)}`
													: ""}
											</>
										)}
										{r.reason ? ` · "${r.reason}"` : ""} · diajukan{" "}
										{formatDateID(r.created_at)}
									</p>
									{b?.event && (
										<Link
											href={`/operations/${b.event.project_id}`}
											className="inline-block text-[13px] font-medium underline"
										>
											Buka event {b.event.project_id}
										</Link>
									)}
									<PortalRequestActions id={r.id} />
								</li>
							);
						})}
					</ul>
				</>
			)}

			<h2 className="pt-2 text-[15px] font-semibold">
				Draf, belum DP ({drafts.length})
			</h2>
			<p className="text-[12.5px] text-muted-foreground">
				Tidak menahan slot. Kedaluwarsa otomatis kalau tidak DP.
			</p>
			<ul className="space-y-2">
				{drafts.map((b) => (
					<li
						key={b.id}
						className="rounded-[16px] border border-border-subtle bg-card p-4"
					>
						<BookingSummary b={b} />
						<p className="mt-1.5 text-[12.5px] text-muted-foreground">
							Kedaluwarsa {formatDateID(b.expires_at)}
						</p>
					</li>
				))}
			</ul>

			<h2 className="pt-2 text-[15px] font-semibold">
				Sudah resmi ({resmi.length})
			</h2>
			<ul className="space-y-2">
				{resmi.map((b) => (
					<li
						key={b.id}
						className="rounded-[16px] border border-border-subtle bg-card p-4"
					>
						<BookingSummary b={b} />
						{b.event && (
							<Link
								href={`/operations/${b.event.project_id}`}
								className="mt-1.5 inline-block text-[13px] font-medium underline"
							>
								Buka event {b.event.project_id}
							</Link>
						)}
					</li>
				))}
			</ul>
		</Container>
	);
}

function BookingSummary({ b }: { b: Booking }) {
	const pemesan = b.members.find((m) => m.role === "pemesan")?.person;
	return (
		<div>
			<p className="truncate text-[15px] font-semibold">
				{b.detail.nama_acara || "Acara tanpa nama"}{" "}
				<span className="font-mono text-[12px] text-muted-foreground">
					{b.public_code}
				</span>
			</p>
			<div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-foreground/80">
				<span className="inline-flex items-center gap-1.5">
					<CalendarDays className="size-3.5 text-muted-foreground" />
					{formatDateID(b.event_date)}
					{b.start_time ? ` · ${b.start_time.slice(0, 5)}` : " · jam menyusul"}
					{b.venue_city ? ` · ${b.venue_city}` : ""}
				</span>
				<span className="inline-flex items-center gap-1.5">
					<Package className="size-3.5 text-muted-foreground" />
					{PRODUCT_LABELS[b.service_type] ?? b.service_type} {b.package_hours}{" "}
					jam
					{b.unit_count > 1 ? ` · ${b.unit_count} unit` : ""}
				</span>
				<span className="inline-flex items-center gap-1.5">
					<User className="size-3.5 text-muted-foreground" />
					{pemesan ? `${pemesan.name ?? "-"} · ${pemesan.phone}` : "-"}
				</span>
			</div>
		</div>
	);
}
