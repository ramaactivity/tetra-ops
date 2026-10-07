"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { inviteMember, removeMember } from "@/lib/actions/portal-booking";
import { Err } from "./verify-phone";

export type Member = {
	id: string;
	name: string | null;
	phone: string;
	role: "pemesan" | "pemilik" | "wo";
};

const ROLE: Record<
	Member["role"],
	{ label: string; bg: string; hint: string }
> = {
	pemesan: {
		label: "Pemesan",
		bg: "var(--butter)",
		hint: "Melihat tagihan dan membayar",
	},
	pemilik: {
		label: "Pemilik acara",
		bg: "var(--lavender)",
		hint: "Mengurus detail acara dan desain",
	},
	wo: { label: "WO", bg: "var(--sky)", hint: "Melihat dan mengisi detail" },
};

/** Siapa saja yang ikut mengurus booking ini + undang orang baru (DR-028). */
export function MembersCard({
	code,
	members,
	meId,
	canManage,
}: {
	code: string;
	members: Member[];
	meId: string;
	canManage: boolean;
}) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [phone, setPhone] = useState("");
	const [role, setRole] = useState<"pemilik" | "wo">("pemilik");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function invite() {
		setBusy(true);
		setError(null);
		const r = await inviteMember(code, { name, phone, role });
		setBusy(false);
		if (!r.ok) return setError(r.error);
		setOpen(false);
		setName("");
		setPhone("");
		router.refresh();
	}

	return (
		<div className="card" style={{ display: "grid", gap: 12 }}>
			{members.map((m) => (
				<div
					key={m.id}
					style={{ display: "flex", alignItems: "center", gap: 10 }}
				>
					<div style={{ flex: 1, minWidth: 0 }}>
						<div style={{ fontWeight: 700 }}>
							{m.name ?? "Tanpa nama"}
							{m.id === meId ? " (kamu)" : ""}
						</div>
						<div className="cap">{ROLE[m.role].hint}</div>
					</div>
					<span className="pill" style={{ background: ROLE[m.role].bg }}>
						{ROLE[m.role].label}
					</span>
					{canManage && m.id !== meId && m.role !== "pemesan" && (
						<button
							type="button"
							className="link cap"
							onClick={async () => {
								const r = await removeMember(code, m.id);
								if (r.ok) router.refresh();
								else setError(r.error);
							}}
						>
							Keluarkan
						</button>
					)}
				</div>
			))}
			{canManage && !open && (
				<button
					type="button"
					className="chip"
					style={{ justifySelf: "start" }}
					onClick={() => setOpen(true)}
				>
					+ Undang orang
				</button>
			)}
			{open && (
				<div style={{ display: "grid", gap: 10 }}>
					<hr className="divider" style={{ margin: "2px 0" }} />
					<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
						{(["pemilik", "wo"] as const).map((r) => (
							<button
								key={r}
								type="button"
								className="chip"
								aria-pressed={role === r}
								onClick={() => setRole(r)}
							>
								{ROLE[r].label}
							</button>
						))}
					</div>
					<input
						className="input"
						placeholder="Nama"
						value={name}
						onChange={(e) => setName(e.target.value)}
						aria-label="Nama"
					/>
					<input
						className="input mono"
						type="tel"
						inputMode="tel"
						placeholder="WhatsApp, mis. 0812 3456 7890"
						value={phone}
						onChange={(e) => setPhone(e.target.value)}
						aria-label="Nomor WhatsApp"
					/>
					<p className="cap">
						Kami kirim link lewat WhatsApp. Dia masuk pakai nomor itu, tanpa
						password.
					</p>
					{error && <Err text={error} />}
					<div style={{ display: "flex", gap: 10 }}>
						<button
							type="button"
							className="btn btn-primary"
							disabled={
								busy || name.trim().length < 2 || phone.trim().length < 8
							}
							onClick={invite}
						>
							{busy ? "Mengirim…" : "Undang"}
						</button>
						<button
							type="button"
							className="link cap"
							onClick={() => setOpen(false)}
						>
							Batal
						</button>
					</div>
				</div>
			)}
			{!open && error && <Err text={error} />}
		</div>
	);
}
