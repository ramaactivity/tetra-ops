"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { RichTextarea } from "@/components/ui/rich-textarea";
import type { VendorFormState } from "@/lib/actions/vendors";
import { cn } from "@/lib/utils";

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
	"h-10 w-full rounded-xl border border-border-default bg-background px-3 text-base md:text-[14px] text-foreground placeholder:text-muted-foreground/60 transition-colors focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

const labelClass =
	"flex flex-col gap-1.5 text-[13px] font-medium text-foreground";

const hintClass = "text-[12px] font-normal text-muted-foreground leading-snug";

const errClass = "text-[12px] font-medium text-rose-600 dark:text-rose-400";

export function VendorForm({
	action,
	defaults,
	submitLabel = "Save vendor",
	successMessage = "Vendor disimpan!",
	doneHref = "/vendors",
}: {
	action: (
		prev: VendorFormState,
		formData: FormData,
	) => Promise<VendorFormState>;
	defaults?: VendorFormDefaults;
	submitLabel?: string;
	successMessage?: string;
	/** Tujuan setelah tersimpan (edit → kembali ke Pusat Vendor). */
	doneHref?: string;
}) {
	const router = useRouter();
	const [state, formAction, pending] = useActionState<
		VendorFormState,
		FormData
	>(action, undefined);

	const stateValues = state && "values" in state ? state.values : undefined;
	const stateErrors = state && "errors" in state ? state.errors : undefined;
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
	const initialMode = get("commission_mode", "commission") as
		| "commission"
		| "upfront_cut";
	const initialValueType = get("commission_value_type", "percent") as
		| "percent"
		| "flat";
	const [mode, setMode] = useState<"commission" | "upfront_cut">(initialMode);
	const [valueType, setValueType] = useState<"percent" | "flat">(
		initialValueType,
	);

	// Redirect to list page on success after a brief confirmation
	useEffect(() => {
		if (success) {
			const t = setTimeout(() => {
				router.push(doneHref);
			}, 1100);
			return () => clearTimeout(t);
		}
	}, [success, router, doneHref]);

	const section =
		"space-y-4 rounded-2xl border border-border-default bg-card p-5 shadow-[var(--shadow-level-2)]";
	const head = (title: string, desc: string) => (
		<header className="space-y-0.5">
			<h3 className="type-heading">{title}</h3>
			<p className="type-secondary">{desc}</p>
		</header>
	);
	const isPct = valueType === "percent";

	return (
		<form action={formAction} className="space-y-3">
			{success && (
				<div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
					<CheckCircle2
						className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400"
						aria-hidden
					/>
					<div>
						<p className="text-[14px] font-medium text-emerald-900 dark:text-emerald-100">
							{successMessage}
						</p>
						<p className="text-[12px] text-emerald-800/80 dark:text-emerald-300/80">
							Mengarahkan kembali…
						</p>
					</div>
				</div>
			)}

			{formErr && (
				<div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4 dark:border-rose-900 dark:bg-rose-950/30">
					<p className="text-[14px] font-medium text-rose-700 dark:text-rose-300">
						{formErr}
					</p>
				</div>
			)}

			<section className={section}>
				{head(
					"Profil vendor",
					"Nama yang muncul di pilihan vendor pada form booking. Harus unik.",
				)}
				<label className={labelClass}>
					<span>
						Nama vendor / perusahaan <span className="text-rose-500">*</span>
					</span>
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
				<div className="grid gap-4 md:grid-cols-2">
					<label className={labelClass}>
						Kontak utama
						<input
							type="text"
							name="default_pic_name"
							defaultValue={get("default_pic_name")}
							placeholder="cth. Teh Puput"
							maxLength={120}
							className={inputClass}
						/>
						{err("default_pic_name") && (
							<span className={errClass}>{err("default_pic_name")}</span>
						)}
					</label>
					<label className={labelClass}>
						Nomor WhatsApp kontak utama
						<input
							type="tel"
							name="default_pic_contact"
							defaultValue={get("default_pic_contact")}
							placeholder="08xxxxxxxxxx"
							maxLength={60}
							className={`${inputClass} tabular`}
						/>
						{err("default_pic_contact") && (
							<span className={errClass}>{err("default_pic_contact")}</span>
						)}
					</label>
				</div>
				<p className={hintClass}>
					Terisi otomatis di form booking saat vendor ini dipilih. Semua orang
					vendor (owner, planner, PIC lapangan) & akses dasbornya diatur di
					Pusat Vendor → Tim.
				</p>
			</section>

			<section className={section}>
				{head(
					"Cara kerja sama",
					"Jadi bawaan booking baru vendor ini. Tetap bisa diubah per booking; acara yang sudah ada tidak berubah.",
				)}
				<div
					role="radiogroup"
					aria-label="Cara kerja sama"
					className="grid gap-2 md:grid-cols-2"
				>
					<ModeOption
						value="commission"
						label="Komisi"
						flow="Klien → Tetra, lalu Tetra → vendor"
						description="Klien membayar penuh ke Tetra. Setelah acara ditutup, Tetra mentransfer komisi ke vendor."
						checked={mode === "commission"}
						onSelect={() => setMode("commission")}
					/>
					<ModeOption
						value="upfront_cut"
						label="Potongan langsung"
						flow="Klien → vendor, lalu vendor → Tetra"
						description="Klien membayar ke vendor. Vendor memotong bagiannya, lalu menyetor sisanya ke Tetra."
						checked={mode === "upfront_cut"}
						onSelect={() => setMode("upfront_cut")}
					/>
				</div>
				<input type="hidden" name="commission_mode" value={mode} />

				<div className="grid gap-4 md:grid-cols-2">
					<div className={labelClass}>
						<span>Hitung dari</span>
						<div className="inline-flex w-fit rounded-full border border-border-default bg-background p-0.5">
							<TypeChip
								label="Persen (%)"
								checked={isPct}
								onSelect={() => setValueType("percent")}
							/>
							<TypeChip
								label="Nominal (Rp)"
								checked={!isPct}
								onSelect={() => setValueType("flat")}
							/>
						</div>
						<input
							type="hidden"
							name="commission_value_type"
							value={valueType}
						/>
						<span className={hintClass}>
							{isPct
								? mode === "upfront_cut"
									? "Persen dari harga paket Tetra."
									: "Persen dari total tagihan acara."
								: "Nominal tetap per acara."}
						</span>
					</div>
					<label className={labelClass}>
						{mode === "upfront_cut" ? "Potongan vendor" : "Komisi vendor"}
						<div className="relative">
							{!isPct && (
								<span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground">
									Rp
								</span>
							)}
							<input
								type="number"
								name="commission_value_default"
								defaultValue={get("commission_value_default", "10")}
								min={0}
								max={isPct ? 100 : undefined}
								step={isPct ? 0.5 : 1000}
								placeholder={isPct ? "10" : "500000"}
								className={cn(inputClass, "tabular", isPct ? "pr-8" : "pl-9")}
							/>
							{isPct && (
								<span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground">
									%
								</span>
							)}
						</div>
						<span className={hintClass}>
							{mode === "upfront_cut"
								? "Bagian yang vendor ambil per acara (mis. Rp 500.000)."
								: "Yang Tetra bayarkan ke vendor per acara."}
						</span>
						{err("commission_value_default") && (
							<span className={errClass}>
								{err("commission_value_default")}
							</span>
						)}
					</label>
					<label className={cn(labelClass, "md:col-span-2")}>
						Termin bayar
						<input
							type="text"
							name="payment_terms"
							defaultValue={get("payment_terms")}
							placeholder='cth. "Lunas H-7" atau "14 hari setelah acara"'
							maxLength={200}
							className={inputClass}
						/>
						<span className={hintClass}>
							Kesepakatan kapan uang dibayar. Opsional, sebagai catatan.
						</span>
						{err("payment_terms") && (
							<span className={errClass}>{err("payment_terms")}</span>
						)}
					</label>
				</div>
			</section>

			<section className={section}>
				{head(
					"Detail tambahan",
					"Opsional, untuk kontrak, invoice, atau catatan internal.",
				)}
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
				<label className={labelClass} htmlFor="company_address">
					Alamat perusahaan
					<RichTextarea
						id="company_address"
						name="company_address"
						defaultValue={get("company_address")}
						placeholder="Alamat untuk invoice / kontrak"
						rows={2}
						maxLength={500}
						toolbar={false}
					/>
					{err("company_address") && (
						<span className={errClass}>{err("company_address")}</span>
					)}
				</label>
				<label className={labelClass} htmlFor="notes">
					Catatan internal
					<RichTextarea
						id="notes"
						name="notes"
						defaultValue={get("notes")}
						placeholder="Mis. preferensi koordinasi, kebiasaan bayar, dll."
						rows={3}
						maxLength={1000}
						toolbar={false}
					/>
					{err("notes") && <span className={errClass}>{err("notes")}</span>}
				</label>
			</section>

			{/* Bilah simpan menempel di bawah area konten (tidak menutupi sidebar). */}
			<div className="sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 flex items-center justify-end gap-2 rounded-2xl border border-border-default bg-card/95 p-2.5 shadow-[var(--shadow-level-3)] backdrop-blur md:bottom-3">
				<Link
					href={doneHref}
					className="hover:bg-secondary inline-flex h-10 items-center rounded-full px-4 text-[13px] font-medium text-muted-foreground"
				>
					Batal
				</Link>
				<Button
					type="submit"
					variant="default"
					disabled={pending || Boolean(success)}
					className="h-10 rounded-full px-5"
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
		</form>
	);
}

function ModeOption({
	value,
	label,
	flow,
	description,
	checked,
	onSelect,
}: {
	value: string;
	label: string;
	flow: string;
	description: string;
	checked: boolean;
	onSelect: () => void;
}) {
	return (
		<label
			className={cn(
				"flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors",
				checked
					? "border-[#059669] bg-emerald-500/5"
					: "border-border-default bg-card hover:bg-secondary/40",
			)}
		>
			<input
				type="radio"
				name="commission_mode_picker"
				value={value}
				checked={checked}
				onChange={onSelect}
				className="mt-0.5 size-4 shrink-0 accent-[#059669]"
			/>
			<span className="flex min-w-0 flex-col gap-0.5">
				<span className="text-[14px] font-semibold leading-tight text-foreground">
					{label}
				</span>
				<span className="text-[12.5px] font-medium text-foreground/80">
					{flow}
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
			aria-pressed={checked}
			onClick={onSelect}
			className={cn(
				"inline-flex h-8 items-center rounded-full px-3.5 text-[12.5px] font-medium leading-none transition-colors",
				checked
					? "bg-[#059669] text-white"
					: "text-muted-foreground hover:text-foreground",
			)}
		>
			{label}
		</button>
	);
}
