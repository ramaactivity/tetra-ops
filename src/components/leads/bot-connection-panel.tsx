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
import { Button } from "@/components/ui/button";
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
	/** Dot color shown on the translucent hero badge. */
	dot: string;
	icon: typeof Wifi;
};

const STATUS_META: Record<string, StatusMeta> = {
	open: { label: "Tersambung", dot: "bg-white", icon: Wifi },
	connecting: {
		label: "Menyambung…",
		dot: "bg-amber-300 animate-pulse",
		icon: Loader2,
	},
	close: { label: "Terputus", dot: "bg-rose-300", icon: WifiOff },
	logged_out: { label: "Perlu scan QR", dot: "bg-rose-300", icon: WifiOff },
	unknown: { label: "Belum diketahui", dot: "bg-white/50", icon: WifiOff },
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

export function BotConnectionHero({ initial }: { initial: BotStatus }) {
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

	const helper = isOpen
		? "Bot tersambung & siap membalas pesan."
		: status.qr
			? "Scan QR di bawah dari HP Tetra."
			: "Klik Hubungkan untuk memunculkan QR pairing dari bot.";

	return (
		<div className="space-y-3">
			{/* === GREEN HERO === identity + live connection status */}
			<section className="overflow-hidden rounded-[20px] bg-[#059669] p-5 text-white shadow-[var(--shadow-level-3)] sm:p-6">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">
							Kontrol Bot
						</p>
						<h1 className="mt-1.5 text-[26px] font-bold leading-[1.1] tracking-[-0.02em] sm:text-[32px]">
							Setting Bot WhatsApp
						</h1>
						<p className="mt-2 max-w-xl text-[13px] leading-relaxed text-white/75">
							Kontrol bot Tetra Photobooth tanpa SSH. Perubahan dibaca bot dalam
							±1 menit.
						</p>
					</div>
					<span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[12.5px] font-semibold text-white backdrop-blur-sm">
						<StatusIcon
							className={cn(
								"size-3.5",
								status.connection === "connecting" && "animate-spin",
							)}
							aria-hidden
						/>
						{meta.label}
					</span>
				</div>
			</section>

			{/* === ACTION TOOLBAR === sits on the page, below the hero (Operations
			    pattern). Helper text on the left, controls on the right. */}
			<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
				<p className="type-secondary flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-0.5">
					<span
						className={cn(
							"size-1.5 shrink-0 rounded-full",
							isOpen
								? "bg-emerald-500"
								: status.connection === "connecting"
									? "bg-amber-500"
									: "bg-rose-500",
						)}
						aria-hidden
					/>
					<span>{helper}</span>
					{lastConnected ? (
						<span className="text-muted-foreground/70">
							· terakhir {lastConnected}
						</span>
					) : null}
				</p>

				<div className="flex items-center gap-2 sm:ml-auto">
					<Button
						variant="outline"
						className="h-9"
						disabled={pending}
						onClick={() =>
							command(
								"reconnect",
								"Perintah reconnect dikirim — tunggu QR muncul",
							)
						}
					>
						{isOpen ? <RefreshCw aria-hidden /> : <QrCode aria-hidden />}
						{isOpen ? "Reconnect" : "Hubungkan / Scan QR"}
					</Button>
					<Button
						variant="ghost"
						className="h-9 text-muted-foreground"
						disabled={pending}
						onClick={() => setLogoutOpen(true)}
					>
						<LogOut aria-hidden />
						Logout
					</Button>
				</div>
			</div>

			{/* QR pairing — shown when the bot publishes a QR string */}
			{status.qr && !isOpen ? (
				<div className="flex flex-col items-center gap-3 rounded-2xl border border-border-subtle bg-card p-6 shadow-[var(--shadow-level-2)]">
					<div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-border-subtle">
						<QRCodeSVG value={status.qr} size={208} level="M" />
					</div>
					<p className="type-secondary max-w-sm text-center leading-relaxed">
						Buka <span className="font-medium text-foreground">WhatsApp</span>{" "}
						di HP Tetra →{" "}
						<span className="font-medium text-foreground">
							Perangkat tertaut
						</span>{" "}
						→{" "}
						<span className="font-medium text-foreground">
							Tautkan perangkat
						</span>
						, lalu scan QR ini. QR berganti otomatis tiap beberapa detik.
					</p>
				</div>
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
