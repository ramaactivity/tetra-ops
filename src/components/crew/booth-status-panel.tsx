"use client";

import {
	AlertTriangle,
	Camera,
	CloudUpload,
	Laptop,
	Printer,
	RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { BoothStatus } from "@/lib/booth-sync";
import { cn } from "@/lib/utils";

type Unit = { unit: number; booths: BoothStatus[] };
type Payload = { available: boolean; units: Unit[]; at?: number };

const POLL_MS = 20_000;

/** "baru saja" / "3 mnt lalu" / "2 jam lalu". */
function ago(iso: string | null): string {
	if (!iso) return "belum pernah online";
	const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
	if (min < 1) return "baru saja";
	if (min < 60) return `${min} mnt lalu`;
	return `${Math.round(min / 60)} jam lalu`;
}

/**
 * Tetra Assistant di halaman crew (Booth #264): status laptop booth per unit
 * di hari acara — online, sisa kertas, cetak gagal, kamera, upload tertunda.
 * Masalah ditulis Booth sebagai kalimat siap tampil (`issues`).
 */
export function BoothStatusPanel({
	projectId,
	mySpot,
	unitCount,
}: {
	projectId: string;
	/** Unit tempat crew ini bertugas — ditandai "unit kamu". */
	mySpot: number;
	unitCount: number;
}) {
	const [data, setData] = useState<Payload | null>(null);
	const [loading, setLoading] = useState(false);

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const res = await fetch(
				`/api/crew/booth-status/${encodeURIComponent(projectId)}`,
				{ cache: "no-store" },
			);
			if (res.ok) setData((await res.json()) as Payload);
		} finally {
			setLoading(false);
		}
	}, [projectId]);

	useEffect(() => {
		load();
		// Hanya saat tab terlihat — HP crew di saku tidak terus menarik data.
		const id = setInterval(() => {
			if (document.visibilityState === "visible") load();
		}, POLL_MS);
		const onShow = () => document.visibilityState === "visible" && load();
		document.addEventListener("visibilitychange", onShow);
		return () => {
			clearInterval(id);
			document.removeEventListener("visibilitychange", onShow);
		};
	}, [load]);

	const units = data?.units ?? [];
	const totalIssues = units.reduce(
		(n, u) =>
			n +
			u.booths.reduce((m, b) => m + b.issues.length + (b.online ? 0 : 1), 0),
		0,
	);

	return (
		<section className="space-y-3 rounded-[16px] border border-border-default bg-card p-4 shadow-[var(--shadow-level-2)]">
			<h2 className="eyebrow flex items-center justify-between">
				<span className="flex items-center gap-1.5">
					<Laptop className="h-3.5 w-3.5" />
					Status booth
				</span>
				<button
					type="button"
					onClick={load}
					disabled={loading}
					className="flex items-center gap-1 text-[11px] font-medium normal-case tracking-normal text-muted-foreground hover:text-foreground disabled:opacity-60"
					aria-label="Muat ulang status booth"
				>
					<RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
					{data?.at
						? new Date(data.at).toLocaleTimeString("id-ID", {
								hour: "2-digit",
								minute: "2-digit",
							})
						: "…"}
				</button>
			</h2>

			{!data ? (
				<p className="type-secondary">Mengecek laptop booth…</p>
			) : !data.available ? (
				<p className="type-secondary">
					Status booth belum bisa dibaca dari Tetra Booth. Cek langsung di
					laptop, atau buka booth.tetraphoto.com/admin/assistant.
				</p>
			) : units.every((u) => u.booths.length === 0) ? (
				<p className="type-secondary">
					Belum ada laptop yang membuka acara ini di aplikasi booth.
				</p>
			) : (
				<>
					{totalIssues === 0 ? (
						<p className="text-[13px] font-medium text-emerald-700 dark:text-emerald-400">
							Semua booth aman.
						</p>
					) : null}
					{units.map((u) => (
						<div key={u.unit} className="space-y-2">
							{unitCount > 1 ? (
								<p className="text-[12px] font-semibold text-foreground">
									Unit {u.unit}
									{u.unit === mySpot ? (
										<span className="ml-1.5 font-normal text-muted-foreground">
											· unit kamu
										</span>
									) : null}
								</p>
							) : null}
							{u.booths.length === 0 ? (
								<p className="type-secondary">Belum ada laptop di unit ini.</p>
							) : (
								u.booths.map((b) => <BoothCard key={b.code} b={b} />)
							)}
						</div>
					))}
				</>
			)}
		</section>
	);
}

