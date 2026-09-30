"use client";

import { Car, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SingleFileUpload } from "@/components/rekap/single-file-upload";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { MoneyInput } from "@/components/ui/form-fields";
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
	locked = false,
}: {
	eventId: string;
	projectId: string;
	initial: {
		mode: Mode;
		vehicle: string | null;
		rentalCost: number | null;
		notaUrl: string | null;
	};
	vehicles: string[];
	/** Event sudah di-settle — tampil saja. */
	locked?: boolean;
}) {
	const router = useRouter();
	const [pending, startTransition] = useTransition();
	const [mode, setMode] = useState<Mode>(initial.mode);
	const [vehicle, setVehicle] = useState(initial.vehicle ?? "");
	const [cost, setCost] = useState(initial.rentalCost ?? 0);
	const [nota, setNota] = useState<string | null>(initial.notaUrl);

	const dirty =
		mode !== initial.mode ||
		(mode === "rental" &&
			(vehicle !== (initial.vehicle ?? "") ||
				cost !== (initial.rentalCost ?? 0) ||
				nota !== initial.notaUrl));

	function save(next: Mode = mode) {
		startTransition(async () => {
			const res = await saveEventTransport({
				event_id: eventId,
				project_id: projectId,
				mode: next,
				vehicle,
				rental_cost: cost > 0 ? cost : null,
				nota_url: nota,
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
					Crew mengisi ongkos gocar/grab & buktinya sendiri di rekap.
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
							onValueChange={setVehicle}
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
					</div>
					<SingleFileUpload
						projectId={projectId}
						kind="nota"
						seq="transport"
						label="Nota sewa (opsional)"
						value={nota}
						onChange={setNota}
					/>
					<p className="text-[11.5px] leading-snug text-muted-foreground">
						Dibayar owner. Rekap crew otomatis terisi &ldquo;Sewa mobil&rdquo; —
						crew cukup isi bensin, tol & parkir.
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
