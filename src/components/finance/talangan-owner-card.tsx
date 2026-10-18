"use client";

import { Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AdminFeeChips } from "@/components/finance/admin-fee-chips";
import { CatatTalanganOwner } from "@/components/finance/catat-talangan-owner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { NativeSelect } from "@/components/ui/native-select";
import {
	batalBayarTalangan,
	bayarTalanganOwner,
} from "@/lib/actions/uang-jalan";
import { formatRupiah } from "@/lib/format";
import { labelItem } from "@/lib/rekap/uang-jalan";
import type { TalanganOwnerSaldo } from "@/lib/rekap/uang-jalan-db";

type Account = { code: string; name: string; balance?: number };

/**
 * Hutang-piutang Tetra ↔ owner (uang pribadi owner untuk uang jalan crew).
 * Saldo positif = Tetra berutang ke owner → "Bayar"; negatif = owner berutang
 * ke Tetra → "Terima". Jumlah boleh sebagian (dicicil).
 */
export function TalanganOwnerCard({
	owners,
	cashAccounts,
	eventId,
	compact = false,
}: {
	owners: TalanganOwnerSaldo[];
	cashAccounts: Account[];
	/** Diisi kalau dilunasi dari halaman rekap acara (untuk jejak jurnal). */
	eventId?: string;
	/**
	 * Hanya saldo + bayar/cicil (rincian & riwayat ditampilkan di tabel
	 * halaman Hutang Owner).
	 */
	compact?: boolean;
}) {
	return (
		<div className={compact ? "space-y-3" : "grid gap-3 sm:grid-cols-2"}>
			{owners.map((o) => (
				<Row
					key={o.id}
					owner={o}
					cashAccounts={cashAccounts}
					eventId={eventId}
					compact={compact}
				/>
			))}
		</div>
	);
}

function Row({
	owner,
	cashAccounts,
	eventId,
	compact = false,
}: {
	owner: TalanganOwnerSaldo;
	cashAccounts: Account[];
	eventId?: string;
	compact?: boolean;
}) {
	const router = useRouter();
	const [pending, start] = useTransition();
	const bayar = owner.saldo > 0;
	const lunas = owner.saldo === 0;
	const sisa = Math.abs(owner.saldo);
	const [open, setOpen] = useState(false);
	const [amount, setAmount] = useState(String(sisa));
	const [account, setAccount] = useState(
		[...cashAccounts].sort((a, b) => (b.balance ?? 0) - (a.balance ?? 0))[0]
			?.code ?? "",
	);
	const [adminFee, setAdminFee] = useState(0);
	const [date, setDate] = useState(
		new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10),
	);
	const verb = bayar ? `Bayar ke ${owner.name}` : `Terima dari ${owner.name}`;
	const BatalButton = BatalTalanganButton;

	return (
		<div className="space-y-2 rounded-2xl border border-border-subtle bg-card p-4">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<p className="truncate text-[14px] font-semibold text-foreground">
						{owner.name}
					</p>
					<p className="text-[12px] text-muted-foreground">
						{lunas
							? "Lunas"
							: bayar
								? `Tetra berutang ke ${owner.name}`
								: `${owner.name} berutang ke Tetra`}
					</p>
				</div>
				<span
					data-nominal
					className={`tabular shrink-0 text-[18px] font-bold ${lunas ? "text-emerald-700" : bayar ? "text-amber-700" : "text-sky-700"}`}
				>
					{formatRupiah(sisa)}
				</span>
			</div>
			{!compact && !lunas && owner.rincian.length > 0 && (
				<ul className="space-y-0.5 border-t border-border-subtle pt-2 text-[12.5px]">
					{owner.rincian.map((it) => (
						<li
							key={`${it.label}|${it.date}|${it.amount}`}
							className="flex items-center justify-between gap-3"
						>
							{it.projectId ? (
								<Link
									href={`/operations/${it.projectId}/rekap`}
									className="min-w-0 truncate text-muted-foreground hover:text-foreground"
								>
									{labelItem(it)}
								</Link>
							) : (
								<span className="min-w-0 truncate text-muted-foreground">
									{labelItem(it)}
								</span>
							)}
							<span className="flex shrink-0 items-center gap-1">
								<span className="tabular" data-nominal>
									{formatRupiah(it.sisa)}
									{it.sisa < it.amount && (
										<span className="text-muted-foreground"> sisa</span>
									)}
								</span>
								{it.batalId && <BatalButton id={it.batalId} />}
							</span>
						</li>
					))}
				</ul>
			)}
			{!compact && owner.riwayat.length > 0 && (
				<ul className="space-y-1 border-t border-border-subtle pt-2 text-[12.5px]">
					{owner.riwayat.map((r) => (
						<li key={r.id} className="flex items-start justify-between gap-2">
							<span className="min-w-0 text-muted-foreground">
								<span className="block truncate">
									{r.direction === "bayar" ? "Dibayar ke" : "Diterima dari"}{" "}
									{owner.name} ·{" "}
									{new Date(r.created_at).toLocaleDateString("id-ID")}
								</span>
								{r.note && (
									<span className="block text-[11.5px] leading-snug">
										{r.note}
									</span>
								)}
							</span>
							<span className="flex shrink-0 items-center gap-1">
								<span className="tabular" data-nominal>
									{formatRupiah(r.amount)}
								</span>
								<BatalButton id={r.id} />
							</span>
						</li>
					))}
				</ul>
			)}
			{lunas ? null : open ? (
				<div className="space-y-3 border-t border-border-subtle pt-3">
					<label className="block space-y-1.5">
						<span className="text-[13px] font-medium">Jumlah</span>
						<div className="relative">
							<span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[13px] text-muted-foreground">
								Rp
							</span>
							<input
								type="number"
								inputMode="numeric"
								min={1}
								max={sisa}
								value={amount}
								onChange={(e) => setAmount(e.target.value)}
								className="tabular h-10 w-full rounded-xl border border-border-default bg-background pr-3 pl-9 text-[13px]"
							/>
						</div>
						<span className="type-caption text-muted-foreground">
							Isi sebagian kalau dicicil.
						</span>
					</label>
					<div className="space-y-1.5">
						<span className="text-[13px] font-medium">
							{bayar ? "Dari rekening" : "Masuk ke rekening"}
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
					{bayar && (
						<div className="space-y-1.5">
							<span className="text-[13px] font-medium">
								Biaya admin transfer
							</span>
							<AdminFeeChips
								presets={[0, 1000, 2500]}
								value={adminFee}
								onChange={setAdminFee}
								ariaLabel="Biaya admin transfer"
							/>
						</div>
					)}
					<div className="flex justify-end gap-2">
						<button
							type="button"
							onClick={() => setOpen(false)}
							className="h-10 rounded-full px-4 text-[13px] font-medium hover:bg-secondary"
						>
							Batal
						</button>
						<button
							type="button"
							disabled={
								pending ||
								!account ||
								!(Number(amount) > 0) ||
								Number(amount) > sisa
							}
							onClick={() =>
								start(async () => {
									const r = await bayarTalanganOwner({
										ownerId: owner.id,
										direction: bayar ? "bayar" : "terima",
										amount: Number(amount),
										accountCode: account,
										adminFee: bayar ? adminFee : 0,
										date,
										eventId: eventId ?? null,
									});
									if (!r.ok) return void toast.error(r.error);
									toast.success(r.note ?? "Tersimpan");
									setOpen(false);
									router.refresh();
								})
							}
							className="h-10 rounded-full bg-foreground px-5 text-[13px] font-medium text-background disabled:opacity-40"
						>
							Simpan
						</button>
					</div>
				</div>
			) : (
				<button
					type="button"
					onClick={() => {
						setAmount(String(sisa));
						setOpen(true);
					}}
					className="h-9 w-full rounded-full bg-foreground text-[13px] font-medium text-background"
				>
					{verb}
				</button>
			)}
		</div>
	);
}

