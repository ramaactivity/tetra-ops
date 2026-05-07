import { Image as ImageIcon, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { ToggleBackdropActiveButton } from "@/components/backdrops/toggle-active-button";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { formatRupiah } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

type BackdropRow = {
	id: string;
	code: string;
	name: string;
	type: "basic_included" | "rental_owned" | "vendor_decor";
	rental_price: number;
	is_active: boolean;
	display_order: number;
	description: string | null;
};

const TYPE_LABEL: Record<string, string> = {
	basic_included: "Basic Included",
	rental_owned: "Rental Owned",
	vendor_decor: "Vendor Decor",
};

const TYPE_TONE: Record<
	string,
	{ variant: "default" | "secondary" | "outline"; className?: string }
> = {
	basic_included: {
		variant: "outline",
		className: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
	},
	rental_owned: {
		variant: "outline",
		className: "border-primary/30 bg-primary/10 text-primary",
	},
	vendor_decor: {
		variant: "outline",
		className:
			"border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
	},
};

export default async function BackdropsListPage() {
	const supabase = await createClient();
	const { data, error } = await supabase
		.from("backdrops")
		.select(
			"id, code, name, type, rental_price, is_active, display_order, description",
		)
		.order("display_order", { ascending: true })
		.order("name", { ascending: true });

	if (error) {
		return (
			<div className="border-destructive bg-destructive/10 rounded-md border p-4">
				<p className="text-destructive text-sm font-medium">
					Gagal memuat backdrops: {error.message}
				</p>
			</div>
		);
	}

	const rows = (data ?? []) as BackdropRow[];
	const activeCount = rows.filter((r) => r.is_active).length;
	const basicCount = rows.filter((r) => r.type === "basic_included").length;
	const rentalCount = rows.filter((r) => r.type === "rental_owned").length;

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h2 className="text-xl font-semibold tracking-tight">Backdrops</h2>
					<p className="text-muted-foreground text-sm">
						{rows.length} backdrop · {activeCount} aktif · {basicCount} basic ·{" "}
						{rentalCount} rental.
					</p>
				</div>
				<Link
					href="/settings/backdrops/new"
					className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium"
				>
					<Plus className="h-4 w-4" />
					New backdrop
				</Link>
			</div>

			{rows.length === 0 ? (
				<div className="border-border bg-card flex flex-col items-center gap-3 rounded-xl border border-dashed p-16 text-center">
					<ImageIcon className="text-muted-foreground h-10 w-10" />
					<div className="space-y-1">
						<h3 className="font-medium">Belum ada backdrop</h3>
						<p className="text-muted-foreground text-sm">
							Bikin backdrop pertama (basic / rental / vendor) supaya muncul di
							booking form.
						</p>
					</div>
				</div>
			) : (
				<div className="border-border bg-card overflow-x-auto rounded-lg border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Code</TableHead>
								<TableHead>Nama</TableHead>
								<TableHead>Tipe</TableHead>
								<TableHead className="text-right">Harga Sewa</TableHead>
								<TableHead>Status</TableHead>
								<TableHead className="w-[100px] text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((r) => {
								const tone = TYPE_TONE[r.type];
								return (
									<TableRow key={r.id}>
										<TableCell className="text-muted-foreground tabular text-xs">
											{r.code}
										</TableCell>
										<TableCell>
											<div className="space-y-0.5">
												<div className="font-medium">{r.name}</div>
												{r.description && (
													<div className="text-muted-foreground text-xs">
														{r.description}
													</div>
												)}
											</div>
										</TableCell>
										<TableCell>
											<Badge variant={tone.variant} className={tone.className}>
												{TYPE_LABEL[r.type] ?? r.type}
											</Badge>
										</TableCell>
										<TableCell className="tabular text-right text-sm">
											{r.rental_price > 0 ? (
												formatRupiah(r.rental_price)
											) : (
												<span className="text-muted-foreground">—</span>
											)}
										</TableCell>
										<TableCell>
											{r.is_active ? (
												<Badge variant="default">Aktif</Badge>
											) : (
												<Badge variant="secondary">Nonaktif</Badge>
											)}
										</TableCell>
										<TableCell>
											<div className="flex items-center justify-end gap-1">
												<Link
													href={`/settings/backdrops/${r.id}/edit`}
													title="Edit"
													className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors"
												>
													<Pencil className="h-4 w-4" />
												</Link>
												<ToggleBackdropActiveButton
													id={r.id}
													isActive={r.is_active}
													name={r.name}
												/>
											</div>
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</div>
			)}

			<p className="text-muted-foreground text-xs">
				<span className="font-medium">Basic</span> ikut gratis di booking ·{" "}
				<span className="font-medium">Rental</span> auto-add ke addons_total ·{" "}
				<span className="font-medium">Vendor Decor</span> minta owner isi field
				markup di booking form.
			</p>
		</div>
	);
}
