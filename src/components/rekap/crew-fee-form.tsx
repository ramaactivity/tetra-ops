"use client";

import { CheckCircle2, ExternalLink, Loader2, Save, Upload, X } from "lucide-react";
import { useRef, useState, useTransition } from "react";
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
	payment_proof_url: string | null;
	is_paid: boolean;
};

type Props = {
	eventId: string;
	projectId: string;
	rows: CrewAssignmentRow[];
	fieldExpenseBreakdown?: {
		total: number;
		items: Array<{ label: string; amount: number }>;
	};
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
	fieldExpenseBreakdown,
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

	function applyExpenseToReimbursement(id: string, amount: number) {
		update(id, { reimbursement_amount: amount });
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
					payment_proof_url: r.payment_proof_url,
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
			<header className="mb-4">
				<h2 className="text-fluid-h3 font-semibold tracking-tight">Fee crew</h2>
				<p className="mt-1 text-xs text-muted-foreground">
					Reimbursement bisa beda per crew — assign manual ke yang sebenarnya bayar.
				</p>
			</header>

			{!readOnly && fieldExpenseBreakdown && (
				<div className="mb-4 rounded-md border border-border-default bg-surface-3 p-3">
					<p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
						Field expense dari rekap · total {formatRupiah(fieldExpenseBreakdown.total)}
					</p>
					<ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs tabular text-foreground/80">
						{fieldExpenseBreakdown.items.map((it) => (
							<li key={it.label}>
								<span className="text-muted-foreground">{it.label}:</span>{" "}
								{formatRupiah(it.amount)}
							</li>
						))}
					</ul>
					<p className="mt-2 text-[11px] text-muted-foreground">
						Klik tombol kecil di kolom Reimbursement tiap crew untuk apply nilai
						ke crew yang sebenarnya bayar item itu.
					</p>
				</div>
			)}

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
								/>
								{!readOnly && fieldExpenseBreakdown && fieldExpenseBreakdown.items.length > 0 && (
									<div className="col-span-full -mt-1 flex flex-wrap gap-1">
										{fieldExpenseBreakdown.items.map((it) => (
											<button
												key={it.label}
												type="button"
												onClick={() =>
													applyExpenseToReimbursement(
														row.assignment_id,
														row.reimbursement_amount + it.amount,
													)
												}
												className="rounded-md border border-border-default bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-link hover:bg-surface-3"
											>
												+ {it.label} {formatRupiah(it.amount)}
											</button>
										))}
										{row.reimbursement_amount > 0 && (
											<button
												type="button"
												onClick={() =>
													applyExpenseToReimbursement(row.assignment_id, 0)
												}
												className="rounded-md border border-border-default bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-surface-3"
											>
												reset 0
											</button>
										)}
									</div>
								)}
							</div>

							<div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
								<div>
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
								<PaymentProofUpload
									projectId={projectId}
									crewRow={row}
									totalFee={total}
									onChange={(url) =>
										update(row.assignment_id, { payment_proof_url: url })
									}
									readOnly={readOnly}
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

function PaymentProofUpload({
	projectId,
	crewRow,
	totalFee,
	onChange,
	readOnly,
}: {
	projectId: string;
	crewRow: CrewAssignmentRow;
	totalFee: number;
	onChange: (url: string | null) => void;
	readOnly?: boolean;
}) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [uploading, setUploading] = useState(false);
	const url = crewRow.payment_proof_url;

	async function handleFiles(files: FileList | null) {
		if (!files || files.length === 0) return;
		const file = files[0];
		setUploading(true);
		try {
			const fd = new FormData();
			fd.set("file", file);
			fd.set("kind", "payment_proof");
			fd.set("paymentType", `crew_fee_${crewRow.role_in_event}`);
			fd.set("paymentDate", new Date().toISOString().slice(0, 10));
			fd.set("amount", String(totalFee));
			const res = await fetch(`/api/drive/upload/${projectId}`, {
				method: "POST",
				body: fd,
			});
			if (!res.ok) {
				const text = await res.text().catch(() => "");
				throw new Error(text || `HTTP ${res.status}`);
			}
			const { url: uploadedUrl } = (await res.json()) as { url: string };
			onChange(uploadedUrl);
			toast.success(`Bukti transfer ${crewRow.user_full_name} ter-upload`);
		} catch (err) {
			toast.error(
				`Upload gagal: ${err instanceof Error ? err.message : "Unknown error"}`,
			);
		} finally {
			setUploading(false);
			if (inputRef.current) inputRef.current.value = "";
		}
	}

	return (
		<div className="space-y-1">
			<label className="block text-xs font-medium text-muted-foreground">
				Bukti transfer (optional)
			</label>
			<input
				ref={inputRef}
				type="file"
				accept="image/*,application/pdf"
				className="hidden"
				onChange={(e) => handleFiles(e.target.files)}
				disabled={readOnly || uploading}
			/>
			{url ? (
				<div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs dark:border-emerald-900 dark:bg-emerald-950/30">
					<CheckCircle2 className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-300" />
					<a
						href={url}
						target="_blank"
						rel="noopener noreferrer"
						className="flex-1 truncate text-emerald-900 hover:underline dark:text-emerald-200"
					>
						Lihat bukti
					</a>
					<a
						href={url}
						target="_blank"
						rel="noopener noreferrer"
						className="text-emerald-700 hover:text-emerald-900 dark:text-emerald-300"
					>
						<ExternalLink className="h-3 w-3" />
					</a>
					{!readOnly && (
						<button
							type="button"
							onClick={() => onChange(null)}
							className="text-emerald-700 hover:text-rose-700 dark:text-emerald-300"
							aria-label="Hapus bukti"
						>
							<X className="h-3 w-3" />
						</button>
					)}
				</div>
			) : (
				<button
					type="button"
					onClick={() => inputRef.current?.click()}
					disabled={readOnly || uploading}
					className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-dashed border-border-default bg-surface-1 px-3 text-xs text-muted-foreground hover:border-border-strong hover:bg-surface-3 disabled:opacity-50"
				>
					{uploading ? (
						<>
							<Loader2 className="h-3.5 w-3.5 animate-spin" />
							Uploading…
						</>
					) : (
						<>
							<Upload className="h-3.5 w-3.5" />
							Upload bukti transfer
						</>
					)}
				</button>
			)}
		</div>
	);
}

function FeeField({
	label,
	value,
	onChange,
	readOnly,
}: {
	label: string;
	value: number;
	onChange: (v: number) => void;
	readOnly?: boolean;
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
		</div>
	);
}
