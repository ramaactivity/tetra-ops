"use client";

/**
 * Halaman booking klien v4 (docs/design/booking-v4 §7): header peach, gerbang
 * 3 data sebelum DP, kartu Bayar DP (upload bukti ke R2), dan "Boleh menyusul"
 * (accordion, autosave). Bagian lain (pelunasan, desain, dokumen, anggota,
 * ubah jadwal) dirender server dan masuk lewat `children`.
 */
import {
	AtSign,
	ChevronDown,
	Cloud,
	FileCheck,
	ListOrdered,
	Map as MapIcon,
	MessageSquare,
	Phone,
	Upload,
	UserCheck,
	Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useRef, useState } from "react";
import {
	requestProofUpload,
	saveBookingDetail,
	submitDpTransfer,
} from "@/lib/actions/portal-booking";
import { compressImage } from "@/lib/crew/image-compression";
import { type Detail, parseInstagram } from "@/lib/portal/core";
import "./booking.css";
import { GUESTS } from "./content";
import { dig, waFmt } from "./logic";
import { B, Cta, Dot, ErrLine, IconChip, INK, layered, mono } from "./ui";

export type BankInfo = {
	id: string;
	bank_name: string;
	account_number: string;
	account_holder: string;
} | null;

const rp = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;
const PROOF_OK = /\.(jpe?g|png|heic|heif|webp|pdf)$/i;

/**
 * Data acara di dashboard klien: 3 data wajib sebelum DP (= missingForDp di
 * server) + "Boleh menyusul" (accordion, autosave per kolom).
 */
export function DataAcara(p: {
	code: string;
	detail: Detail;
	readOnly: boolean;
	stageGroups: boolean;
	/** Draf → judul "Sebelum bayar DP" + penghitung n/3. */
	beforeDp: boolean;
}) {
	const router = useRouter();
	const [d, setD] = useState<Detail>(p.detail);
	const saved = useRef<Detail>(p.detail);
	const [saveErr, setSaveErr] = useState(false);

	async function save<K extends keyof Detail>(key: K, value: Detail[K]) {
		if (
			JSON.stringify(value ?? "") === JSON.stringify(saved.current[key] ?? "")
		)
			return;
		const r = await saveBookingDetail(p.code, { [key]: value ?? "" }).catch(
			() => null,
		);
		if (r?.ok) {
			saved.current = { ...saved.current, [key]: value };
			setSaveErr(false);
			router.refresh();
		} else setSaveErr(true);
	}
	const setF = <K extends keyof Detail>(k: K, v: Detail[K]) =>
		setD((x) => ({ ...x, [k]: v }));

	const gate: Array<[keyof Detail, string, string]> = [
		["nama_acara", "Nama acara", "Nama acara"],
		["pemilik_nama", "Nama pemilik acara", "Nama pemilik acara"],
		["venue_nama", "Nama tempat acara (venue)", "Contoh: Gedung Kirana, Bogor"],
	];
	const okGate = (k: keyof Detail) => String(d[k] ?? "").trim().length >= 2;
	const gateCount = gate.filter(([k]) => okGate(k)).length;

	return (
		<div
			className="bk"
			style={{
				display: "flex",
				flexDirection: "column",
				gap: 20,
				background: "transparent",
			}}
		>
			<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
					}}
				>
					<span style={{ fontSize: 15, fontWeight: 800 }}>
						{p.beforeDp ? "Sebelum bayar DP" : "Data utama"}
					</span>
					{p.beforeDp && (
						<span
							style={{
								height: 28,
								padding: "0 10px",
								border: B,
								borderRadius: 999,
								background: gateCount === 3 ? "#D6F1EA" : "#FFFFFF",
								...mono,
								fontSize: 13,
								fontWeight: 600,
								display: "flex",
								alignItems: "center",
							}}
						>
							{gateCount}/3
						</span>
					)}
				</div>
				<div
					style={{
						border: B,
						borderRadius: 18,
						background: "#fff",
						padding: "4px 14px",
					}}
				>
					{gate.map(([k, label, ph], i) => (
						<div
							key={k}
							style={{
								display: "flex",
								flexDirection: "column",
								gap: 6,
								padding: "12px 0",
								borderBottom: i < 2 ? "1.5px dashed #D6D3CC" : "0",
							}}
						>
							<span
								style={{
									display: "flex",
									justifyContent: "space-between",
									alignItems: "center",
									gap: 10,
								}}
							>
								<label
									htmlFor={`g-${k}`}
									style={{ fontSize: 13, fontWeight: 700 }}
								>
									{label}
								</label>
								<Dot
									size={22}
									font={11}
									ok={okGate(k)}
									ring={okGate(k) ? INK : "#D6D3CC"}
								/>
							</span>
							<input
								id={`g-${k}`}
								className="in"
								value={String(d[k] ?? "")}
								onChange={(e) => setF(k, e.target.value as never)}
								onBlur={() => save(k, String(d[k] ?? "").trim() as never)}
								placeholder={ph}
								maxLength={120}
								disabled={p.readOnly}
								style={{
									height: 48,
									border: B,
									borderRadius: 12,
									background: "#fff",
									padding: "0 12px",
									fontSize: 16,
									fontWeight: 600,
									width: "100%",
								}}
							/>
						</div>
					))}
				</div>
			</div>
			<Later
				d={d}
				setF={setF}
				save={save}
				readOnly={p.readOnly}
				stageGroups={p.stageGroups}
				saveErr={saveErr}
			/>
		</div>
	);
}

