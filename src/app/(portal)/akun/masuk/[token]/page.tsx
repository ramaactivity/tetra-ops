import {
	Briefcase,
	CalendarCheck,
	Images,
	Palette,
	Receipt,
	UserPlus,
} from "lucide-react";
import { AcceptInviteButton } from "@/components/portal/accept-invite";
import {
	type AuthFeature,
	AuthShell,
} from "@/components/portal/dash/auth-shell";
import { getPortalPerson } from "@/lib/portal/auth";
import { type InviteView, readInvite } from "@/lib/portal/invite-link";

export const dynamic = "force-dynamic";
export const metadata = { title: "Undangan dashboard" };

const mask = (p: string) =>
	`+${p.slice(0, 2)} ${p.slice(2, 5)}-••••-${p.slice(-4)}`;

const EVENT_FEATURES: AuthFeature[] = [
	{
		icon: CalendarCheck,
		tint: "#D6F1EA",
		title: "Lengkapi data acara",
		body: "Lokasi, PIC di lapangan, susunan acara, akun Instagram.",
	},
	{
		icon: Palette,
		tint: "#CEC8F6",
		title: "Pilih & setujui desain frame",
		body: "Pilih template atau ceritakan desain yang kamu mau.",
	},
	{
		icon: Images,
		tint: "#FCE3C6",
		title: "Galeri foto",
		body: "Lihat dan unduh foto booth setelah acara.",
	},
];

function copy(v: InviteView) {
	const c = v.context;
	if (v.kind === "vendor")
		return {
			tone: "#FFF0C2",
			badge: `Dasbor rekanan${c.role_label ? ` · ${c.role_label}` : ""}`,
			title: `Dasbor rekanan ${c.vendor_name ?? "kamu"}`,
			lead: `${c.events ? `Semua ${c.events} acara` : "Semua acara"} klien ${c.vendor_name ?? "kamu"} yang memakai Tetra Photobooth, di satu tempat.`,
			features: [
				{
					icon: Briefcase,
					tint: "#F8D98B",
					title: "Status & yang perlu ditindaklanjuti",
					body: "Jadwal tiap acara, data yang kurang, desain yang belum disetujui.",
				},
				{
					icon: Receipt,
					tint: "#FCE3C6",
					title: "Tagihan & komisi",
					body: "Sisa tagihan ke Tetra dan rekap komisi per acara.",
				},
				{
					icon: UserPlus,
					tint: "#D6F1EA",
					title: "Undang klien kamu",
					body: "Klien mengisi data & memilih desain sendiri — harga tetap urusanmu.",
				},
			] as AuthFeature[],
			cta: "Buka dasbor rekanan",
		};
	return {
		tone: "#D6EEF8",
		badge:
			v.kind === "klien"
				? "Dashboard acara"
				: `Diundang${c.role_label ? ` sebagai ${c.role_label}` : ""}`,
		title: c.title || "Dashboard acaramu",
		lead:
			v.kind === "klien"
				? `${c.invited_by ?? "Tetra Photobooth"} membuka dashboard acaramu di Tetra Photobooth.`
				: `${c.invited_by ?? "Pemesan"} mengajakmu ikut mengurus acara ini di Tetra Photobooth.`,
		features: EVENT_FEATURES,
		cta: "Buka dashboard acara",
	};
}

export default async function InvitePage({
	params,
}: {
	params: Promise<{ token: string }>;
}) {
	const { token } = await params;
	const v = await readInvite(token);
	const me = await getPortalPerson();

	if (!v || v.expired)
		return (
			<AuthShell
				tone="#F7D5CC"
				eyebrow="Undangan dashboard Tetra"
				title={
					v?.expired
						? "Link undangan sudah kedaluwarsa"
						: "Link undangan tidak dikenali"
				}
				lead="Tidak apa-apa — kamu tetap bisa masuk pakai nomor WhatsApp yang diundang. Tanpa password."
			>
				{v && (
					<div className="auth-person">
						<span className="auth-avatar">{(v.person.name ?? "?")[0]}</span>
						<span style={{ display: "grid", gap: 2 }}>
							<b style={{ fontSize: 15 }}>{v.person.name ?? "Kamu"}</b>
							<span className="mono" style={{ fontSize: 12, color: "#5F5E5A" }}>
								{mask(v.person.phone)}
							</span>
						</span>
					</div>
				)}
				<a href="/akun" className="btn btn-primary btn-block">
					Masuk pakai WhatsApp →
				</a>
			</AuthShell>
		);

	const c = copy(v);
	const first = v.person.name?.split(" ")[0];
	return (
		<AuthShell
			tone={c.tone}
			badge={
				<span className="pill" style={{ background: "#fff" }}>
					{c.badge}
				</span>
			}
			eyebrow={`Halo${first ? `, ${first}` : ""}! 👋`}
			title={c.title}
			lead={c.lead}
			features={c.features}
		>
			<div style={{ display: "grid", gap: 6 }}>
				<h2
					style={{
						margin: 0,
						fontSize: 22,
						fontWeight: 800,
						letterSpacing: "-0.02em",
					}}
				>
					Undangan untukmu
				</h2>
				<p
					style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: "#3A3936" }}
				>
					Satu ketuk langsung masuk — tanpa password, tanpa kode.
				</p>
			</div>
			<div className="auth-person">
				<span className="auth-avatar">{(v.person.name ?? "?")[0]}</span>
				<span style={{ display: "grid", gap: 2, minWidth: 0 }}>
					<b style={{ fontSize: 15 }}>{v.person.name ?? "Kamu"}</b>
					<span className="mono" style={{ fontSize: 12, color: "#5F5E5A" }}>
						{mask(v.person.phone)}
					</span>
					<span style={{ fontSize: 12, fontWeight: 600, color: "#5F5E5A" }}>
						{c.badge}
					</span>
				</span>
			</div>
			<AcceptInviteButton token={token} label={c.cta} />
			{me && me.id !== v.person.id && (
				<p className="auth-help">
					Kamu sedang masuk sebagai {me.name ?? `+${me.phone}`}. Membuka
					undangan ini akan mengganti akun.
				</p>
			)}
			<p className="auth-help">
				Lain kali cukup buka <b>booking.tetraphoto.com/akun</b> dan masuk pakai
				nomor WhatsApp ini.
			</p>
		</AuthShell>
	);
}
