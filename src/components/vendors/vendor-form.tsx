"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { VendorFormState } from "@/lib/actions/vendors";

export type VendorFormDefaults = Partial<{
	name: string;
	default_pic_name: string;
	default_pic_contact: string;
	commission_mode: "commission" | "upfront_cut";
	commission_value_type: "percent" | "flat";
	commission_value_default: number;
	payment_terms: string;
	company_address: string;
	email: string;
	notes: string;
}>;

const inputClass =
	"h-10 w-full rounded-md border border-border-default bg-card px-3 text-[14px] text-foreground placeholder:text-muted-foreground/60 transition-colors focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

const labelClass =
	"flex flex-col gap-1.5 text-[13px] font-medium text-foreground";

const hintClass = "text-[12px] font-normal text-muted-foreground leading-snug";

const errClass = "text-[12px] font-medium text-rose-600 dark:text-rose-400";

export function VendorForm({
	action,
	defaults,
	submitLabel = "Save vendor",
	successMessage = "Vendor disimpan!",
}: {
	action: (
		prev: VendorFormState,
		formData: FormData,
	) => Promise<VendorFormState>;
	defaults?: VendorFormDefaults;
	submitLabel?: string;
	successMessage?: string;
}) {
	const router = useRouter();
	const [state, formAction, pending] = useActionState<
		VendorFormState,
		FormData
	>(action, undefined);

	const stateValues =
		state && "values" in state ? state.values : undefined;
	const stateErrors =
		state && "errors" in state ? state.errors : undefined;
	const success = state && "ok" in state ? state : null;

	const get = (key: keyof VendorFormDefaults, fallback?: string): string =>
		stateValues?.[key] ??
		(defaults?.[key] as string | number | undefined)?.toString() ??
		fallback ??
		"";

	const err = (key: keyof VendorFormDefaults) =>
		stateErrors?.[key as keyof typeof stateErrors]?.[0];

	const formErr = stateErrors?._form?.[0];

	// Commission scheme state — mode + value_type drive UI.
	// Initial from server echo (post-submit) > defaults > fallback.
	const initialMode = (get("commission_mode", "commission") as
		| "commission"
		| "upfront_cut");
	const initialValueType = (get("commission_value_type", "percent") as
		| "percent"
		| "flat");
	const [mode, setMode] = useState<"commission" | "upfront_cut">(initialMode);
	const [valueType, setValueType] = useState<"percent" | "flat">(
		initialValueType,
	);

	// Redirect to list page on success after a brief confirmation
	useEffect(() => {
		if (success) {
			const t = setTimeout(() => {
				router.push("/settings/vendors");
			}, 1100);
			return () => clearTimeout(t);
		}
	}, [success, router]);

	return (
		<form action={formAction} className="space-y-6 pb-32">
			{success && (
				<div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
					<div className="flex items-center gap-3">
						<CheckCircle2
							className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400"
							aria-hidden
						/>
						<div>
							<p className="text-[14px] font-medium text-emerald-900 dark:text-emerald-100">
								{successMessage}
							</p>
							<p className="text-[12px] text-emerald-800/80 dark:text-emerald-300/80">
								Mengarahkan ke daftar vendor…
							</p>
						</div>
					</div>
				</div>
			)}

			{formErr && (
				<div className="rounded-lg border border-rose-200 bg-rose-50/60 p-4 dark:border-rose-900 dark:bg-rose-950/30">
					<p className="text-[14px] font-medium text-rose-700 dark:text-rose-300">
						{formErr}
					</p>
				</div>
			)}

			<section className="space-y-4 rounded-lg border border-border-default bg-surface-2 p-5">
				<header className="space-y-0.5">
					<h3 className="text-[15px] font-semibold tracking-tight">
						Informasi Vendor
					</h3>
					<p className="text-[12px] text-muted-foreground">
						Nama vendor yang muncul di booking form. Wajib unik.
					</p>
				</header>

				<label className={labelClass}>
					Nama Vendor / Perusahaan <span className="text-rose-500">*</span>
					<input
						type="text"
						name="name"
						defaultValue={get("name")}
						placeholder="cth. Partner Organizer"
						required
						maxLength={120}
						className={inputClass}
						aria-invalid={Boolean(err("name"))}
					/>
					{err("name") && <span className={errClass}>{err("name")}</span>}
				</label>
			</section>

			<section className="space-y-4 rounded-lg border border-border-default bg-surface-2 p-5">
				<header className="space-y-0.5">
					<h3 className="text-[15px] font-semibold tracking-tight">
						Default PIC
					</h3>
					<p className="text-[12px] text-muted-foreground">
						Sales / account manager utama. Auto-fills booking form saat vendor
						ini dipilih.
					</p>
				</header>

				<div className="grid gap-4 md:grid-cols-2">
					<label className={labelClass}>
						Nama PIC / Sales
						<input
							type="text"
							name="default_pic_name"
							defaultValue={get("default_pic_name")}
							placeholder="cth. Nisa"
							maxLength={120}
							className={inputClass}
						/>
						<span className={hintClass}>
							Nama orang yang biasanya kita kontak dari vendor.
						</span>
						{err("default_pic_name") && (
							<span className={errClass}>{err("default_pic_name")}</span>
						)}
					</label>

					<label className={labelClass}>
						WA / HP PIC
						<input
							type="tel"
							name="default_pic_contact"
							defaultValue={get("default_pic_contact")}
							placeholder="08xxxxxxxxxx"
							maxLength={60}
							className={`${inputClass} tabular`}
						/>
						<span className={hintClass}>
							Format: 08xxx (auto-convert ke 628xxx di link WhatsApp).
						</span>
						{err("default_pic_contact") && (
							<span className={errClass}>{err("default_pic_contact")}</span>
						)}
					</label>
				</div>
			</section>

			<section className="space-y-4 rounded-lg border border-border-default bg-surface-2 p-5">
				<header className="space-y-0.5">
					<h3 className="text-[15px] font-semibold tracking-tight">
						Skema Komisi
					</h3>
					<p className="text-[12px] text-muted-foreground">
						Cara Tetra deal dengan vendor ini. Bisa di-override per booking.
					</p>
				</header>

				{/* Mode segmented control */}
				<div role="radiogroup" aria-label="Mode komisi" className="space-y-2">
					<ModeOption
						value="commission"
						label="Komisi Langsung"
						description="Klien bayar Tetra full, Tetra transfer komisi ke vendor setelah event."
						checked={mode === "commission"}
						onSelect={() => setMode("commission")}
					/>
					<ModeOption
						value="upfront_cut"
						label="Potongan Langsung"
						description="Vendor potong jumlah tetap dari setiap event (mis. Rp 500K). Klien tetap pilih paket dari katalog Tetra; vendor ambil fee saat transfer. Tetra terima = base − potongan."
						checked={mode === "upfront_cut"}
						onSelect={() => setMode("upfront_cut")}
					/>
				</div>
				<input type="hidden" name="commission_mode" value={mode} />

				<div className="grid gap-4 md:grid-cols-2">
					{mode === "commission" ? (
						<>
							<div className={labelClass}>
								<span>Tipe Nilai Komisi</span>
								<div
									role="radiogroup"
									aria-label="Tipe nilai komisi"
									className="inline-flex rounded-md border border-border-default bg-card p-0.5"
								>
									<TypeChip
										label="Persentase (%)"
										checked={valueType === "percent"}
										onSelect={() => setValueType("percent")}
									/>
									<TypeChip
										label="Nominal (Rp)"
										checked={valueType === "flat"}
										onSelect={() => setValueType("flat")}
									/>
								</div>
								<input
									type="hidden"
									name="commission_value_type"
									value={valueType}
								/>
								<span className={hintClass}>
									Persentase: 10% dari grand_total. Nominal: rupiah flat per
									event.
								</span>
							</div>
							<label className={labelClass}>
								Nilai Komisi Default
								<div className="relative">
									{valueType === "flat" && (
										<span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground">
											Rp
										</span>
									)}
									<input
										type="number"
										name="commission_value_default"
										defaultValue={get("commission_value_default", "10")}
										min={0}
										max={valueType === "percent" ? 100 : undefined}
										step={valueType === "percent" ? 0.5 : 1000}
										placeholder={valueType === "percent" ? "10" : "500000"}
										className={cn(
											inputClass,
											"tabular",
											valueType === "flat" ? "pl-9" : "pr-8",
										)}
									/>
									{valueType === "percent" && (
										<span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground">
											%
										</span>
									)}
								</div>
								<span className={hintClass}>
									{valueType === "percent"
										? "Standar industri 10%. Owner bisa override saat input booking."
										: "Komisi flat yang Tetra bayarkan ke vendor per event."}
								</span>
								{err("commission_value_default") && (
									<span className={errClass}>
										{err("commission_value_default")}
									</span>
								)}
							</label>
						</>
					) : (
						<label className={cn(labelClass, "md:col-span-2")}>
							Potongan Default Vendor per Event
							<div className="relative">
								<span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground">
									Rp
								</span>
								<input
									type="number"
									name="commission_value_default"
									defaultValue={get("commission_value_default")}
									min={0}
									step={50000}
									placeholder="500000"
									className={cn(inputClass, "tabular pl-9")}
								/>
							</div>
							<input
								type="hidden"
								name="commission_value_type"
								value="flat"
							/>
							<span className={hintClass}>
								Jumlah yang vendor potong dari harga paket Tetra per event.
								Klien tetap pilih paket dari katalog kita; vendor ambil fee
								tetap ini saat transfer ke Tetra (mis. Partner Organizer = Rp
								500.000, Party Planner = Rp 300.000). Bisa di-override per
								booking.
							</span>
							{err("commission_value_default") && (
								<span className={errClass}>
									{err("commission_value_default")}
								</span>
							)}
						</label>
					)}

					<label className={cn(labelClass, mode === "upfront_cut" && "md:col-span-2")}>
						Payment Terms
						<input
							type="text"
							name="payment_terms"
							defaultValue={get("payment_terms")}
							placeholder='cth. "Net 14" atau "Pelunasan H+7"'
							maxLength={200}
							className={inputClass}
						/>
						<span className={hintClass}>
							Catatan kapan pembayaran flow. Optional, untuk reference.
						</span>
						{err("payment_terms") && (
							<span className={errClass}>{err("payment_terms")}</span>
						)}
					</label>
				</div>
			</section>

			<section className="space-y-4 rounded-lg border border-border-default bg-surface-2 p-5">
				<header className="space-y-0.5">
					<h3 className="text-[15px] font-semibold tracking-tight">
						Detail Tambahan
					</h3>
					<p className="text-[12px] text-muted-foreground">
						Optional — untuk keperluan kontrak / invoice / catatan internal.
					</p>
				</header>

				<label className={labelClass}>
					Email
					<input
						type="email"
						name="email"
						defaultValue={get("email")}
						placeholder="info@vendor.com"
						className={inputClass}
					/>
					{err("email") && <span className={errClass}>{err("email")}</span>}
				</label>

				<label className={labelClass}>
					Alamat Perusahaan
					<textarea
						name="company_address"
						defaultValue={get("company_address")}
						placeholder="Alamat untuk invoice / kontrak"
						rows={2}
						maxLength={500}
						className={`${inputClass} min-h-[60px] resize-y py-2`}
					/>
					{err("company_address") && (
						<span className={errClass}>{err("company_address")}</span>
					)}
				</label>

				<label className={labelClass}>
					Catatan Internal
					<textarea
						name="notes"
						defaultValue={get("notes")}
						placeholder="Catatan apapun tentang vendor ini (mis. preferensi koordinasi, dll)"
						rows={3}
						maxLength={1000}
						className={`${inputClass} min-h-[80px] resize-y py-2`}
					/>
					{err("notes") && <span className={errClass}>{err("notes")}</span>}
				</label>
			</section>

			{/* Sticky footer */}
			<div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 border-t border-border-default bg-background/95 supports-[backdrop-filter]:bg-background/85 backdrop-blur md:bottom-0">
				<div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 md:px-8 md:py-4">
					<Link
						href="/settings/vendors"
						className="text-[13px] font-medium text-muted-foreground hover:text-foreground"
					>
						Batal
					</Link>
					<Button
						type="submit"
						variant="default"
						size="lg"
						disabled={pending || Boolean(success)}
					>
						{pending ? (
							<>
								<Loader2 className="size-4 animate-spin" />
								Menyimpan…
							</>
						) : success ? (
							<>
								<CheckCircle2 className="size-4" />
								Tersimpan
							</>
						) : (
							submitLabel
						)}
					</Button>
				</div>
			</div>
		</form>
	);
}

