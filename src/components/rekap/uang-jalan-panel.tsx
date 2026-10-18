"use client";

import { HandCoins, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AdminFeeChips } from "@/components/finance/admin-fee-chips";
import { TalanganOwnerCard } from "@/components/finance/talangan-owner-card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { NativeSelect } from "@/components/ui/native-select";
import {
	batalUangJalan,
	beriUangJalan,
	terimaSisaUangJalan,
} from "@/lib/actions/uang-jalan";
import { formatRupiah } from "@/lib/format";
import { TALANGAN_OWNER_COA } from "@/lib/rekap/uang-jalan";
import type { TalanganOwnerSaldo } from "@/lib/rekap/uang-jalan-db";
import type { CashAccountOption } from "./crew-fee-form";
import { SingleFileUpload } from "./single-file-upload";

export type UangJalanLedgerRow = {
	id: string;
	user_id: string;
	kind: "beri" | "kembali" | "potong_fee" | "pakai";
	amount: number;
	method: string | null;
	account_code: string | null;
	created_at: string;
	is_reversed: boolean;
	proof_url?: string | null;
	owner_id?: string | null;
};

const KIND: Record<UangJalanLedgerRow["kind"], string> = {
	beri: "Diberikan",
	kembali: "Sisa dikembalikan",
	potong_fee: "Dipotong dari fee",
	pakai: "Dipakai bayar biaya",
};

