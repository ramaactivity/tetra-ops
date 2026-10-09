"use client";

import { Plus, Send, Trash2, UserX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
	inviteVendorPerson,
	revokeVendorAccess,
	saveVendorPeople,
} from "@/lib/actions/vendor-hub";

export type VendorPerson = {
	name: string;
	contact: string | null;
	role: string | null;
};
/** Baris yang bisa ditambah/dihapus perlu kunci stabil (bukan indeks). */
type Row = VendorPerson & { key: string };
let seq = 0;
const withKey = (p: VendorPerson): Row => ({ ...p, key: `p${++seq}` });
export type VendorAccess = {
	personId: string;
	name: string | null;
	phone: string;
	lastSeen: string | null;
};

const ROLES = ["Owner", "Planner", "PIC lapangan", "Admin", "Lainnya"];
const tail = (x: string | null) => (x ?? "").replace(/\D/g, "").slice(-9);
const input =
	"border-border-default bg-background h-10 w-full rounded-xl border px-3 text-sm";

function since(iso: string | null) {
	if (!iso) return "belum pernah masuk";
	const d = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
	return d <= 0
		? "aktif hari ini"
		: d === 1
			? "aktif kemarin"
			: `aktif ${d} hari lalu`;
}

export function VendorTeam({
	contactId,
	people: initial,
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
	const [people, setPeople] = useState<Row[]>(() => initial.map(withKey));
	const [dirty, setDirty] = useState(false);
	const [pending, start] = useTransition();

	const accessOf = (p: VendorPerson) =>
		access.find((a) => p.contact && tail(a.phone) === tail(p.contact)) ?? null;

	const edit = (i: number, patch: Partial<VendorPerson>) => {
		setPeople(people.map((p, j) => (j === i ? { ...p, ...patch } : p)));
		setDirty(true);
	};

	const run = (
		fn: () => Promise<{ ok: boolean; error?: string; note?: string }>,
	) =>
		start(async () => {
			const r = await fn();
			if (!r.ok) toast.error(r.error ?? "Gagal");
			else {
				toast.success(r.note ?? "Tersimpan");
				router.refresh();
			}
		});

	return (
		<div className="space-y-3">
			<div className="border-border-default bg-card space-y-3 rounded-2xl border p-5 shadow-[var(--shadow-level-2)]">
				<div className="flex flex-wrap items-start justify-between gap-2">
					<div>
						<h3 className="type-heading">Orang vendor</h3>
						<p className="type-secondary">
							Owner, planner, PIC lapangan. Dipakai di form booking dan untuk
							mengundang ke dasbor rekanan.
						</p>
					</div>
					<button
						type="button"
						onClick={() => {
							setPeople([
								...people,
								withKey({ name: "", contact: "", role: "PIC lapangan" }),
							]);
							setDirty(true);
						}}
						className="border-border-default bg-card hover:bg-secondary inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium"
					>
						<Plus className="size-4" /> Tambah orang
					</button>
				</div>

				{people.length === 0 && (
					<p className="type-caption text-muted-foreground">
						Belum ada orang. Tambahkan owner atau PIC vendor ini.
					</p>
				)}
				<div className="space-y-2">
					{people.map((p, i) => {
						const a = accessOf(p);
						return (
							<div
								key={p.key}
								className="border-border-default grid gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_1fr_160px_auto] sm:items-center"
							>
								<input
									value={p.name}
									onChange={(e) => edit(i, { name: e.target.value })}
									placeholder="Nama"
									aria-label="Nama"
									className={input}
								/>
								<input
									value={p.contact ?? ""}
									onChange={(e) => edit(i, { contact: e.target.value })}
									placeholder="0812…"
									aria-label="WhatsApp"
									inputMode="tel"
									className={`${input} font-mono`}
								/>
								<select
									value={p.role ?? ""}
									onChange={(e) => edit(i, { role: e.target.value || null })}
									aria-label="Peran"
									className={input}
								>
									<option value="">— peran —</option>
									{ROLES.map((r) => (
										<option key={r} value={r}>
											{r}
										</option>
									))}
								</select>
								<div className="flex flex-wrap items-center justify-end gap-1.5">
									{a ? (
										<span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
											Punya akses · {since(a.lastSeen)}
										</span>
									) : (
										<button
											type="button"
											disabled={
												pending || dirty || !portalEnabled || !p.contact
											}
											title={
												!portalEnabled
													? "Akses dasbor rekanan sedang dimatikan (tab Fitur)"
													: dirty
														? "Simpan perubahan dulu"
														: undefined
											}
											onClick={() =>
												run(() =>
													inviteVendorPerson(contactId, {
														name: p.name,
														phone: p.contact ?? "",
														role: p.role,
														send: true,
													}),
												)
											}
											className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-3 text-[12px] font-medium text-background disabled:opacity-40"
										>
											<Send className="size-3.5" /> Undang ke dasbor
										</button>
									)}
									{a && (
										<button
											type="button"
											disabled={pending || !portalEnabled}
											onClick={() =>
												run(() =>
													inviteVendorPerson(contactId, {
														name: p.name,
														phone: a.phone,
														role: p.role,
														send: true,
													}),
												)
											}
											className="border-border-default hover:bg-secondary inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium"
										>
											<Send className="size-3.5" /> Kirim ulang link
										</button>
									)}
									{a && (
										<button
											type="button"
											disabled={pending}
											aria-label={`Cabut akses ${p.name}`}
											onClick={async () => {
												if (
													!(await confirm({
														title: `Cabut akses ${p.name}?`,
														description:
															"Orang ini tidak bisa membuka dasbor rekanan & acara vendor ini lagi. Bisa diundang ulang kapan saja.",
														confirmLabel: "Cabut akses",
														variant: "destructive",
													}))
												)
													return;
												run(() => revokeVendorAccess(contactId, a.personId));
											}}
											className="hover:bg-destructive/10 text-destructive grid size-9 place-items-center rounded-full"
										>
											<UserX className="size-4" />
										</button>
									)}
									<button
										type="button"
										aria-label={`Hapus ${p.name || "baris"}`}
										onClick={() => {
											setPeople(people.filter((_, j) => j !== i));
											setDirty(true);
										}}
										className="hover:bg-secondary text-muted-foreground grid size-9 place-items-center rounded-full"
									>
										<Trash2 className="size-4" />
									</button>
								</div>
							</div>
						);
					})}
				</div>
				{dirty && (
					<div className="flex items-center justify-end gap-2">
						<button
							type="button"
							onClick={() => {
								setPeople(initial.map(withKey));
								setDirty(false);
							}}
							className="hover:bg-secondary h-9 rounded-full px-3.5 text-[13px] font-medium"
						>
							Batal
						</button>
						<button
							type="button"
							disabled={pending}
							onClick={() =>
								start(async () => {
									const r = await saveVendorPeople(
										contactId,
										people
											.filter((p) => p.name.trim())
											.map(({ key: _k, ...p }) => p),
									);
									if (!r.ok) return void toast.error(r.error);
									toast.success("Daftar orang vendor disimpan");
									setDirty(false);
									router.refresh();
								})
							}
							className="h-9 rounded-full bg-foreground px-4 text-[13px] font-medium text-background"
						>
							Simpan daftar
						</button>
					</div>
				)}
			</div>

			{access.some(
				(a) =>
					!people.some((p) => p.contact && tail(p.contact) === tail(a.phone)),
			) && (
				<div className="border-border-default bg-card space-y-2 rounded-2xl border p-5 shadow-[var(--shadow-level-2)]">
					<h3 className="type-heading">Akses lain</h3>
					<p className="type-secondary">
						Punya akses dasbor tapi belum ada di daftar orang vendor.
					</p>
					{access
						.filter(
							(a) =>
								!people.some(
									(p) => p.contact && tail(p.contact) === tail(a.phone),
								),
						)
						.map((a) => (
							<div
								key={a.personId}
								className="flex items-center justify-between gap-2 text-sm"
							>
								<span>
									{a.name ?? "—"} ·{" "}
									<span className="font-mono">+{a.phone}</span> ·{" "}
									<span className="text-muted-foreground">
										{since(a.lastSeen)}
									</span>
								</span>
								<button
									type="button"
									disabled={pending}
									onClick={() =>
										run(() => revokeVendorAccess(contactId, a.personId))
									}
									className="text-destructive text-[12px] font-medium"
								>
									Cabut
								</button>
							</div>
						))}
				</div>
			)}
		</div>
	);
}
