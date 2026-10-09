"use client";

/**
 * Dasbor rekanan (WO/vendor dengan banyak klien): ringkasan + daftar acara
 * dengan cari & filter + rekap komisi. Data dari lib/portal/vendor.ts.
 */
import { ChevronRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { RekananRow } from "@/lib/portal/vendor";

const MON = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"Mei",
	"Jun",
	"Jul",
	"Agu",
	"Sep",
	"Okt",
	"Nov",
	"Des",
];
const rp = (n: number) => `Rp${n.toLocaleString("id-ID")}`;
const INK = "#1D1D1B";
const B = `1.5px solid ${INK}`;

type Filter = "mendatang" | "tindakan" | "selesai" | "semua";

/** Hal yang perlu dikerjakan WO untuk acara mendatang ini. */
export function todo(r: RekananRow, today: string): string[] {
	if (r.status === "batal" || r.status === "selesai" || r.date < today)
		return [];
	const out: string[] = [];
	if (!r.clientInvited) out.push("Klien belum diundang");
	if (r.status === "draf" && r.missingData > 0)
		out.push(`${r.missingData} data acara kurang`);
	if (r.status === "draf" && r.payer !== "klien") out.push("Belum DP");
	const days =
		(Date.parse(`${r.date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
		86_400_000;
	if (r.status === "resmi" && !r.designDone && days <= 30)
		out.push("Desain belum disetujui");
	if ((r.remaining ?? 0) > 0) out.push(`Sisa tagihan ${rp(r.remaining ?? 0)}`);
	return out;
}

const STATUS: Record<RekananRow["status"], { label: string; bg: string }> = {
	draf: { label: "Draf", bg: "#FCE3C6" },
	dp_dicek: { label: "DP dicek", bg: "#D6EEF8" },
	resmi: { label: "Resmi", bg: "#D6F1EA" },
	selesai: { label: "Selesai", bg: "#EFEDE8" },
	batal: { label: "Batal", bg: "#F7D5CC" },
};

function Stat({
	label,
	value,
	sub,
	under,
	onClick,
	on,
}: {
	label: string;
	value: string;
	sub?: string;
	under: string;
	onClick?: () => void;
	on?: boolean;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="dash-stat"
			style={{
				display: "grid",
				gap: 4,
				textAlign: "left",
				padding: "14px 16px",
				borderRadius: 16,
				border: B,
				background: on ? "#FFF6DD" : "#fff",
				boxShadow: `5px 5px 0 -1.5px ${under},5px 5px 0 0 ${INK}`,
				font: "inherit",
				color: INK,
				cursor: onClick ? "pointer" : "default",
			}}
		>
			<span style={{ fontSize: 12, fontWeight: 600, color: "#5F5E5A" }}>
				{label}
			</span>
			<span className="dash-stat-v" style={{ fontWeight: 800 }}>
				{value}
			</span>
			{sub && <span style={{ fontSize: 12, color: "#5F5E5A" }}>{sub}</span>}
		</button>
	);
}

export function RekananDashboard({
	rows,
	today,
}: {
	rows: RekananRow[];
	today: string;
}) {
	const [filter, setFilter] = useState<Filter>("mendatang");
	const [q, setQ] = useState("");
	const month = today.slice(0, 7);

	const upcoming = rows.filter(
		(r) => r.date >= today && r.status !== "batal" && r.status !== "selesai",
	);
	const needs = upcoming.filter((r) => todo(r, today).length > 0);
	const owe = upcoming.reduce((t, r) => t + (r.remaining ?? 0), 0);
	const comm = rows.filter((r) => r.commission && r.status !== "batal");
	const commPaid = comm
		.filter((r) => r.commission?.paidAt)
		.reduce((t, r) => t + (r.commission?.amount ?? 0), 0);
	const commOpen = comm
		.filter((r) => !r.commission?.paidAt)
		.reduce((t, r) => t + (r.commission?.amount ?? 0), 0);

	const list = useMemo(() => {
		const term = q.trim().toLowerCase();
		const base = rows.filter((r) =>
			filter === "mendatang"
				? r.date >= today && r.status !== "batal"
				: filter === "tindakan"
					? todo(r, today).length > 0
					: filter === "selesai"
						? r.date < today || r.status === "selesai"
						: true,
		);
		const hit = term
			? base.filter((r) =>
					`${r.title} ${r.venue ?? ""} ${r.code} ${r.projectId ?? ""}`
						.toLowerCase()
						.includes(term),
				)
			: base;
		const past = filter === "selesai";
		return [...hit].sort((a, b) =>
			past ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date),
		);
	}, [rows, filter, q, today]);

	const chip = (f: Filter, label: string, n: number) => (
		<button
			key={f}
			type="button"
			aria-pressed={filter === f}
			onClick={() => setFilter(f)}
			style={{
				display: "inline-flex",
				alignItems: "center",
				gap: 6,
				height: 36,
				padding: "0 14px",
				borderRadius: 999,
				border: filter === f ? B : "1.5px solid #D6D3CC",
				background: filter === f ? "#F8D98B" : "#fff",
				fontSize: 13,
				fontWeight: filter === f ? 800 : 600,
				color: INK,
				whiteSpace: "nowrap",
			}}
		>
			{label}
			<span className="mono" style={{ fontSize: 11 }}>
				{n}
			</span>
		</button>
	);

	return (
		<>
			<div className="dash-stats">
				<Stat
					label="Acara mendatang"
					value={String(upcoming.length)}
					sub={`${upcoming.filter((r) => r.date.startsWith(month)).length} di bulan ini`}
					under="#CEC8F6"
					onClick={() => setFilter("mendatang")}
					on={filter === "mendatang"}
				/>
				<Stat
					label="Perlu tindakan"
					value={String(needs.length)}
					sub={needs.length ? "Lihat daftarnya" : "Semua aman"}
					under="#F8D98B"
					onClick={() => setFilter("tindakan")}
					on={filter === "tindakan"}
				/>
				{owe > 0 && (
					<Stat
						label="Tagihan ke Tetra"
						value={rp(owe)}
						sub="Sisa acara mendatang"
						under="#FCE3C6"
					/>
				)}
				{comm.length > 0 && (
					<Stat
						label="Komisi kamu"
						value={rp(commOpen)}
						sub={`belum dibayar · ${rp(commPaid)} sudah dibayar`}
						under="#D6F1EA"
					/>
				)}
			</div>

			<section
				style={{
					display: "grid",
					gridTemplateColumns: "minmax(0, 1fr)",
					gap: 12,
					minWidth: 0,
				}}
			>
				<div
					style={{
						display: "flex",
						flexWrap: "wrap",
						alignItems: "center",
						gap: 10,
						justifyContent: "space-between",
					}}
				>
					<div
						className="noscroll"
						style={{
							display: "flex",
							gap: 8,
							overflowX: "auto",
							minWidth: 0,
							maxWidth: "100%",
						}}
					>
						{chip(
							"mendatang",
							"Mendatang",
							rows.filter((r) => r.date >= today && r.status !== "batal")
								.length,
						)}
						{chip("tindakan", "Perlu tindakan", needs.length)}
						{chip(
							"selesai",
							"Selesai",
							rows.filter((r) => r.date < today || r.status === "selesai")
								.length,
						)}
						{chip("semua", "Semua", rows.length)}
					</div>
					<label
						style={{
							display: "flex",
							alignItems: "center",
							gap: 8,
							height: 40,
							padding: "0 12px",
							borderRadius: 12,
							border: "1.5px solid #D6D3CC",
							background: "#fff",
							minWidth: 0,
							flex: "1 1 220px",
							maxWidth: 360,
						}}
					>
						<Search aria-hidden size={16} strokeWidth={2} color="#5F5E5A" />
						<input
							value={q}
							onChange={(e) => setQ(e.target.value)}
							placeholder="Cari nama acara, lokasi, kode"
							aria-label="Cari acara"
							style={{
								border: 0,
								outline: 0,
								background: "transparent",
								font: "inherit",
								fontSize: 16,
								minWidth: 0,
								flex: 1,
							}}
						/>
					</label>
				</div>

				{list.length === 0 ? (
					<p
						style={{
							margin: 0,
							padding: "16px 20px",
							borderRadius: 16,
							border: "1.5px dashed #D6D3CC",
							background: "#fff",
							fontSize: 14,
							color: "#5F5E5A",
						}}
					>
						{q ? "Tidak ada acara yang cocok." : "Belum ada acara di sini."}
					</p>
				) : (
					<div
						style={{
							display: "grid",
							gridTemplateColumns: "minmax(0, 1fr)",
							gap: 10,
						}}
					>
						{list.map((r) => {
							const [, m, d] = r.date.split("-").map(Number);
							const t = todo(r, today);
							const st = STATUS[r.status];
							return (
								<a
									key={r.code}
									href={`/akun/booking/${r.code}`}
									style={{
										display: "flex",
										alignItems: "center",
										gap: 14,
										padding: "12px 14px",
										borderRadius: 16,
										border: B,
										background: "#fff",
										textDecoration: "none",
										color: INK,
									}}
								>
									<span
										style={{
											display: "grid",
											placeItems: "center",
											width: 52,
											flex: "none",
											padding: "6px 0",
											borderRadius: 12,
											border: B,
											background: st.bg,
											lineHeight: 1.05,
										}}
									>
										<span style={{ fontSize: 20, fontWeight: 800 }}>{d}</span>
										<span style={{ fontSize: 11, fontWeight: 700 }}>
											{MON[m - 1]} {r.date.slice(2, 4)}
										</span>
									</span>
									<span
										style={{ display: "grid", gap: 4, minWidth: 0, flex: 1 }}
									>
										<span
											style={{
												display: "flex",
												alignItems: "center",
												gap: 8,
												minWidth: 0,
											}}
										>
											<b
												style={{
													fontSize: 15,
													overflow: "hidden",
													textOverflow: "ellipsis",
													whiteSpace: "nowrap",
												}}
											>
												{r.title}
											</b>
											<span
												style={{
													flex: "none",
													fontSize: 11,
													fontWeight: 700,
													padding: "2px 8px",
													borderRadius: 999,
													border: "1px solid #1D1D1B",
													background: st.bg,
												}}
											>
												{st.label}
											</span>
										</span>
										<span
											style={{
												fontSize: 12,
												color: "#5F5E5A",
												overflow: "hidden",
												textOverflow: "ellipsis",
												whiteSpace: "nowrap",
											}}
										>
											{[r.start, r.venue].filter(Boolean).join(" · ") || "—"}
											{r.payer === "klien"
												? " · klien bayar ke Tetra"
												: r.payer === "wo"
													? " · kamu bayar ke Tetra"
													: ""}
										</span>
										{(t.length > 0 || r.commission) && (
											<span
												style={{ display: "flex", flexWrap: "wrap", gap: 6 }}
											>
												{t.map((x) => (
													<span
														key={x}
														style={{
															fontSize: 11,
															fontWeight: 700,
															padding: "2px 8px",
															borderRadius: 999,
															background: "#FDE8C4",
															color: "#7A4A00",
														}}
													>
														{x}
													</span>
												))}
												{r.commission && r.commission.amount > 0 && (
													<span
														className="mono"
														style={{
															fontSize: 11,
															fontWeight: 700,
															padding: "2px 8px",
															borderRadius: 999,
															background: r.commission.paidAt
																? "#D6F1EA"
																: "#EFEDE8",
														}}
													>
														Komisi {rp(r.commission.amount)}
														{r.commission.paidAt ? " · dibayar" : ""}
													</span>
												)}
											</span>
										)}
									</span>
									<ChevronRight
										aria-hidden
										size={18}
										strokeWidth={2}
										style={{ flex: "none" }}
									/>
								</a>
							);
						})}
					</div>
				)}
			</section>

			{comm.length > 0 && (
				<section
					style={{
						display: "grid",
						gridTemplateColumns: "minmax(0, 1fr)",
						gap: 12,
						minWidth: 0,
						borderRadius: 16,
						border: B,
						background: "#fff",
						padding: "16px 20px",
					}}
				>
					<div
						style={{
							display: "flex",
							flexWrap: "wrap",
							justifyContent: "space-between",
							gap: 8,
							alignItems: "baseline",
						}}
					>
						<h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>
							Rekap komisi
						</h2>
						<span style={{ fontSize: 12, color: "#5F5E5A" }}>
							Acara dengan klien bayar langsung ke Tetra · dibayar setelah acara
							selesai
						</span>
					</div>
					<div
						style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)" }}
					>
						{[...comm]
							.sort((a, b) => b.date.localeCompare(a.date))
							.map((r, i) => {
								const [, m, d] = r.date.split("-").map(Number);
								return (
									<div
										key={r.code}
										style={{
											display: "flex",
											flexWrap: "wrap",
											alignItems: "center",
											columnGap: 12,
											rowGap: 2,
											padding: "10px 0",
											borderTop: i ? "1px dashed #D6D3CC" : undefined,
											fontSize: 14,
										}}
									>
										<span
											className="mono"
											style={{
												width: 64,
												flex: "none",
												fontSize: 12,
												color: "#5F5E5A",
											}}
										>
											{d} {MON[m - 1]} {r.date.slice(2, 4)}
										</span>
										<span
											style={{
												flex: "1 1 150px",
												minWidth: 0,
												overflow: "hidden",
												textOverflow: "ellipsis",
												whiteSpace: "nowrap",
												fontWeight: 600,
											}}
										>
											{r.title}
										</span>
										<span className="mono" style={{ fontWeight: 700 }}>
											{rp(r.commission?.amount ?? 0)}
										</span>
										<span
											style={{
												width: 92,
												flex: "none",
												textAlign: "right",
												fontSize: 12,
												fontWeight: 700,
												color: r.commission?.paidAt ? "#2F8F55" : "#7A4A00",
											}}
										>
											{r.commission?.paidAt
												? `Dibayar ${Number(r.commission.paidAt.slice(8, 10))} ${MON[Number(r.commission.paidAt.slice(5, 7)) - 1]}`
												: r.date < today
													? "Menunggu"
													: "Setelah acara"}
										</span>
									</div>
								);
							})}
					</div>
					<div
						style={{
							display: "flex",
							flexWrap: "wrap",
							gap: 8,
							justifyContent: "space-between",
							borderTop: B,
							paddingTop: 10,
							fontSize: 14,
							fontWeight: 800,
						}}
					>
						<span>Belum dibayar · Sudah dibayar</span>
						<span className="mono">
							{rp(commOpen)} · {rp(commPaid)}
						</span>
					</div>
				</section>
			)}
		</>
	);
}
