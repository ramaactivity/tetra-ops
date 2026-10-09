"use client";

import { Briefcase, ExternalLink, RefreshCw, User, Wallet } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
	demoLinkAction,
	resetDemoAction,
	simulateDemoPayment,
} from "@/lib/actions/demo";

export type DemoSub = {
	id: string;
	amount: number;
	kind: string;
	booking: string;
};

const btn =
	"inline-flex h-10 items-center gap-2 rounded-full px-4 text-[13px] font-medium disabled:opacity-50";

const ACCOUNTS = [
	{
		who: "vendor" as const,
		icon: Briefcase,
		title: "Dasbor vendor demo",
		body: "Masuk sebagai Sari (Owner · DEMO Rekanan Contoh): 3 acara, tagihan potongan langsung, komisi, undang klien.",
	},
	{
		who: "klien" as const,
		icon: User,
		title: "Dashboard klien demo",
		body: "Masuk sebagai Nadia: acara pribadi (pelunasan), wedding yang diurus WO (tanpa harga), dan satu booking draf.",
	},
];

export function DemoPanel({
	ready,
	subs,
}: {
	ready: boolean;
	subs: DemoSub[];
}) {
	const [pending, start] = useTransition();
	const confirm = useConfirm();

	const open = (who: "vendor" | "klien") => {
		// Buka tab dulu (supaya tidak diblok popup blocker), isi URL setelah link jadi.
		const w = window.open("about:blank", "_blank");
		start(async () => {
			const r = await demoLinkAction(who);
			if (!r.ok || !r.url) {
				w?.close();
				toast.error(r.ok ? "Gagal membuat link" : r.error);
				return;
			}
			if (w) w.location.href = r.url;
			else window.location.href = r.url;
		});
	};

	return (
		<div className="space-y-3">
			<div className="grid gap-3 md:grid-cols-2">
				{ACCOUNTS.map(({ who, icon: Icon, title, body }) => (
					<div
						key={who}
						className="border-border-default bg-card space-y-3 rounded-2xl border p-5 shadow-[var(--shadow-level-2)]"
					>
						<div className="flex items-center gap-2">
							<span className="bg-secondary grid size-9 place-items-center rounded-xl">
								<Icon className="size-4" />
							</span>
							<h3 className="type-heading">{title}</h3>
						</div>
						<p className="type-secondary">{body}</p>
						<button
							type="button"
							disabled={!ready || pending}
							onClick={() => open(who)}
							className={`${btn} bg-foreground text-background`}
						>
							<ExternalLink className="size-4" /> Buka sebagai{" "}
							{who === "vendor" ? "vendor" : "klien"}
						</button>
					</div>
				))}
			</div>

			<div className="border-border-default bg-card space-y-3 rounded-2xl border p-5 shadow-[var(--shadow-level-2)]">
				<div className="flex items-center gap-2">
					<span className="bg-secondary grid size-9 place-items-center rounded-xl">
						<Wallet className="size-4" />
					</span>
					<h3 className="type-heading">Bukti bayar demo menunggu</h3>
				</div>
				{subs.length === 0 ? (
					<p className="type-secondary">
						Belum ada. Coba unggah bukti pelunasan dari dashboard klien demo,
						lalu terima di sini (tanpa pembayaran & jurnal).
					</p>
				) : (
					<ul className="divide-border-default divide-y">
						{subs.map((s) => (
							<li
								key={s.id}
								className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
							>
								<span>
									{s.booking} · {s.kind === "dp" ? "DP" : "Pelunasan"}{" "}
									<span className="tabular" data-nominal>
										Rp{s.amount.toLocaleString("id-ID")}
									</span>
								</span>
								<button
									type="button"
									disabled={pending}
									onClick={() =>
										start(async () => {
											const r = await simulateDemoPayment(s.id);
											if (r.ok) toast.success(r.note ?? "Diterima");
											else toast.error(r.error);
										})
									}
									className={`${btn} border-border-default border`}
								>
									Simulasikan diterima
								</button>
							</li>
						))}
					</ul>
				)}
			</div>

			<div className="border-border-default flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed p-5">
				<p className="type-secondary max-w-xl">
					{ready
						? "Reset mengembalikan semua data demo ke kondisi awal (isian, undangan, bukti bayar, dan booking yang dibuat akun demo dihapus)."
						: "Data demo belum dibuat. Klik tombol di samping untuk membuat vendor, akun, dan acara contoh."}
				</p>
				<button
					type="button"
					disabled={pending}
					onClick={async () => {
						if (
							ready &&
							!(await confirm({
								title: "Reset data demo?",
								description:
									"Semua perubahan di akun demo dihapus dan data contoh dibuat ulang.",
								confirmLabel: "Reset",
							}))
						)
							return;
						start(async () => {
							const r = await resetDemoAction();
							if (r.ok) toast.success(r.note ?? "Selesai");
							else toast.error(r.error);
						});
					}}
					className={`${btn} border-border-default bg-card border`}
				>
					<RefreshCw className="size-4" />{" "}
					{ready ? "Reset data demo" : "Buat data demo"}
				</button>
			</div>
		</div>
	);
}
