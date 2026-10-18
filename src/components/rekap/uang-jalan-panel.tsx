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
import {
	type GiverRow,
	isiSisa,
	TALANGAN_OWNER_COA,
} from "@/lib/rekap/uang-jalan";
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
	terpakaiRekap = {},
	transferOwner = [],
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
	/**
	 * Biaya lapangan di rekap yang dibayar pemegang uang jalan, per crew —
	 * belum mengurangi buku uang jalan (dipotong saat bayar fee).
	 */
	terpakaiRekap?: Record<string, number>;
	/**
	 * Biaya rekap yang ditransfer / dibayar owner langsung ('owner:<id>') —
	 * uang dari owner ke crew di luar uang jalan, sudah jadi hutang ke owner.
	 */
	transferOwner?: Array<{
		ownerId: string;
		ownerName: string;
		label: string;
		amount: number;
	}>;
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
	// Uang di tangan crew = buku uang jalan − biaya rekap yang dia bayar pakai
	// uang jalan − yang diantre. Sama dengan "sisa" di kartu Fee crew.
	const sisaDiCrew = (u: string) =>
		saldo(u) - (terpakaiRekap[u] ?? 0) - (antre[u] ?? 0);
	// Siapa memberi berapa di acara ini — dasar mengganti uang pribadi owner.
	// Owner yang pakai uang pribadi di acara ini → saldo totalnya bisa dilunasi di sini.
	// Owner yang punya hutang/piutang dari acara ini — uang jalan pribadi
	// ATAU biaya acara yang dia bayar (sewa mobil, bensin, …) — bisa langsung
	// dilunasi di sini, atau dibiarkan jadi hutang dulu.
	const talanganHere = talangan.filter(
		(t) =>
			live.some(
				(l) => l.owner_id === t.id && l.account_code === TALANGAN_OWNER_COA,
			) || t.rincian.some((it) => it.projectId === projectId),
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
	const sisaFor = (crewId: string) =>
		report && report.holder === crewId
			? Math.max(0, report.terima - given(crewId))
			: 0;
	const sisaLapor = mode === "beri" ? sisaFor(userId) : 0;
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
	// Catat uang jalan: satu baris per owner pemberi (bisa dibagi beberapa owner).
	const [rows, setRows] = useState<GiverRow[]>([]);
	const rowsTotal = rows.reduce((t, r) => t + (Number(r.amount) || 0), 0);
	const openBeri = (crewId: string) => {
		const target = sisaFor(crewId);
		setUserId(crewId);
		setRows(
			ownerId
				? [
						{
							ownerId,
							amount: target > 0 ? String(target) : "",
							touched: false,
							pribadi: true,
							admin: 0,
							proof: null,
						},
					]
				: [],
		);
		setMode("beri");
	};
	const toggleGiver = (id: string) =>
		setRows((rs) =>
			rs.some((r) => r.ownerId === id)
				? isiSisa(
						rs.filter((r) => r.ownerId !== id),
						sisaLapor,
					)
				: isiSisa(
						[
							...rs.map((r) => ({ ...r, touched: true })),
							{
								ownerId: id,
								amount: "",
								touched: false,
								pribadi: true,
								admin: 0,
							},
						],
						sisaLapor,
					),
		);
	const editRow = (id: string, patch: Partial<GiverRow>) =>
		setRows((rs) =>
			isiSisa(
				rs.map((r) => (r.ownerId === id ? { ...r, ...patch } : r)),
				sisaLapor,
			),
		);
	const [proof, setProof] = useState<string | null>(null);
	const [adminFee, setAdminFee] = useState("");
	const [date, setDate] = useState(
		new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10),
	);

	const submitBeri = () =>
		start(async () => {
			for (const [i, r] of rows.entries()) {
				const res = await beriUangJalan({
					eventId,
					projectId,
					userId,
					amount: Number(r.amount),
					accountCode: account,
					ownerId: r.ownerId,
					pribadi: r.pribadi,
					method,
					date,
					proofUrl: r.proof ?? null,
					adminFee: method === "transfer" ? r.admin : 0,
				});
				if (!res.ok) {
					toast.error(
						`${ownerName(r.ownerId)}: ${res.error}${i > 0 ? " (pemberi sebelumnya sudah tersimpan)" : ""}`,
					);
					setRows(rows.slice(i));
					return void router.refresh();
				}
			}
			toast.success(
				rows.length > 1
					? `Uang jalan dari ${rows.map((r) => ownerName(r.ownerId)).join(" + ")} tercatat`
					: "Uang jalan tercatat",
			);
			setMode(null);
			setRows([]);
			setProof(null);
			router.refresh();
		});

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
						Uang dari owner ke crew untuk bensin, parkir, tol, transport, dll —
						sebelum berangkat, di tengah, atau sesudah acara.
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<button
						type="button"
						onClick={() =>
							mode === "beri" ? setMode(null) : openBeri(reportHolder ?? userId)
						}
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
						onClick={() => openBeri(reportHolder as string)}
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
								? "Tap owner yang memberi — bisa lebih dari satu. Uang pribadi owner tercatat sebagai hutang Tetra ke owner itu."
								: pribadi
									? "Uang yang dipegang crew berkurang; saldo rekening Tetra tidak berubah."
									: "Saldo rekening bertambah, uang yang dipegang crew berkurang."}
						</p>
					</div>
					<div className="grid gap-3 sm:grid-cols-2">
						{mode === "kembali" && (
							<>
								<div className="space-y-1.5 sm:col-span-2">
									<span className="text-[13px] font-medium">
										Diterima siapa
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
										Uangnya masuk ke
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
											{`Dipegang ${ownerName(ownerId)}`}
										</button>
									</div>
									{pribadi && (
										<span className="type-caption text-muted-foreground">
											{`Mengurangi hutang Tetra ke ${ownerName(ownerId)}. Kalau lebih, ${ownerName(ownerId)} jadi berutang ke Tetra.`}
										</span>
									)}
								</div>
							</>
						)}
						<div className="space-y-1.5">
							<span className="text-[13px] font-medium">Crew</span>
							<NativeSelect
								value={userId}
								onValueChange={(v) => {
									setUserId(v);
									if (mode === "beri")
										setRows((rs) =>
											isiSisa(
												rs.map((r, i) =>
													i === rs.length - 1 ? { ...r, touched: false } : r,
												),
												sisaFor(v),
											),
										);
								}}
								aria-label="Crew"
								triggerClassName="h-10 w-full rounded-xl bg-background px-3 data-[size=default]:h-10"
								options={crew.map((c) => ({ value: c.user_id, label: c.name }))}
							/>
						</div>
						{mode === "kembali" && (
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
							</div>
						)}
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
						{(mode === "kembali" ? !pribadi : rows.some((r) => !r.pribadi)) && (
							<div className="space-y-1.5">
								<span className="text-[13px] font-medium">
									{mode === "beri" ? "Rekening Tetra" : "Masuk ke rekening"}
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
						{mode === "beri" && (
							<div className="space-y-2 sm:col-span-2">
								<span className="text-[13px] font-medium">Dari siapa</span>
								<div className="flex flex-wrap gap-1.5">
									{owners.map((o) => {
										const on = rows.some((r) => r.ownerId === o.id);
										return (
											<button
												key={o.id}
												type="button"
												aria-pressed={on}
												onClick={() => toggleGiver(o.id)}
												className={`h-9 rounded-full border px-4 text-[13px] font-medium transition-colors ${
													on
														? "border-transparent bg-foreground text-background"
														: "border-border-default hover:bg-secondary"
												}`}
											>
												{o.name}
											</button>
										);
									})}
								</div>
								{rows.map((r) => (
									<div
										key={r.ownerId}
										className="border-border-default bg-card space-y-2 rounded-xl border p-3"
									>
										<div className="flex flex-wrap items-center gap-2">
											<span className="w-14 shrink-0 text-[13px] font-semibold">
												{ownerName(r.ownerId)}
											</span>
											<div className="relative min-w-0 flex-1 basis-36">
												<span className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px]">
													Rp
												</span>
												<input
													type="number"
													inputMode="numeric"
													min={1}
													aria-label={`Jumlah dari ${ownerName(r.ownerId)}`}
													value={r.amount}
													onChange={(e) =>
														editRow(r.ownerId, {
															amount: e.target.value,
															touched: true,
														})
													}
													placeholder="200000"
													className={`${input} tabular pl-9`}
												/>
											</div>
											<div className="flex shrink-0 gap-1">
												{([true, false] as const).map((pr) => (
													<button
														key={String(pr)}
														type="button"
														aria-pressed={r.pribadi === pr}
														onClick={() => editRow(r.ownerId, { pribadi: pr })}
														className={`h-10 rounded-xl border px-3 text-[12.5px] font-medium transition-colors ${
															r.pribadi === pr
																? "border-transparent bg-foreground text-background"
																: "border-border-default hover:bg-secondary"
														}`}
													>
														{pr ? "Uang pribadi" : "Rek. Tetra"}
													</button>
												))}
											</div>
										</div>
										{method === "transfer" && (
											<AdminFeeChips
												presets={[0, 1000, 2500]}
												value={r.admin}
												onChange={(v) => editRow(r.ownerId, { admin: v })}
												ariaLabel={`Biaya admin transfer ${ownerName(r.ownerId)}`}
											/>
										)}
										<SingleFileUpload
											projectId={projectId}
											kind="uang_jalan"
											seq={`beri-${ownerName(r.ownerId).toLowerCase()}`}
											label={`Bukti transfer ${ownerName(r.ownerId)} (opsional)`}
											value={r.proof ?? null}
											onChange={(url) => editRow(r.ownerId, { proof: url })}
										/>
									</div>
								))}
								{sisaLapor > 0 && rows.length > 0 && (
									<p
										className={`text-[12.5px] ${
											rowsTotal === sisaLapor
												? "text-emerald-700"
												: "font-medium text-amber-700"
										}`}
									>
										Total{" "}
										<span className="tabular" data-nominal>
											{formatRupiah(rowsTotal)}
										</span>{" "}
										{rowsTotal === sisaLapor
											? "— pas dengan laporan crew ✓"
											: rowsTotal > sisaLapor
												? `— lebih ${formatRupiah(rowsTotal - sisaLapor)} dari laporan crew`
												: `— kurang ${formatRupiah(sisaLapor - rowsTotal)} dari laporan crew`}
										{given(userId) > 0 && (
											<span className="text-muted-foreground font-normal">
												{" "}
												(laporan {formatRupiah(report?.terima ?? 0)}, sudah
												tercatat {formatRupiah(given(userId))})
											</span>
										)}
									</p>
								)}
								{method === "transfer" && rows.some((r) => r.admin > 0) && (
									<p className="type-caption text-muted-foreground">
										Biaya admin dicatat sebagai biaya admin bank; yang dari uang
										pribadi ikut diganti ke owner-nya.
									</p>
								)}
							</div>
						)}
					</div>
					{mode === "kembali" && (
						<SingleFileUpload
							projectId={projectId}
							kind="uang_jalan"
							seq="kembali"
							label="Bukti pengembalian (opsional)"
							value={proof}
							onChange={setProof}
						/>
					)}
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
								!userId ||
								(mode === "beri"
									? rows.length === 0 ||
										rows.some((r) => !(Number(r.amount) > 0)) ||
										(rows.some((r) => !r.pribadi) && !account)
									: !(Number(amount) > 0) || (!pribadi && !account))
							}
							onClick={mode === "beri" ? submitBeri : submit}
							className="bg-foreground text-background h-10 rounded-full px-5 text-[13px] font-medium disabled:opacity-40"
						>
							{mode === "beri" ? "Simpan uang jalan" : "Simpan penerimaan"}
						</button>
					</div>
				</div>
			)}

			{transferOwner.length > 0 && (
				<div className="space-y-2 rounded-xl border border-emerald-600/20 bg-emerald-500/5 p-3 text-[13px]">
					<p className="font-semibold">
						Transfer owner untuk biaya{" "}
						<span className="font-normal text-muted-foreground">
							(di luar uang jalan)
						</span>
					</p>
					{[...new Set(transferOwner.map((t) => t.ownerId))].map((id) => {
						const rows = transferOwner.filter((t) => t.ownerId === id);
						return (
							<div key={id} className="space-y-0.5">
								<div className="flex justify-between gap-3 font-medium">
									<span>{rows[0].ownerName}</span>
									<span className="tabular" data-nominal>
										{formatRupiah(rows.reduce((t, r) => t + r.amount, 0))}
									</span>
								</div>
								{rows.map((r) => (
									<div
										key={r.label}
										className="flex justify-between gap-3 pl-3 text-muted-foreground"
									>
										<span>{r.label}</span>
										<span className="tabular" data-nominal>
											{formatRupiah(r.amount)}
										</span>
									</div>
								))}
							</div>
						);
					})}
					<p className="text-[12px] text-muted-foreground">
						Uangnya langsung habis untuk biaya itu — tidak dipotong dari fee
						crew. Sudah tercatat jadi hutang Tetra ke owner-nya (lunasi di
						Hutang-piutang owner). Kalau transfernya lebih dari biayanya, catat
						lewat <b>Catat uang jalan</b> supaya sisanya ikut dipotong saat
						bayar fee.
					</p>
				</div>
			)}

			{holders.length === 0 && !belumDicatat ? (
				mode === null &&
				transferOwner.length === 0 && (
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
							{given(u) - saldo(u) > 0 && (
								<div className="flex justify-between text-muted-foreground">
									<span>Sudah dipakai / dikembalikan / dipotong</span>
									<span className="tabular" data-nominal>
										− {formatRupiah(given(u) - saldo(u))}
									</span>
								</div>
							)}
							{(terpakaiRekap[u] ?? 0) > 0 && (
								<div className="flex justify-between text-muted-foreground">
									<span>Dipakai biaya lapangan (rekap crew)</span>
									<span className="tabular" data-nominal>
										− {formatRupiah(terpakaiRekap[u] ?? 0)}
									</span>
								</div>
							)}
							{(antre[u] ?? 0) > 0 && (
								<div className="flex justify-between text-muted-foreground">
									<span>Akan dipakai (diantre sampai settle)</span>
									<span className="tabular" data-nominal>
										− {formatRupiah(antre[u] ?? 0)}
									</span>
								</div>
							)}
							{sisaDiCrew(u) >= 0 ? (
								<div className="flex justify-between font-semibold">
									<span>Masih dipegang crew</span>
									<span className="tabular" data-nominal>
										{formatRupiah(sisaDiCrew(u))}
									</span>
								</div>
							) : (
								<div className="flex justify-between font-semibold text-amber-700">
									<span>Kurang — ditalangi crew</span>
									<span className="tabular" data-nominal>
										{formatRupiah(-sisaDiCrew(u))}
									</span>
								</div>
							)}
							<p className="mt-1 text-[12px] text-muted-foreground">
								{sisaDiCrew(u) < 0
									? "Kekurangannya ikut dibayar bersama fee crew ini."
									: sisaDiCrew(u) === 0
										? "Uang jalan habis terpakai."
										: report?.holder === u && report.sisa === "kembalikan"
											? "Crew memilih mengembalikan sisanya — tekan Terima sisa saat uangnya sudah masuk. Yang terpakai tetap dipotong saat Bayar fee."
											: "Sisanya otomatis dipotong saat Bayar fee crew ini."}
							</p>
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
					<div>
						<p className="flex flex-wrap items-baseline justify-between gap-2 text-[13px] font-semibold">
							Hutang-piutang owner (semua acara)
							<a
								href="/finance/hutang-owner"
								className="text-[12px] font-medium text-muted-foreground hover:text-foreground"
							>
								Riwayat & detail →
							</a>
						</p>
						<p className="text-[12px] text-muted-foreground">
							Bayar langsung sekarang, atau biarkan jadi hutang dulu & lunasi
							nanti sekalian dari Dashboard / Keuangan.
						</p>
					</div>
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
