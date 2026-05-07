"use client";

import { CheckCircle2 } from "lucide-react";
import { useActionState } from "react";
import { type RekapFormState, submitRekap } from "@/lib/actions/rekap";

type Defaults = {
	cetak_total: string;
	media_set_used: string;
	sleeve_used: string;
	flashdisk_used: string;
	pouch_used: string;
	photomagnet_used: string;
	keychain_used: string;
	proof_photo_urls: string;
	crew_notes: string;
};

const EMPTY: Defaults = {
	cetak_total: "0",
	media_set_used: "0",
	sleeve_used: "0",
	flashdisk_used: "0",
	pouch_used: "0",
	photomagnet_used: "0",
	keychain_used: "0",
	proof_photo_urls: "",
	crew_notes: "",
};

export function RekapForm({
	eventId,
	projectId,
	defaults = EMPTY,
	mode,
}: {
	eventId: string;
	projectId: string;
	defaults?: Defaults;
	mode: "create" | "update";
}) {
	const action = submitRekap.bind(null, eventId, projectId);
	const [state, formAction, pending] = useActionState<RekapFormState, FormData>(
		action,
		undefined,
	);

	const get = (key: keyof Defaults) => {
		const v = state?.values?.[key as string];
		if (v !== undefined) return v;
		return String(defaults[key] ?? "");
	};
	const err = (key: string) =>
		(
			state?.errors?.[key as keyof typeof state.errors] as string[] | undefined
		)?.[0];

	return (
		<form action={formAction} className="space-y-5">
			{state?.success && (
				<div className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 rounded-md border p-3 text-sm font-medium inline-flex items-center gap-2">
					<CheckCircle2 className="h-4 w-4" />
					Rekap tersimpan. Owner akan review sebelum settlement.
				</div>
			)}
			{state?.errors?._form && (
				<div className="border-destructive bg-destructive/10 rounded-md border p-3">
					<p className="text-destructive text-sm font-medium">
						{state.errors._form[0]}
					</p>
				</div>
			)}

			<section className="border-border bg-card space-y-4 rounded-xl border p-5">
				<div>
					<h3 className="text-base font-semibold tracking-tight">Cetak</h3>
					<p className="text-muted-foreground text-xs">
						Hitung total dari counter mesin atau manual.
					</p>
				</div>
				<div className="grid gap-4 sm:grid-cols-3">
					<NumField
						label="Total cetak (pcs)"
						name="cetak_total"
						value={get("cetak_total")}
						error={err("cetak_total")}
					/>
					<NumField
						label="Media Set terpakai"
						name="media_set_used"
						value={get("media_set_used")}
						error={err("media_set_used")}
						hint="1 media set = ~140 cetak"
					/>
					<NumField
						label="Sleeve terpakai (pcs)"
						name="sleeve_used"
						value={get("sleeve_used")}
						error={err("sleeve_used")}
						hint="Biasanya = total cetak"
					/>
				</div>
			</section>

			<section className="border-border bg-card space-y-4 rounded-xl border p-5">
				<div>
					<h3 className="text-base font-semibold tracking-tight">
						Flashdisk & Pouch
					</h3>
					<p className="text-muted-foreground text-xs">
						Hanya jika package include FD/Pouch.
					</p>
				</div>
				<div className="grid gap-4 sm:grid-cols-2">
					<NumField
						label="Flashdisk terpakai"
						name="flashdisk_used"
						value={get("flashdisk_used")}
						error={err("flashdisk_used")}
					/>
					<NumField
						label="Pouch terpakai"
						name="pouch_used"
						value={get("pouch_used")}
						error={err("pouch_used")}
					/>
				</div>
			</section>

			<section className="border-border bg-card space-y-4 rounded-xl border p-5">
				<div>
					<h3 className="text-base font-semibold tracking-tight">Add-on</h3>
					<p className="text-muted-foreground text-xs">
						Photomagnet / keychain — kalau dipakai.
					</p>
				</div>
				<div className="grid gap-4 sm:grid-cols-2">
					<NumField
						label="Photomagnet terpakai"
						name="photomagnet_used"
						value={get("photomagnet_used")}
						error={err("photomagnet_used")}
					/>
					<NumField
						label="Keychain terpakai"
						name="keychain_used"
						value={get("keychain_used")}
						error={err("keychain_used")}
					/>
				</div>
			</section>

			<section className="border-border bg-card space-y-4 rounded-xl border p-5">
				<div>
					<h3 className="text-base font-semibold tracking-tight">Bukti</h3>
					<p className="text-muted-foreground text-xs">
						Foto display counter, area event, atau dokumentasi consumable. Wajib
						minimal 1.
					</p>
				</div>
				<div className="space-y-1.5">
					<label htmlFor="proof_photo_urls" className="text-sm font-medium">
						URL Foto Bukti
						<span className="text-primary ml-0.5">*</span>
					</label>
					<textarea
						id="proof_photo_urls"
						name="proof_photo_urls"
						rows={3}
						required
						defaultValue={get("proof_photo_urls")}
						placeholder={`https://drive.google.com/...\nhttps://drive.google.com/...`}
						className={`${inputClass} resize-none font-mono text-xs`}
					/>
					{err("proof_photo_urls") ? (
						<p className="text-destructive text-xs">
							{err("proof_photo_urls")}
						</p>
					) : (
						<p className="text-muted-foreground text-xs">
							Pisah dengan baris baru atau koma.
						</p>
					)}
				</div>

				<div className="space-y-1.5">
					<label htmlFor="crew_notes" className="text-sm font-medium">
						Catatan crew
					</label>
					<textarea
						id="crew_notes"
						name="crew_notes"
						rows={3}
						maxLength={1000}
						defaultValue={get("crew_notes")}
						placeholder="Apa yang perlu owner tahu — alat rusak, request klien, dst"
						className={`${inputClass} resize-none`}
					/>
				</div>
			</section>

			<div className="flex justify-end pt-1">
				<button
					type="submit"
					disabled={pending}
					className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 items-center rounded-md px-4 text-sm font-medium disabled:opacity-60"
				>
					{pending
						? "Menyimpan…"
						: mode === "create"
							? "Submit rekap"
							: "Update rekap"}
				</button>
			</div>
		</form>
	);
}

function NumField({
	label,
	name,
	value,
	error,
	hint,
}: {
	label: string;
	name: string;
	value: string;
	error?: string;
	hint?: string;
}) {
	return (
		<div className="space-y-1.5">
			<label htmlFor={name} className="text-sm font-medium">
				{label}
			</label>
			<input
				id={name}
				name={name}
				type="number"
				inputMode="numeric"
				min={0}
				step={1}
				defaultValue={value}
				className={`${inputClass} tabular`}
			/>
			{error ? (
				<p className="text-destructive text-xs">{error}</p>
			) : hint ? (
				<p className="text-muted-foreground text-xs">{hint}</p>
			) : null}
		</div>
	);
}

const inputClass =
	"border-border bg-background text-foreground focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-sm placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:outline-none";
