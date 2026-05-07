"use client";

import { Save } from "lucide-react";
import { useState, useTransition } from "react";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { updateInvestorShare } from "@/lib/actions/investors";
import { formatDateID, formatRupiah } from "@/lib/format";

export type InvestorRow = {
	id: string;
	full_name: string;
	role: string;
	share_pct: number | null;
	capital_contributed: number | null;
	capital_contributed_at: string | null;
};

export function InvestorShareTable({
	rows,
	canEdit,
}: {
	rows: InvestorRow[];
	canEdit: boolean;
}) {
	const totalShare = rows.reduce((s, r) => s + Number(r.share_pct ?? 0), 0);
	const totalCapital = rows.reduce(
		(s, r) => s + Number(r.capital_contributed ?? 0),
		0,
	);

	const isComplete = Math.abs(totalShare - 100) < 0.01;

	return (
		<div className="space-y-3">
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<div>
					<h3 className="text-base font-semibold">Investor Capital & Share</h3>
					<p className="text-muted-foreground text-xs">
						Share % menentukan distribusi owner pool saat settlement.{" "}
						{canEdit
							? "Edit per row → Save."
							: "Hanya super_admin yang bisa edit."}
					</p>
				</div>
				<div className="text-right text-xs">
					<div
						className={`tabular font-semibold ${
							isComplete
								? "text-emerald-600 dark:text-emerald-400"
								: totalShare > 100
									? "text-rose-600 dark:text-rose-400"
									: "text-amber-600 dark:text-amber-400"
						}`}
					>
						Total share: {totalShare.toFixed(2)}%
					</div>
					<div className="text-muted-foreground tabular">
						Total capital: {formatRupiah(totalCapital)}
					</div>
				</div>
			</div>

			{!isComplete && totalShare > 0 && (
				<div className="border-amber-500/30 bg-amber-500/10 rounded-md border p-3 text-xs">
					<p className="text-amber-700 dark:text-amber-300 font-medium">
						{totalShare > 100
							? `Total share melebihi 100% (${totalShare.toFixed(2)}%)`
							: `Total share belum 100% (${totalShare.toFixed(2)}%)`}
						{
							" — distribusi tetap proportional ke share yang di-set, tapi sebaiknya total = 100% untuk fairness."
						}
					</p>
				</div>
			)}

			{rows.length === 0 ? (
				<p className="text-muted-foreground text-sm italic">
					Belum ada user dengan role super_admin / owner. Promote user dari
					tabel Master Crew di atas.
				</p>
			) : (
				<div className="border-border bg-card overflow-x-auto rounded-lg border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Investor</TableHead>
								<TableHead>Role</TableHead>
								<TableHead className="text-right">Share %</TableHead>
								<TableHead className="text-right">Capital (Rp)</TableHead>
								<TableHead>Sejak</TableHead>
								{canEdit && (
									<TableHead className="w-[80px] text-right">Save</TableHead>
								)}
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((row) => (
								<InvestorRowEditor key={row.id} row={row} canEdit={canEdit} />
							))}
						</TableBody>
					</Table>
				</div>
			)}
		</div>
	);
}

function InvestorRowEditor({
	row,
	canEdit,
}: {
	row: InvestorRow;
	canEdit: boolean;
}) {
	const [pending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);
	const [share, setShare] = useState<string>(
		row.share_pct !== null ? String(row.share_pct) : "",
	);
	const [capital, setCapital] = useState<string>(
		row.capital_contributed !== null ? String(row.capital_contributed) : "",
	);
	const [date, setDate] = useState<string>(row.capital_contributed_at ?? "");
	const [savedFlash, setSavedFlash] = useState(false);

	function onSave() {
		setError(null);
		startTransition(async () => {
			const fd = new FormData();
			fd.set("share_pct", share);
			fd.set("capital_contributed", capital);
			fd.set("capital_contributed_at", date);
			const result = await updateInvestorShare(row.id, fd);
			if (result.error) {
				setError(result.error);
			} else {
				setSavedFlash(true);
				setTimeout(() => setSavedFlash(false), 1800);
			}
		});
	}

	if (!canEdit) {
		return (
			<TableRow>
				<TableCell className="font-medium">{row.full_name}</TableCell>
				<TableCell className="text-muted-foreground text-sm">
					{row.role}
				</TableCell>
				<TableCell className="tabular text-right text-sm">
					{row.share_pct !== null ? `${row.share_pct}%` : "—"}
				</TableCell>
				<TableCell className="tabular text-right text-sm">
					{row.capital_contributed !== null
						? formatRupiah(row.capital_contributed)
						: "—"}
				</TableCell>
				<TableCell className="tabular text-muted-foreground text-sm">
					{row.capital_contributed_at
						? formatDateID(row.capital_contributed_at)
						: "—"}
				</TableCell>
			</TableRow>
		);
	}

	return (
		<TableRow>
			<TableCell className="font-medium">{row.full_name}</TableCell>
			<TableCell className="text-muted-foreground text-sm">
				{row.role}
			</TableCell>
			<TableCell className="text-right">
				<input
					type="number"
					min={0}
					max={100}
					step={0.01}
					value={share}
					onChange={(e) => setShare(e.target.value)}
					placeholder="0"
					className="border-border bg-background text-foreground focus-visible:ring-ring tabular h-8 w-20 rounded-md border px-2 text-right text-xs focus-visible:ring-2 focus-visible:outline-none"
				/>
			</TableCell>
			<TableCell className="text-right">
				<input
					type="number"
					min={0}
					step={1}
					value={capital}
					onChange={(e) => setCapital(e.target.value)}
					placeholder="0"
					className="border-border bg-background text-foreground focus-visible:ring-ring tabular h-8 w-32 rounded-md border px-2 text-right text-xs focus-visible:ring-2 focus-visible:outline-none"
				/>
			</TableCell>
			<TableCell>
				<input
					type="date"
					value={date}
					onChange={(e) => setDate(e.target.value)}
					className="border-border bg-background text-foreground focus-visible:ring-ring h-8 rounded-md border px-2 text-xs focus-visible:ring-2 focus-visible:outline-none"
				/>
			</TableCell>
			<TableCell className="text-right">
				<div className="flex items-center justify-end gap-1">
					{error && (
						<span className="text-destructive text-[10px]" title={error}>
							!
						</span>
					)}
					<button
						type="button"
						onClick={onSave}
						disabled={pending}
						title={savedFlash ? "Tersimpan" : "Save"}
						className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
							savedFlash
								? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
								: "text-muted-foreground hover:bg-muted hover:text-foreground"
						} disabled:opacity-50`}
					>
						<Save className="h-4 w-4" />
					</button>
				</div>
			</TableCell>
		</TableRow>
	);
}
