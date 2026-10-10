"use client";

import { Pencil, Plus, Send, Trash2, UserX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { NativeSelect } from "@/components/ui/native-select";
import {
	inviteVendorPerson,
	revokeVendorAccess,
	saveVendorPeople,
} from "@/lib/actions/vendor-hub";
import { nameInitials } from "@/lib/format";
import { cn } from "@/lib/utils";

export type VendorPerson = {
	name: string;
	contact: string | null;
	role: string | null;
};
export type VendorAccess = {
	personId: string;
	name: string | null;
	phone: string;
	lastSeen: string | null;
};

const ROLES = ["Owner", "Planner", "PIC lapangan", "Admin", "Lainnya"];
const tail = (x: string | null) => (x ?? "").replace(/\D/g, "").slice(-9);
const input =
	"border-border-default bg-background h-10 w-full min-w-0 rounded-xl border px-3 text-sm";
const card =
	"border-border-default bg-card rounded-2xl border shadow-[var(--shadow-level-2)]";

function since(iso: string | null) {
	if (!iso) return "belum pernah masuk";
	const d = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
	return d <= 0
		? "terakhir masuk hari ini"
		: d === 1
			? "terakhir masuk kemarin"
			: `terakhir masuk ${d} hari lalu`;
}

/** Baris yang diubah: indeks di daftar, atau -1 untuk orang baru. */
type Editing = { i: number; draft: VendorPerson } | null;

export function VendorTeam({
	contactId,
	people,
	access,
	portalEnabled,
}: {
	contactId: string;
	people: VendorPerson[];
	access: VendorAccess[];
	portalEnabled: boolean;
}) {
	const router = useRouter();
	const confirm = useConfirm();
	const [editing, setEditing] = useState<Editing>(null);
	const [pending, start] = useTransition();

	const accessOf = (p: VendorPerson) =>
		access.find((a) => p.contact && tail(a.phone) === tail(p.contact)) ?? null;
	const others = access.filter(
		(a) => !people.some((p) => p.contact && tail(p.contact) === tail(a.phone)),
	);

	const run = (
		fn: () => Promise<{ ok: boolean; error?: string; note?: string }>,
		after?: () => void,
	) =>
		start(async () => {
			const r = await fn();
			if (!r.ok) return void toast.error(r.error ?? "Gagal");
			toast.success(r.note ?? "Tersimpan");
			after?.();
			router.refresh();
		});

	const saveList = (list: VendorPerson[], note: string) =>
		run(
			async () => {
				const r = await saveVendorPeople(contactId, list);
				return r.ok ? { ok: true, note } : r;
			},
			() => setEditing(null),
		);

	const invite = (p: VendorPerson, phone: string) =>
		run(() =>
			inviteVendorPerson(contactId, {
				name: p.name,
				phone,
				role: p.role,
				send: true,
			}),
		);

	const form = editing && (
		<div className="bg-secondary/50 space-y-3 rounded-xl p-4">
			<div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_170px]">
				<label className="space-y-1">
					<span className="type-caption text-muted-foreground">Nama</span>
					<input
						value={editing.draft.name}
						onChange={(e) =>
							setEditing({
								...editing,
								draft: { ...editing.draft, name: e.target.value },
							})
						}
						placeholder="Nama lengkap"
						className={input}
					/>
				</label>
				<label className="space-y-1">
					<span className="type-caption text-muted-foreground">
						Nomor WhatsApp
					</span>
					<input
						value={editing.draft.contact ?? ""}
						onChange={(e) =>
							setEditing({
								...editing,
								draft: { ...editing.draft, contact: e.target.value },
							})
						}
						placeholder="0812…"
						inputMode="tel"
						className={input}
					/>
				</label>
				<div className="space-y-1">
					<span className="type-caption text-muted-foreground">Peran</span>
					<NativeSelect
						value={editing.draft.role ?? ""}
						onValueChange={(v) =>
							setEditing({
								...editing,
								draft: { ...editing.draft, role: v || null },
							})
						}
						placeholder="Pilih peran"
						aria-label="Peran"
						triggerClassName="h-10 w-full rounded-xl bg-background px-3 data-[size=default]:h-10"
						options={ROLES.map((r) => ({ value: r, label: r }))}
					/>
				</div>
			</div>
			<div className="flex justify-end gap-2">
				<button
					type="button"
					onClick={() => setEditing(null)}
					className="hover:bg-secondary h-9 rounded-full px-3.5 text-[13px] font-medium"
				>
					Batal
				</button>
				<button
					type="button"
					disabled={pending || editing.draft.name.trim().length < 2}
					onClick={() => {
						const d = {
							...editing.draft,
							name: editing.draft.name.trim(),
							contact: editing.draft.contact?.trim() || null,
						};
						saveList(
							editing.i < 0
								? [...people, d]
								: people.map((p, j) => (j === editing.i ? d : p)),
							editing.i < 0 ? `${d.name} ditambahkan` : "Perubahan disimpan",
						);
					}}
					className="bg-foreground text-background h-9 rounded-full px-4 text-[13px] font-medium disabled:opacity-40"
				>
					Simpan
				</button>
			</div>
		</div>
	);

	return (
		<div className="space-y-3">
			<section className={cn(card, "overflow-hidden")}>
				<div className="flex flex-wrap items-start justify-between gap-3 p-5">
					<div className="min-w-0 flex-1">
						<h3 className="type-heading">Tim vendor</h3>
						<p className="type-secondary mt-0.5">
							Owner, planner, dan PIC lapangan. Undang mereka ke dasbor rekanan
							supaya bisa memantau semua acara vendor ini.
						</p>
					</div>
					<button
						type="button"
						disabled={!!editing}
						onClick={() =>
							setEditing({
								i: -1,
								draft: { name: "", contact: "", role: "PIC lapangan" },
							})
						}
						className="border-border-default hover:bg-secondary inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium disabled:opacity-40"
					>
						<Plus className="size-4 shrink-0" /> Tambah orang
					</button>
				</div>

				{!portalEnabled && (
					<p className="mx-5 mb-4 rounded-xl bg-amber-500/12 px-3.5 py-2.5 text-[13px] text-amber-800 dark:text-amber-300">
						Akses dasbor rekanan vendor ini sedang dimatikan. Nyalakan di tab
						Pengaturan untuk mengundang.
					</p>
				)}

				{editing?.i === -1 && <div className="px-5 pb-4">{form}</div>}

				{people.length === 0 && editing?.i !== -1 ? (
					<p className="type-secondary border-border-default border-t px-5 py-4">
						Belum ada orang. Tambahkan owner atau PIC vendor ini.
					</p>
				) : (
					<ul className="divide-border-default border-border-default divide-y border-t">
						{people.map((p, i) => {
							const a = accessOf(p);
							if (editing?.i === i)
								return (
									<li key={`${p.name}-${p.contact}`} className="px-5 py-4">
										{form}
									</li>
								);
							return (
								<li
									key={`${p.name}-${p.contact}`}
									className="flex flex-wrap items-center gap-x-3 gap-y-3 px-5 py-4"
								>
									<span
										className={cn(
											"grid size-10 shrink-0 place-items-center rounded-full text-[13px] font-semibold",
											a
												? "bg-emerald-500/15 text-emerald-700"
												: "bg-secondary text-muted-foreground",
										)}
										aria-hidden
									>
										{nameInitials(p.name)}
									</span>
									<div className="min-w-0 flex-1 basis-48">
										<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
											<p className="truncate text-[14.5px] font-semibold">
												{p.name}
											</p>
											{p.role && (
												<span className="bg-secondary rounded-full px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
													{p.role}
												</span>
											)}
										</div>
										<p className="text-muted-foreground mt-0.5 truncate text-[12.5px]">
											{p.contact || "Nomor WA belum diisi"}
										</p>
										<p
											className={cn(
												"mt-1 inline-flex items-center gap-1.5 text-[12px] font-medium",
												a ? "text-emerald-700" : "text-muted-foreground",
											)}
										>
											<span
												className={cn(
													"size-1.5 shrink-0 rounded-full",
													a ? "bg-emerald-500" : "bg-muted-foreground/40",
												)}
												aria-hidden
											/>
											{a
												? `Punya akses dasbor · ${since(a.lastSeen)}`
												: "Belum diundang ke dasbor"}
										</p>
									</div>
									<div className="flex shrink-0 items-center gap-1">
										<button
											type="button"
											disabled={
												pending || !!editing || !portalEnabled || !p.contact
											}
											title={!p.contact ? "Isi nomor WA dulu" : undefined}
											onClick={() => invite(p, a?.phone ?? p.contact ?? "")}
											className={cn(
												"inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-medium disabled:opacity-40",
												a
													? "border-border-default hover:bg-secondary border"
													: "bg-foreground text-background",
											)}
										>
											<Send className="size-3.5 shrink-0" />
											{a ? "Kirim ulang link" : "Undang"}
										</button>
										<button
											type="button"
											disabled={pending || !!editing}
											aria-label={`Ubah ${p.name}`}
											title="Ubah"
											onClick={() => setEditing({ i, draft: { ...p } })}
											className="hover:bg-secondary text-muted-foreground grid size-9 place-items-center rounded-full disabled:opacity-40"
										>
											<Pencil className="size-4" />
										</button>
										{a ? (
											<button
												type="button"
												disabled={pending}
												aria-label={`Cabut akses ${p.name}`}
												title="Cabut akses"
												onClick={async () => {
													if (
														await confirm({
															title: `Cabut akses ${p.name}?`,
															description:
																"Orang ini tidak bisa membuka dasbor rekanan & acara vendor ini lagi. Bisa diundang ulang kapan saja.",
															confirmLabel: "Cabut akses",
															variant: "destructive",
														})
													)
														run(() =>
															revokeVendorAccess(contactId, a.personId),
														);
												}}
												className="hover:bg-destructive/10 text-destructive grid size-9 place-items-center rounded-full"
											>
												<UserX className="size-4" />
											</button>
										) : (
											<button
												type="button"
												disabled={pending || !!editing}
												aria-label={`Hapus ${p.name}`}
												title="Hapus dari daftar"
												onClick={async () => {
													if (
														await confirm({
															title: `Hapus ${p.name} dari daftar?`,
															description:
																"Hanya dihapus dari daftar tim vendor. Acara yang sudah ada tidak berubah.",
															confirmLabel: "Hapus",
															variant: "destructive",
														})
													)
														saveList(
															people.filter((_, j) => j !== i),
															`${p.name} dihapus`,
														);
												}}
												className="hover:bg-secondary text-muted-foreground grid size-9 place-items-center rounded-full disabled:opacity-40"
											>
												<Trash2 className="size-4" />
											</button>
										)}
									</div>
								</li>
							);
						})}
					</ul>
				)}
			</section>

			{others.length > 0 && (
				<section className={cn(card, "p-5")}>
					<h3 className="type-heading">Akses lain</h3>
					<p className="type-secondary mt-0.5">
						Punya akses dasbor tapi belum ada di daftar tim vendor.
					</p>
					<ul className="divide-border-default mt-2 divide-y">
						{others.map((a) => (
							<li
								key={a.personId}
								className="flex flex-wrap items-center justify-between gap-2 py-2.5"
							>
								<div className="min-w-0">
									<p className="truncate text-[14px] font-medium">
										{a.name ?? "Tanpa nama"}
									</p>
									<p className="text-muted-foreground text-[12.5px]">
										+{a.phone} · {since(a.lastSeen)}
									</p>
								</div>
								<button
									type="button"
									disabled={pending}
									onClick={() =>
										run(() => revokeVendorAccess(contactId, a.personId))
									}
									className="text-destructive hover:bg-destructive/10 h-8 rounded-full px-3 text-[12.5px] font-medium"
								>
									Cabut akses
								</button>
							</li>
						))}
					</ul>
				</section>
			)}
		</div>
	);
}
