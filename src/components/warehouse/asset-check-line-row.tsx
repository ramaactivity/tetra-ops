"use client";

import { AlertTriangle, Check, HelpCircle, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "@/components/ui/toaster";
import { updateAssetCheckLine } from "@/lib/actions/asset-checks";

export type AssetCheckResult = "ada" | "rusak" | "hilang" | null;

export interface AssetCheckRow {
	check_id: string;
	item_id: string;
	result: AssetCheckResult;
	notes: string | null;
	item: {
		id: string;
		sku: string;
		name: string;
		asset_number: string | null;
		serial_number: string | null;
		condition: string | null;
		current_location: string | null;
	};
}

const RESULT_OPTIONS: ReadonlyArray<{
	key: Exclude<AssetCheckResult, null>;
	label: string;
	icon: typeof Check;
	activeCls: string;
}> = [
	{
		key: "ada",
		label: "Ada",
		icon: Check,
		activeCls: "bg-emerald-600 text-white",
	},
	{
		key: "rusak",
		label: "Rusak",
		icon: AlertTriangle,
		activeCls: "bg-amber-500 text-white",
	},
	{
		key: "hilang",
		label: "Hilang",
		icon: X,
		activeCls: "bg-rose-600 text-white",
	},
];

const PREV_CONDITION_LABEL: Record<string, string> = {
	normal: "Normal",
	service: "Sedang servis",
	damaged: "Rusak",
	lost: "Hilang",
};

/**
 * Satu baris alat dalam sesi Cek Alat: nama + identitas alat, kondisi
 * terakhir dari register, lalu segmented Ada / Rusak / Hilang. Klik =
 * langsung tersimpan (klik lagi tombol yang sama = batal tanda, kembali
 * "belum dicek"). Catatan disimpan saat blur.
 */
export function AssetCheckLineRow({
	line,
	editable,
}: {
	line: AssetCheckRow;
	editable: boolean;
}) {
	const [result, setResult] = useState<AssetCheckResult>(line.result);
	const [notes, setNotes] = useState(line.notes ?? "");
	const [pending, startTransition] = useTransition();

	function persist(nextResult: AssetCheckResult, nextNotes?: string) {
		startTransition(async () => {
			const fd = new FormData();
			fd.set("check_id", line.check_id);
			fd.set("item_id", line.item_id);
			fd.set("result", nextResult ?? "");
			fd.set("notes", (nextNotes ?? notes).trim());
			const res = await updateAssetCheckLine(fd);
			if (!res.ok) toast.error(res.error);
		});
	}

	function handlePick(key: Exclude<AssetCheckResult, null>) {
		// Klik ulang pilihan yang sama = batalkan tanda (kembali belum dicek)
		const next = result === key ? null : key;
		setResult(next);
		persist(next);
	}

	const prevCondition = line.item.condition
		? (PREV_CONDITION_LABEL[line.item.condition] ?? line.item.condition)
		: null;
	const showPrevWarning =
		line.item.condition === "damaged" || line.item.condition === "lost";

	return (
		<div
			className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-surface-2 px-3 py-2.5 ring-1 ${
				result === "hilang"
					? "ring-rose-500/30"
					: result === "rusak"
						? "ring-amber-500/30"
						: "ring-foreground/[0.04]"
			}`}
		>
			{/* Status dot */}
			<span
				className={`size-2 shrink-0 rounded-full ${
					result === null
						? "bg-muted-foreground/30"
						: result === "ada"
							? "bg-emerald-500"
							: result === "rusak"
								? "bg-amber-500"
								: "bg-rose-500"
				}`}
				title={result === null ? "Belum dicek" : undefined}
			/>

			{/* Identity */}
			<div className="min-w-0 flex-1 basis-52">
				<div className="truncate text-fluid-caption font-medium text-foreground">
					{line.item.name}
				</div>
				<div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular text-[10px] text-muted-foreground">
					<span>{line.item.asset_number ?? line.item.sku}</span>
					{line.item.serial_number && (
						<>
							<span className="text-muted-foreground/40">·</span>
							<span>SN {line.item.serial_number}</span>
						</>
					)}
					{prevCondition && (
						<>
							<span className="text-muted-foreground/40">·</span>
							<span
								className={
									showPrevWarning
										? "font-medium text-amber-700 dark:text-amber-300"
										: ""
								}
							>
								terakhir: {prevCondition}
							</span>
						</>
					)}
				</div>
			</div>

			{/* Result segmented */}
			{editable ? (
				<div className="inline-flex h-8 shrink-0 items-center gap-0.5 rounded-full bg-surface-1 p-0.5">
					{RESULT_OPTIONS.map((o) => {
						const active = result === o.key;
						const Icon = o.icon;
						return (
							<button
								key={o.key}
								type="button"
								onClick={() => handlePick(o.key)}
								disabled={pending}
								aria-pressed={active}
								className={`press-down inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[12px] font-medium transition-colors disabled:opacity-50 ${
									active
										? o.activeCls
										: "text-muted-foreground hover:bg-surface-3 hover:text-foreground"
								}`}
							>
								<Icon className="size-3" />
								{o.label}
							</button>
						);
					})}
				</div>
			) : (
				<span
					className={`inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-medium ${
						result === "ada"
							? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
							: result === "rusak"
								? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
								: result === "hilang"
									? "bg-rose-500/10 text-rose-700 dark:text-rose-300"
									: "bg-surface-3 text-muted-foreground"
					}`}
				>
					{result === null ? (
						<>
							<HelpCircle className="size-3" />
							Tidak dicek
						</>
					) : (
						RESULT_OPTIONS.find((o) => o.key === result)?.label
					)}
				</span>
			)}

			{/* Notes */}
			{editable ? (
				<input
					type="text"
					value={notes}
					onChange={(e) => setNotes(e.target.value)}
					onBlur={() => {
						if ((notes.trim() || null) !== (line.notes ?? null)) {
							persist(result);
						}
					}}
					placeholder="Catatan (opsional)"
					maxLength={200}
					className="h-8 min-w-0 flex-1 basis-40 rounded-md bg-surface-1 px-2 text-[12px] focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
				/>
			) : line.notes ? (
				<span className="basis-full text-[11px] italic text-muted-foreground sm:basis-auto sm:flex-1">
					{line.notes}
				</span>
			) : null}
		</div>
	);
}
