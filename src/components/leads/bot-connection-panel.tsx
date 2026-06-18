"use client";

import {
	Loader2,
	LogOut,
	QrCode,
	RefreshCw,
	Wifi,
	WifiOff,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useRef, useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import { sendBotCommand } from "@/lib/actions/bot-control";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export type BotStatus = {
	connection: string;
	qr: string | null;
	last_connected_at: string | null;
};

type StatusMeta = {
	label: string;
	dot: string;
	chip: string;
	icon: typeof Wifi;
};

const STATUS_META: Record<string, StatusMeta> = {
	open: {
		label: "Tersambung",
		dot: "bg-emerald-500",
		chip: "border-emerald-500/30 bg-emerald-300/30 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
		icon: Wifi,
	},
	connecting: {
		label: "Menyambung…",
		dot: "bg-amber-500 animate-pulse",
		chip: "border-amber-500/30 bg-amber-300/30 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
		icon: Loader2,
	},
	close: {
		label: "Terputus",
		dot: "bg-rose-500",
		chip: "border-rose-500/30 bg-rose-300/30 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
		icon: WifiOff,
	},
	logged_out: {
		label: "Logout — perlu scan QR",
		dot: "bg-rose-500",
		chip: "border-rose-500/30 bg-rose-300/30 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
		icon: WifiOff,
	},
	unknown: {
		label: "Belum diketahui",
		dot: "bg-muted-foreground/50",
		chip: "border-border-default text-muted-foreground",
		icon: WifiOff,
	},
};

function formatWhen(iso: string | null): string | null {
	if (!iso) return null;
	return new Date(iso).toLocaleString("id-ID", {
		day: "numeric",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
	});
}

export function BotConnectionPanel({ initial }: { initial: BotStatus }) {
	const [status, setStatus] = useState<BotStatus>(initial);
	const [pending, start] = useTransition();
	const [logoutOpen, setLogoutOpen] = useState(false);
	const supabaseRef = useRef(createClient());

	// Subscribe to bot_status (id=1) so the QR + connection state stream live as
	// the bot publishes them. setAuth() before subscribe → RLS lets us read.
	useEffect(() => {
		const supabase = supabaseRef.current;
		let aborted = false;
		let cleanup: (() => void) | null = null;

		(async () => {
			const {
				data: { session },
			} = await supabase.auth.getSession();
			if (aborted) return;
			if (session?.access_token)
				supabase.realtime.setAuth(session.access_token);

			const channel = supabase
				.channel("bot-status-realtime")
				.on(
					"postgres_changes",
					{ event: "*", schema: "public", table: "bot_status" },
					(payload) => {
						const row = payload.new as Partial<BotStatus> | null;
						if (row && typeof row.connection === "string") {
							setStatus({
								connection: row.connection,
								qr: row.qr ?? null,
								last_connected_at: row.last_connected_at ?? null,
							});
						}
					},
				);
			channel.subscribe();

			const { data: authSub } = supabase.auth.onAuthStateChange((_e, sess) => {
				if (sess?.access_token) supabase.realtime.setAuth(sess.access_token);
			});

			cleanup = () => {
				authSub.subscription.unsubscribe();
				supabase.removeChannel(channel);
			};
		})();

		return () => {
			aborted = true;
			cleanup?.();
		};
	}, []);

	const meta = STATUS_META[status.connection] ?? STATUS_META.unknown;
	const StatusIcon = meta.icon;
	const isOpen = status.connection === "open";
	const lastConnected = formatWhen(status.last_connected_at);

	function command(cmd: "reconnect" | "logout", okMsg: string) {
		start(async () => {
			try {
				await sendBotCommand(cmd);
				toast.success(okMsg);
			} catch (e) {
				toast.error(e instanceof Error ? e.message : "Gagal mengirim perintah");
			}
		});
	}

	return (
		<div className="rounded-[16px] border border-border-subtle bg-card p-4 shadow-[var(--shadow-level-2)] sm:p-5">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-center gap-3">
					<span
						className={cn(
							"inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[13px] font-medium",
							meta.chip,
						)}
					>
						<StatusIcon
							className={cn(
								"size-3.5",
								status.connection === "connecting" && "animate-spin",
							)}
							aria-hidden
						/>
						{meta.label}
					</span>
					{lastConnected ? (
						<span className="text-[12.5px] text-muted-foreground">
							Terakhir tersambung {lastConnected}
						</span>
					) : null}
				</div>

				<div className="flex items-center gap-2">
					<button
						type="button"
						disabled={pending}
						onClick={() =>
							command(
								"reconnect",
								"Perintah reconnect dikirim — tunggu QR muncul",
							)
						}
						className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border-default px-3.5 text-[13px] font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-60"
					>
						{isOpen ? (
							<RefreshCw className="size-3.5" aria-hidden />
						) : (
							<QrCode className="size-3.5" aria-hidden />
						)}
						{isOpen ? "Reconnect" : "Hubungkan / Scan QR"}
					</button>
					<button
						type="button"
						disabled={pending}
						onClick={() => setLogoutOpen(true)}
						className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border-default px-3.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
					>
						<LogOut className="size-3.5" aria-hidden />
						Logout
					</button>
				</div>
			</div>

			{/* QR pairing — shown when the bot publishes a QR string */}
			{status.qr && !isOpen ? (
				<div className="mt-4 flex flex-col items-center gap-3 rounded-[12px] border border-border-subtle bg-surface-2 p-5">
					<div className="rounded-[12px] bg-white p-3 shadow-sm">
						<QRCodeSVG value={status.qr} size={208} level="M" />
					</div>
					<p className="max-w-sm text-center text-[13px] leading-snug text-muted-foreground">
						Buka <span className="font-medium text-foreground">WhatsApp</span>{" "}
						di HP Tetra → <span className="font-medium">Perangkat tertaut</span>{" "}
						→ <span className="font-medium">Tautkan perangkat</span>, lalu scan
						QR ini. QR berganti otomatis tiap beberapa detik.
					</p>
				</div>
			) : null}

			{isOpen ? (
				<p className="mt-3 text-[13px] text-muted-foreground">
					Bot tersambung & siap membalas pesan. ✅
				</p>
			) : !status.qr ? (
				<p className="mt-3 text-[13px] text-muted-foreground">
					Klik <span className="font-medium">Hubungkan / Scan QR</span> untuk
					memunculkan QR pairing dari bot.
				</p>
			) : null}

			<ConfirmDialog
				open={logoutOpen}
				onOpenChange={setLogoutOpen}
				title="Logout bot WhatsApp?"
				description="Sesi WhatsApp akan diputus. Untuk menyambung lagi (atau ganti nomor) kamu perlu scan QR ulang dari HP."
				confirmLabel="Logout"
				variant="destructive"
				onConfirm={async () => {
					try {
						await sendBotCommand("logout");
						toast.success("Perintah logout dikirim");
					} catch (e) {
						toast.error(e instanceof Error ? e.message : "Gagal logout");
						throw e;
					}
				}}
			/>
		</div>
	);
}
