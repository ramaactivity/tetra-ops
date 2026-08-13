import {
	AlertTriangle,
	BellOff,
	CheckCircle2,
	ChevronRight,
	Info,
} from "lucide-react";
import Link from "next/link";
import {
	DismissButton,
	MarkAllReadButton,
	MarkReadButton,
} from "@/components/notifications/notification-row-actions";
import { PushPrompt } from "@/components/push/push-prompt";
import { AppHeader, AppScreen } from "@/components/ui/mobile";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

/**
 * Inbox notifikasi versi crew.
 *
 * Sebelumnya lonceng di topbar crew menunjuk ke /notifications — rute milik
 * grup (owner) — jadi crew ditendang balik ke /crew dan kabar "rekap kamu
 * di-approve / minta revisi" tidak pernah terbaca (49 baris menumpuk di DB).
 * Halaman ini memakai baris aksi yang sama dengan inbox owner, tapi bentuknya
 * kartu mobile seperti sisa aplikasi crew.
 */

type Severity = "alert" | "warning" | "info" | "success";

const TONES: Record<
	Severity,
	{ chip: string; icon: typeof Info; ring: string }
> = {
	alert: {
		chip: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
		icon: AlertTriangle,
		ring: "border-rose-300/60 dark:border-rose-900/70",
	},
	warning: {
		chip: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
		icon: AlertTriangle,
		ring: "border-amber-300/60 dark:border-amber-900/70",
	},
	info: {
		chip: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
		icon: Info,
		ring: "border-border-default",
	},
	success: {
		chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
		icon: CheckCircle2,
		ring: "border-emerald-300/60 dark:border-emerald-900/70",
	},
};

const RELATIVE = new Intl.RelativeTimeFormat("id-ID", { numeric: "auto" });

function timeAgo(iso: string): string {
	const diffMs = Date.parse(iso) - Date.now();
	const mins = Math.round(diffMs / 60000);
	if (Math.abs(mins) < 60) return RELATIVE.format(mins, "minute");
	const hours = Math.round(mins / 60);
	if (Math.abs(hours) < 24) return RELATIVE.format(hours, "hour");
	return RELATIVE.format(Math.round(hours / 24), "day");
}

export default async function CrewNotificationsPage() {
	const me = await getCurrentUser();
	if (!me) return null;

	const supabase = await createClient();
	const nowIso = new Date().toISOString();

	// RLS notifications = self-only, jadi tidak perlu filter user_id manual;
	// tetap ditulis eksplisit supaya maksudnya terbaca.
	const { data } = await supabase
		.from("notifications")
		.select(
			"id, severity, category, title, body, action_url, is_read, created_at",
		)
		.eq("user_id", me.profile.id)
		.eq("is_dismissed", false)
		.or(`expires_at.is.null,expires_at.gt.${nowIso}`)
		.order("created_at", { ascending: false })
		.limit(50);

	const rows = (data ?? []) as Array<{
		id: string;
		severity: Severity;
		category: string;
		title: string;
		body: string | null;
		action_url: string | null;
		is_read: boolean;
		created_at: string;
	}>;
	const unread = rows.filter((r) => !r.is_read).length;

	return (
		<AppScreen>
			<AppHeader
				title="Notifikasi"
				subtitle={
					unread > 0 ? `${unread} belum dibaca` : "Semua sudah kebaca 👌"
				}
			/>

			{unread > 0 && (
				<div className="mt-3 flex justify-end">
					<MarkAllReadButton />
				</div>
			)}

			{rows.length === 0 ? (
				<div className="mt-4 rounded-[16px] border border-dashed border-border-default bg-card/40 px-5 py-10 text-center">
					<BellOff className="mx-auto mb-2.5 size-7 text-muted-foreground/50" />
					<p className="type-body-strong">Belum ada notifikasi</p>
					<p className="type-secondary mx-auto mt-1 max-w-[18rem]">
						Kabar soal rekap (di-approve / minta revisi) dan jadwal baru bakal
						muncul di sini.
					</p>
				</div>
			) : (
				<ul className="mt-4 space-y-2.5">
					{rows.map((n) => {
						const tone = TONES[n.severity] ?? TONES.info;
						const Icon = tone.icon;
						const inner = (
							<>
								<span
									className={cn(
										"grid size-8 shrink-0 place-items-center rounded-full",
										tone.chip,
									)}
								>
									<Icon className="size-4" />
								</span>
								<div className="min-w-0 flex-1">
									<p
										className={cn(
											"type-body-strong",
											n.is_read && "text-muted-foreground",
										)}
									>
										{n.title}
									</p>
									{n.body && (
										<p className="type-secondary mt-0.5 line-clamp-3">
											{n.body}
										</p>
									)}
									<p className="type-caption mt-1">{timeAgo(n.created_at)}</p>
								</div>
								{n.action_url && (
									<ChevronRight className="size-4 shrink-0 self-center text-muted-foreground/50" />
								)}
							</>
						);
						// Aksi (tandai dibaca / hapus) SENGAJA di luar tautan: anchor di
						// dalam anchor itu HTML ilegal, dan tombol di dalam link bikin tap
						// nyasar membuka halaman.
						return (
							<li
								key={n.id}
								className={cn(
									"overflow-hidden rounded-[16px] border bg-card shadow-[var(--shadow-level-2)]",
									tone.ring,
									!n.is_read && "ring-1 ring-primary/15",
								)}
							>
								{crewHref(n.action_url) ? (
									<Link
										href={crewHref(n.action_url) as string}
										className="press tap flex items-start gap-3 p-3.5 transition-colors active:bg-surface-3"
									>
										{inner}
									</Link>
								) : (
									<div className="flex items-start gap-3 p-3.5">{inner}</div>
								)}
								<div className="flex items-center justify-end gap-1 border-t border-border-subtle px-2 py-1">
									{!n.is_read && <MarkReadButton id={n.id} />}
									<DismissButton id={n.id} />
								</div>
							</li>
						);
					})}
				</ul>
			)}

			<PushPrompt
				vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null}
			/>
		</AppScreen>
	);
}

/**
 * action_url notifikasi ditulis untuk owner (mis. `/operations/PRJ-x/rekap`).
 * Crew tidak punya rute itu — dipetakan ke padanannya, dan kalau tidak ada
 * padanan, kartunya tidak dijadikan tautan sama sekali (lebih baik mati suri
 * daripada memantulkan crew ke halaman yang tidak boleh ia buka).
 */
function crewHref(actionUrl: string | null): string | null {
	if (!actionUrl) return null;
	if (actionUrl.startsWith("/crew")) return actionUrl;
	const m = actionUrl.match(/^\/operations\/([^/?#]+)/);
	if (m) {
		return actionUrl.includes("/rekap")
			? `/crew/jadwal/${m[1]}/rekap`
			: `/crew/jadwal/${m[1]}`;
	}
	return null;
}
