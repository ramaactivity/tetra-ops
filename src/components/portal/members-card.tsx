"use client";

import { UserPlus } from "lucide-react";
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
	labels,
	woView = false,
	openInitially = false,
}: {
	code: string;
	members: Member[];
	meId: string;
	canManage: boolean;
	/** Label & keterangan per peran sesuai sudut pandang yang melihat. */
	labels?: Partial<Record<Member["role"], { label: string; hint: string }>>;
	/** Yang melihat WO/vendor: undangan utama = klien, dengan panduan langkah. */
	woView?: boolean;
	openInitially?: boolean;
}) {
	const router = useRouter();
	const R = (r: Member["role"]) => ({ ...ROLE[r], ...labels?.[r] });
	const [open, setOpen] = useState(openInitially);
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

	const head = (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
				gap: 8,
			}}
		>
			<h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>
				Orang di booking ini
			</h2>
			{canManage && !open && (
				<button type="button" className="chip" onClick={() => setOpen(true)}>
					<UserPlus aria-hidden size={16} strokeWidth={2} />
					{woView ? "Undang klien" : "Undang"}
				</button>
			)}
		</div>
	);

	return (
		<div className="card" style={{ display: "grid", gap: 14 }}>
			{head}
			<ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid" }}>
				{members.map((m, i) => (
					<li
						key={m.id}
						style={{
							display: "flex",
							alignItems: "center",
							gap: 12,
							padding: "10px 0",
							borderTop: i ? "1.5px dashed #D6D3CC" : undefined,
						}}
					>
						<span
							aria-hidden
							style={{
								display: "flex",
								width: 36,
								height: 36,
								flex: "none",
								alignItems: "center",
								justifyContent: "center",
								borderRadius: 18,
								border: "1.5px solid var(--ink)",
								background: R(m.role).bg,
								fontSize: 13,
								fontWeight: 800,
								textTransform: "uppercase",
							}}
						>
							{(m.name ?? "?")[0]}
						</span>
						<div style={{ flex: 1, minWidth: 0 }}>
							<div
								style={{
									fontSize: 14,
									fontWeight: 700,
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap",
								}}
							>
								{m.name ?? "Tanpa nama"}
								{m.id === meId ? " (kamu)" : ""}
							</div>
							<div className="cap">{R(m.role).hint}</div>
						</div>
						<span className="pill" style={{ background: R(m.role).bg }}>
							{R(m.role).label}
						</span>
						{canManage && m.id !== meId && m.role !== "pemesan" && (
							<button
								type="button"
								className="dash-row-btn"
								aria-label={`Keluarkan ${m.name ?? "orang ini"}`}
								onClick={async () => {
									const r = await removeMember(code, m.id);
									if (r.ok) router.refresh();
									else setError(r.error);
								}}
							>
								Keluarkan
							</button>
						)}
					</li>
				))}
			</ul>
			{woView &&
				canManage &&
				!open &&
				!members.some((m) => m.role === "pemilik") && (
					<div
						className="note"
						style={{
							background: "#D6F1EA",
							display: "grid",
							gap: 10,
							justifyItems: "start",
						}}
					>
						<span>
							<b>Klien kamu belum diundang.</b> Undang supaya mereka bisa
							melengkapi data acara dan memilih desain sendiri, tanpa kamu perlu
							meneruskan pesan.
						</span>
						<button
							type="button"
							className="btn btn-primary"
							onClick={() => setOpen(true)}
						>
							<UserPlus aria-hidden size={16} strokeWidth={2} />
							Undang klien sekarang
						</button>
					</div>
				)}
			{open && (
				<div
					style={{
						display: "grid",
						gap: 12,
						borderTop: "1.5px dashed var(--ink)",
						paddingTop: 14,
					}}
				>
					{woView && (
						<ol
							style={{
								margin: 0,
								paddingLeft: 20,
								listStyle: "decimal",
								display: "grid",
								gap: 4,
								fontSize: 13,
								lineHeight: 1.45,
								color: "#3A3936",
							}}
						>
							<li>Isi nama dan nomor WhatsApp klien.</li>
							<li>Kami kirim link dashboard ke WhatsApp-nya.</li>
							<li>
								Klien masuk pakai nomor itu (tanpa password) lalu melengkapi
								data acara & memilih desain.
							</li>
						</ol>
					)}
					<div className="label" style={{ margin: 0 }}>
						Undang sebagai
					</div>
					<div
						style={{
							display: "grid",
							gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
							gap: 10,
						}}
					>
						{(["pemilik", "wo"] as const).map((r) => (
							<button
								key={r}
								type="button"
								className="opt"
								aria-pressed={role === r}
								onClick={() => setRole(r)}
							>
								<div style={{ fontSize: 14, fontWeight: 800 }}>
									{R(r).label}
								</div>
								<div className="cap">{R(r).hint}</div>
							</button>
						))}
					</div>
					<div
						style={{
							display: "grid",
							gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
							gap: 10,
						}}
					>
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
							placeholder="0812 3456 7890"
							value={phone}
							onChange={(e) => setPhone(e.target.value)}
							aria-label="Nomor WhatsApp"
						/>
					</div>
					<p className="cap" style={{ margin: 0 }}>
						Kami kirim link lewat WhatsApp. Dia masuk pakai nomor itu, tanpa
						password.
					</p>
					{error && <Err text={error} />}
					<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
						<button
							type="button"
							className="btn btn-primary"
							disabled={
								busy || name.trim().length < 2 || phone.trim().length < 8
							}
							onClick={invite}
						>
							{busy ? "Mengirim…" : "Kirim undangan"}
						</button>
						<button
							type="button"
							className="dash-row-btn"
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
