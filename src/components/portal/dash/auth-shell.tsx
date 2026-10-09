/**
 * Kerangka halaman masuk & undangan portal (DR-045): bahasa visual sama dengan
 * wizard booking (lingkaran pastel bergaris tinta, logo, kartu "layered").
 * Desktop: panel warna kiri (judul + kartu fitur) | kartu aksi kanan.
 * HP: pita warna di atas, kartu aksi di bawahnya.
 */
import type { LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import "./dash.css";

export type AuthFeature = {
	icon: LucideIcon;
	tint: string;
	title: string;
	body: string;
};

function Circle({ style, desk }: { style: CSSProperties; desk?: boolean }) {
	return (
		<span
			aria-hidden
			className={`auth-circle${desk ? " auth-desk-only" : ""}`}
			style={style}
		/>
	);
}

export function AuthShell({
	tone = "#D6EEF8",
	badge,
	eyebrow,
	title,
	lead,
	features,
	children,
}: {
	tone?: string;
	badge?: ReactNode;
	eyebrow?: ReactNode;
	title: ReactNode;
	lead?: ReactNode;
	features?: AuthFeature[];
	/** Kartu aksi (form masuk / tombol buka). */
	children: ReactNode;
}) {
	// Desktop: fitur di panel kiri. HP: di bawah kartu aksi, supaya tombol utama
	// langsung terlihat tanpa menggulir.
	const list = (cls: string) =>
		features && features.length > 0 ? (
			<ul className={`auth-features ${cls}`}>
				{features.map((f) => {
					const I = f.icon;
					return (
						<li key={f.title} className="auth-feature">
							<span className="auth-feature-ico" style={{ background: f.tint }}>
								<I aria-hidden size={20} strokeWidth={2} />
							</span>
							<span>
								<b>{f.title}</b>
								<span>{f.body}</span>
							</span>
						</li>
					);
				})}
			</ul>
		) : null;
	return (
		<div className="auth" style={{ "--auth-tone": tone } as CSSProperties}>
			<section className="auth-hero">
				<Circle
					style={{
						right: -80,
						top: -90,
						width: 260,
						height: 260,
						background: "#8EDCCB",
					}}
				/>
				<Circle
					desk
					style={{
						left: -50,
						bottom: 40,
						width: 150,
						height: 150,
						background: "#FCE3C6",
					}}
				/>
				<Circle
					style={{
						right: 60,
						bottom: 120,
						width: 44,
						height: 44,
						background: "#CEC8F6",
					}}
				/>
				<div className="auth-hero-in">
					<a href="/akun" aria-label="Tetra">
						{/* biome-ignore lint/performance/noImgElement: logo statis kecil. */}
						<img
							src="/portal/tetra-logo.png"
							alt="tetra"
							className="auth-logo"
						/>
					</a>
					<div className="auth-copy">
						{badge}
						{eyebrow && <p className="auth-eyebrow">{eyebrow}</p>}
						<h1 className="auth-title">{title}</h1>
						{lead && <p className="auth-lead">{lead}</p>}
					</div>
					{list("auth-feat-desk")}
				</div>
			</section>
			<section className="auth-side">
				<div className="auth-card">{children}</div>
				{list("auth-feat-mob")}
			</section>
		</div>
	);
}