/**
 * Bagian "Hutang-piutang owner" lengkap (judul + tombol Catat + kartu per
 * owner) — satu komponen untuk Dashboard & Keuangan supaya keduanya sama.
 */
export function HutangPiutangOwner({
	owners,
	list,
	cashAccounts,
}: {
	owners: Array<{ id: string; name: string }>;
	list: TalanganOwnerSaldo[];
	cashAccounts: Account[];
}) {
	return (
		<div className="space-y-3">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0 flex-1 basis-60">
					<h3 className="type-heading">Hutang-piutang owner</h3>
					<p className="type-secondary mt-0.5">
						Antara Tetra dan owner: uang jalan, biaya yang dibayarin owner,
						pinjaman. Dilunasi sekaligus atau dicicil.
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<Link
						href="/finance/hutang-owner"
						className="text-[12.5px] font-medium text-muted-foreground hover:text-foreground"
					>
						Riwayat & detail →
					</Link>
					<CatatTalanganOwner owners={owners} cashAccounts={cashAccounts} />
				</div>
			</div>
			{list.length > 0 ? (
				<TalanganOwnerCard owners={list} cashAccounts={cashAccounts} />
			) : (
				<p className="rounded-xl bg-secondary/60 px-3 py-2.5 text-[13px] text-muted-foreground">
					Tidak ada hutang-piutang dengan owner.
				</p>
			)}
		</div>
	);
}

/** Batalkan catatan hutang-piutang owner (jurnal pembalik) — kartu & riwayat. */
export function BatalTalanganButton({ id }: { id: string }) {
	const router = useRouter();
	const confirm = useConfirm();
	const [pending, start] = useTransition();
	return (
		<button
			type="button"
			aria-label="Batalkan catatan"
			disabled={pending}
			onClick={async () => {
				if (
					!(await confirm({
						title: "Batalkan catatan ini?",
						description:
							"Jurnalnya dibalik dan saldo hutang-piutang kembali seperti sebelumnya. Data tidak dihapus.",
						confirmLabel: "Batalkan",
						variant: "destructive",
					}))
				)
					return;
				start(async () => {
					const res = await batalBayarTalangan(id);
					if (!res.ok) return void toast.error(res.error);
					toast.success(res.note ?? "Dibatalkan");
					router.refresh();
				});
			}}
			className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-secondary disabled:opacity-40"
		>
			<Undo2 className="size-3.5" />
		</button>
	);
}
