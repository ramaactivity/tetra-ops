"use client";

import { HandCoins, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
	batalUangJalan,
	beriUangJalan,
	terimaSisaUangJalan,
} from "@/lib/actions/uang-jalan";
import { formatRupiah } from "@/lib/format";
import type { CashAccountOption } from "./crew-fee-form";

export type UangJalanLedgerRow = {
	id: string;
	user_id: string;
	kind: "beri" | "kembali" | "potong_fee";
	amount: number;
	method: string | null;
	account_code: string | null;
	created_at: string;
	is_reversed: boolean;
};

const KIND: Record<UangJalanLedgerRow["kind"], string> = {
	beri: "Diberikan",
	kembali: "Sisa dikembalikan",
	potong_fee: "Dipotong dari fee",
};

const input =
	"border-border-default bg-background h-9 w-full rounded-lg border px-2.5 text-[13px]";

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
			};
			const r =
				mode === "kembali"
					? await terimaSisaUangJalan(payload)
					: await beriUangJalan(payload);
			if (!r.ok) return void toast.error(r.error);
			toast.success(r.note ?? "Tersimpan");
			setMode(null);
			setAmount("");
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
						Uang yang dikasih sebelum berangkat (bensin, parkir, tol,
						transport). Sisanya otomatis dipotong saat Bayar fee, atau
						dikembalikan crew.
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
						}}
					>
						Catat sekarang
					</button>{" "}
					supaya ikut terpotong saat bayar fee.
				</div>
			)}

			{mode && (
				<div className="bg-secondary/60 grid gap-2 rounded-xl p-3 sm:grid-cols-2 lg:grid-cols-5">
					<label className="space-y-1">
						<span className="type-caption text-muted-foreground">Crew</span>
						<select
							value={userId}
							onChange={(e) => setUserId(e.target.value)}
							className={input}
						>
							{crew.map((c) => (
								<option key={c.user_id} value={c.user_id}>
									{c.name}
								</option>
							))}
						</select>
					</label>
					<label className="space-y-1">
						<span className="type-caption text-muted-foreground">Jumlah</span>
						<input
							type="number"
							inputMode="numeric"
							min={1}
							value={amount}
							onChange={(e) => setAmount(e.target.value)}
							className={`${input} tabular`}
						/>
					</label>
					{mode === "beri" && (
						<label className="space-y-1">
							<span className="type-caption text-muted-foreground">Cara</span>
							<select
								value={method}
								onChange={(e) =>
									setMethod(
										e.target.value === "transfer" ? "transfer" : "tunai",
									)
								}
								className={input}
							>
								<option value="tunai">Tunai</option>
								<option value="transfer">Transfer / top-up</option>
							</select>
						</label>
					)}
					<label className="space-y-1">
						<span className="type-caption text-muted-foreground">
							{mode === "beri" ? "Dari rekening" : "Masuk ke rekening"}
						</span>
						<select
							value={account}
							onChange={(e) => setAccount(e.target.value)}
							className={input}
						>
							{cashAccounts.map((a) => (
								<option key={a.code} value={a.code}>
									{a.name}
									{a.balance !== undefined
										? ` · ${formatRupiah(a.balance)}`
										: ""}
								</option>
							))}
						</select>
					</label>
					<label className="space-y-1">
						<span className="type-caption text-muted-foreground">Tanggal</span>
						<input
							type="date"
							value={date}
							onChange={(e) => setDate(e.target.value)}
							className={input}
						/>
					</label>
					<div className="flex justify-end gap-2 sm:col-span-2 lg:col-span-5">
						<button
							type="button"
							onClick={() => setMode(null)}
							className="hover:bg-secondary h-9 rounded-full px-4 text-[13px] font-medium"
						>
							Batal
						</button>
						<button
							type="button"
							disabled={pending || !(Number(amount) > 0) || !account || !userId}
							onClick={submit}
							className="bg-foreground text-background h-9 rounded-full px-5 text-[13px] font-medium disabled:opacity-40"
						>
							{mode === "beri" ? "Simpan uang jalan" : "Simpan penerimaan"}
						</button>
					</div>
				</div>
			)}

			{holders.length === 0 && !belumDicatat ? (
				<p className="type-caption text-muted-foreground">
					Belum ada uang jalan untuk acara ini.
				</p>
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
