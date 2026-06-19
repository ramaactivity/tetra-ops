"use client";

import { AlertTriangle, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { reportBotHealth } from "@/lib/actions/bot-health-alert";
import { type BotHealthInput, botHealth } from "@/lib/bot-health";
import { createClient } from "@/lib/supabase/client";

/**
 * <BotDownBanner /> — app-wide red banner shown to owners when the WhatsApp bot
 * is unhealthy (heartbeat stale or WA link down). Mounted in the owner layout.
 *
 * Detection is two-pronged because Supabase Realtime can't fire when the bot
 * PROCESS is dead: (1) realtime on bot_status catches connection changes
 * instantly; (2) a 60s timer re-reads the row and re-evaluates staleness so a
 * silent death surfaces within ~5 min. On every health transition it pings
 * reportBotHealth() (server-deduped) to fan out the in-app notif + web push.
 */
export function BotDownBanner({ initial }: { initial: BotHealthInput }) {
	const [status, setStatus] = useState<BotHealthInput>(initial);
	const [now, setNow] = useState(() => Date.now());
	const supabaseRef = useRef(createClient());
	const lastReportedOk = useRef<boolean | null>(null);

	const health = useMemo(() => botHealth(status, now), [status, now]);

	// Realtime: instant connection-change updates.
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
				.channel("bot-status-health")
				.on(
					"postgres_changes",
					{ event: "*", schema: "public", table: "bot_status" },
					(payload) => {
						const row = payload.new as Partial<BotHealthInput> | null;
						if (row && typeof row.connection === "string") {
							setStatus({
								connection: row.connection,
								updated_at: row.updated_at ?? null,
							});
							setNow(Date.now());
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

	// 60s timer: advance `now` (so staleness trips even with no new events) and
	// re-read the row in case a realtime event was missed.
	useEffect(() => {
		const supabase = supabaseRef.current;
		const tick = async () => {
			setNow(Date.now());
			const { data } = await supabase
				.from("bot_status")
				.select("connection, updated_at")
				.eq("id", 1)
				.maybeSingle();
			if (data) {
				setStatus({ connection: data.connection, updated_at: data.updated_at });
			}
		};
		const t = setInterval(tick, 60_000);
		return () => clearInterval(t);
	}, []);

	// On every health transition (and on mount), let the server fan out / clear
	// the alert. Server dedups, so a redundant call is harmless.
	useEffect(() => {
		if (lastReportedOk.current === health.ok) return;
		lastReportedOk.current = health.ok;
		void reportBotHealth();
	}, [health.ok]);

	if (health.ok) return null;

	return (
		<div
			role="alert"
			className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-rose-300 bg-rose-100 px-4 py-3 text-rose-900 shadow-[var(--shadow-level-2)] dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-100"
		>
			<AlertTriangle className="size-5 shrink-0" aria-hidden />
			<div className="min-w-0 flex-1">
				<p className="text-[13.5px] font-semibold leading-tight">
					Bot WhatsApp tidak aktif
				</p>
				<p className="text-[12.5px] leading-snug text-rose-900/80 dark:text-rose-100/80">
					{health.reason} Chat customer tidak terbalas sampai bot pulih.
				</p>
			</div>
			<Link
				href="/leads/settings"
				className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-rose-600 px-4 text-[13px] font-medium text-white transition-colors hover:bg-rose-700"
			>
				Buka Setting Bot
				<ArrowRight className="size-3.5" aria-hidden />
			</Link>
		</div>
	);
}
