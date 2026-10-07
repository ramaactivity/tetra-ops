import { PKG } from "@/components/portal/booking/content";
import { DashShell } from "@/components/portal/dash/shell";
import { btn, PageHead } from "@/components/portal/dash/ui";
import { PortalLogin } from "@/components/portal/portal-login";
import { dateLong } from "@/components/portal/status-pill";
import { getPortalPerson } from "@/lib/portal/auth";
import { daysUntil, PRODUCT_LABELS } from "@/lib/portal/core";
import { loadMyBookings, type PortalBooking } from "@/lib/portal/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { toWaPhone } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";
export const metadata = { title: "Booking saya" };

export default async function AkunPage() {
	const person = await getPortalPerson();
	if (!person)
		return (
			<div className="wrap" style={{ display: "grid", gap: 18 }}>
				<a
					href="/booking"
					className="h2"
					style={{ color: "var(--ink)", textDecoration: "none" }}
				>
					tetra
				</a>
				<h1 className="h1">Masuk ke booking kamu</h1>
				<p className="body">
					Pakai nomor WhatsApp yang kamu daftarkan waktu booking. Tanpa
					password.
				</p>
				<PortalLogin />
				<p className="cap">
					Belum pernah booking?{" "}
					<a className="link" href="/booking">
						Mulai booking
					</a>
				</p>
			</div>
		);

	const [bookings, biz] = await Promise.all([
		loadMyBookings(person),
		createAdminClient()
			.from("system_config")
			.select("value")
			.eq("key", "business_phone")
			.maybeSingle(),
	]);
	const adminWa =
		typeof biz.data?.value === "string" ? toWaPhone(biz.data.value) : null;
	const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
	// Dasbor WO (DR-028): klien yang dipegang dipisah dari booking pribadi.
	const groups = [
		{
			title: "Klien yang kamu pegang",
			list: bookings.filter((b) => b.role === "wo"),
		},
		{ title: "Booking kamu", list: bookings.filter((b) => b.role !== "wo") },
	].filter((g) => g.list.length);
	return (
		<DashShell
			nav={[
				{ href: "/akun", label: "Booking saya", icon: "list", current: true },
				{ href: "/booking", label: "Booking baru", icon: "plus" },
			]}
			person={{ name: person.name, phone: person.phone }}
			chatUrl={adminWa ? `https://wa.me/${adminWa}` : null}
		>
			<PageHead
				title={`Halo, ${person.name?.split(" ")[0] ?? "kamu"}`}
				meta="Pilih booking untuk melihat dashboard-nya."
				actions={
					<a href="/booking" style={btn("#F8D98B")}>
						+ Booking baru
					</a>
				}
			/>
			{bookings.length === 0 && (
				<p
					style={{
						margin: 0,
						padding: "16px 20px",
						borderRadius: 16,
						border: "1.5px solid #1D1D1B",
						background: "#fff",
						fontSize: 14,
					}}
				>
					Belum ada booking dengan nomor ini.
				</p>
			)}
			{groups.map((g) => (
				<section
					key={g.title}
					style={{ display: "flex", flexDirection: "column", gap: 12 }}
				>
					{groups.length > 1 && (
						<h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>
							{g.title}
						</h2>
					)}
					<div
						className="dash-stats"
						style={{
							gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))",
						}}
					>
						{g.list.map((b) => (
							<BookingCard key={b.id} b={b} today={today} />
						))}
					</div>
				</section>
			))}
		</DashShell>
	);
}

const STATUS: Record<string, { label: string; bg: string; under: string }> = {
	draft: { label: "Draf", bg: "#FCE3C6", under: "#FCE3C6" },
	menunggu_konfirmasi: { label: "DP dicek", bg: "#D6EEF8", under: "#D6EEF8" },
	resmi: { label: "Resmi", bg: "#D6F1EA", under: "#8EDCCB" },
	kedaluwarsa: { label: "Kedaluwarsa", bg: "#F7D5CC", under: "#EFEDE8" },
	batal: { label: "Dibatalkan", bg: "#F7D5CC", under: "#EFEDE8" },
};

function BookingCard({ b, today }: { b: PortalBooking; today: string }) {
	const st = STATUS[b.status] ?? STATUS.draft;
	const days = daysUntil(b.event_date, today);
	return (
		<a
			href={`/akun/booking/${b.public_code}`}
			className="dash-stat"
			style={{
				display: "flex",
				flexDirection: "column",
				gap: 8,
				borderRadius: 16,
				border: "1.5px solid #1D1D1B",
				background: "#fff",
				padding: "16px 18px",
				boxShadow: `5px 5px 0 -1.5px ${st.under},5px 5px 0 0 #1D1D1B`,
				textDecoration: "none",
			}}
		>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					gap: 8,
					alignItems: "center",
				}}
			>
				<span className="mono" style={{ fontSize: 12, color: "#5F5E5A" }}>
					{b.public_code}
				</span>
				<span
					style={{
						borderRadius: 8,
						border: "1.5px solid #1D1D1B",
						background: st.bg,
						padding: "2px 10px",
						fontSize: 12,
						fontWeight: 700,
					}}
				>
					{st.label}
				</span>
			</div>
			<span style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em" }}>
				{b.detail.nama_acara || "Acara tanpa nama"}
			</span>
			<span style={{ fontSize: 13, color: "#3A3936" }}>
				{dateLong(b.event_date)} ·{" "}
				{PKG[b.service_type]?.name ??
					PRODUCT_LABELS[b.service_type] ??
					b.service_type}{" "}
				{b.package_hours} jam
			</span>
			<span style={{ fontSize: 13, fontWeight: 700 }}>
				{days > 0
					? `${days} hari lagi`
					: days === 0
						? "Hari ini"
						: "Sudah lewat"}{" "}
				→
			</span>
		</a>
	);
}
