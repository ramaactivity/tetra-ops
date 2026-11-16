import {
	AlertTriangle,
	BellOff,
	CheckCircle2,
	ChevronRight,
	Info,
} from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import {
	DismissButton,
	MarkAllReadButton,
	MarkReadButton,
} from "@/components/notifications/notification-row-actions";
import { RunScannerButton } from "@/components/notifications/run-scanner-button";
import { PushPrompt } from "@/components/push/push-prompt";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUser } from "@/lib/auth/get-user";
import { timeAgo } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

type Severity = "alert" | "warning" | "info" | "success";
type Category = "operational" | "financial" | "inventory" | "system";

/** Warna ikon = tingkat penting; tidak ada badge teks tambahan. */
const SEVERITY_TONES: Record<
	Severity,
	{ cls: string; icon: typeof Info; label: string }
> = {
	alert: {
		cls: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
		icon: AlertTriangle,
		label: "Penting",
	},
	warning: {
		cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
		icon: AlertTriangle,
		label: "Perlu dicek",
	},
	info: {
		cls: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
		icon: Info,
		label: "Info",
	},
	success: {
		cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
		icon: CheckCircle2,
		label: "Beres",
	},
};

const CATEGORY_LABELS: Record<Category, string> = {
	operational: "Operasional",
	financial: "Keuangan",
	inventory: "Stok",
	system: "Sistem",
};

type NotifRow = {
	id: string;
	severity: Severity;
	category: Category;
	title: string;
	body: string;
	action_url: string | null;
	is_read: boolean;
	is_resolved: boolean;
	created_at: string;
};

const CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[];

export default async function NotificationsPage({
	searchParams,
}: {
	searchParams: Promise<{ category?: string; show?: string }>;
}) {
	const me = await getCurrentUser();
	if (!me) return null;
	const params = await searchParams;
	const cat = (
		CATEGORIES.includes(params.category as Category) ? params.category : ""
	) as Category | "";
	const showAll = params.show === "all";

	const supabase = await createClient();
	// Notifikasi kedaluwarsa (expires_at lewat) disembunyikan; yang tanpa
	// expires_at tetap tampil.
	const nowIso = new Date().toISOString();
	const active = () =>
		supabase
			.from("notifications")
			.select("category", { count: "exact" })
			.eq("user_id", me.profile.id)
			.eq("is_dismissed", false)
			.or(`expires_at.is.null,expires_at.gt.${nowIso}`);

	let query = supabase
		.from("notifications")
		.select(
			"id, severity, category, title, body, action_url, is_read, is_resolved, created_at",
		)
		.eq("user_id", me.profile.id)
		.eq("is_dismissed", false)
		.or(`expires_at.is.null,expires_at.gt.${nowIso}`)
		.order("created_at", { ascending: false })
		.limit(200);
	if (!showAll) query = query.eq("is_read", false);
	if (cat) query = query.eq("category", cat);

	const [{ data, error }, unread, all] = await Promise.all([
		query,
		// Kategori yang belum dibaca → angka di chip filter (global, tidak ikut filter).
		active().eq("is_read", false).limit(1000),
		// Total aktif — membedakan akun baru ("belum ada") dari "semua sudah dibaca".
		active().limit(1),
	]);

	if (error) {
		return (
			<Container size="xl">
				<p className="border-destructive bg-destructive/10 text-destructive rounded-2xl border p-4 text-sm">
					{error.message}
				</p>
			</Container>
		);
	}

	const rows = (data ?? []) as NotifRow[];
	const totalUnread = unread.count ?? 0;
	const totalAll = all.count ?? 0;
	const catCount = new Map<string, number>();
	for (const r of (unread.data ?? []) as Array<{ category: string }>)
		catCount.set(r.category, (catCount.get(r.category) ?? 0) + 1);
	const show = showAll ? "all" : "";

	return (
		<Container size="xl" className="space-y-3 md:space-y-3">
			<SectionHeader
				title="Notifikasi"
				actions={
					<>
						<RunScannerButton />
						<MarkAllReadButton disabled={totalUnread === 0} />
					</>
				}
			/>

			{/* Satu baris filter: status + kategori (angka = belum dibaca). */}
			<div className="hide-scrollbar -mx-3 flex items-center gap-2 overflow-x-auto px-3 sm:mx-0 sm:px-0 [&>*]:shrink-0">
				<div className="bg-secondary inline-flex items-center rounded-full p-0.5">
					<Pill
						href={buildQs({ show: "", category: cat })}
						active={!showAll}
						label="Belum dibaca"
						count={totalUnread}
					/>
					<Pill
						href={buildQs({ show: "all", category: cat })}
						active={showAll}
						label="Semua"
					/>
				</div>
				<span aria-hidden className="bg-border-default h-5 w-px" />
				<Pill
					href={buildQs({ show })}
					active={cat === ""}
					label="Semua kategori"
					outline
				/>
				{CATEGORIES.map((c) => (
					<Pill
						key={c}
						href={buildQs({ show, category: c })}
						active={cat === c}
						label={CATEGORY_LABELS[c]}
						count={catCount.get(c)}
						outline
					/>
				))}
			</div>

			{rows.length === 0 ? (
				totalAll === 0 ? (
					// Akun baru (sering di HP owner kedua): scanner belum pernah membuat
					// notifikasi untuk user ini → tawarkan cek langsung.
					<EmptyState
						icon={BellOff}
						title="Belum ada notifikasi"
						description="Pengingat acara, stok, dan keuangan bakal masuk ke sini. Cek sekarang untuk lihat kondisi terkini."
						action={<RunScannerButton />}
					/>
				) : cat ? (
					<EmptyState
						icon={BellOff}
						title={`Tidak ada notifikasi ${CATEGORY_LABELS[cat].toLowerCase()}`}
						action={
							<ResetLink href={buildQs({ show })} label="Semua kategori" />
						}
					/>
				) : (
					<EmptyState
						icon={CheckCircle2}
						title="Semua sudah dibaca"
						action={
							<ResetLink href={buildQs({ show: "all" })} label="Lihat semua" />
						}
					/>
				)
			) : (
				<ul className="border-border-subtle bg-card divide-border-subtle divide-y overflow-hidden rounded-2xl border shadow-[var(--shadow-level-1)]">
					{rows.map((n) => (
						<NotificationItem key={n.id} n={n} />
					))}
				</ul>
			)}

			{/* Ajakan nyalakan pemberitahuan HP — popup kecil yang bisa ditutup. */}
			<PushPrompt
				vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null}
			/>
		</Container>
	);
}

