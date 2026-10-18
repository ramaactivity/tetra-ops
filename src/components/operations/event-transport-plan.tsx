"use client";

import { Car, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SingleFileUpload } from "@/components/rekap/single-file-upload";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { MoneyInput } from "@/components/ui/form-fields";
import { NativeSelect } from "@/components/ui/native-select";
import { toast } from "@/components/ui/toaster";
import { saveEventTransport } from "@/lib/actions/event-transport";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

type Mode = "rental" | "online" | null;

const MODES: Array<{ value: Mode; label: string }> = [
	{ value: null, label: "Belum diatur" },
	{ value: "rental", label: "Sewa mobil" },
	{ value: "online", label: "Online (Gocar/Grab)" },
];

/**
 * Transport event — diisi owner di bawah Crew Incharge. Sewa mobil = dibayar
 * owner: rekap crew ikut terisi otomatis, crew tidak perlu mengisi lagi.
 */
export function EventTransportPlan({
	eventId,
	projectId,
	initial,
	vehicles,
	owners = [],
	lastPrices = [],
	cashAccounts = [],
	locked = false,
}: {
	eventId: string;
	projectId: string;
	initial: {
		mode: Mode;
		vehicle: string | null;
		rentalCost: number | null;
		notaUrl: string | null;
		/** Owner pembayar sewa (users.id) — jadi hutang ke owner itu. */
		paidByOwnerId?: string | null;
		/** Diganti langsung saat settle dari rekening ini (null = hutang dulu). */
		reimburseAccount?: string | null;
	};
	/** Rekening Tetra (tanpa kartu e-toll) — pilihan "diganti langsung". */
	cashAccounts?: Array<{ code: string; name: string; balance: number }>;
	vehicles: string[];
	/** Owner aktif — pilihan "Dibayar oleh". */
	owners?: Array<{ id: string; name: string }>;
	/** Harga sewa acara-acara sebelumnya, terbaru dulu — dasar saran harga. */
	lastPrices?: Array<{ vehicle: string | null; cost: number }>;
	/** Event sudah di-settle — tampil saja. */
	locked?: boolean;
}) {
	const router = useRouter();
	const [pending, startTransition] = useTransition();
	const [mode, setMode] = useState<Mode>(initial.mode);
	const [vehicle, setVehicle] = useState(initial.vehicle ?? "");
	const [cost, setCost] = useState(initial.rentalCost ?? 0);
	const [nota, setNota] = useState<string | null>(initial.notaUrl);
	const [paidBy, setPaidBy] = useState<string | null>(
		initial.paidByOwnerId ?? null,
	);
	const [reimburse, setReimburse] = useState<string | null>(
		initial.reimburseAccount ?? null,
	);
	const rekeningBawaan =
		[...cashAccounts].sort((a, b) => b.balance - a.balance)[0]?.code ?? null;
	const ownerName = (id: string | null | undefined) =>
		owners.find((o) => o.id === id)?.name;
	// Saran harga: harga terakhir mobil yang sama, kalau belum pernah →
	// harga sewa terakhir apa pun. Tetap bisa diubah.
	const saranHarga = (v: string) =>
		lastPrices.find((p) => p.vehicle?.toLowerCase() === v.trim().toLowerCase())
			?.cost ?? lastPrices[0]?.cost;
	const saran = vehicle.trim() ? saranHarga(vehicle) : lastPrices[0]?.cost;
	function pickVehicle(v: string) {
		setVehicle(v);
		// Isi otomatis hanya kalau harga belum diketik / masih saran sebelumnya.
		const s = saranHarga(v);
		if (s && (cost === 0 || cost === saranHarga(vehicle))) setCost(s);
	}

	const dirty =
		mode !== initial.mode ||
		(mode === "rental" &&
			(vehicle !== (initial.vehicle ?? "") ||
				cost !== (initial.rentalCost ?? 0) ||
				nota !== initial.notaUrl ||
				paidBy !== (initial.paidByOwnerId ?? null) ||
				reimburse !== (initial.reimburseAccount ?? null)));

	function save(next: Mode = mode) {
		startTransition(async () => {
			const res = await saveEventTransport({
				event_id: eventId,
				project_id: projectId,
				mode: next,
				vehicle,
				rental_cost: cost > 0 ? cost : null,
				nota_url: nota,
				paid_by_owner_id: paidBy,
				reimburse_account: paidBy ? reimburse : null,
			});
			if (!res.ok) {
				toast.error(res.error);
				return;
			}
			toast.success("Transport disimpan — rekap crew ikut menyesuaikan.");
			router.refresh();
		});
	}

	function pickMode(next: Mode) {
		setMode(next);
		// Online / belum diatur tidak punya isian lanjutan → langsung simpan.
		if (next !== "rental" && next !== initial.mode) save(next);
	}

	if (locked) {
		return (
			<div className="mt-3 flex items-center gap-2 text-[12px] text-muted-foreground">
				<Car className="size-4" aria-hidden />
				{initial.mode === "rental"
					? `Sewa ${initial.vehicle ?? "mobil"}`
					: initial.mode === "online"
						? "Transport online"
						: "Transport belum diatur"}
				{initial.mode === "rental" && initial.rentalCost ? (
					<span className="tabular">· {formatRupiah(initial.rentalCost)}</span>
				) : null}
				{initial.mode === "rental" && ownerName(initial.paidByOwnerId) ? (
					<span>
						· dibayar {ownerName(initial.paidByOwnerId)}
						{initial.reimburseAccount ? " (diganti langsung)" : " (hutang)"}
					</span>
				) : null}
			</div>
		);
	}

	return (
		<div className="mt-3 space-y-3 rounded-2xl border border-border-default p-3">
			<p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
				<Car className="size-4" aria-hidden />
				Transport
			</p>
			<div className="flex flex-wrap gap-1.5">
				{MODES.map((m) => (
					<button
						key={m.label}
						type="button"
						disabled={pending}
						onClick={() => pickMode(m.value)}
						className={cn(
							"h-8 rounded-full border px-3 text-[13px] font-medium transition-colors",
							mode === m.value
								? "border-[#059669] bg-[#059669] text-white"
								: "border-border-default bg-card text-muted-foreground hover:text-foreground",
						)}
					>
						{m.label}
					</button>
				))}
			</div>

			{mode === "online" && (
				<p className="text-[12px] leading-snug text-muted-foreground">
					Crew mengisi ongkos gocar/grab & buktinya sendiri di rekap. Top-up
					saldo GoPay/OVO dari owner ke crew dicatat sebagai{" "}
					<a
						href={`/operations/${projectId}/rekap`}
						className="font-medium text-foreground underline underline-offset-2"
					>
						uang jalan
					</a>{" "}
					(Catat uang jalan → Transfer / top-up → pilih owner pemberi); crew
					memilih &ldquo;💵 Uang jalan dari owner&rdquo; di ongkosnya.
				</p>
			)}

			{mode === "rental" && (
				<div className="space-y-2.5">
					<div className="space-y-1">
						<span className="block text-[12px] font-medium text-muted-foreground">
							Mobil
						</span>
						<Combobox
							value={vehicle}
							onValueChange={pickVehicle}
							options={vehicles.map((v) => ({ value: v, label: v }))}
							placeholder="Pilih atau ketik mobil baru"
						/>
					</div>
					<div className="space-y-1">
						<span className="block text-[12px] font-medium text-muted-foreground">
							Harga sewa{" "}
							<span className="font-normal">(boleh diisi nanti)</span>
						</span>
						<MoneyInput value={cost} onValueChange={setCost} />
						{saran && saran !== cost ? (
							<button
								type="button"
								onClick={() => setCost(saran)}
								className="rounded-full border border-border-default bg-card px-2.5 py-0.5 text-[11.5px] font-medium text-muted-foreground hover:text-foreground"
							>
								Harga terakhir{" "}
								<span className="tabular" data-nominal>
									{formatRupiah(saran)}
								</span>
							</button>
						) : null}
					</div>
					<SingleFileUpload
						projectId={projectId}
						kind="nota"
						seq="transport"
						label="Nota sewa (opsional)"
						value={nota}
						onChange={setNota}
					/>
					{owners.length > 0 && (
						<div className="space-y-1">
							<span className="block text-[12px] font-medium text-muted-foreground">
								Dibayar oleh
							</span>
							<div className="flex flex-wrap gap-1.5">
								{owners.map((o) => (
									<button
										key={o.id}
										type="button"
										aria-pressed={paidBy === o.id}
										onClick={() => setPaidBy(paidBy === o.id ? null : o.id)}
										className={cn(
											"h-8 rounded-full border px-3 text-[13px] font-medium transition-colors",
											paidBy === o.id
												? "border-[#059669] bg-[#059669] text-white"
												: "border-border-default bg-card text-muted-foreground hover:text-foreground",
										)}
									>
										{o.name}
									</button>
								))}
							</div>
						</div>
					)}
					{paidBy && (
						<div className="space-y-1.5">
							<div className="flex flex-wrap gap-1.5">
								{(
									[
										[false, "Jadi hutang dulu"],
										[true, "Diganti langsung saat settle"],
									] as const
								).map(([langsung, label]) => (
									<button
										key={label}
										type="button"
										aria-pressed={Boolean(reimburse) === langsung}
										onClick={() =>
											setReimburse(
												langsung ? (reimburse ?? rekeningBawaan) : null,
											)
										}
										className={cn(
											"h-8 rounded-full border px-3 text-[13px] font-medium transition-colors",
											Boolean(reimburse) === langsung
												? "border-[#059669] bg-[#059669] text-white"
												: "border-border-default bg-card text-muted-foreground hover:text-foreground",
										)}
									>
										{label}
									</button>
								))}
							</div>
							{reimburse && (
								<NativeSelect
									value={reimburse}
									onValueChange={setReimburse}
									aria-label="Rekening pengganti"
									triggerClassName="h-9 w-full rounded-xl bg-background px-3"
									options={cashAccounts.map((a) => ({
										value: a.code,
										label: `${a.name} · ${formatRupiah(a.balance)}`,
									}))}
								/>
							)}
						</div>
					)}
					<p className="text-[11.5px] leading-snug text-muted-foreground">
						{!paidBy
							? "Dibayar owner — pilih siapa supaya otomatis jadi hutang ke owner itu."
							: reimburse
								? `Dibayar ${ownerName(paidBy)}, diganti langsung saat settle dari rekening di atas — tidak jadi hutang.`
								: `Dibayar ${ownerName(paidBy)} — jadi hutang Tetra ke ${ownerName(paidBy)}, lunasi kapan saja (kartu Hutang-piutang owner).`}{" "}
						Rekap crew otomatis terisi &ldquo;Sewa mobil&rdquo; — crew cukup isi
						bensin, tol & parkir.
					</p>
				</div>
			)}

			{dirty && mode === "rental" && (
				<Button
					type="button"
					size="sm"
					onClick={() => save()}
					disabled={pending || !vehicle.trim()}
					className="w-full gap-2"
				>
					{pending ? <Loader2 className="size-4 animate-spin" /> : null}
					Simpan transport
				</Button>
			)}
		</div>
	);
}
