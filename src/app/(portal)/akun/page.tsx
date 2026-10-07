import { LogoutButton, PortalLogin } from "@/components/portal/portal-login";
import { dateLong, StatusPill } from "@/components/portal/status-pill";
import { getPortalPerson } from "@/lib/portal/auth";
import { PRODUCT_LABELS } from "@/lib/portal/core";
import { loadMyBookings, type PortalBooking } from "@/lib/portal/data";

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

	const bookings = await loadMyBookings(person);
	// Dasbor WO (DR-028): klien yang dipegang dipisah dari booking pribadi.
	const groups = [
		{
			title: "Klien yang kamu pegang",
			list: bookings.filter((b) => b.role === "wo"),
		},
		{ title: "Booking kamu", list: bookings.filter((b) => b.role !== "wo") },
	];
	return (
		<div className="wrap" style={{ display: "grid", gap: 16 }}>
			<header
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
				}}
			>
				<span className="h2">tetra</span>
				<LogoutButton />
			</header>
			<h1 className="h1">Halo, {person.name ?? "kamu"}</h1>
			{bookings.length === 0 && (
				<div className="note">Belum ada booking dengan nomor ini.</div>
			)}
			{groups.map(
				(g) =>
					g.list.length > 0 && (
						<section key={g.title} style={{ display: "grid", gap: 14 }}>
							{groups.filter((x) => x.list.length).length > 1 && (
								<h2 className="h2">{g.title}</h2>
							)}
							{g.list.map((b) => (
								<BookingCard key={b.id} b={b} />
							))}
						</section>
					),
			)}
			<a className="btn btn-block" href="/booking">
				Booking acara lain
			</a>
		</div>
	);
}

function BookingCard({ b }: { b: PortalBooking }) {
	return (
		<a
			href={`/akun/booking/${b.public_code}`}
			className="card layered"
			style={{
				color: "var(--ink)",
				textDecoration: "none",
				display: "grid",
				gap: 8,
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
				<span style={{ fontWeight: 800, fontSize: 17 }}>
					{b.detail.nama_acara || "Acara tanpa nama"}
				</span>
				<StatusPill status={b.status} />
			</div>
			<hr className="divider" style={{ margin: "4px 0" }} />
			<div className="body">
				{dateLong(b.event_date)} ·{" "}
				{PRODUCT_LABELS[b.service_type] ?? b.service_type} {b.package_hours} jam
			</div>
			<div className="cap mono">{b.public_code}</div>
		</a>
	);
}