function ResetLink({
	href,
	label = "Reset filter",
}: {
	href: string;
	label?: string;
}) {
	return (
		<Link
			href={href}
			className="border-border-default bg-card text-foreground hover:bg-secondary inline-flex h-9 items-center rounded-full border px-4 text-[13px] font-medium transition-colors"
		>
			{label}
		</Link>
	);
}

function NotificationItem({ n }: { n: NotifRow }) {
	const tone = SEVERITY_TONES[n.severity];
	const Icon = tone.icon;
	// Yang sudah beres tidak perlu warna peringatan lagi.
	const iconCls = n.is_resolved
		? "bg-secondary text-muted-foreground"
		: tone.cls;
	// Grid: HP → judul & isi selebar baris, tombol pindah ke baris meta;
	// layar lebar → tombol di kolom kanan.
	return (
		<li className="grid grid-cols-[2rem_minmax(0,1fr)_auto] gap-x-3 px-4 py-3">
			<span
				title={tone.label}
				className={`col-start-1 row-span-3 row-start-1 mt-0.5 grid size-8 place-items-center rounded-full ${iconCls}`}
			>
				<Icon className="size-4" aria-label={tone.label} />
			</span>
			<p
				className={`col-span-2 col-start-2 row-start-1 text-sm leading-snug sm:col-span-1 ${
					n.is_read
						? "text-foreground/70 font-medium"
						: "text-foreground font-semibold"
				}`}
			>
				{n.title}
			</p>
			<p className="text-muted-foreground col-span-2 col-start-2 row-start-2 mt-0.5 line-clamp-2 text-[13px] leading-relaxed sm:col-span-1">
				{n.body}
			</p>
			<p className="text-muted-foreground/80 col-start-2 row-start-3 mt-1 flex flex-wrap items-center gap-x-1.5 self-center text-xs">
				<span>{CATEGORY_LABELS[n.category]}</span>
				<span aria-hidden>·</span>
				<span>{timeAgo(n.created_at)}</span>
				{n.is_resolved && (
					<>
						<span aria-hidden>·</span>
						<span className="text-emerald-600 dark:text-emerald-400">
							Sudah beres
						</span>
					</>
				)}
				{n.action_url && (
					<Link
						href={n.action_url}
						className="text-primary ml-1 inline-flex items-center gap-0.5 font-medium hover:underline"
					>
						Buka
						<ChevronRight className="size-3" />
					</Link>
				)}
			</p>
			<div className="col-start-3 row-start-3 -mr-1.5 flex items-center gap-0.5 self-center sm:row-span-3 sm:row-start-1 sm:self-start">
				{!n.is_read && <MarkReadButton id={n.id} />}
				<DismissButton id={n.id} />
			</div>
		</li>
	);
}

function buildQs(updates: Record<string, string>): string {
	const params = new URLSearchParams();
	for (const [k, v] of Object.entries(updates)) {
		if (v) params.set(k, v);
	}
	const qs = params.toString();
	return qs ? `/notifications?${qs}` : "/notifications";
}

function Pill({
	href,
	label,
	active,
	count,
	outline = false,
}: {
	href: string;
	label: string;
	active: boolean;
	count?: number;
	/** Chip berbingkai (kategori) vs segmen di dalam track abu (status). */
	outline?: boolean;
}) {
	const tone = active
		? "bg-[#059669] text-white border-[#059669]"
		: outline
			? "border-border-default bg-card text-foreground/75 hover:bg-secondary hover:text-foreground"
			: "border-transparent text-muted-foreground hover:text-foreground";
	return (
		<Link
			href={href}
			aria-current={active ? "true" : undefined}
			className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors ${tone}`}
		>
			{label}
			{count ? (
				<span
					className={`tabular text-xs ${active ? "text-white/85" : "text-muted-foreground"}`}
				>
					{count}
				</span>
			) : null}
		</Link>
	);
}
