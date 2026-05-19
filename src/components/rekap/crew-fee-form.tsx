"use client";

import { Loader2, Save } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { saveCrewFees } from "@/lib/actions/crew-fees";
import { formatRupiah } from "@/lib/format";

export type CrewAssignmentRow = {
	assignment_id: string;
	user_full_name: string;
	role_in_event: "lead" | "asisten" | "crew_c";
	fee_amount: number;
	bonus_amount: number;
	reimbursement_amount: number;
	payment_notes: string | null;
	is_paid: boolean;
};

type Props = {
	eventId: string;
	projectId: string;
	rows: CrewAssignmentRow[];
	suggestedReimbursementPerCrew?: number; // dari crew_rekap transport_cost dll
	readOnly?: boolean;
};

const ROLE_LABEL: Record<CrewAssignmentRow["role_in_event"], string> = {
	lead: "Lead",
	asisten: "Asisten",
	crew_c: "Crew C",
};

export function CrewFeeForm({
	eventId,
	projectId,
	rows: initialRows,
	suggestedReimbursementPerCrew,
	readOnly = false,
}: Props) {
	const router = useRouter();
	const [rows, setRows] = useState<CrewAssignmentRow[]>(initialRows);
	const [pending, startTransition] = useTransition();

	function update(id: string, patch: Partial<CrewAssignmentRow>) {
		setRows((rs) =>
			rs.map((r) => (r.assignment_id === id ? { ...r, ...patch } : r)),
		);
	}

	function applyTransportSuggestion(id: string) {
		if (!suggestedReimbursementPerCrew) return;
		update(id, { reimbursement_amount: suggestedReimbursementPerCrew });
	}

	function handleSave() {
		startTransition(async () => {
			const result = await saveCrewFees(
				eventId,
				projectId,
				rows.map((r) => ({
					assignment_id: r.assignment_id,
					fee_amount: r.fee_amount,
					bonus_amount: r.bonus_amount,
					reimbursement_amount: r.reimbursement_amount,
					payment_notes: r.payment_notes,
				})),
			);
			if (!result.ok) {
				toast.error(result.error || "Gagal simpan fee crew");
				return;
			}
			toast.success(`${result.updated} fee crew disimpan`);
			router.refresh();
		});
	}

	if (rows.length === 0) {
		return (
			<section className="rounded-xl border border-border-default bg-surface-2 p-5">
				<header className="mb-3">
					<h2 className="text-fluid-h3 font-semibold tracking-tight">
						Fee crew
					</h2>
				</header>
				<p className="text-sm text-muted-foreground">
					Belum ada crew yang di-assign ke event ini. Buka halaman Crew
					Assignment untuk menambah crew.
				</p>
			</section>
		);
	}

	return (
		<section className="rounded-xl border border-border-default bg-surface-2 p-5">
			<header className="mb-4 flex items-baseline justify-between">
				<h2 className="text-fluid-h3 font-semibold tracking-tight">Fee crew</h2>
				{!readOnly && suggestedReimbursementPerCrew !== undefined && (
					<span className="text-[10px] uppercase tracking-widest text-muted-foreground">
						Saran reimbursement: {formatRupiah(suggestedReimbursementPerCrew)}/crew
					</span>
				)}
			</header>

			<div className="space-y-4">
				{rows.map((row) => {
					const total =
						row.fee_amount + row.bonus_amount + row.reimbursement_amount;
					return (
						<div
							key={row.assignment_id}
							className="rounded-lg border border-border-default bg-surface-1 p-4"
						>
							<div className="mb-3 flex items-baseline justify-between">
								<div>
									<p className="text-sm font-semibold text-foreground">
										{row.user_full_name}
									</p>
									<p className="text-xs text-muted-foreground">
										{ROLE_LABEL[row.role_in_event]}
										{row.is_paid && (
											<span className="ml-2 inline-flex items-center rounded-full bg-surface-3 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-foreground">
												Paid
											</span>
										)}
									</p>
								</div>
								<span className="tabular text-base font-semibold text-foreground">
									{formatRupiah(total)}
								</span>
							</div>

							<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
								<FeeField
									label="Base fee"
									value={row.fee_amount}
									onChange={(v) => update(row.assignment_id, { fee_amount: v })}
									readOnly={readOnly}
								/>
								<FeeField
									label="Bonus"
									value={row.bonus_amount}
									onChange={(v) =>
										update(row.assignment_id, { bonus_amount: v })
									}
									readOnly={readOnly}
								/>
								<FeeField
									label="Reimbursement"
									value={row.reimbursement_amount}
									onChange={(v) =>
										update(row.assignment_id, { reimbursement_amount: v })
									}
									readOnly={readOnly}
									hint={
										!readOnly && suggestedReimbursementPerCrew !== undefined
											? "Saran dari transport"
											: undefined
									}
									onUseHint={
										!readOnly && suggestedReimbursementPerCrew
											? () => applyTransportSuggestion(row.assignment_id)
											: undefined
									}
								/>
							</div>

							<div className="mt-3">
								<label
									htmlFor={`notes-${row.assignment_id}`}
									className="mb-1 block text-xs font-medium text-muted-foreground"
								>
									Catatan pembayaran (optional)
								</label>
								<Input
									id={`notes-${row.assignment_id}`}
									value={row.payment_notes ?? ""}
									onChange={(e) =>
										update(row.assignment_id, {
											payment_notes: e.target.value || null,
										})
									}
									placeholder="Mis. Transfer BCA 2026-05-20"
									disabled={readOnly}
								/>
							</div>
						</div>
					);
				})}
			</div>

			{!readOnly && (
				<div className="mt-4 flex justify-end">
					<Button onClick={handleSave} disabled={pending} className="gap-2">
						{pending ? (
							<>
								<Loader2 className="h-4 w-4 animate-spin" />
								Menyimpan…
							</>
						) : (
							<>
								<Save className="h-4 w-4" />
								Simpan fee crew
							</>
						)}
					</Button>
				</div>
			)}
		</section>
	);
}

function FeeField({
	label,
	value,
	onChange,
	readOnly,
	hint,
	onUseHint,
}: {
	label: string;
	value: number;
	onChange: (v: number) => void;
	readOnly?: boolean;
	hint?: string;
	onUseHint?: () => void;
}) {
	return (
		<div className="space-y-1">
			<label className="block text-xs font-medium text-muted-foreground">
				{label}
			</label>
			<Input
				type="number"
				inputMode="numeric"
				min={0}
				value={value}
				onChange={(e) => onChange(Number(e.target.value) || 0)}
				disabled={readOnly}
				className="tabular text-right"
			/>
			{hint && onUseHint && (
				<button
					type="button"
					onClick={onUseHint}
					className="text-[11px] text-link hover:underline"
				>
					Pakai {hint.toLowerCase()}
				</button>
			)}
		</div>
	);
}
