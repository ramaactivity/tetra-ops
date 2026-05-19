"use client";

import { Loader2, Save } from "lucide-react";
import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { saveAddonSplit } from "@/lib/actions/crew-fees";

type Props = {
	recapId: string;
	eventId: string;
	projectId: string;
	photomagnetTotal: number;
	keychainTotal: number;
	photomagnetPaid: number;
	photomagnetBonus: number;
	keychainPaid: number;
	keychainBonus: number;
	readOnly?: boolean;
};

export function AddonSplitForm({
	recapId,
	eventId,
	projectId,
	photomagnetTotal,
	keychainTotal,
	photomagnetPaid: initPmPaid,
	photomagnetBonus: initPmBonus,
	keychainPaid: initKcPaid,
	keychainBonus: initKcBonus,
	readOnly = false,
}: Props) {
	const router = useRouter();
	const [pmPaid, setPmPaid] = useState(initPmPaid);
	const [pmBonus, setPmBonus] = useState(initPmBonus);
	const [kcPaid, setKcPaid] = useState(initKcPaid);
	const [kcBonus, setKcBonus] = useState(initKcBonus);
	const [pending, startTransition] = useTransition();

	// Auto-derive bonus from total - paid when paid changes (only if total > 0)
	useEffect(() => {
		if (photomagnetTotal > 0) {
			setPmBonus(Math.max(0, photomagnetTotal - pmPaid));
		}
	}, [pmPaid, photomagnetTotal]);

	useEffect(() => {
		if (keychainTotal > 0) {
			setKcBonus(Math.max(0, keychainTotal - kcPaid));
		}
	}, [kcPaid, keychainTotal]);

	const pmMismatch = pmPaid + pmBonus !== photomagnetTotal && photomagnetTotal > 0;
	const kcMismatch = kcPaid + kcBonus !== keychainTotal && keychainTotal > 0;

	function handleSave() {
		startTransition(async () => {
			const result = await saveAddonSplit(recapId, eventId, projectId, {
				photomagnet_paid: pmPaid,
				photomagnet_bonus: pmBonus,
				keychain_paid: kcPaid,
				keychain_bonus: kcBonus,
			});
			if (!result.ok) {
				toast.error(result.error || "Gagal simpan split addon");
				return;
			}
			toast.success("Split addon disimpan");
			router.refresh();
		});
	}

	const hasAnyAddon = photomagnetTotal > 0 || keychainTotal > 0;
	if (!hasAnyAddon) return null;

	return (
		<section className="rounded-xl border border-border-default bg-surface-2 p-5">
			<header className="mb-4 flex items-baseline justify-between">
				<h2 className="text-fluid-h3 font-semibold tracking-tight">
					Split add-on (paid vs bonus)
				</h2>
				<span className="text-[10px] uppercase tracking-widest text-muted-foreground">
					Total = paid + bonus
				</span>
			</header>

			<div className="space-y-4">
				{photomagnetTotal > 0 && (
					<SplitRow
						label="Photomagnet"
						total={photomagnetTotal}
						paid={pmPaid}
						bonus={pmBonus}
						onPaid={setPmPaid}
						onBonus={setPmBonus}
						mismatch={pmMismatch}
						readOnly={readOnly}
					/>
				)}
				{keychainTotal > 0 && (
					<SplitRow
						label="Keychain"
						total={keychainTotal}
						paid={kcPaid}
						bonus={kcBonus}
						onPaid={setKcPaid}
						onBonus={setKcBonus}
						mismatch={kcMismatch}
						readOnly={readOnly}
					/>
				)}
			</div>

			{!readOnly && (
				<div className="mt-4 flex justify-end">
					<Button
						onClick={handleSave}
						disabled={pending || pmMismatch || kcMismatch}
						className="gap-2"
					>
						{pending ? (
							<>
								<Loader2 className="h-4 w-4 animate-spin" />
								Menyimpan…
							</>
						) : (
							<>
								<Save className="h-4 w-4" />
								Simpan split
							</>
						)}
					</Button>
				</div>
			)}

			{(pmMismatch || kcMismatch) && !readOnly && (
				<p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
					Total paid + bonus harus sama dengan total terpakai. Koreksi dulu sebelum simpan.
				</p>
			)}
		</section>
	);
}

function SplitRow({
	label,
	total,
	paid,
	bonus,
	onPaid,
	onBonus,
	mismatch,
	readOnly,
}: {
	label: string;
	total: number;
	paid: number;
	bonus: number;
	onPaid: (v: number) => void;
	onBonus: (v: number) => void;
	mismatch: boolean;
	readOnly?: boolean;
}) {
	return (
		<div className="rounded-lg border border-border-default bg-surface-1 p-4">
			<div className="mb-3 flex items-baseline justify-between">
				<p className="text-sm font-semibold text-foreground">{label}</p>
				<span className="tabular text-xs text-muted-foreground">
					Total: <span className="font-semibold text-foreground">{total}</span>
				</span>
			</div>
			<div className="grid grid-cols-2 gap-3">
				<div className="space-y-1">
					<label className="block text-xs font-medium text-muted-foreground">
						Paid (di-charge ke klien)
					</label>
					<Input
						type="number"
						inputMode="numeric"
						min={0}
						max={total}
						value={paid}
						onChange={(e) => onPaid(Number(e.target.value) || 0)}
						disabled={readOnly}
						className={`tabular text-right ${mismatch ? "border-amber-300" : ""}`}
					/>
				</div>
				<div className="space-y-1">
					<label className="block text-xs font-medium text-muted-foreground">
						Bonus (freebie, internal cost)
					</label>
					<Input
						type="number"
						inputMode="numeric"
						min={0}
						value={bonus}
						onChange={(e) => onBonus(Number(e.target.value) || 0)}
						disabled={readOnly}
						className={`tabular text-right ${mismatch ? "border-amber-300" : ""}`}
					/>
				</div>
			</div>
		</div>
	);
}
