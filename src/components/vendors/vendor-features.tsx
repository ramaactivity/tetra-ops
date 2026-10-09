"use client";

import {
	Coins,
	Eye,
	type LucideIcon,
	MonitorSmartphone,
	UserPlus,
} from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { updateVendorSettings } from "@/lib/actions/vendor-hub";
import { PARTNER_LEVELS, type VendorSettings } from "@/lib/vendor-settings";

const ROWS: Array<{
	k: Exclude<keyof VendorSettings, "partner_level">;
	icon: LucideIcon;
	title: string;
	on: string;
	off: string;
}> = [
	{
		k: "portal_enabled",
		icon: MonitorSmartphone,
		title: "Akses dasbor rekanan",
		on: "Orang vendor yang diundang bisa masuk dan melihat semua acara vendor ini.",
		off: "Dasbor rekanan & akses WO di semua acara vendor ini ditutup (data tetap ada).",
	},
	{
		k: "show_commission",
		icon: Coins,
		title: "Tampilkan komisi di dasbor",
		on: "Rekap komisi per acara & status bayar terlihat oleh vendor.",
		off: "Komisi disembunyikan dari vendor; tetap tercatat di Ops.",
	},
	{
		k: "can_invite_clients",
		icon: UserPlus,
		title: "Vendor boleh mengundang klien",
		on: "Vendor bisa mengundang kliennya ke dashboard acara dari menu Orang & akses.",
		off: "Hanya admin Tetra yang mengundang klien acara vendor ini.",
	},
	{
		k: "client_price_visible_default",
		icon: Eye,
		title: "Klien melihat harga (bawaan)",
		on: "Booking baru vendor ini: klien undangan melihat total, tagihan & invoice.",
		off: "Booking baru vendor ini: harga Tetra disembunyikan dari klien. Vendor tetap bisa mengubah per booking.",
	},
];

export function VendorFeatures({
	contactId,
	settings: initial,
}: {
	contactId: string;
	settings: VendorSettings;
}) {
	const [s, setS] = useState(initial);
	const [pending, start] = useTransition();

	const save = (patch: Partial<VendorSettings>) => {
		const prev = s;
		setS({ ...s, ...patch });
		start(async () => {
			const r = await updateVendorSettings(contactId, patch);
			if (!r.ok) {
				setS(prev);
				toast.error(r.error);
			} else toast.success("Pengaturan vendor disimpan");
		});
	};

	return (
		<div className="space-y-3">
			<div className="border-border-default bg-card space-y-3 rounded-2xl border p-5 shadow-[var(--shadow-level-2)]">
				<div>
					<h3 className="type-heading">Status kerja sama</h3>
					<p className="type-secondary">
						Label internal untuk tim Tetra. Tidak terlihat oleh vendor.
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					{(
						Object.keys(PARTNER_LEVELS) as Array<
							VendorSettings["partner_level"]
						>
					).map((k) => (
						<button
							key={k}
							type="button"
							disabled={pending}
							onClick={() => save({ partner_level: k })}
							aria-pressed={s.partner_level === k}
							className={`h-8 rounded-full border px-3.5 text-[13px] font-medium ${
								s.partner_level === k
									? "border-transparent bg-foreground text-background"
									: "border-border-default bg-card hover:bg-secondary"
							}`}
						>
							{PARTNER_LEVELS[k]}
						</button>
					))}
				</div>
			</div>

			<div className="border-border-default bg-card divide-border-default divide-y rounded-2xl border shadow-[var(--shadow-level-2)]">
				{ROWS.map((r) => {
					const I = r.icon;
					const on = s[r.k];
					return (
						<div key={r.k} className="flex items-start gap-3 p-4">
							<span className="bg-secondary text-muted-foreground grid size-9 shrink-0 place-items-center rounded-xl">
								<I className="size-4" aria-hidden />
							</span>
							<div className="min-w-0 flex-1">
								<p className="text-fluid-body font-medium">{r.title}</p>
								<p className="type-caption text-muted-foreground">
									{on ? r.on : r.off}
								</p>
							</div>
							<Switch
								checked={on}
								disabled={pending}
								onCheckedChange={() => save({ [r.k]: !on })}
								aria-label={r.title}
							/>
						</div>
					);
				})}
			</div>
		</div>
	);
}