const seg = (on: boolean) =>
	`h-10 flex-1 rounded-xl border px-2 text-[13px] font-medium transition-colors ${
		on
			? "border-transparent bg-foreground text-background"
			: "border-border-default hover:bg-secondary"
	}`;

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
	owners,
	meId,
	talangan = [],
	antre = {},
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
	/** Owner yang bisa memberi uang jalan (Rama, Adit, …). */
	owners: Array<{ id: string; name: string }>;
	meId: string;
	/** Saldo hutang-piutang Tetra ↔ owner (semua acara). */
	talangan?: TalanganOwnerSaldo[];
	/** Pengeluaran "pakai uang jalan" yang masih diantre (dibukukan saat settle), per crew. */
	antre?: Record<string, number>;
}) {
	const router = useRouter();
	const confirm = useConfirm();
	const [pending, start] = useTransition();
	const [mode, setMode] = useState<"beri" | "kembali" | null>(null);
	const nameOf = (id: string | null) =>
		crew.find((c) => c.user_id === id)?.name ?? "crew";
	const ownerName = (id: string | null | undefined) =>
		owners.find((o) => o.id === id)?.name ?? "owner";
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
	// Siapa memberi berapa di acara ini — dasar mengganti uang pribadi owner.
	// Owner yang pakai uang pribadi di acara ini → saldo totalnya bisa dilunasi di sini.
	const talanganHere = talangan.filter((t) =>
		live.some(
			(l) => l.owner_id === t.id && l.account_code === TALANGAN_OWNER_COA,
		),
	);
	const givers = [
		...new Set(live.filter((l) => l.kind === "beri").map((l) => l.owner_id)),
	]
		.filter((o): o is string => Boolean(o))
		.map((o) => {
			const rows = live.filter((l) => l.owner_id === o);
			const sum = (k: string, pr: boolean) =>
				rows
					.filter(
						(l) =>
							l.kind === k && (l.account_code === TALANGAN_OWNER_COA) === pr,
					)
					.reduce((s, l) => s + l.amount, 0);
			return {
				id: o,
				tetra: sum("beri", false),
				pribadi: sum("beri", true) - sum("kembali", true),
			};
		});
	const reportHolder = report?.holder ?? null;
	const belumDicatat =
		report && report.terima > 0 && reportHolder
			? Math.max(0, report.terima - given(reportHolder))
			: 0;

	const [userId, setUserId] = useState(reportHolder ?? crew[0]?.user_id ?? "");
	const [amount, setAmount] = useState(
		belumDicatat > 0 ? String(belumDicatat) : "",
	);
	// Saat mencatat pemberian: cocokkan dengan uang jalan yang dilaporkan crew
	// diterima, supaya catatan dari beberapa owner jumlahnya pas.
	const lapor =
		mode === "beri" && report && report.holder === userId ? report.terima : 0;
	const sisaLapor = Math.max(0, lapor - given(userId));
	const lebih = lapor > 0 ? Math.max(0, Number(amount) - sisaLapor) : 0;
	const [method, setMethod] = useState<"tunai" | "transfer">(
		report?.metode === "transfer" ? "transfer" : "tunai",
	);
	// Bawaan: rekening dengan saldo terbesar (bukan asal pertama — Kas Tunai sering Rp0).
	const [account, setAccount] = useState(
		[...cashAccounts].sort((a, b) => (b.balance ?? 0) - (a.balance ?? 0))[0]
			?.code ?? "",
	);
	const [ownerId, setOwnerId] = useState(
		owners.some((o) => o.id === meId) ? meId : (owners[0]?.id ?? ""),
	);
	const [pribadi, setPribadi] = useState(false);
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
				ownerId: ownerId || null,
				pribadi,
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
			setPribadi(false);
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
							{pribadi
								? "Uang yang dipegang crew ikut tercatat; saldo rekening Tetra tidak berubah."
								: mode === "beri"
									? "Saldo rekening berkurang, tercatat sebagai uang yang dipegang crew."
									: "Saldo rekening bertambah, uang yang dipegang crew berkurang."}
						</p>
					</div>
					<div className="grid gap-3 sm:grid-cols-2">
						<div className="space-y-1.5 sm:col-span-2">
							<span className="text-[13px] font-medium">
								{mode === "beri" ? "Dari siapa" : "Diterima siapa"}
							</span>
							<div className="flex flex-wrap gap-1.5">
								{owners.map((o) => (
									<button
										key={o.id}
										type="button"
										aria-pressed={ownerId === o.id}
										onClick={() => setOwnerId(o.id)}
										className={`h-9 rounded-full border px-4 text-[13px] font-medium transition-colors ${
											ownerId === o.id
												? "border-transparent bg-foreground text-background"
												: "border-border-default hover:bg-secondary"
										}`}
									>
										{o.name}
									</button>
								))}
							</div>
						</div>
						<div className="space-y-1.5 sm:col-span-2">
							<span className="text-[13px] font-medium">
								{mode === "beri" ? "Pakai uang" : "Uangnya masuk ke"}
							</span>
							<div className="flex gap-1.5">
								<button
									type="button"
									aria-pressed={!pribadi}
									onClick={() => setPribadi(false)}
									className={seg(!pribadi)}
								>
									Rekening Tetra
								</button>
								<button
									type="button"
									aria-pressed={pribadi}
									onClick={() => setPribadi(true)}
									className={seg(pribadi)}
								>
									{mode === "beri"
										? `Uang pribadi ${ownerName(ownerId)}`
										: `Dipegang ${ownerName(ownerId)}`}
								</button>
							</div>
							{pribadi && (
								<span className="type-caption text-muted-foreground">
									{mode === "beri"
										? `Saldo rekening Tetra tidak berkurang. Tercatat Tetra berutang ke ${ownerName(ownerId)} sampai dilunasi (di sini, Dashboard, atau Keuangan).`
										: `Mengurangi hutang Tetra ke ${ownerName(ownerId)}. Kalau lebih, ${ownerName(ownerId)} jadi berutang ke Tetra.`}
								</span>
							)}
						</div>
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
						<div className="space-y-1.5">
							<label htmlFor="uj-amount" className="text-[13px] font-medium">
								Jumlah
							</label>
							<div className="relative">
								<span className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px]">
									Rp
								</span>
								<input
									type="number"
									inputMode="numeric"
									min={1}
									id="uj-amount"
									value={amount}
									onChange={(e) => setAmount(e.target.value)}
									placeholder="200000"
									className={`${input} tabular pl-9`}
								/>
							</div>
							{lapor > 0 &&
								(lebih > 0 ? (
									<p className="text-[12px] font-medium text-amber-700">
										Lebih{" "}
										<span className="tabular" data-nominal>
											{formatRupiah(lebih)}
										</span>{" "}
										dari laporan crew (terima{" "}
										<span className="tabular" data-nominal>
											{formatRupiah(lapor)}
										</span>
										, sudah tercatat{" "}
										<span className="tabular" data-nominal>
											{formatRupiah(given(userId))}
										</span>
										).
									</p>
								) : sisaLapor > 0 ? (
									<button
										type="button"
										onClick={() => setAmount(String(sisaLapor))}
										className={`h-8 rounded-full border px-3 text-[12px] font-medium transition-colors ${
											Number(amount) === sisaLapor
												? "border-transparent bg-lime-100 text-lime-900"
												: "border-border-default hover:bg-secondary"
										}`}
									>
										Sisa{" "}
										<span className="tabular" data-nominal>
											{formatRupiah(sisaLapor)}
										</span>{" "}
										dari laporan crew
									</button>
								) : (
									<p className="text-[12px] text-muted-foreground">
										Sudah sesuai laporan crew (
										<span className="tabular" data-nominal>
											{formatRupiah(lapor)}
										</span>
										).
									</p>
								))}
						</div>
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
											className={seg(method === m)}
										>
											{m === "tunai" ? "Tunai" : "Transfer / top-up"}
										</button>
									))}
								</div>
							</div>
						)}
						{!pribadi && (
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
						)}
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
							<div className="space-y-1.5">
								<span className="text-[13px] font-medium">
									Biaya admin transfer
								</span>
								<AdminFeeChips
									presets={[0, 1000, 2500]}
									value={Number(adminFee) || 0}
									onChange={(v) => setAdminFee(v ? String(v) : "")}
									ariaLabel="Biaya admin transfer"
								/>
								<span className="type-caption text-muted-foreground">
									{pribadi
										? `Dicatat sebagai biaya admin bank dan ikut diganti ke ${ownerName(ownerId)}.`
										: "Dicatat sebagai biaya admin bank, bukan uang jalan crew."}
								</span>
							</div>
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
							disabled={
								pending ||
								!(Number(amount) > 0) ||
								(!pribadi && !account) ||
								!userId ||
								(mode === "beri" && !ownerId)
							}
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
							{(antre[u] ?? 0) > 0 && (
								<div className="flex justify-between text-muted-foreground">
									<span>Akan dipakai (diantre sampai settle)</span>
									<span className="tabular" data-nominal>
										− {formatRupiah(antre[u] ?? 0)}
									</span>
								</div>
							)}
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

			{givers.length > 0 && (
				<div className="bg-secondary/60 space-y-1 rounded-xl px-3 py-2.5 text-[13px]">
					<p className="font-semibold">Dari siapa</p>
					{givers.map((g) => (
						<div key={g.id} className="flex flex-wrap justify-between gap-x-3">
							<span>
								{ownerName(g.id)}
								{g.pribadi > 0 && (
									<span className="text-muted-foreground">
										{" "}
										· uang pribadi {formatRupiah(g.pribadi)}
									</span>
								)}
							</span>
							<span className="tabular font-medium" data-nominal>
								{formatRupiah(g.tetra + g.pribadi)}
							</span>
						</div>
					))}
				</div>
			)}

			{talanganHere.length > 0 && (
				<div className="space-y-2">
					<p className="text-[13px] font-semibold">
						Hutang-piutang owner (semua acara)
					</p>
					<TalanganOwnerCard
						owners={talanganHere}
						cashAccounts={cashAccounts}
						eventId={eventId}
					/>
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
								{l.owner_id
									? ` · ${l.kind === "beri" ? "dari" : "ke"} ${ownerName(l.owner_id)}${
											l.account_code === TALANGAN_OWNER_COA ? " (pribadi)" : ""
										}`
									: ""}
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
								{!l.is_reversed &&
									(l.kind === "beri" || l.kind === "kembali") && (
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