function BoothCard({ b }: { b: BoothStatus }) {
	const issues = b.online ? b.issues : ["Booth offline", ...b.issues];
	const uniqueIssues = [...new Set(issues)];
	const paperPct =
		b.paper && b.paper.capacity > 0
			? Math.max(0, Math.min(100, (b.paper.remaining / b.paper.capacity) * 100))
			: null;
	return (
		<div
			className={cn(
				"space-y-2.5 rounded-xl border p-3",
				uniqueIssues.length
					? "border-rose-300/70 bg-rose-50/60 dark:border-rose-900/70 dark:bg-rose-950/20"
					: "border-border-default bg-surface-1",
			)}
		>
			<div className="flex items-center justify-between gap-2">
				<p className="flex min-w-0 items-center gap-2 text-[14px] font-semibold text-foreground">
					<span
						className={cn(
							"size-2 shrink-0 rounded-full",
							b.online ? "bg-emerald-500" : "bg-muted-foreground/40",
						)}
						aria-hidden
					/>
					<span className="truncate">{b.name}</span>
					<span className="font-mono text-[11px] font-normal text-muted-foreground">
						{b.code}
					</span>
				</p>
				<span className="shrink-0 text-[11px] text-muted-foreground">
					{b.online ? "online" : ago(b.last_seen_at)}
				</span>
			</div>

			{uniqueIssues.length > 0 ? (
				<ul className="space-y-1">
					{uniqueIssues.map((t) => (
						<li
							key={t}
							className="flex items-start gap-1.5 text-[13px] font-medium text-rose-700 dark:text-rose-300"
						>
							<AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
							{t}
						</li>
					))}
				</ul>
			) : null}

			{b.paper ? (
				<div className="space-y-1">
					<div className="flex justify-between text-[12px] text-muted-foreground">
						<span>Kertas</span>
						<span className="tabular text-foreground">
							{b.paper.remaining} / {b.paper.capacity}
						</span>
					</div>
					<div className="h-1.5 overflow-hidden rounded-full bg-secondary">
						<div
							className={cn(
								"h-full rounded-full",
								(paperPct ?? 100) < 10 ? "bg-rose-500" : "bg-emerald-500",
							)}
							style={{ width: `${paperPct ?? 0}%` }}
						/>
					</div>
				</div>
			) : null}

			<div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px] text-muted-foreground">
				<span className="flex min-w-0 items-center gap-1.5">
					<Camera className="h-3.5 w-3.5 shrink-0" />
					<span className="truncate">
						{b.camera
							? `${b.camera.model}${b.camera.connected ? "" : " · putus"}`
							: "Kamera —"}
					</span>
				</span>
				<span className="flex min-w-0 items-center gap-1.5">
					<Printer className="h-3.5 w-3.5 shrink-0" />
					<span className="truncate">
						{b.printer ? b.printer.name : "Printer —"}
					</span>
				</span>
				<span className="flex items-center gap-1.5">
					<CloudUpload className="h-3.5 w-3.5 shrink-0" />
					<span className="tabular">
						{b.upload_pending > 0
							? `${b.upload_pending} belum terupload`
							: "Upload lancar"}
					</span>
				</span>
				<span className="tabular">
					{b.failed_prints > 0
						? `${b.failed_prints} cetak gagal`
						: "Cetak lancar"}
				</span>
			</div>
		</div>
	);
}
