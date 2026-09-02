"use client";

import { Building2, ExternalLink, Merge, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useId, useMemo, useState } from "react";
import {
	type CatalogColumn,
	CatalogExplorer,
} from "@/components/catalog/catalog-explorer";
import {
	Field,
	FormError,
	fieldInputClass,
} from "@/components/catalog/form-kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import {
	mergeVenues,
	setVenueActive,
	updateVenue,
	type VenueFormState,
} from "@/lib/actions/venues";
import { cn } from "@/lib/utils";

export type VenueRow = {
	id: string;
	name: string;
	address: string | null;
	city: string | null;
	province: string | null;
	googleMapsUrl: string | null;
	notes: string | null;
	isActive: boolean;
	eventCount: number;
	lastEventDate: string | null;
};

function errOf(state: VenueFormState, key: string): string | undefined {
	return state?.errors?.[key]?.[0];
}

function Dash() {
	return <span className="text-muted-foreground">—</span>;
}

// ---------------------------------------------------------------------------
// Tabel
// ---------------------------------------------------------------------------

export function VenuesExplorer({ venues }: { venues: VenueRow[] }) {
	const router = useRouter();
	const [editing, setEditing] = useState<VenueRow | null>(null);
	const [merging, setMerging] = useState<VenueRow | null>(null);
	const [busyId, setBusyId] = useState<string | null>(null);

	async function toggleActive(v: VenueRow) {
		setBusyId(v.id);
		const res = await setVenueActive(v.id, !v.isActive);
		setBusyId(null);
		if (!res.ok) {
			toast.error(res.error ?? "Gagal mengubah status venue");
			return;
		}
		toast.success(v.isActive ? "Venue diarsipkan" : "Venue diaktifkan lagi");
		router.refresh();
	}

	const columns: CatalogColumn<VenueRow>[] = [
		{
			key: "name",
			header: "Venue",
			cell: (v) => (
				<div className="min-w-0">
					<span className="text-foreground font-medium">{v.name}</span>
					{!v.isActive ? (
						<span className="bg-secondary text-muted-foreground ml-2 rounded-full px-2 py-0.5 text-[11px] font-medium">
							Arsip
						</span>
					) : null}
					{v.address ? (
						<p className="text-muted-foreground truncate text-[12px]">
							{v.address}
						</p>
					) : null}
				</div>
			),
		},
		{
			key: "city",
			header: "Kota",
			cell: (v) =>
				v.city ? (
					<span className="text-muted-foreground">{v.city}</span>
				) : (
					<Dash />
				),
		},
		{
			key: "maps",
			header: "Maps",
			cell: (v) =>
				v.googleMapsUrl ? (
					<a
						href={v.googleMapsUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="text-primary inline-flex items-center gap-1 text-[12px] font-medium hover:underline"
					>
						Buka <ExternalLink className="size-3" aria-hidden />
					</a>
				) : (
					<span className="text-[12px] font-medium text-amber-700 dark:text-amber-300">
						Belum ada
					</span>
				),
		},
		{
			key: "usage",
			header: "Dipakai",
			cell: (v) =>
				v.eventCount > 0 ? (
					<span className="tabular">
						{v.eventCount}×
						{v.lastEventDate ? (
							<span className="text-muted-foreground ml-1 text-[11px]">
								· {v.lastEventDate}
							</span>
						) : null}
					</span>
				) : (
					<Badge variant="secondary">Belum pernah</Badge>
				),
		},
	];

	return (
		<>
			<CatalogExplorer
				rows={venues}
				columns={columns}
				getId={(v) => v.id}
				searchText={(v) =>
					`${v.name} ${v.address ?? ""} ${v.city ?? ""} ${v.province ?? ""}`
				}
				searchPlaceholder="Cari venue, alamat, kota…"
				cardSubtitle={(v) => v.city ?? v.address ?? ""}
				emptyIcon={Building2}
				emptyTitle="Belum ada venue"
				emptyDescription="Venue tersimpan otomatis begitu dipakai di booking."
				renderActions={(v) => (
					<div className="flex items-center gap-1">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="h-8 rounded-full"
							onClick={() => setEditing(v)}
						>
							<Pencil className="size-3.5" aria-hidden />
							Edit
						</Button>
						{v.isActive ? (
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="h-8 rounded-full"
								onClick={() => setMerging(v)}
							>
								<Merge className="size-3.5" aria-hidden />
								Gabung
							</Button>
						) : null}
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="text-muted-foreground h-8 rounded-full"
							disabled={busyId === v.id}
							onClick={() => toggleActive(v)}
						>
							{v.isActive ? "Arsipkan" : "Aktifkan"}
						</Button>
					</div>
				)}
			/>

			<EditVenueDialog venue={editing} onClose={() => setEditing(null)} />
			<MergeVenueDialog
				source={merging}
				venues={venues}
				onClose={() => setMerging(null)}
			/>
		</>
	);
}

// ---------------------------------------------------------------------------
// Edit
// ---------------------------------------------------------------------------

function EditVenueDialog({
	venue,
	onClose,
}: {
	venue: VenueRow | null;
	onClose: () => void;
}) {
	const id = useId();
	const router = useRouter();
	const [state, action, pending] = useActionState(updateVenue, undefined);

	useEffect(() => {
		if (!state?.ok) return;
		toast.success("Venue diperbarui");
		onClose();
		router.refresh();
	}, [state, onClose, router]);

	return (
		<Dialog
			open={venue !== null}
			onOpenChange={(o) => !o && !pending && onClose()}
		>
			<DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Edit {venue?.name}</DialogTitle>
					<DialogDescription>
						Yang diisi di sini dipakai untuk booking BERIKUTNYA. Event lama
						tidak ikut berubah — alamatnya adalah catatan saat acara
						berlangsung.
					</DialogDescription>
				</DialogHeader>

				{/* key: paksa form dibangun ulang tiap ganti venue supaya defaultValue
				    tidak menempel dari baris sebelumnya. */}
				<form key={venue?.id} action={action} className="space-y-4">
					<FormError message={errOf(state, "_form")} />
					<input type="hidden" name="id" value={venue?.id ?? ""} />

					<Field
						label="Nama venue"
						name={`${id}-name`}
						error={errOf(state, "name")}
						required
					>
						<input
							id={`${id}-name`}
							name="name"
							required
							maxLength={120}
							defaultValue={venue?.name ?? ""}
							className={fieldInputClass}
						/>
					</Field>

					<Field
						label="Alamat"
						name={`${id}-address`}
						error={errOf(state, "address")}
					>
						<input
							id={`${id}-address`}
							name="address"
							maxLength={255}
							defaultValue={venue?.address ?? ""}
							placeholder="Jl. …"
							className={fieldInputClass}
						/>
					</Field>

					<div className="grid gap-4 sm:grid-cols-2">
						<Field
							label="Kota / Kabupaten"
							name={`${id}-city`}
							error={errOf(state, "city")}
						>
							<input
								id={`${id}-city`}
								name="city"
								maxLength={60}
								defaultValue={venue?.city ?? ""}
								placeholder="cth. Kota Bogor"
								className={fieldInputClass}
							/>
						</Field>
						<Field
							label="Provinsi"
							name={`${id}-province`}
							error={errOf(state, "province")}
						>
							<input
								id={`${id}-province`}
								name="province"
								maxLength={60}
								defaultValue={venue?.province ?? ""}
								placeholder="cth. Jawa Barat"
								className={fieldInputClass}
							/>
						</Field>
					</div>

					<Field
						label="Google Maps URL"
						name={`${id}-maps`}
						hint="Diisi sekali di sini, ikut terpakai di semua booking berikutnya."
						error={errOf(state, "google_maps_url")}
					>
						<input
							id={`${id}-maps`}
							name="google_maps_url"
							maxLength={500}
							defaultValue={venue?.googleMapsUrl ?? ""}
							placeholder="https://maps.app.goo.gl/…"
							className={fieldInputClass}
						/>
					</Field>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={onClose}
							disabled={pending}
						>
							Batal
						</Button>
						<Button type="submit" disabled={pending}>
							{pending ? "Menyimpan…" : "Simpan"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

// ---------------------------------------------------------------------------
// Gabung duplikat
// ---------------------------------------------------------------------------

function MergeVenueDialog({
	source,
	venues,
	onClose,
}: {
	source: VenueRow | null;
	venues: VenueRow[];
	onClose: () => void;
}) {
	const id = useId();
	const router = useRouter();
	const [state, action, pending] = useActionState(mergeVenues, undefined);
	const [targetId, setTargetId] = useState("");
	const [renameEvents, setRenameEvents] = useState(true);

	useEffect(() => {
		setTargetId("");
		setRenameEvents(true);
	}, []);

	useEffect(() => {
		if (!state?.ok) return;
		toast.success(state.info ?? "Venue digabung");
		onClose();
		router.refresh();
	}, [state, onClose, router]);

	const options: ComboboxOption[] = useMemo(
		() =>
			venues
				.filter((v) => v.isActive && v.id !== source?.id)
				.map((v) => ({
					value: v.id,
					label: v.name,
					sublabel:
						[v.city, v.eventCount > 0 ? `${v.eventCount}× dipakai` : null]
							.filter(Boolean)
							.join(" · ") || undefined,
				})),
		[venues, source?.id],
	);
	const target = venues.find((v) => v.id === targetId) ?? null;

	return (
		<Dialog
			open={source !== null}
			onOpenChange={(o) => !o && !pending && onClose()}
		>
			<DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Gabungkan {source?.name}</DialogTitle>
					<DialogDescription>
						Untuk dua entri yang sebenarnya tempat yang sama. Semua event pindah
						ke venue tujuan, lalu {source?.name} diarsipkan.
					</DialogDescription>
				</DialogHeader>

				<form key={source?.id} action={action} className="space-y-4">
					<FormError message={errOf(state, "_form")} />
					<input type="hidden" name="source_id" value={source?.id ?? ""} />
					<input type="hidden" name="target_id" value={targetId} />

					<Field
						label="Gabungkan ke venue"
						name={`${id}-target`}
						hint="Pilih entri yang mau dipertahankan — biasanya yang paling sering dipakai."
						error={errOf(state, "target_id")}
						required
					>
						<Combobox
							id={`${id}-target`}
							value={targetId}
							onValueChange={(v) => setTargetId(v ?? "")}
							options={options}
							allowFreeText={false}
							placeholder="Pilih venue tujuan…"
							aria-label="Venue tujuan penggabungan"
						/>
					</Field>

					{target ? (
						<div className="bg-surface-2 space-y-1 rounded-xl px-3 py-2 text-[13px]">
							<p>
								<span className="text-muted-foreground">
									{source?.eventCount ?? 0} event
								</span>{" "}
								dari <strong>{source?.name}</strong> pindah ke{" "}
								<strong>{target.name}</strong>.
							</p>
							<p className="text-muted-foreground text-[12px]">
								Alamat, kota, dan link Maps yang cuma dimiliki {source?.name}{" "}
								ikut disalin ke {target.name} — menggabungkan tidak membuang
								data.
							</p>
						</div>
					) : null}

					<label className="flex items-start gap-2 text-[13px]">
						<input
							type="checkbox"
							name="rename_events"
							checked={renameEvents}
							onChange={(e) => setRenameEvents(e.target.checked)}
							className="border-border-default mt-0.5 size-4 rounded"
						/>
						<span>
							Samakan juga nama venue di event lama
							<span className="text-muted-foreground block text-[12px]">
								Nyalakan kalau ejaan lama memang salah ketik. Matikan kalau nama
								itu benar-benar dipakai waktu acaranya — catatan event sebaiknya
								apa adanya.
							</span>
						</span>
					</label>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={onClose}
							disabled={pending}
						>
							Batal
						</Button>
						<Button
							type="submit"
							disabled={pending || !targetId}
							className={cn(!targetId && "opacity-60")}
						>
							{pending ? "Menggabungkan…" : "Gabungkan"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