function ModeOption({
	value,
	label,
	description,
	checked,
	onSelect,
}: {
	value: string;
	label: string;
	description: string;
	checked: boolean;
	onSelect: () => void;
}) {
	return (
		<label
			className={cn(
				"flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors",
				checked
					? "border-primary bg-primary/5"
					: "border-border-default bg-card hover:border-border-strong hover:bg-secondary/40",
			)}
		>
			<input
				type="radio"
				name="commission_mode_picker"
				value={value}
				checked={checked}
				onChange={onSelect}
				className="mt-0.5 size-4 accent-primary"
			/>
			<span className="flex flex-col gap-0.5">
				<span className="text-[14px] font-medium leading-tight text-foreground">
					{label}
				</span>
				<span className="text-[12px] leading-snug text-muted-foreground">
					{description}
				</span>
			</span>
		</label>
	);
}

function TypeChip({
	label,
	checked,
	onSelect,
}: {
	label: string;
	checked: boolean;
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			role="radio"
			aria-checked={checked}
			onClick={onSelect}
			className={cn(
				"inline-flex h-8 items-center rounded-[4px] px-3 text-[12.5px] font-medium leading-none transition-colors",
				checked
					? "bg-foreground text-background"
					: "text-muted-foreground hover:text-foreground",
			)}
		>
			{label}
		</button>
	);
}