export function DpCard({
	code,
	dp,
	bank,
	gateOpen,
	gateLeft,
	sent,
	rejectReason,
}: {
	code: string;
	dp: number;
	bank: BankInfo;
	gateOpen: boolean;
	gateLeft: number;
	sent: boolean;
	rejectReason: string | null;
}) {
	const router = useRouter();
	const [file, setFile] = useState<File | null>(null);
	const [fileErr, setFileErr] = useState("");
	const [busy, setBusy] = useState(false);
	const [done, setDone] = useState(sent);

	function pick(f: File | undefined) {
		if (!f) return;
		if (!PROOF_OK.test(f.name))
			return setFileErr(
				"Format belum didukung. Pakai JPG, PNG, HEIC, atau PDF.",
			);
		if (f.size > 10 * 1048576)
			return setFileErr("File lebih dari 10 MB. Coba kompres dulu.");
		setFileErr("");
		setFile(f);
	}

	async function send() {
		if (!file || !bank) return;
		setBusy(true);
		setFileErr("");
		try {
			const f =
				file.type.startsWith("image/") && file.type !== "image/heic"
					? await compressImage(file, { targetMaxBytes: 2 * 1024 * 1024 })
					: file;
			const up = await requestProofUpload(code, { type: f.type, size: f.size });
			if (!up.ok) throw new Error(up.error);
			const put = await fetch(up.uploadUrl, {
				method: "PUT",
				body: f,
				headers: { "content-type": f.type },
			});
			if (!put.ok)
				throw new Error("Upload bukti gagal. Cek koneksi lalu coba lagi.");
			const r = await submitDpTransfer(code, {
				amount: dp,
				bankAccountId: bank.id,
				path: up.path,
			});
			if (!r.ok) throw new Error(r.error);
			setDone(true);
			router.refresh();
		} catch (e) {
			setFileErr(
				e instanceof Error ? e.message : "Gagal mengirim. Coba lagi, ya.",
			);
		}
		setBusy(false);
	}

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				gap: 12,
				padding: 16,
				border: B,
				borderRadius: 18,
				background: gateOpen ? "#FFFFFF" : "#F8F7F4",
				boxShadow: gateOpen ? layered(4) : "none",
			}}
		>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "baseline",
				}}
			>
				<span style={{ fontSize: 17, fontWeight: 800 }}>Bayar DP</span>
				<span style={{ ...mono, fontSize: 22, fontWeight: 600 }}>{rp(dp)}</span>
			</div>
			{rejectReason && !done && (
				<div
					style={{
						padding: "10px 12px",
						border: B,
						borderRadius: 12,
						background: "#F7D5CC",
						fontSize: 14,
						lineHeight: 1.4,
					}}
				>
					Bukti sebelumnya belum bisa kami terima: {rejectReason}
				</div>
			)}
			{!gateOpen && !done && (
				<>
					<span style={{ fontSize: 14, lineHeight: 1.45, color: "#3A3936" }}>
						Lengkapi {gateLeft} data acara wajib dulu, lalu tombol bayar aktif.
					</span>
					<button
						type="button"
						disabled
						style={{
							height: 52,
							border: "1.5px solid #D6D3CC",
							borderRadius: 14,
							background: "#EFEDE8",
							color: "#8A8883",
							fontSize: 15,
							fontWeight: 700,
						}}
					>
						Bayar DP
					</button>
				</>
			)}
			{gateOpen && !done && (
				<>
					{bank ? (
						<div
							style={{
								border: B,
								borderRadius: 14,
								background: "#fff",
								overflow: "hidden",
								fontSize: 14,
							}}
						>
							<BankRow k="Bank" v={bank.bank_name} />
							<BankRow k="No. rekening" v={bank.account_number} mono copy />
							<BankRow k="Atas nama" v={bank.account_holder} last />
						</div>
					) : (
						<span style={{ fontSize: 14, color: "#3A3936" }}>
							Rekening tujuan belum diatur. Chat admin, ya.
						</span>
					)}
					{!file && (
						<label
							style={{
								display: "flex",
								flexDirection: "column",
								alignItems: "center",
								gap: 6,
								padding: "18px 12px",
								border: `1.5px dashed ${INK}`,
								borderRadius: 14,
								background: "#fff",
								textAlign: "center",
								cursor: "pointer",
							}}
						>
							<input
								type="file"
								accept="image/jpeg,image/png,image/heic,.heic,image/webp,application/pdf"
								onChange={(e) => pick(e.target.files?.[0])}
								style={{ display: "none" }}
							/>
							<Upload size={22} strokeWidth={2} />
							<span style={{ fontSize: 15, fontWeight: 800 }}>
								Unggah bukti transfer
							</span>
							<span style={{ fontSize: 12, color: "#5F5E5A" }}>
								JPG, PNG, HEIC, atau PDF · maks 10 MB
							</span>
						</label>
					)}
					{fileErr && <ErrLine text={fileErr} size={14} />}
					{file && (
						<div
							style={{
								display: "flex",
								gap: 10,
								alignItems: "center",
								padding: 12,
								border: B,
								borderRadius: 14,
								background: "#fff",
							}}
						>
							<FileCheck size={20} strokeWidth={2} />
							<span
								style={{
									flex: 1,
									minWidth: 0,
									display: "flex",
									flexDirection: "column",
								}}
							>
								<span
									style={{
										fontSize: 14,
										fontWeight: 700,
										overflow: "hidden",
										textOverflow: "ellipsis",
										whiteSpace: "nowrap",
									}}
								>
									{file.name}
								</span>
								<span style={{ ...mono, fontSize: 12, color: "#5F5E5A" }}>
									{(file.size / 1048576).toFixed(1)} MB
								</span>
							</span>
							<button
								type="button"
								onClick={() => setFile(null)}
								style={{
									border: 0,
									background: "transparent",
									fontSize: 13,
									fontWeight: 700,
									textDecoration: "underline",
								}}
							>
								Ganti
							</button>
						</div>
					)}
					{file && bank && (
						<Cta
							onClick={send}
							disabled={busy}
							bg="#FFFFFF"
							style={{ height: 52, fontSize: 16 }}
						>
							{busy ? "Mengirim…" : "Kirim bukti DP"}
						</Cta>
					)}
				</>
			)}
			{done && (
				<div
					role="status"
					style={{
						display: "flex",
						gap: 10,
						alignItems: "center",
						padding: 12,
						border: B,
						borderRadius: 14,
						background: "#D6F1EA",
						fontSize: 14,
						lineHeight: 1.4,
					}}
				>
					<Dot size={26} font={12} ok />
					Bukti terkirim. Setelah admin cek, tanggalmu terkunci.
				</div>
			)}
		</div>
	);
}

