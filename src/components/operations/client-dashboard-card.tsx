"use client";

import {
	Check,
	Copy,
	ExternalLink,
	Eye,
	LayoutDashboard,
	Loader2,
	Send,
} from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { inviteClientDashboard } from "@/lib/actions/portal-invite";

/**
 * Kartu "Dashboard klien" di detail event: buka akses booking.tetraphoto.com
 * untuk klien event buatan admin (galeri, invoice, detail acara) lalu kirim
 * link lewat WA bot. Event dari booking portal sudah punya link — tampil saja.
 */
const VENDOR_ROLES = ["Owner", "Planner", "PIC lapangan"];

export function ClientDashboardCard({
	eventId,
	link: initialLink,
	previewLink,
	defaultName,
	defaultPhone,
	vendor,
}: {
	eventId: string;
	link: string | null;
	/** Link bertanda tangan "Lihat sebagai klien" (2 jam), null kalau belum ada booking. */
	previewLink?: string | null;
	defaultName: string;
	defaultPhone: string;
	/** Event lewat vendor/WO: boleh kirim ke vendor (dasbor rekanan) atau klien. */
	vendor?: {
		name: string;
		phone: string;
		/** Siapa yang membayar ke Tetra (dari mode komisi event). */
		payer: "klien" | "wo" | null;
		/** Orang vendor dari master vendor (owner, PIC lapangan, planner, …). */
		people?: Array<{ name: string; phone: string; role: string | null }>;
		/** Nomor (62…) yang sudah punya dasbor rekanan vendor ini. */
		invited?: string[];
	} | null;
}) {
	const [link, setLink] = useState(initialLink);
	const [as, setAs] = useState<"klien" | "wo">(vendor ? "wo" : "klien");
	const first = vendor?.people?.[0];
	const [name, setName] = useState(
		vendor ? (first?.name ?? vendor.name) : defaultName,
	);
	const [phone, setPhone] = useState(
		vendor ? (first?.phone ?? vendor.phone) : defaultPhone,
	);
	const people = vendor?.people ?? [];
	const [role, setRole] = useState<string>(first?.role ?? "Owner");
	const [who, setWho] = useState<number | "lain">(people.length ? 0 : "lain");
	const pickPerson = (i: number | "lain") => {
		setWho(i);
		if (i === "lain") {
			setName("");
			setPhone("");
			setRole("PIC lapangan");
		} else {
			setName(people[i].name);
			setPhone(people[i].phone);
			setRole(people[i].role ?? "");
		}
	};
	const isInvited = (p: string) =>
		(vendor?.invited ?? []).some(
			(x) => x.replace(/\D/g, "").slice(-9) === p.replace(/\D/g, "").slice(-9),
		);
	const pickAs = (v: "klien" | "wo") => {
		setAs(v);
		if (v === "wo" && people.length) return pickPerson(0);
		setName(v === "wo" ? (vendor?.name ?? "") : defaultName);
		setPhone(v === "wo" ? (vendor?.phone ?? "") : defaultPhone);
	};
	const [error, setError] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	const [pending, start] = useTransition();

	const invite = (send: boolean) => {
		setError(null);
		start(async () => {
			const r = await inviteClientDashboard(eventId, {
				name,
				phone,
				send,
				as,
				...(as === "wo" && role ? { role } : {}),
			});
			if (!r.ok) return setError(r.error);
			setLink(r.url);
			toast.success(
				r.sent
					? `Link dashboard dikirim ke WhatsApp ${as === "wo" ? "vendor" : "klien"}`
					: "Akses dashboard dibuat",
			);
		});
	};

	return (
		<div className="border-border-default bg-card md:col-span-2 space-y-4 rounded-2xl border p-5 shadow-[var(--shadow-level-2)]">
			<div className="flex items-center gap-2">
				<LayoutDashboard className="text-primary size-4" />
				<h3 className="type-heading">Dashboard klien</h3>
			</div>
			<p className="type-secondary">
				Klien masuk ke booking.tetraphoto.com pakai nomor WhatsApp-nya (tanpa
				password) untuk melihat galeri foto, invoice & kuitansi, dan detail
				acara.
			</p>

			{link && (
				<div className="flex flex-wrap gap-2">
					<div className="border-border-default bg-background flex h-11 min-w-0 flex-1 items-center rounded-xl border px-3.5 font-mono text-[13px]">
						<span className="truncate">{link}</span>
					</div>
					<button
						type="button"
						onClick={() => {
							navigator.clipboard?.writeText(link).then(() => {
								setCopied(true);
								setTimeout(() => setCopied(false), 1500);
							});
						}}
						className="press tap border-border-default bg-background inline-flex h-11 items-center gap-2 rounded-xl border px-3.5 text-sm font-medium"
					>
						{copied ? (
							<Check className="size-4" />
						) : (
							<Copy className="size-4" />
						)}
						{copied ? "Tersalin" : "Salin"}
					</button>
					<a
						href={link}
						target="_blank"
						rel="noopener noreferrer"
						className="press tap border-border-default bg-background inline-flex h-11 items-center gap-2 rounded-xl border px-3.5 text-sm font-medium"
					>
						<ExternalLink className="size-4" />
						Buka
					</a>
					{previewLink && (
						<a
							href={previewLink}
							target="_blank"
							rel="noopener noreferrer"
							className="press tap border-border-default bg-background inline-flex h-11 items-center gap-2 rounded-xl border px-3.5 text-sm font-medium"
						>
							<Eye className="size-4" />
							Lihat sebagai klien
						</a>
					)}
				</div>
			)}

			{vendor && (
				<div className="space-y-2">
					<span className="type-caption">Kirim ke</span>
					<div className="flex flex-wrap gap-2">
						{(
							[
								["wo", "Vendor / WO"],
								["klien", "Klien"],
							] as const
						).map(([v, l]) => (
							<button
								key={v}
								type="button"
								onClick={() => pickAs(v)}
								aria-pressed={as === v}
								className={`h-9 rounded-full border px-4 text-[13px] font-medium ${as === v ? "border-transparent bg-foreground text-background" : "border-border-default bg-card hover:bg-secondary"}`}
							>
								{l}
							</button>
						))}
					</div>
					<p className="type-caption text-muted-foreground">
						{as === "wo"
							? `Vendor mendapat dasbor rekanan: SEMUA acara vendor ini (lampau & mendatang) di satu tempat, cukup sekali undang. Di acara ini ${vendor.payer === "klien" ? "klien yang membayar ke Tetra" : "vendor yang membayar ke Tetra"}; vendor bisa mengundang kliennya sendiri dan melihat rekap komisi.`
							: vendor.payer === "wo"
								? "Klien melihat data acara, desain & galeri — tanpa harga Tetra (potongan langsung vendor)."
								: "Klien melihat tagihan dan membayar langsung ke Tetra (komisi ke vendor)."}
					</p>
				</div>
			)}
			{as === "wo" && vendor && (
				<div className="space-y-2">
					<span className="type-caption">
						Orang dari {vendor.name || "vendor ini"} — bisa diundang lebih dari
						satu, masing-masing dengan nomornya sendiri
					</span>
					<div className="flex flex-wrap gap-2">
						{people.map((p, i) => (
							<button
								key={`${p.name}-${p.phone}`}
								type="button"
								onClick={() => pickPerson(i)}
								aria-pressed={who === i}
								className={`flex h-11 items-center gap-2 rounded-xl border px-3 text-left text-[13px] ${who === i ? "border-foreground bg-secondary font-semibold" : "border-border-default bg-card hover:bg-secondary"}`}
							>
								<span>
									{p.name}
									{p.role && (
										<span className="text-muted-foreground"> · {p.role}</span>
									)}
								</span>
								{p.phone && isInvited(p.phone) && (
									<span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
										sudah punya akses
									</span>
								)}
							</button>
						))}
						<button
							type="button"
							onClick={() => pickPerson("lain")}
							aria-pressed={who === "lain"}
							className={`h-11 rounded-xl border px-3 text-[13px] ${who === "lain" ? "border-foreground bg-secondary font-semibold" : "border-dashed border-border-default bg-card hover:bg-secondary"}`}
						>
							+ Orang lain
						</button>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<span className="type-caption">Peran</span>
						{VENDOR_ROLES.map((r) => (
							<button
								key={r}
								type="button"
								onClick={() => setRole(r)}
								aria-pressed={role === r}
								className={`h-8 rounded-full border px-3 text-[12px] ${role === r ? "border-transparent bg-foreground text-background" : "border-border-default bg-card hover:bg-secondary"}`}
							>
								{r}
							</button>
						))}
					</div>
				</div>
			)}
			<div className="grid gap-3 sm:grid-cols-2">
				<label className="space-y-1.5">
					<span className="type-caption">
						{as === "wo" ? "Nama vendor / PIC" : "Nama klien"}
					</span>
					<input
						value={name}
						onChange={(e) => setName(e.target.value)}
						maxLength={80}
						className="border-border-default bg-background h-11 w-full rounded-xl border px-3.5 text-sm"
					/>
				</label>
				<label className="space-y-1.5">
					<span className="type-caption">
						WhatsApp {as === "wo" ? "vendor" : "klien"}
					</span>
					<input
						value={phone}
						onChange={(e) => setPhone(e.target.value)}
						type="tel"
						inputMode="tel"
						placeholder="0812 3456 7890"
						className="border-border-default bg-background h-11 w-full rounded-xl border px-3.5 font-mono text-sm"
					/>
				</label>
			</div>
			{error && (
				<p className="text-[13px] font-medium text-rose-600">{error}</p>
			)}
			<div className="flex flex-wrap gap-2">
				<button
					type="button"
					disabled={pending}
					onClick={() => invite(true)}
					className="press tap bg-foreground text-background inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold disabled:opacity-60"
				>
					{pending ? (
						<Loader2 className="size-4 animate-spin" />
					) : (
						<Send className="size-4" />
					)}
					{link ? "Kirim ulang ke WhatsApp" : "Buat & kirim ke WhatsApp"}
				</button>
				{!link && (
					<button
						type="button"
						disabled={pending}
						onClick={() => invite(false)}
						className="press tap border-border-default bg-background inline-flex h-11 items-center rounded-full border px-5 text-sm font-medium disabled:opacity-60"
					>
						Buat link saja
					</button>
				)}
			</div>
		</div>
	);
}
