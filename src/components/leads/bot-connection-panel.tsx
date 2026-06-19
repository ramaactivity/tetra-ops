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
import { Badge } from "@/components/ui/badge";
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
	dot: string;
	badge: "success" | "warning" | "danger" | "neutral";
	icon: typeof Wifi;
};

const STATUS_META: Record<string, StatusMeta> = {
	open: { label: "Tersambung", dot: "bg-emerald-500", badge: "success", icon: Wifi },
	connecting: {
		label: "Menyambung…",
		dot: "bg-amber-500 animate-pulse",
		badge: "warning",
		icon: Loader2,
	},
	close: { label: "Terputus", dot: "bg-rose-500", badge: "danger", icon: WifiOff },
	logged_out: {
		label: "Logout — perlu scan QR",
		dot: "bg-rose-500",
		badge: "danger",
		icon: WifiOff,
	},
	unknown: {
		label: "Belum diketahui",
		dot: "bg-muted-foreground/50",
		badge: "neutral",
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
			if (session?.access_token) supabase.realtime.setAuth(session.access_token);

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
		<div className="rounded-2xl border border-border-subtle bg-card p-5 shadow-[var(--shadow-level-2)]">
			{/* Card header — title left, live status badge right */}
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0">
					<h2 className="type-heading text-foreground">Koneksi WhatsApp</h2>
					<p className="type-secondary mt-0.5 leading-snug">
						Status sambungan bot ke WhatsApp. Reconnect, scan QR, atau logout
						tanpa SSH.
					</p>
				</div>
				<Badge variant={meta.badge} className="gap-1.5">
					<StatusIcon
						className={cn(status.connection === "connecting" && "animate-spin")}
						aria-hidden
					/>
					{meta.label}
				</Badge>
			</div>

			{/* Status detail + actions */}
			<div className="mt-4 flex flex-wrap items-center justify-between gap-3">
				<p className="type-secondary inline-flex items-center gap-1.5">
					<span className={cn("size-1.5 rounded-full", meta.dot)} aria-hidden />
					{isOpen
						? "Bot tersambung & siap membalas pesan."
						: status.qr
							? "Scan QR di bawah dari HP Tetra."
							: "Klik Hubungkan untuk memunculkan QR pairing."}
					{lastConnected ? (
						<span className="text-muted-foreground/70">
							· terakhir {lastConnected}
						</span>
					) : null}
				</p>

				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						disabled={pending}
						onClick={() =>
							command("reconnect", "Perintah reconnect dikirim — tunggu QR muncul")
						}
					>
						{isOpen ? (
							<RefreshCw aria-hidden />
						) : (
							<QrCode aria-hidden />
						)}
						{isOpen ? "Reconnect" : "Hubungkan / Scan QR"}
					</Button>
					<Button
						variant="ghost"
						disabled={pending}
						onClick={() => setLogoutOpen(true)}
						className="text-muted-foreground"
					>
						<LogOut aria-hidden />
						Logout
					</Button>
				</div>
			</div>

			{/* QR pairing — shown when the bot publishes a QR string */}
			{status.qr && !isOpen ? (
				<div className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-border-subtle bg-secondary/60 p-5">
					<div className="rounded-xl bg-white p-3 shadow-sm">
						<QRCodeSVG value={status.qr} size={208} level="M" />
					</div>
					<p className="type-secondary max-w-sm text-center leading-relaxed">
						Buka <span className="font-medium text-foreground">WhatsApp</span> di
						HP Tetra →{" "}
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
