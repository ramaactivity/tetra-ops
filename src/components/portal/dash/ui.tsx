/**
 * Komponen dashboard klien (server-safe), pola visual admin Tetra Booth:
 * kartu putih border tinta radius 16, kartu statistik "layered" berwarna.
 */
import {
	ArrowRight,
	CalendarDays,
	ChevronLeft,
	ExternalLink,
	Images,
	type LucideIcon,
	MessageCircle,
	Palette,
	Wallet,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

const INK = "#1D1D1B";
const B = `1.5px solid ${INK}`;
export const mono: CSSProperties = {
	fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
};
const layered = (under: string, o = 5) =>
	`${o}px ${o}px 0 -1.5px ${under},${o}px ${o}px 0 0 ${INK}`;
export const btn = (bg: string, fg = INK): CSSProperties => ({
	display: "inline-flex",
	alignItems: "center",
	gap: 8,
	height: 42,
	padding: "0 16px",
	borderRadius: 12,
	border: B,
	background: bg,
	color: fg,
	fontSize: 14,
	fontWeight: 700,
	textDecoration: "none",
	whiteSpace: "nowrap",
});

export function PageHead({
	back,
	title,
	meta,
	chip,
	code,
	actions,
}: {
	back?: { href: string; label: string };
	title: string;
	meta?: string;
	chip?: { label: string; bg: string };
	code?: string;
	actions?: ReactNode;
}) {
	return (
		<div
			style={{
				display: "flex",
				flexWrap: "wrap",
				alignItems: "flex-end",
				justifyContent: "space-between",
				gap: 16,
			}}
		>
			<div style={{ minWidth: 0 }}>
				{back && (
					<a
						href={back.href}
						style={{
							marginLeft: -4,
							display: "inline-flex",
							alignItems: "center",
							gap: 2,
							fontSize: 13,
							fontWeight: 600,
							color: "#5F5E5A",
							textDecoration: "none",
						}}
					>
						<ChevronLeft aria-hidden size={16} strokeWidth={2} />
						{back.label}
					</a>
				)}
				<h1
					style={{
						margin: "4px 0 0",
						fontSize: 28,
						fontWeight: 800,
						letterSpacing: "-0.03em",
						lineHeight: 1.1,
					}}
				>
					{title}
				</h1>
				<p
					style={{
						margin: "10px 0 0",
						display: "flex",
						flexWrap: "wrap",
						alignItems: "center",
						gap: 8,
						fontSize: 13,
						color: "#3A3936",
					}}
				>
					{meta}
					{chip && (
						<span
							style={{
								borderRadius: 8,
								border: B,
								background: chip.bg,
								padding: "2px 10px",
								fontSize: 12,
								fontWeight: 700,
								color: INK,
							}}
						>
							{chip.label}
						</span>
					)}
					{code && (
						<span style={{ ...mono, fontSize: 12, color: "#5F5E5A" }}>
							{code}
						</span>
					)}
				</p>
			</div>
			{actions && (
				<div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
					{actions}
				</div>
			)}
		</div>
	);
}

export type NextStep = {
	title: string;
	body: string;
	cta?: { label: string; href: string; external?: boolean };
	tone: "butter" | "mint" | "sky" | "coral";
	/** Indeks tahap aktif di stepper 0..4. */
	stage: number;
};
const TONE = {
	butter: "#F8D98B",
	mint: "#D6F1EA",
	sky: "#D6EEF8",
	coral: "#F7D5CC",
};
const STAGES = ["Booking", "DP", "Desain", "Pelunasan", "Hari H"];

export function NextStepCard({ s }: { s: NextStep }) {
	return (
		<section
			id="ringkasan"
			className="dash-sec"
			style={{
				display: "flex",
				flexDirection: "column",
				gap: 14,
				borderRadius: 16,
				border: B,
				background: "#fff",
				padding: "18px 20px",
				boxShadow: layered(TONE[s.tone]),
			}}
		>
			<div
				style={{
					display: "flex",
					flexWrap: "wrap",
					alignItems: "center",
					justifyContent: "space-between",
					gap: 14,
				}}
			>
				<div style={{ minWidth: 0, flex: "1 1 280px" }}>
					<div
						style={{
							fontSize: 12,
							fontWeight: 800,
							letterSpacing: "0.04em",
							color: "#5F5E5A",
						}}
					>
						LANGKAH BERIKUTNYA
					</div>
					<div
						style={{
							marginTop: 4,
							fontSize: 20,
							fontWeight: 800,
							letterSpacing: "-0.02em",
						}}
					>
						{s.title}
					</div>
					<div
						style={{
							marginTop: 4,
							fontSize: 14,
							lineHeight: 1.45,
							color: "#3A3936",
						}}
					>
						{s.body}
					</div>
				</div>
				{s.cta && (
					<a
						href={s.cta.href}
						{...(s.cta.external
							? { target: "_blank", rel: "noopener noreferrer" }
							: {})}
						style={{ ...btn(INK, "#fff"), height: 46, padding: "0 18px" }}
					>
						{s.cta.label}
						{s.cta.external ? (
							<ExternalLink aria-hidden size={16} strokeWidth={2} />
						) : (
							<ArrowRight aria-hidden size={16} strokeWidth={2} />
						)}
					</a>
				)}
			</div>
			<ol
				aria-label="Tahapan booking"
				style={{
					listStyle: "none",
					margin: 0,
					padding: 0,
					display: "flex",
					alignItems: "center",
					gap: 6,
					flexWrap: "wrap",
				}}
			>
				{STAGES.map((l, i) => {
					const done = i < s.stage;
					const now = i === s.stage;
					return (
						<li
							key={l}
							style={{ display: "flex", alignItems: "center", gap: 6 }}
						>
							{i > 0 && (
								<span
									aria-hidden
									style={{
										width: 18,
										borderTop: `1.5px ${i <= s.stage ? "solid" : "dashed"} ${INK}`,
									}}
								/>
							)}
							<span
								aria-current={now ? "step" : undefined}
								style={{
									display: "flex",
									alignItems: "center",
									gap: 6,
									height: 28,
									padding: "0 10px",
									borderRadius: 999,
									border: B,
									background: done ? "#5DB978" : now ? "#F8D98B" : "#fff",
									color: done ? "#fff" : INK,
									fontSize: 12,
									fontWeight: now ? 800 : 700,
								}}
							>
								{done ? "✓ " : ""}
								{l}
							</span>
						</li>
					);
				})}
			</ol>
		</section>
	);
}

const STAT_ICON = {
	cal: CalendarDays,
	pay: Wallet,
	design: Palette,
	gallery: Images,
} as const;

export function StatGrid({
	items,
}: {
	items: Array<{
		k: keyof typeof STAT_ICON;
		label: string;
		value: string;
		sub?: string;
		under: string;
		href: string;
	}>;
}) {
	return (
		<div className="dash-stats">
			{items.map((s) => {
				const I: LucideIcon = STAT_ICON[s.k];
				return (
					<a
						key={s.label}
						href={s.href}
						className="dash-stat"
						style={{
							display: "block",
							borderRadius: 16,
							border: B,
							background: "#fff",
							padding: "16px 18px",
							boxShadow: layered(s.under),
							textDecoration: "none",
						}}
					>
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: 6,
								fontSize: 12,
								fontWeight: 600,
								color: "#5F5E5A",
							}}
						>
							<I
								aria-hidden
								size={16}
								strokeWidth={2}
								style={{ flex: "none" }}
							/>
							{s.label}
						</div>
						<div
							className="dash-stat-v"
							style={{
								marginTop: 2,
								fontWeight: 800,
								letterSpacing: "-0.03em",
								lineHeight: 1.2,
							}}
						>
							{s.value}
						</div>
						{s.sub && (
							<div
								style={{
									marginTop: 2,
									fontSize: 12,
									fontWeight: 600,
									color: "#3A3936",
								}}
							>
								{s.sub}
							</div>
						)}
					</a>
				);
			})}
		</div>
	);
}