function BankRow({
	k,
	v,
	mono: isMono,
	last,
	copy,
}: {
	k: string;
	v: string;
	mono?: boolean;
	last?: boolean;
	copy?: boolean;
}) {
	const [copied, setCopied] = useState(false);
	return (
		<div
			style={{
				display: "flex",
				justifyContent: "space-between",
				gap: 10,
				padding: "10px 12px",
				borderBottom: last ? "0" : "1.5px dashed #D6D3CC",
			}}
		>
			<span style={{ color: "#5F5E5A" }}>{k}</span>
			<span style={{ display: "flex", gap: 8, alignItems: "center" }}>
				<span
					style={{ fontWeight: isMono ? 600 : 700, ...(isMono ? mono : {}) }}
				>
					{v}
				</span>
				{copy && (
					<button
						type="button"
						onClick={() => {
							navigator.clipboard
								?.writeText(v.replace(/\s/g, ""))
								.then(() => setCopied(true));
							setTimeout(() => setCopied(false), 1500);
						}}
						style={{
							border: 0,
							background: "transparent",
							fontSize: 12,
							fontWeight: 700,
							textDecoration: "underline",
						}}
					>
						{copied ? "Tersalin" : "Salin"}
					</button>
				)}
			</span>
		</div>
	);
}

// ── Boleh menyusul ──────────────────────────────────────────────────────────

