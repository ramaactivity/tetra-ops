"use client";

import { CheckCircle2, FileSpreadsheet, XCircle } from "lucide-react";
import { useActionState } from "react";
import {
	type ImportFormState,
	importItemsFromCsv,
} from "@/lib/actions/items-import";

const SAMPLE_CSV = `sku,name,category,unit,min_stock_alert,purchase_price_avg,is_active
ITM-SLEEVE-2R,Sleeve 2R,consumable,Pcs,1000,500,TRUE
ITM-PCS-4R,Media Set (4R/2R),consumable,Pcs,700,941,TRUE
EQ-MONITOR,Monitor,equipment,unit,0,0,TRUE`;

export function ItemsImportForm() {
	const [state, formAction, pending] = useActionState<
		ImportFormState,
		FormData
	>(importItemsFromCsv, undefined);

	return (
		<div className="space-y-5">
			<form action={formAction} className="space-y-3">
				<div className="space-y-1.5">
					<label htmlFor="csv" className="text-sm font-medium">
						CSV content
					</label>
					<textarea
						id="csv"
						name="csv"
						rows={14}
						required
						defaultValue={state?.values?.csv ?? ""}
						placeholder={SAMPLE_CSV}
						className="border-border bg-background text-foreground focus-visible:ring-ring w-full rounded-md border px-3 py-2 font-mono text-xs leading-relaxed placeholder:text-muted-foreground/50 focus-visible:ring-2 focus-visible:outline-none"
					/>
					<p className="text-muted-foreground text-xs">
						Header wajib row pertama. Kolom yang dikenal:{" "}
						<code className="bg-muted rounded px-1 font-mono">
							sku, name, category, unit, min_stock_alert, purchase_price_avg,
							purchase_price, useful_life_months, notes, is_active
						</code>
						. Alias lama ikut:{" "}
						<code className="bg-muted rounded px-1 font-mono">
							item_id → sku
						</code>
						,{" "}
						<code className="bg-muted rounded px-1 font-mono">
							item_name → name
						</code>
						,{" "}
						<code className="bg-muted rounded px-1 font-mono">
							standard_cost_rp → purchase_price_avg
						</code>
						,{" "}
						<code className="bg-muted rounded px-1 font-mono">
							reorder_level → min_stock_alert
						</code>
						. Existing SKU akan di-update; baru → insert. Category{" "}
						<code className="bg-muted rounded px-1 font-mono">
							PACKAGING / UNIFORM
						</code>{" "}
						otomatis di-collapse ke{" "}
						<code className="bg-muted rounded px-1 font-mono">consumable</code>.
					</p>
				</div>

				{state?.error && (
					<div className="border-destructive bg-destructive/10 rounded-md border p-3">
						<p className="text-destructive text-sm font-medium">
							{state.error}
						</p>
					</div>
				)}

				<div className="flex justify-end">
					<button
						type="submit"
						disabled={pending}
						className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-medium disabled:opacity-60"
					>
						<FileSpreadsheet className="h-4 w-4" />
						{pending ? "Memproses…" : "Import"}
					</button>
				</div>
			</form>

			{state?.result && (
				<div className="border-border bg-card space-y-4 rounded-xl border p-5">
					<div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
						<Stat label="Total" value={state.result.totalRows} tone="muted" />
						<Stat
							label="Inserted"
							value={state.result.inserted}
							tone="emerald"
						/>
						<Stat label="Updated" value={state.result.updated} tone="primary" />
						<Stat label="Skipped" value={state.result.skipped} tone="muted" />
						<Stat
							label="Errors"
							value={state.result.errors}
							tone={state.result.errors > 0 ? "rose" : "muted"}
						/>
					</div>

					<details className="space-y-2">
						<summary className="text-foreground cursor-pointer text-sm font-medium">
							Lihat detail per baris ({state.result.rows.length})
						</summary>
						<div className="border-border max-h-80 overflow-y-auto rounded-md border">
							<table className="w-full text-xs">
								<thead className="bg-muted/50 sticky top-0">
									<tr>
										<th className="px-2 py-1.5 text-left font-medium">Row</th>
										<th className="px-2 py-1.5 text-left font-medium">SKU</th>
										<th className="px-2 py-1.5 text-left font-medium">Name</th>
										<th className="px-2 py-1.5 text-left font-medium">
											Status
										</th>
										<th className="px-2 py-1.5 text-left font-medium">Note</th>
									</tr>
								</thead>
								<tbody className="divide-border divide-y">
									{state.result.rows.map((r) => (
										<tr key={`${r.row}-${r.sku ?? "na"}`}>
											<td className="text-muted-foreground tabular px-2 py-1">
												{r.row}
											</td>
											<td className="text-muted-foreground tabular px-2 py-1 font-mono">
												{r.sku ?? "—"}
											</td>
											<td className="px-2 py-1">{r.name ?? "—"}</td>
											<td className="px-2 py-1">
												<StatusPill status={r.status} />
											</td>
											<td className="text-muted-foreground px-2 py-1">
												{r.message ?? ""}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</details>
				</div>
			)}
		</div>
	);
}

function Stat({
	label,
	value,
	tone,
}: {
	label: string;
	value: number;
	tone: "primary" | "emerald" | "rose" | "muted";
}) {
	const cls =
		tone === "primary"
			? "text-primary"
			: tone === "emerald"
				? "text-emerald-500"
				: tone === "rose"
					? "text-rose-500"
					: "text-muted-foreground";
	return (
		<div className="space-y-0.5">
			<dt className="text-muted-foreground text-xs uppercase tracking-wider">
				{label}
			</dt>
			<dd className={`tabular text-lg font-semibold ${cls}`}>
				{value.toLocaleString("id-ID")}
			</dd>
		</div>
	);
}

function StatusPill({
	status,
}: {
	status: "inserted" | "updated" | "skipped" | "error";
}) {
	if (status === "inserted") {
		return (
			<span className="text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-0.5 font-medium">
				<CheckCircle2 className="h-3 w-3" />
				inserted
			</span>
		);
	}
	if (status === "updated") {
		return (
			<span className="text-primary inline-flex items-center gap-0.5 font-medium">
				<CheckCircle2 className="h-3 w-3" />
				updated
			</span>
		);
	}
	if (status === "skipped") {
		return <span className="text-muted-foreground italic">skipped</span>;
	}
	return (
		<span className="text-rose-600 dark:text-rose-400 inline-flex items-center gap-0.5 font-medium">
			<XCircle className="h-3 w-3" />
			error
		</span>
	);
}
