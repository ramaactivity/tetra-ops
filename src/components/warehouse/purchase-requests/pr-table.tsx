"use client";

import {
	AlertTriangle,
	CheckCircle2,
	ChevronDown,
	ChevronUp,
	Package,
	X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import {
	cancelPurchaseRequest,
	receivePurchaseRequest,
} from "@/lib/actions/purchase-requests";
import { formatDateID } from "@/lib/format";

export type PRItem = {
	id: string;
	item_id: string;
	item_name: string;
	item_sku: string;
	qty_requested: number;
	qty_received: number;
	unit: string;
	notes: string | null;
};

export type PRRow = {
	id: string;
	status: string;
	notes: string | null;
	created_at: string;
	completed_at: string | null;
	requester_name: string;
	items: PRItem[];
	total_requested: number;
	total_received: number;
	outstanding_lines: number;
};

const STATUS_TONE: Record<string, string> = {
	open: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
	partial: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
	completed:
		"border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
	cancelled: "border-border-default bg-surface-3 text-muted-foreground",
};
const STATUS_LABEL: Record<string, string> = {
	open: "Open",
	partial: "Sebagian",
	completed: "Selesai",
	cancelled: "Cancelled",
};

function ageInDays(iso: string): number {
	return (Date.now() - new Date(iso).getTime()) / 1000 / 86400;
}

export function PRTable({
	rows,
	canReceive,
}: {
	rows: PRRow[];
	canReceive: boolean;
}) {
	const [expanded, setExpanded] = useState<string | null>(null);
	return (
		<div className="space-y-3">
			{rows.map((pr) => {
				const open = expanded === pr.id;
				const age = ageInDays(pr.created_at);
				const stale =
					(pr.status === "open" || pr.status === "partial") && age > 3;
				const progressPct =
					pr.total_requested === 0
						? 0
						: Math.min(
								100,
								Math.round((pr.total_received / pr.total_requested) * 100),
							);
				return (
					<div
						key={pr.id}
						className={`rounded-lg border bg-surface-2 ${
							stale ? "border-rose-500/30" : "border-border-default"
						}`}
					>
						<button
							type="button"
							onClick={() => setExpanded(open ? null : pr.id)}
							className="flex w-full items-start justify-between gap-3 p-3 text-left hover:bg-surface-3/40"
						>
							<div className="min-w-0 flex-1 space-y-1">
								<div className="flex flex-wrap items-center gap-2">
									<span className="font-semibold text-foreground">
										Permintaan {formatDateID(pr.created_at)}
									</span>
									<Badge
										variant="outline"
										className={STATUS_TONE[pr.status] ?? ""}
									>
										{STATUS_LABEL[pr.status] ?? pr.status}
									</Badge>
									{stale && (
										<Badge
											variant="outline"
											className="h-5 border-rose-500/30 bg-rose-500/10 px-1.5 text-[10px] text-rose-700 dark:text-rose-300"
										>
											<AlertTriangle className="mr-0.5 size-2.5" />
											{Math.floor(age)} hari
										</Badge>
									)}
								</div>
								<div className="text-[11px] text-muted-foreground">
									by {pr.requester_name} · {pr.items.length} bahan
									{pr.outstanding_lines > 0
										? ` (${pr.outstanding_lines} outstanding)`
										: ""}
								</div>
								{pr.notes && (
									<div className="line-clamp-1 text-[11px] italic text-muted-foreground/80">
										{pr.notes}
									</div>
								)}
								<div className="flex items-center gap-2 pt-1">
									<div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3">
										<div
											className={`h-full rounded-full transition-all ${
												pr.status === "completed"
													? "bg-emerald-500"
													: "bg-amber-400"
											}`}
											style={{ width: `${progressPct}%` }}
										/>
									</div>
									<span className="tabular text-[10px] text-muted-foreground">
										{pr.total_received.toLocaleString("id-ID", {
											maximumFractionDigits: 0,
										})}{" "}
										/{" "}
										{pr.total_requested.toLocaleString("id-ID", {
											maximumFractionDigits: 0,
										})}{" "}
										({progressPct}%)
									</span>
								</div>
							</div>
							{open ? (
								<ChevronUp className="size-4 shrink-0 text-muted-foreground" />
							) : (
								<ChevronDown className="size-4 shrink-0 text-muted-foreground" />
							)}
						</button>

						{open && <PRDetailExpanded pr={pr} canReceive={canReceive} />}
					</div>
				);
			})}
		</div>
	);
}

function PRDetailExpanded({
	pr,
	canReceive,
}: {
	pr: PRRow;
	canReceive: boolean;
}) {
	const router = useRouter();
	const isEditable = pr.status === "open" || pr.status === "partial";
	const [pending, startTransition] = useTransition();
	const [confirmCancel, setConfirmCancel] = useState(false);
	const [receiveInputs, setReceiveInputs] = useState<Record<string, string>>(
		{},
	);

	function handleReceive() {
		const lines = pr.items
			.map((it) => {
				const v = Number(receiveInputs[it.id] ?? 0);
				if (!Number.isFinite(v) || v <= 0) return null;
				return { pr_item_id: it.id, qty_received: v };
			})
			.filter(
				(v): v is { pr_item_id: string; qty_received: number } => v !== null,
			);
		if (lines.length === 0) {
			toast.error("Isi qty terima dulu");
			return;
		}
		const fd = new FormData();
		fd.set("pr_id", pr.id);
		fd.set("items", JSON.stringify(lines));
		startTransition(async () => {
			const res = await receivePurchaseRequest(fd);
			if (!res.ok) {
				toast.error(res.error);
			} else {
				toast.success(`Terima — ${res.movements} stock movement dibuat`);
				setReceiveInputs({});
				router.refresh();
			}
		});
	}

	function handleCancel() {
		startTransition(async () => {
			const res = await cancelPurchaseRequest(pr.id);
			if (!res.ok) {
				toast.error(res.error);
			} else {
				toast.success("PR dibatalkan");
				setConfirmCancel(false);
				router.refresh();
			}
		});
	}

	return (
		<div className="border-t border-border-default p-3 space-y-3">
			<div className="overflow-hidden rounded-md border border-border-default">
				<div className="w-full overflow-x-auto">
					<table className="w-full text-sm">
						<thead className="bg-card border-b border-border-subtle text-[11px] uppercase tracking-wider text-foreground">
							<tr>
								<th className="px-3 py-2 text-left">Item</th>
								<th className="px-3 py-2 text-right">Diminta</th>
								<th className="px-3 py-2 text-right">Sudah Diterima</th>
								{canReceive && isEditable && (
									<th className="px-3 py-2 text-right">Terima Sekarang</th>
								)}
							</tr>
						</thead>
						<tbody className="divide-y divide-border-default/50">
							{pr.items.map((it) => {
								const fulfilled = it.qty_received >= it.qty_requested;
								const outstanding = Math.max(
									0,
									it.qty_requested - it.qty_received,
								);
								return (
									<tr key={it.id} className="hover:bg-muted/10">
										<td className="px-3 py-2">
											<div className="text-fluid-caption font-medium text-foreground">
												{it.item_name}
											</div>
											<div className="tabular text-[10px] text-muted-foreground">
												{it.item_sku} · {it.unit}
											</div>
											{it.notes && (
												<div className="mt-0.5 line-clamp-1 text-[10px] italic text-muted-foreground/80">
													{it.notes}
												</div>
											)}
										</td>
										<td className="px-3 py-2 text-right tabular text-fluid-caption text-foreground">
											{it.qty_requested.toLocaleString("id-ID", {
												maximumFractionDigits: 4,
											})}{" "}
											{it.unit}
										</td>
										<td className="px-3 py-2 text-right">
											<div className="space-y-0.5">
												<div
													className={`tabular text-fluid-caption font-medium ${
														fulfilled
															? "text-emerald-600 dark:text-emerald-400"
															: "text-foreground"
													}`}
												>
													{it.qty_received.toLocaleString("id-ID", {
														maximumFractionDigits: 4,
													})}{" "}
													{it.unit}
												</div>
												{!fulfilled && outstanding > 0 && (
													<div className="text-[10px] text-amber-600 dark:text-amber-400">
														kurang {outstanding.toLocaleString("id-ID")}
													</div>
												)}
												{fulfilled && (
													<Badge
														variant="outline"
														className="h-4 border-emerald-500/30 bg-emerald-500/10 px-1 text-[9px] text-emerald-700 dark:text-emerald-300"
													>
														OK
													</Badge>
												)}
											</div>
										</td>
										{canReceive && isEditable && (
											<td className="px-3 py-2 text-right">
												<input
													type="number"
													min={0}
													step={it.unit === "roll" ? 0.01 : 1}
													value={receiveInputs[it.id] ?? ""}
													onChange={(e) =>
														setReceiveInputs((s) => ({
															...s,
															[it.id]: e.target.value,
														}))
													}
													placeholder={
														outstanding > 0 ? String(outstanding) : "0"
													}
													className="h-8 w-24 rounded-md border border-border-default bg-background px-2 text-right text-sm tabular focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
												/>
											</td>
										)}
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			</div>

			{canReceive && isEditable && (
				<div className="flex flex-wrap items-center justify-end gap-2">
					<button
						type="button"
						onClick={() => setConfirmCancel(true)}
						disabled={pending}
						className="press-down inline-flex h-9 items-center gap-1.5 rounded-md border border-border-default bg-surface-2 px-3 text-fluid-caption font-medium text-muted-foreground hover:bg-surface-3 disabled:opacity-40"
					>
						<X className="size-3.5" />
						Batalkan PR
					</button>
					<button
						type="button"
						onClick={handleReceive}
						disabled={pending}
						className="press-down inline-flex h-9 items-center gap-1.5 rounded-md bg-[#059669] dark:bg-[#0b9e6a] px-3 text-fluid-caption font-medium text-white hover:bg-[#047857] dark:hover:bg-[#059669] disabled:opacity-60"
					>
						<Package className="size-3.5" />
						{pending ? "Memproses..." : "Terima Item"}
					</button>
				</div>
			)}

			{pr.status === "completed" && pr.completed_at && (
				<div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2.5 text-fluid-caption">
					<CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
					<span className="text-foreground">
						Selesai pada {formatDateID(pr.completed_at)}
					</span>
				</div>
			)}

			<ConfirmDialog
				open={confirmCancel}
				onOpenChange={setConfirmCancel}
				title="Batalkan PR?"
				description="Status PR akan jadi cancelled. Stock movement yang sudah ter-record dari penerimaan sebelumnya tetap tersimpan."
				confirmLabel="Ya, batalkan"
				variant="destructive"
				onConfirm={handleCancel}
			/>
		</div>
	);
}