type Row = { jam: string; acara: string };

function Later({
	d,
	setF,
	save,
	readOnly,
	stageGroups,
	saveErr,
}: {
	d: Detail;
	setF: <K extends keyof Detail>(k: K, v: Detail[K]) => void;
	save: <K extends keyof Detail>(k: K, v: Detail[K]) => Promise<void>;
	readOnly: boolean;
	stageGroups: boolean;
	saveErr: boolean;
}) {
	const [open, setOpen] = useState<string | null>(null);
	const [rows, setRows] = useState<Row[]>(d.rundown?.length ? d.rundown : []);
	const [groups, setGroups] = useState((d.stage_groups ?? []).join("\n"));
	const [igText, setIgText] = useState(
		(d.instagram ?? []).map((h) => `@${h}`).join(" "),
	);
	const igList = parseInstagram(igText);
	const saveRows = (next: Row[]) =>
		save(
			"rundown",
			next.filter((r) => r.jam.trim() || r.acara.trim()),
		);
	const parseGroups = (t: string) =>
		t
			.split("\n")
			.map((l) => l.trim().slice(0, 120))
			.filter(Boolean)
			.slice(0, 300);
	const inp = {
		height: 48,
		border: B,
		borderRadius: 12,
		padding: "0 12px",
		fontSize: 16,
		fontWeight: 600,
		width: "100%",
		background: "#fff",
	} as const;
	const ta = {
		border: B,
		borderRadius: 12,
		padding: "10px 12px",
		fontSize: 16,
		fontWeight: 500,
		width: "100%",
		resize: "none",
		background: "#fff",
	} as const;
	const ownerWa = d.pemilik_wa ? waFmt(dig(d.pemilik_wa)) : "";
	const items: Array<{
		k: string;
		label: string;
		icon: typeof Phone;
		tint: string;
		sub: string;
		body: ReactNode;
	}> = [
		{
			k: "ownerWa",
			label: "WA pemilik acara",
			icon: Phone,
			tint: "#D6EEF8",
			sub: ownerWa ? `+62 ${ownerWa}` : "Kalau beda dari pemesan",
			body: (
				<div style={{ position: "relative" }}>
					<span
						style={{
							position: "absolute",
							left: 0,
							top: 0,
							bottom: 0,
							width: 58,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							...mono,
							fontSize: 15,
							fontWeight: 600,
							borderRight: "1.5px solid #D6D3CC",
						}}
					>
						+62
					</span>
					<input
						className="in"
						type="tel"
						inputMode="tel"
						aria-label="WA pemilik acara"
						placeholder="WA pemilik acara"
						value={d.pemilik_wa ?? ""}
						onChange={(e) => setF("pemilik_wa", e.target.value)}
						onBlur={() =>
							save(
								"pemilik_wa",
								dig(d.pemilik_wa ?? "") ? `0${dig(d.pemilik_wa ?? "")}` : "",
							)
						}
						style={{ ...inp, padding: "0 12px 0 70px", ...mono }}
					/>
				</div>
			),
		},
		{
			k: "addr",
			label: "Alamat venue & Google Maps",
			icon: MapIcon,
			tint: "#FCE3C6",
			sub: d.venue_alamat || (d.maps_url ? "Link Maps tersimpan" : "Opsional"),
			body: (
				<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
					<textarea
						className="in"
						rows={2}
						aria-label="Alamat venue"
						placeholder="Alamat lengkap venue"
						value={d.venue_alamat ?? ""}
						maxLength={255}
						onChange={(e) => setF("venue_alamat", e.target.value)}
						onBlur={() => save("venue_alamat", (d.venue_alamat ?? "").trim())}
						style={ta}
					/>
					<input
						className="in"
						type="url"
						inputMode="url"
						aria-label="Link Google Maps"
						placeholder="Link Google Maps"
						value={d.maps_url ?? ""}
						maxLength={500}
						onChange={(e) => setF("maps_url", e.target.value)}
						onBlur={() => save("maps_url", (d.maps_url ?? "").trim())}
						style={{ ...inp, fontWeight: 500 }}
					/>
				</div>
			),
		},
		{
			k: "pic",
			label: "PIC di hari H",
			icon: UserCheck,
			tint: "#D6F1EA",
			sub: d.pic_nama
				? [d.pic_nama, d.pic_wa].filter(Boolean).join(" · ")
				: "Opsional",
			body: (
				<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
					<input
						className="in"
						aria-label="Nama PIC hari H"
						placeholder="Nama PIC hari H"
						value={d.pic_nama ?? ""}
						maxLength={120}
						onChange={(e) => setF("pic_nama", e.target.value)}
						onBlur={() => save("pic_nama", (d.pic_nama ?? "").trim())}
						style={inp}
					/>
					<input
						className="in"
						type="tel"
						inputMode="tel"
						aria-label="WA PIC"
						placeholder="WA PIC (08…)"
						value={d.pic_wa ?? ""}
						maxLength={20}
						onChange={(e) => setF("pic_wa", e.target.value)}
						onBlur={() => save("pic_wa", (d.pic_wa ?? "").trim())}
						style={{ ...inp, ...mono }}
					/>
				</div>
			),
		},
		{
			k: "guests",
			label: "Perkiraan jumlah tamu",
			icon: Users,
			tint: "#CEC8F6",
			sub: d.jumlah_tamu ? `${d.jumlah_tamu} tamu` : "Opsional",
			body: (
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "repeat(4,minmax(0,1fr))",
						gap: 6,
					}}
				>
					{GUESTS.map((g) => (
						<button
							key={g}
							type="button"
							aria-pressed={d.jumlah_tamu === g}
							disabled={readOnly}
							onClick={() => {
								const v = d.jumlah_tamu === g ? "" : g;
								setF("jumlah_tamu", v);
								save("jumlah_tamu", v);
							}}
							style={{
								height: 44,
								border: B,
								borderRadius: 12,
								background: d.jumlah_tamu === g ? "#8EDCCB" : "#FFFFFF",
								...mono,
								fontSize: 13,
								fontWeight: 600,
							}}
						>
							{g}
						</button>
					))}
				</div>
			),
		},
		{
			k: "rundown",
			label: "Rundown acara",
			icon: ListOrdered,
			tint: "#FCE3C6",
			sub: rows.filter((r) => r.jam || r.acara).length
				? `${rows.filter((r) => r.jam || r.acara).length} baris`
				: "Opsional",
			body: (
				<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
					{rows.map((r, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: baris rundown tanpa id; urutan = identitas.
						<div key={i} style={{ display: "flex", gap: 6 }}>
							<input
								className="in"
								inputMode="numeric"
								placeholder="18:00"
								aria-label={`Jam baris ${i + 1}`}
								maxLength={5}
								value={r.jam}
								onChange={(e) =>
									setRows(
										rows.map((x, j) =>
											j === i ? { ...x, jam: e.target.value } : x,
										),
									)
								}
								onBlur={() => saveRows(rows)}
								style={{
									flex: "none",
									width: 104,
									height: 46,
									border: B,
									borderRadius: 12,
									padding: "0 8px",
									...mono,
									fontSize: 15,
									background: "#fff",
								}}
							/>
							<input
								className="in"
								placeholder="Kegiatan"
								aria-label={`Kegiatan baris ${i + 1}`}
								maxLength={120}
								value={r.acara}
								onChange={(e) =>
									setRows(
										rows.map((x, j) =>
											j === i ? { ...x, acara: e.target.value } : x,
										),
									)
								}
								onBlur={() => saveRows(rows)}
								style={{
									flex: 1,
									minWidth: 0,
									height: 46,
									border: B,
									borderRadius: 12,
									padding: "0 10px",
									fontSize: 16,
									fontWeight: 500,
									background: "#fff",
								}}
							/>
							<button
								type="button"
								aria-label="Hapus baris"
								onClick={() => {
									const next = rows.filter((_, j) => j !== i);
									setRows(next);
									saveRows(next);
								}}
								style={{
									flex: "none",
									width: 40,
									height: 46,
									border: 0,
									background: "transparent",
									fontSize: 18,
								}}
							>
								×
							</button>
						</div>
					))}
					{rows.length < 30 && (
						<button
							type="button"
							onClick={() => setRows([...rows, { jam: "", acara: "" }])}
							style={{
								height: 44,
								border: `1.5px dashed ${INK}`,
								borderRadius: 12,
								background: "transparent",
								fontSize: 14,
								fontWeight: 700,
							}}
						>
							+ Tambah baris{" "}
							<span style={{ ...mono, fontWeight: 500, color: "#5F5E5A" }}>
								{rows.length}/30
							</span>
						</button>
					)}
				</div>
			),
		},
		...(stageGroups
			? [
					{
						k: "groups",
						label: "Grup foto pelaminan",
						icon: Users,
						tint: "#D6F1EA",
						sub: parseGroups(groups).length
							? `${parseGroups(groups).length} grup`
							: "Opsional",
						body: (
							<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
								<textarea
									className="in"
									rows={5}
									aria-label="Grup foto pelaminan, satu per baris"
									placeholder={
										"Keluarga inti pengantin wanita\nKeluarga inti pengantin pria\nSahabat SMA"
									}
									value={groups}
									onChange={(e) => setGroups(e.target.value)}
									onBlur={() => save("stage_groups", parseGroups(groups))}
									style={ta}
								/>
								<span style={{ fontSize: 12, color: "#5F5E5A" }}>
									Satu grup per baris, sesuai urutan dipanggil fotografer.
								</span>
							</div>
						),
					},
				]
			: []),
		{
			k: "instagram",
			label: "Instagram kamu (boleh lebih dari satu)",
			icon: AtSign,
			tint: "#F7D5CC",
			sub: d.instagram?.length
				? d.instagram.map((h) => `@${h}`).join(" · ")
				: "Biar tamu bisa tag kamu",
			body: (
				<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
					<span style={{ fontSize: 13, lineHeight: 1.5, color: "#3A3936" }}>
						Isi IG pengantin, perusahaan/acara, atau WO/EO. Di halaman foto,
						tamu akan diarahkan untuk <b>follow dan tag akun ini</b> saat upload
						foto ke story, jadi acaramu ikut ramai di Instagram.
					</span>
					<input
						className="in"
						aria-label="Akun Instagram"
						placeholder="@rinadimas @bahagia.organizer"
						value={igText}
						onChange={(e) => setIgText(e.target.value)}
						onBlur={() => {
							setIgText(igList.map((h) => `@${h}`).join(" "));
							save("instagram", igList);
						}}
						style={{ ...inp, ...mono }}
					/>
					{igList.length > 0 && (
						<div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
							{igList.map((h) => (
								<span
									key={h}
									style={{
										height: 28,
										padding: "0 10px",
										border: B,
										borderRadius: 999,
										background: "#fff",
										display: "inline-flex",
										alignItems: "center",
										...mono,
										fontSize: 13,
										fontWeight: 600,
									}}
								>
									@{h}
								</span>
							))}
						</div>
					)}
					<span style={{ fontSize: 12, color: "#5F5E5A" }}>
						Maks. 6 akun, pisahkan dengan spasi. Akun ini ditampilkan di halaman
						foto tamu.
					</span>
				</div>
			),
		},
		{
			k: "note",
			label: "Catatan untuk tim",
			icon: MessageSquare,
			tint: "#D6EEF8",
			sub: d.catatan || "Opsional",
			body: (
				<textarea
					className="in"
					rows={3}
					aria-label="Catatan untuk tim"
					placeholder="Tema warna, akses loading barang, dsb."
					value={d.catatan ?? ""}
					maxLength={1000}
					onChange={(e) => setF("catatan", e.target.value)}
					onBlur={() => save("catatan", (d.catatan ?? "").trim())}
					style={ta}
				/>
			),
		},
	];
	return (
		<div
			id="boleh-menyusul"
			style={{ display: "flex", flexDirection: "column", gap: 12 }}
		>
			<div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
				<span style={{ fontSize: 17, fontWeight: 800 }}>Boleh menyusul</span>
				<span style={{ fontSize: 13, color: "#5F5E5A" }}>
					Tidak menghalangi apa pun. Isi kapan saja.
				</span>
			</div>
			<fieldset
				disabled={readOnly}
				style={{
					margin: 0,
					padding: 0,
					border: B,
					borderRadius: 18,
					background: "#fff",
					overflow: "hidden",
				}}
			>
				{items.map((it, i) => {
					const on = open === it.k;
					const muted =
						it.sub === "Opsional" || it.sub === "Kalau beda dari pemesan";
					return (
						<div
							key={it.k}
							style={{
								borderBottom:
									i < items.length - 1 ? "1.5px dashed #D6D3CC" : "0",
							}}
						>
							<button
								type="button"
								aria-expanded={on}
								onClick={() => setOpen(on ? null : it.k)}
								style={{
									display: "flex",
									alignItems: "center",
									gap: 12,
									width: "100%",
									minHeight: 60,
									padding: "10px 14px",
									border: 0,
									background: "transparent",
									textAlign: "left",
								}}
							>
								<IconChip
									icon={it.icon}
									tint={it.tint}
									size={38}
									radius={11}
									iconSize={18}
								/>
								<span
									style={{
										flex: 1,
										minWidth: 0,
										display: "flex",
										flexDirection: "column",
										gap: 1,
									}}
								>
									<span style={{ fontSize: 15, fontWeight: 700 }}>
										{it.label}
									</span>
									<span
										style={{
											fontSize: 12,
											color: muted ? "#5F5E5A" : INK,
											overflow: "hidden",
											textOverflow: "ellipsis",
											whiteSpace: "nowrap",
										}}
									>
										{it.sub}
									</span>
								</span>
								<ChevronDown
									size={18}
									strokeWidth={2}
									style={{
										flex: "none",
										transform: `rotate(${on ? 180 : 0}deg)`,
										transition: "transform 150ms",
									}}
								/>
							</button>
							{on && <div style={{ padding: "0 14px 14px" }}>{it.body}</div>}
						</div>
					);
				})}
			</fieldset>
			{saveErr ? (
				<ErrLine
					text="Gagal menyimpan. Cek koneksi lalu coba lagi."
					size={12}
				/>
			) : (
				<span
					style={{
						fontSize: 12,
						color: "#5F5E5A",
						display: "flex",
						gap: 6,
						alignItems: "center",
					}}
				>
					<Cloud size={14} strokeWidth={2} />
					Tersimpan otomatis
				</span>
			)}
		</div>
	);
}