/** Kartu bagian: putih, border tinta, radius 16, judul 15/800. `bare` = tanpa kartu (isi sudah berkartu). */
export function Section({
	id,
	title,
	right,
	bare,
	children,
}: {
	id: string;
	title: string;
	right?: ReactNode;
	bare?: boolean;
	children: ReactNode;
}) {
	const head = (
		<div
			style={{
				display: "flex",
				flexWrap: "wrap",
				alignItems: "baseline",
				justifyContent: "space-between",
				gap: 8,
			}}
		>
			<h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>{title}</h2>
			{right}
		</div>
	);
	return bare ? (
		<section
			id={id}
			className="dash-sec"
			style={{ display: "flex", flexDirection: "column", gap: 12 }}
		>
			{head}
			{children}
		</section>
	) : (
		<section
			id={id}
			className="dash-sec"
			style={{
				display: "flex",
				flexDirection: "column",
				gap: 14,
				borderRadius: 16,
				border: B,
				background: "#fff",
				padding: "16px 20px",
			}}
		>
			{head}
			{children}
		</section>
	);
}

/** Galeri foto dari Tetra Booth (kontrak §5): sampul + thumbnail kalau Booth mengirim, jumlah foto, masa aktif. */
export function GalleryCard({
	ev,
	today,
}: {
	ev: {
		name: string;
		gallery_url: string | null;
		photo_count?: number;
		client_expires_at: string | null;
		phase?: string;
		cover_url?: string | null;
		thumbs?: Array<{ url: string }>;
	};
	today: string;
}) {
	const left = ev.client_expires_at
		? Math.max(
				0,
				Math.ceil(
					(Date.parse(ev.client_expires_at) -
						Date.parse(`${today}T00:00:00+07:00`)) /
						864e5,
				),
			)
		: null;
	const until = ev.client_expires_at
		? new Intl.DateTimeFormat("id-ID", {
				day: "numeric",
				month: "short",
				year: "numeric",
				timeZone: "Asia/Jakarta",
			}).format(new Date(ev.client_expires_at))
		: null;
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
			<div style={{ display: "flex", gap: 14, alignItems: "center" }}>
				<div
					style={{
						flex: "none",
						width: 84,
						height: 84,
						borderRadius: 14,
						border: B,
						overflow: "hidden",
						background:
							"repeating-linear-gradient(45deg,#D6EEF8 0 8px,#fff 8px 16px)",
					}}
				>
					{ev.cover_url && (
						// biome-ignore lint/performance/noImgElement: URL presigned R2 dari Booth, tanpa optimasi Next.
						<img
							src={ev.cover_url}
							alt=""
							style={{ width: "100%", height: "100%", objectFit: "cover" }}
						/>
					)}
				</div>
				<div style={{ minWidth: 0, flex: 1 }}>
					<div style={{ fontSize: 15, fontWeight: 800 }}>{ev.name}</div>
					<div style={{ marginTop: 2, fontSize: 13, color: "#3A3936" }}>
						{typeof ev.photo_count === "number"
							? `${ev.photo_count} foto`
							: "Foto acara"}
						{until ? ` · tersedia s/d ${until}` : ""}
					</div>
					{left !== null && (
						<span
							style={{
								marginTop: 8,
								display: "inline-flex",
								alignItems: "center",
								height: 26,
								padding: "0 10px",
								borderRadius: 999,
								border: B,
								background: "#FCE3C6",
								fontSize: 12,
								fontWeight: 700,
							}}
						>
							Tersedia {left} hari lagi
						</span>
					)}
				</div>
			</div>
			{!!ev.thumbs?.length && (
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "repeat(6,minmax(0,1fr))",
						gap: 6,
					}}
				>
					{ev.thumbs.slice(0, 6).map((t) => (
						// biome-ignore lint/performance/noImgElement: thumbnail presigned dari Booth.
						<img
							key={t.url}
							src={t.url}
							alt=""
							style={{
								width: "100%",
								aspectRatio: "1",
								objectFit: "cover",
								borderRadius: 10,
								border: B,
							}}
						/>
					))}
				</div>
			)}
			{ev.gallery_url && (
				<a
					href={ev.gallery_url}
					target="_blank"
					rel="noopener noreferrer"
					style={{
						...btn("#F8D98B"),
						alignSelf: "flex-start",
						height: 46,
						boxShadow: layered("#fff", 4),
					}}
				>
					<Images aria-hidden size={18} strokeWidth={2} />
					Buka galeri
					<ExternalLink aria-hidden size={15} strokeWidth={2} />
				</a>
			)}
		</div>
	);
}

export function ChatButton({ href }: { href: string }) {
	return (
		<a
			href={href}
			target="_blank"
			rel="noopener noreferrer"
			style={btn("#fff")}
		>
			<MessageCircle aria-hidden size={16} strokeWidth={2} />
			Chat admin
		</a>
	);
}
