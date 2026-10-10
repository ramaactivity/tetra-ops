"use client";

import { HandCoins, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { NativeSelect } from "@/components/ui/native-select";
import {
	batalUangJalan,
	beriUangJalan,
	terimaSisaUangJalan,
} from "@/lib/actions/uang-jalan";
import { formatRupiah } from "@/lib/format";
import type { CashAccountOption } from "./crew-fee-form";
import { SingleFileUpload } from "./single-file-upload";

export type UangJalanLedgerRow = {
	id: string;
	user_id: string;
	kind: "beri" | "kembali" | "potong_fee";
	amount: number;
	method: string | null;
	account_code: string | null;
	created_at: string;
	is_reversed: boolean;
	proof_url?: string | null;
};

const KIND: Record<UangJalanLedgerRow["kind"], string> = {
	beri: "Diberikan",
	kembali: "Sisa dikembalikan",
	potong_fee: "Dipotong dari fee",
};

const input =
	"border-border-default bg-background h-10 w-full rounded-xl border px-3 text-[13px]";

/**
 * Uang jalan crew di halaman rekap owner (DR-049): catat uang yang diberikan
 * sebelum acara, terima sisa yang dikembalikan, lihat saldo per crew. Sisa yang
 * masih dipegang crew otomatis dipotong saat Bayar fee.
 */
export function UangJalanPanel({
	eventId,
	projectId,
	crew,
	ledger,
	report,
	cashAccounts,
}: {
	eventId: string;
	projectId: string;
	crew: Array<{ user_id: string; name: string }>;
	ledger: UangJalanLedgerRow[];
	/** Laporan crew di rekap (kalau sudah submit). */
	report: {
		terima: number;
		metode: string | null;
		holder: string | null;
		sisa: string | null;
		bukti?: string | null;
		kembaliMetode?: string | null;
		kembaliBukti?: string | null;
	} | null;
	cashAccounts: CashAccountOption[];
}) {
	const router = useRouter();
	const confirm = useConfirm();
	const [pending, start] = useTransition();
	const [mode, setMode] = useState<"beri" | "kembali" | null>(null);
	const nameOf = (id: string | null) =>
		crew.find((c) => c.user_id === id)?.name ?? "crew";
	const live = ledger.filter((l) => !l.is_reversed);
	const given = (u: string) =>
		live
			.filter((l) => l.user_id === u && l.kind === "beri")
			.reduce((s, l) => s + l.amount, 0);
	const saldo = (u: string) =>
		live
			.filter((l) => l.user_id === u)
			.reduce((s, l) => s + (l.kind === "beri" ? l.amount : -l.amount), 0);
	const holders = [...new Set(live.map((l) => l.user_id))];
	const reportHolder = report?.holder ?? null;
	const belumDicatat =
		report && report.terima > 0 && reportHolder
			? Math.max(0, report.terima - given(reportHolder))
			: 0;

	const [userId, setUserId] = useState(reportHolder ?? crew[0]?.user_id ?? "");
	const [amount, setAmount] = useState(
		belumDicatat > 0 ? String(belumDicatat) : "",
	);
	const [method, setMethod] = useState<"tunai" | "transfer">(
		report?.metode === "transfer" ? "transfer" : "tunai",
	);
	// Bawaan: rekening dengan saldo terbesar (bukan asal pertama — Kas Tunai sering Rp0).
	const [account, setAccount] = useState(
		[...cashAccounts].sort((a, b) => (b.balance ?? 0) - (a.balance ?? 0))[0]
			?.code ?? "",
	);
	const [proof, setProof] = useState<string | null>(null);
	const [adminFee, setAdminFee] = useState("");
	const [date, setDate] = useState(
		new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10),
	);

	const submit = () =>
		start(async () => {
			const payload = {
				eventId,
				projectId,
				userId,
				amount: Number(amount),
				accountCode: account,
				method,
				date,
				proofUrl: proof,
				adminFee: method === "transfer" ? Number(adminFee) || 0 : 0,
			};
			const r =
				mode === "kembali"
					? await terimaSisaUangJalan(payload)
					: await beriUangJalan(payload);
			if (!r.ok) return void toast.error(r.error);
			toast.success(r.note ?? "Tersimpan");
			setMode(null);
			setAmount("");
			setProof(null);
			setAdminFee("");
			router.refresh();
		});

	return (
		<section className="border-border-default bg-card space-y-3 rounded-2xl border p-5 shadow-[var(--shadow-level-2)]">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0 flex-1 basis-60">
					<h3 className="type-heading flex items-center gap-2">
						<HandCoins className="size-4 shrink-0" /> Uang jalan crew
					</h3>
					<p className="type-secondary mt-0.5">
						Uang yang dikasih ke crew sebelum berangkat untuk bensin, parkir,
						tol, dan transport.
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<button
						type="button"
						onClick={() => setMode(mode === "beri" ? null : "beri")}
						className="bg-foreground text-background h-9 rounded-full px-4 text-[13px] font-medium"
					>
						Catat uang jalan
					</button>
					{holders.some((u) => saldo(u) > 0) && (
						<button
							type="button"
							onClick={() => {
								setMode(mode === "kembali" ? null : "kembali");
								setProof(report?.kembaliBukti ?? null);
								const u = holders.find((x) => saldo(x) > 0) ?? "";
								setUserId(u);
								setAmount("");
							}}
							className="border-border-default hover:bg-secondary h-9 rounded-full border px-4 text-[13px] font-medium"
						>
							Terima sisa
						</button>
					)}
				</div>
			</div>

			{belumDicatat > 0 && mode === null && (
				<div className="rounded-xl bg-amber-500/12 px-3.5 py-2.5 text-[13px] text-amber-900 dark:text-amber-200">
					{nameOf(reportHolder)} melapor menerima uang jalan{" "}
					<b className="tabular" data-nominal>
						{formatRupiah(report?.terima ?? 0)}
					</b>{" "}
					({report?.metode === "transfer" ? "transfer" : "tunai"}), tapi baru{" "}
					<span className="tabular" data-nominal>
						{formatRupiah(given(reportHolder as string))}
					</span>{" "}
					yang tercatat.{" "}
					<button
						type="button"
						className="font-semibold underline"
						onClick={() => {
							setMode("beri");
							setUserId(reportHolder as string);
							setAmount(String(belumDicatat));
							setProof(report?.bukti ?? null);
						}}
					>
						Catat sekarang
					</button>{" "}
					supaya ikut terpotong saat bayar fee.
				</div>
			)}

			{mode && (
				<div className="border-border-default bg-background space-y-4 rounded-xl border p-4">
					<div>
						<p className="text-[14px] font-semibold">
							{mode === "beri"
								? "Catat uang jalan yang diberikan"
								: "Terima sisa uang jalan"}
						</p>
						<p className="type-caption text-muted-foreground">
							{mode === "beri"
								? "Saldo rekening berkurang, tercatat sebagai uang yang dipegang crew."
								: "Saldo rekening bertambah, uang yang dipegang crew berkurang."}
						</p>
					</div>
					<div className="grid gap-3 sm:grid-cols-2">
						<div className="space-y-1.5">
							<span className="text-[13px] font-medium">Crew</span>
							<NativeSelect
								value={userId}
								onValueChange={setUserId}
								aria-label="Crew"
								triggerClassName="h-10 w-full rounded-xl bg-background px-3 data-[size=default]:h-10"
								options={crew.map((c) => ({ value: c.user_id, label: c.name }))}
							/>
						</div>
						<label className="space-y-1.5">
							<span className="text-[13px] font-medium">Jumlah</span>
							<div className="relative">
								<span className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px]">
									Rp
								</span>
								<input
									type="number"
									inputMode="numeric"
									min={1}
									value={amount}
									onChange={(e) => setAmount(e.target.value)}
									placeholder="200000"
									className={`${input} tabular pl-9`}
								/>
							</div>
						</label>
						{mode === "beri" && (
							<div className="space-y-1.5">
								<span className="text-[13px] font-medium">Cara memberi</span>
								<div className="flex gap-1.5">
									{(["tunai", "transfer"] as const).map((m) => (
										<button
											key={m}
											type="button"
											aria-pressed={method === m}
											onClick={() => setMethod(m)}
											className={`h-10 flex-1 rounded-xl border text-[13px] font-medium transition-colors ${
												method === m
													? "border-transparent bg-foreground text-background"
													: "border-border-default hover:bg-secondary"
											}`}
										>
											{m === "tunai" ? "Tunai" : "Transfer / top-up"}
										</button>
									))}
								</div>
							</div>
						)}
						<div className="space-y-1.5">
							<span className="text-[13px] font-medium">
								{mode === "beri" ? "Dari rekening" : "Masuk ke rekening"}
							</span>
							<NativeSelect
								value={account}
								onValueChange={setAccount}
								aria-label="Rekening"
								triggerClassName="h-10 w-full rounded-xl bg-background px-3 data-[size=default]:h-10"
								options={cashAccounts.map((a) => ({
									value: a.code,
									label: `${a.name}${a.balance !== undefined ? ` · ${formatRupiah(a.balance)}` : ""}`,
								}))}
							/>
						</div>
						<div className="space-y-1.5">
							<span className="text-[13px] font-medium">Tanggal</span>
							<DatePicker
								value={date}
								onValueChange={setDate}
								aria-label="Tanggal"
								className="h-10 w-full rounded-xl"
							/>
						</div>
						{mode === "beri" && method === "transfer" && (
							<label className="space-y-1.5">
								<span className="text-[13px] font-medium">
									Biaya admin transfer
								</span>
								<div className="relative">
									<span className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px]">
										Rp
									</span>
									<input
										type="number"
										inputMode="numeric"
										min={0}
										value={adminFee}
										onChange={(e) => setAdminFee(e.target.value)}
										placeholder="0 · mis. 2500"
										className={`${input} tabular pl-9`}
									/>
								</div>
								<span className="type-caption text-muted-foreground">
									Dicatat sebagai biaya admin bank, bukan uang jalan crew.
								</span>
							</label>
						)}
					</div>
					<SingleFileUpload
						projectId={projectId}
						kind="uang_jalan"
						seq={mode === "beri" ? "beri" : "kembali"}
						label={
							mode === "beri"
								? "Bukti transfer / foto serah terima (opsional)"
								: "Bukti pengembalian (opsional)"
						}
						value={proof}
						onChange={setProof}
					/>
					<div className="flex justify-end gap-2">
						<button
							type="button"
							onClick={() => setMode(null)}
							className="hover:bg-secondary h-10 rounded-full px-4 text-[13px] font-medium"
						>
							Batal
						</button>
						<button
							type="button"
							disabled={pending || !(Number(amount) > 0) || !account || !userId}
							onClick={submit}
							className="bg-foreground text-background h-10 rounded-full px-5 text-[13px] font-medium disabled:opacity-40"
						>
							{mode === "beri" ? "Simpan uang jalan" : "Simpan penerimaan"}
						</button>
					</div>
				</div>
			)}

			{holders.length === 0 && !belumDicatat ? (
				mode === null && (
					<ol className="grid gap-2 sm:grid-cols-3">
						{[
							[
								"1",
								"Catat saat memberi",
								"Tunai atau transfer/top-up GoPay sebelum crew berangkat.",
							],
							[
								"2",
								"Crew lapor di rekap",
								"Crew mengisi uang jalan yang diterima & biaya yang dibayar pakai uang itu.",
							],
							[
								"3",
								"Sisa beres otomatis",
								"Sisanya dipotong saat Bayar fee, atau dikembalikan crew.",
							],
						].map(([n, t, d]) => (
							<li
								key={n}
								className="bg-secondary/60 flex gap-2.5 rounded-xl p-3"
							>
								<span className="bg-foreground text-background grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold">
									{n}
								</span>
								<div className="min-w-0">
									<p className="text-[13px] font-semibold">{t}</p>
									<p className="type-caption text-muted-foreground">{d}</p>
								</div>
							</li>
						))}
					</ol>
				)
			) : (
				<div className="grid gap-2 sm:grid-cols-2">
					{holders.map((u) => (
						<div key={u} className="bg-secondary/60 rounded-xl p-3 text-[13px]">
							<p className="font-semibold">{nameOf(u)}</p>
							<div className="mt-1 flex justify-between">
								<span className="text-muted-foreground">Diberikan</span>
								<span className="tabular" data-nominal>
									{formatRupiah(given(u))}
								</span>
							</div>
							<div className="flex justify-between font-semibold">
								<span>Masih dipegang crew</span>
								<span className="tabular" data-nominal>
									{formatRupiah(saldo(u))}
								</span>
							</div>
							{saldo(u) > 0 && (
								<p className="mt-1 text-[12px] text-muted-foreground">
									{report?.holder === u && report.sisa === "kembalikan"
										? "Crew memilih mengembalikan sisanya — tekan Terima sisa saat uangnya sudah masuk. Yang terpakai tetap dipotong saat Bayar fee."
										: "Otomatis dipotong saat Bayar fee crew ini."}
								</p>
							)}
						</div>
					))}
				</div>
			)}

			{report &&
				(report.bukti ||
					report.kembaliBukti ||
					report.sisa === "kembalikan") && (
					<div className="bg-secondary/60 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-3 py-2 text-[12.5px]">
						<span className="font-medium">Laporan crew:</span>
						{report.bukti && (
							<a
								href={report.bukti}
								target="_blank"
								rel="noopener noreferrer"
								className="text-primary underline"
							>
								Bukti terima
							</a>
						)}
						{report.sisa === "kembalikan" && (
							<span>
								Sisa dikembalikan (
								{report.kembaliMetode === "transfer" ? "transfer" : "tunai"})
								{report.kembaliBukti && (
									<>
										{" · "}
										<a
											href={report.kembaliBukti}
											target="_blank"
											rel="noopener noreferrer"
											className="text-primary underline"
										>
											Bukti pengembalian
										</a>
									</>
								)}
							</span>
						)}
					</div>
				)}

			{ledger.length > 0 && (
				<ul className="divide-border-default divide-y text-[13px]">
					{ledger.map((l) => (
						<li
							key={l.id}
							className={`flex flex-wrap items-center justify-between gap-2 py-2 ${l.is_reversed ? "opacity-50 line-through" : ""}`}
						>
							<span className="min-w-0">
								{KIND[l.kind]} · {nameOf(l.user_id)}
								{l.method ? ` · ${l.method}` : ""}
								<span className="text-muted-foreground">
									{" "}
									· {new Date(l.created_at).toLocaleDateString("id-ID")}
								</span>
							</span>
							<span className="flex items-center gap-2">
								{l.proof_url && (
									<a
										href={l.proof_url}
										target="_blank"
										rel="noopener noreferrer"
										className="text-[12px] font-medium text-primary underline"
									>
										Bukti
									</a>
								)}
								<span className="tabular font-medium" data-nominal>
									{formatRupiah(l.amount)}
								</span>
								{!l.is_reversed && l.kind !== "potong_fee" && (
									<button
										type="button"
										aria-label="Batalkan catatan"
										disabled={pending}
										onClick={async () => {
											if (
												await confirm({
													title: "Batalkan catatan uang jalan ini?",
													description:
														"Jurnalnya dibalik. Data tidak dihapus, hanya ditandai batal.",
													confirmLabel: "Batalkan",
													variant: "destructive",
												})
											)
												start(async () => {
													const r = await batalUangJalan(l.id, projectId);
													if (!r.ok) toast.error(r.error);
													else {
														toast.success(r.note ?? "Dibatalkan");
														router.refresh();
													}
												});
										}}
										className="hover:bg-secondary text-muted-foreground grid size-7 place-items-center rounded-full"
									>
										<Undo2 className="size-3.5" />
									</button>
								)}
							</span>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
