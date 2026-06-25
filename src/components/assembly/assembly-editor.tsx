"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import {
	addAssemblyComponent,
	removeAssemblyComponent,
	updateAssemblyQty,
} from "@/lib/actions/assembly-rules";
import { cn } from "@/lib/utils";

type Comp = { id: string; component_sku: string; qty_per_unit: number };
type Group = { field: string; label: string; components: Comp[] };

const INPUT =
	"h-9 rounded-md border border-border-default bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function AssemblyEditor({
	groups,
	items,
}: {
	groups: Group[];
	items: Array<{ sku: string; name: string }>;
}) {
	const router = useRouter();
	const [pending, start] = useTransition();
	const [addSku, setAddSku] = useState<Record<string, string>>({});
	const [addQty, setAddQty] = useState<Record<string, string>>({});

	function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
		start(async () => {
			const res = await fn();
			if (res.ok) {
				toast.success(ok);
				router.refresh();
			} else {
				toast.error(res.error ?? "Gagal");
			}
		});
	}

	return (
		<div className="space-y-4">
			{groups.map((g) => (
				<section
					key={g.field}
					className="overflow-hidden rounded-2xl border border-border-subtle bg-card"
				>
					<div className="border-b border-border-subtle p-4">
						<h2 className="text-sm font-semibold">{g.label}</h2>
						<p className="mt-0.5 text-xs text-muted-foreground">
							1 unit di rekap → item berikut berkurang:
						</p>
					</div>
					<div className="divide-y divide-border-subtle">
						{g.components.length === 0 ? (
							<p className="p-4 text-sm text-muted-foreground">
								Belum ada komponen.
							</p>
						) : (
							g.components.map((c) => (
								<div key={c.id} className="flex items-center gap-3 p-3 sm:px-4">
									<span className="min-w-0 flex-1 truncate text-sm font-medium">
										{c.component_sku}
									</span>
									<input
										type="number"
										min={0.0001}
										step="any"
										defaultValue={c.qty_per_unit}
										disabled={pending}
										onBlur={(e) => {
											const v = Number(e.target.value);
											if (v > 0 && v !== c.qty_per_unit) {
												run(() => updateAssemblyQty(c.id, v), "Qty diperbarui");
											}
										}}
										className={cn(INPUT, "tabular w-20 text-right")}
										aria-label={`Qty ${c.component_sku}`}
									/>
									<span className="text-xs text-muted-foreground">/ unit</span>
									<Button
										variant="ghost"
										size="icon-sm"
										disabled={pending}
										onClick={() =>
											run(
												() => removeAssemblyComponent(c.id),
												"Komponen dihapus",
											)
										}
										aria-label="Hapus komponen"
									>
										<Trash2 className="size-4 text-rose-600" />
									</Button>
								</div>
							))
						)}
					</div>
					{/* Add component row */}
					<div className="flex flex-wrap items-center gap-2 border-t border-border-subtle bg-secondary/30 p-3 sm:px-4">
						<select
							value={addSku[g.field] ?? ""}
							disabled={pending}
							onChange={(e) =>
								setAddSku((p) => ({ ...p, [g.field]: e.target.value }))
							}
							className={cn(INPUT, "min-w-0 flex-1")}
						>
							<option value="">+ tambah item…</option>
							{items
								.filter(
									(it) => !g.components.some((c) => c.component_sku === it.sku),
								)
								.map((it) => (
									<option key={it.sku} value={it.sku}>
										{it.sku} · {it.name}
									</option>
								))}
						</select>
						<input
							type="number"
							min={0.0001}
							step="any"
							placeholder="qty"
							value={addQty[g.field] ?? ""}
							disabled={pending}
							onChange={(e) =>
								setAddQty((p) => ({ ...p, [g.field]: e.target.value }))
							}
							className={cn(INPUT, "tabular w-20 text-right")}
							aria-label="Qty komponen baru"
						/>
						<Button
							size="sm"
							disabled={pending || !addSku[g.field]}
							onClick={() => {
								const sku = addSku[g.field];
								const qty = Number(addQty[g.field] || "1");
								if (!sku || qty <= 0) return;
								run(
									() =>
										addAssemblyComponent({
											rekap_field: g.field,
											component_sku: sku,
											qty_per_unit: qty,
										}),
									"Komponen ditambah",
								);
								setAddSku((p) => ({ ...p, [g.field]: "" }));
								setAddQty((p) => ({ ...p, [g.field]: "" }));
							}}
						>
							{pending ? (
								<Loader2 className="size-4 animate-spin" />
							) : (
								<Plus className="size-4" />
							)}
							Tambah
						</Button>
					</div>
				</section>
			))}
		</div>
	);
}
