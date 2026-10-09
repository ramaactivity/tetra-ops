"use client";

/**
 * Kerangka dashboard klien: sidebar (desktop ≥1024px) + top bar & laci (HP),
 * meniru admin Tetra Booth supaya terasa satu produk. Item anchor (#…) ditandai
 * aktif saat diklik; item halaman ditandai dari `current`.
 */
import {
	CalendarDays,
	CircleHelp,
	FileText,
	Images,
	LayoutDashboard,
	ListChecks,
	Menu,
	MessageCircle,
	Palette,
	Plus,
	RefreshCw,
	Users,
	Wallet,
	X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { logoutPortal } from "@/lib/actions/portal-auth";
import "./dash.css";

const ICONS = {
	list: CalendarDays,
	home: LayoutDashboard,
	pay: Wallet,
	data: ListChecks,
	design: Palette,
	gallery: Images,
	docs: FileText,
	people: Users,
	change: RefreshCw,
	plus: Plus,
} as const;
export type NavIcon = keyof typeof ICONS;
export type NavItem = {
	href: string;
	label: string;
	icon: NavIcon;
	sub?: boolean;
	current?: boolean;
	/** Penanda kecil di kanan, mis. "2/3". */
	badge?: string;
	/** Titik oranye = perlu tindakan. */
	alert?: boolean;
};

export function DashShell({
	nav,
	groupTitle,
	person,
	chatUrl,
	guideHref,
	children,
}: {
	nav: NavItem[];
	/** Judul grup sub-menu (mis. nama acara). Item `sub` ditampilkan di bawahnya. */
	groupTitle?: string;
	person: { name: string | null; phone: string };
	chatUrl: string | null;
	/** Buka ulang panduan dashboard (mis. "?panduan=1"). */
	guideHref?: string;
	children: ReactNode;
}) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const dlg = useRef<HTMLDialogElement>(null);

	// HP: tab aktif digeser ke tengah supaya terlihat.
	useEffect(() => {
		document
			.querySelector('.dash-tabs [aria-current="page"]')
			?.scrollIntoView({ inline: "center", block: "nearest" });
	}, []);

	useEffect(() => {
		if (!open) return;
		dlg.current?.showModal();
		document.documentElement.style.overflow = "hidden";
		const lg = matchMedia("(min-width: 1024px)");
		const onLg = () => lg.matches && dlg.current?.close();
		lg.addEventListener("change", onLg);
		return () => lg.removeEventListener("change", onLg);
	}, [open]);

	const isOn = (n: NavItem) => !!n.current;

	const logo = (
		<a
			href="/akun"
			style={{
				display: "flex",
				alignItems: "center",
				gap: 10,
				textDecoration: "none",
			}}
		>
			<span
				style={{
					display: "flex",
					width: 34,
					height: 34,
					alignItems: "center",
					justifyContent: "center",
					borderRadius: 9,
					border: "1.5px solid #1D1D1B",
					background: "#8EDCCB",
					fontSize: 15,
					fontWeight: 800,
				}}
			>
				T
			</span>
			<span style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em" }}>
				tetra
			</span>
		</a>
	);

	const top = nav.filter((n) => !n.sub);
	const sub = nav.filter((n) => n.sub);
	const link = (n: NavItem) => {
		const I = ICONS[n.icon];
		return (
			<a
				key={n.href}
				href={n.href}
				className={n.sub ? "sub" : undefined}
				aria-current={isOn(n) ? "page" : undefined}
			>
				<I
					aria-hidden
					size={n.sub ? 18 : 20}
					strokeWidth={2}
					style={{ flex: "none" }}
				/>
				<span style={{ flex: 1, minWidth: 0 }}>{n.label}</span>
				{n.badge && (
					<span
						className="mono"
						style={{ fontSize: 11, fontWeight: 600, color: "#5F5E5A" }}
					>
						{n.badge}
					</span>
				)}
				{n.alert && (
					<span
						style={{
							width: 8,
							height: 8,
							borderRadius: 4,
							background: "#E8836F",
							flex: "none",
						}}
					>
						<span
							style={{
								position: "absolute",
								width: 1,
								height: 1,
								overflow: "hidden",
								clip: "rect(0 0 0 0)",
							}}
						>
							perlu tindakan
						</span>
					</span>
				)}
			</a>
		);
	};

	const panel = (
		<>
			<nav
				className="dash-nav"
				style={{ display: "flex", flexDirection: "column", gap: 6 }}
			>
				{top.slice(0, 1).map(link)}
				{sub.length > 0 && (
					<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
						<p
							style={{
								display: "flex",
								height: 34,
								alignItems: "center",
								gap: 12,
								padding: "0 12px",
								margin: 0,
								fontSize: 14,
								fontWeight: 700,
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap",
							}}
						>
							<LayoutDashboard
								aria-hidden
								size={20}
								strokeWidth={2}
								style={{ flex: "none" }}
							/>
							<span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
								{groupTitle}
							</span>
						</p>
						{sub.map(link)}
					</div>
				)}
				{top.slice(1).map(link)}
			</nav>
			<div
				style={{
					marginTop: "auto",
					display: "flex",
					flexDirection: "column",
					gap: 10,
					paddingTop: 16,
				}}
			>
				{guideHref && (
					<a
						href={guideHref}
						style={{
							display: "flex",
							height: 38,
							alignItems: "center",
							justifyContent: "center",
							gap: 8,
							fontSize: 13,
							fontWeight: 700,
							textDecoration: "underline",
							textUnderlineOffset: 3,
						}}
					>
						<CircleHelp aria-hidden size={16} strokeWidth={2} />
						Panduan dashboard
					</a>
				)}
				{chatUrl && (
					<a
						href={chatUrl}
						target="_blank"
						rel="noopener noreferrer"
						style={{
							display: "flex",
							height: 42,
							alignItems: "center",
							justifyContent: "center",
							gap: 8,
							borderRadius: 11,
							border: "1.5px solid #1D1D1B",
							background: "#fff",
							fontSize: 14,
							fontWeight: 700,
							textDecoration: "none",
						}}
					>
						<MessageCircle aria-hidden size={18} strokeWidth={2} />
						Chat admin
					</a>
				)}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 10,
						borderRadius: 14,
						border: "1.5px dashed #1D1D1B",
						padding: 10,
					}}
				>
					<span
						style={{
							display: "flex",
							width: 32,
							height: 32,
							flex: "none",
							alignItems: "center",
							justifyContent: "center",
							borderRadius: 16,
							border: "1.5px solid #1D1D1B",
							background: "#FCE3C6",
							fontSize: 12,
							fontWeight: 800,
							textTransform: "uppercase",
						}}
					>
						{(person.name ?? "K")[0]}
					</span>
					<div style={{ minWidth: 0, flex: 1 }}>
						<div
							style={{
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap",
								fontSize: 13,
								fontWeight: 700,
							}}
						>
							{person.name ?? "Klien"}
						</div>
						<div className="mono" style={{ fontSize: 11, color: "#5F5E5A" }}>
							+{person.phone}
						</div>
					</div>
					<button
						type="button"
						onClick={async () => {
							await logoutPortal();
							router.push("/akun");
							router.refresh();
						}}
						style={{
							minHeight: 44,
							border: 0,
							background: "transparent",
							padding: "0 4px",
							fontSize: 11,
							fontWeight: 700,
							textDecoration: "underline",
						}}
					>
						Keluar
					</button>
				</div>
			</div>
		</>
	);

	return (
		<div className="dash">
			<header className="dash-top">
				{logo}
				<button
					type="button"
					aria-label="Buka menu"
					onClick={() => setOpen(true)}
					style={{
						display: "flex",
						width: 44,
						height: 44,
						alignItems: "center",
						justifyContent: "center",
						borderRadius: 11,
						border: 0,
						background: "transparent",
					}}
				>
					<Menu aria-hidden size={24} strokeWidth={2} />
				</button>
			</header>
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: Esc ditangani <dialog>; tautan punya keyboard sendiri. */}
			<dialog
				ref={dlg}
				className="dash-drawer"
				aria-label="Menu"
				onClose={() => {
					setOpen(false);
					document.documentElement.style.overflow = "";
				}}
				onClick={(e) => {
					const t = e.target as Element;
					if (t === e.currentTarget || t.closest("a")) dlg.current?.close();
				}}
			>
				{open && (
					<div
						style={{
							display: "flex",
							height: "100%",
							flexDirection: "column",
							gap: 6,
							padding: "12px 14px 24px",
						}}
					>
						<div
							style={{
								display: "flex",
								alignItems: "center",
								justifyContent: "space-between",
								paddingBottom: 16,
								paddingLeft: 8,
							}}
						>
							{logo}
							<button
								type="button"
								aria-label="Tutup menu"
								onClick={() => dlg.current?.close()}
								style={{
									display: "flex",
									width: 44,
									height: 44,
									alignItems: "center",
									justifyContent: "center",
									borderRadius: 11,
									border: 0,
									background: "transparent",
								}}
							>
								<X aria-hidden size={24} strokeWidth={2} />
							</button>
						</div>
						{panel}
					</div>
				)}
			</dialog>
			{sub.length > 0 && (
				<nav className="dash-tabs noscroll" aria-label="Menu booking">
					{sub.map((n) => (
						<a
							key={n.href}
							href={n.href}
							aria-current={isOn(n) ? "page" : undefined}
						>
							{n.label}
							{n.alert && (
								<span
									aria-hidden
									style={{
										width: 7,
										height: 7,
										borderRadius: 4,
										background: "#E8836F",
									}}
								/>
							)}
						</a>
					))}
				</nav>
			)}
			<aside className="dash-side">
				<div style={{ padding: "0 8px 24px" }}>{logo}</div>
				{panel}
			</aside>
			<main className="dash-main">
				<div className="dash-inner">{children}</div>
			</main>
		</div>
	);
}

/** Keluar dari sesi portal lalu kembali ke halaman masuk (/akun). */
export function LogoutAndLogin() {
	const router = useRouter();
	return (
		<button
			type="button"
			onClick={async () => {
				await logoutPortal();
				router.push("/akun");
				router.refresh();
			}}
			style={{
				alignSelf: "flex-start",
				height: 44,
				padding: "0 18px",
				borderRadius: 12,
				border: "1.5px solid #1D1D1B",
				background: "#1D1D1B",
				color: "#fff",
				fontSize: 14,
				fontWeight: 700,
			}}
		>
			Keluar &amp; masuk dengan nomor lain
		</button>
	);
}
