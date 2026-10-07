"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { saveBookingDetail } from "@/lib/actions/portal-booking";
import { type Detail, parseStageGroups } from "@/lib/portal/core";

type TextKey = Exclude<keyof Detail, "rundown" | "stage_groups">;
type Row = { jam: string; acara: string };

type Field = {
	key: TextKey;
	label: string;
	placeholder?: string;
	type?: "tel" | "url" | "area";
	hint?: string;
};

const GROUPS: Array<{ title: string; fields: Field[] }> = [
	{
		title: "Tentang acara",
		fields: [
			{
				key: "nama_acara",
				label: "Nama acara",
				placeholder: "mis. Wedding Rina & Dimas",
			},
			{
				key: "pemilik_nama",
				label: "Nama pemilik acara",
				placeholder: "mis. Rina & Dimas",
				hint: "Yang punya acara. Boleh beda dengan yang memesan.",
			},
			{
				key: "pemilik_wa",
				label: "WhatsApp pemilik acara",
				type: "tel",
				placeholder: "0812 3456 7890",
			},
		],
	},
	{
		title: "Lokasi",
		fields: [
			{
				key: "venue_nama",
				label: "Nama tempat",
				placeholder: "mis. Gedung Kirana",
			},
			{ key: "venue_alamat", label: "Alamat", type: "area" },
			{ key: "venue_kota", label: "Kota", placeholder: "mis. Bogor" },
			{
				key: "maps_url",
				label: "Link Google Maps",
				type: "url",
				placeholder: "https://maps.app.goo.gl/…",
			},
		],
	},
	{
		title: "PIC di hari acara",
		fields: [
			{
				key: "pic_nama",
				label: "Nama PIC",
				hint: "Orang yang bisa dihubungi crew di lokasi.",
			},
			{
				key: "pic_wa",
				label: "WhatsApp PIC",
				type: "tel",
				placeholder: "0812 3456 7890",
			},
		],
	},
	{
		title: "Catatan",
		fields: [
			{
				key: "catatan",
				label: "Catatan untuk tim Tetra",
				type: "area",
				placeholder: "Tema, dress code, akses loading, dll.",
			},
		],
	},
];

/** Detail acara, tersimpan otomatis tiap kolom ditinggalkan. */
export function DetailForm({
	code,
	initial,
	categories,
	readOnly,
	stageGroups,
}: {
	code: string;
	initial: Detail;
	categories: Array<{ code: string; label: string }>;
	readOnly?: boolean;
	/** Paket ber-modul Photo Stage → tampilkan daftar grup foto pelaminan. */
	stageGroups?: boolean;
}) {
	const router = useRouter();
	const [values, setValues] = useState<Detail>(initial);
	const saved = useRef<Detail>(initial);
	const [state, setState] = useState<"idle" | "saving" | "saved" | "error">(
		"idle",
	);

	const [rows, setRows] = useState<Row[]>(
		initial.rundown?.length ? initial.rundown : [{ jam: "", acara: "" }],
	);

	async function save<K extends keyof Detail>(
		key: K,
		value: Detail[K] = values[key],
	) {
		if (
			JSON.stringify(value ?? "") === JSON.stringify(saved.current[key] ?? "")
		)
			return;
		setState("saving");
		const r = await saveBookingDetail(code, { [key]: value ?? "" });
		if (r.ok) {
			saved.current = { ...saved.current, [key]: value };
			setState("saved");
			// Bagian Bayar DP di halaman ini bergantung pada isian wajib.
			router.refresh();
		} else setState("error");
	}

	const [groupsText, setGroupsText] = useState(
		(initial.stage_groups ?? []).join("\n"),
	);
	const groupCount = parseStageGroups(groupsText).length;

	const saveRows = (next: Row[]) =>
		save(
			"rundown",
			next.filter((r) => r.jam.trim() || r.acara.trim()),
		);

	return (
		<div style={{ display: "grid", gap: 14 }}>
			<div className="cap" aria-live="polite" style={{ minHeight: 16 }}>
				{state === "saving" && "Menyimpan…"}
				{state === "saved" && "Tersimpan otomatis ✓"}
				{state === "error" && "Gagal menyimpan. Cek koneksi lalu coba lagi."}
			</div>
			<fieldset className="card" style={{ margin: 0 }} disabled={readOnly}>
				<legend className="h2" style={{ padding: "0 6px", marginLeft: -6 }}>
					Jenis acara
				</legend>
				<div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
					{categories.map((c) => (
						<button
							key={c.code}
							type="button"
							className="chip"
							aria-pressed={values.kategori === c.code}
							onClick={() => {
								setValues({ ...values, kategori: c.code });
								save("kategori", c.code);
							}}
						>
							{c.label}
						</button>
					))}
				</div>
			</fieldset>
			{GROUPS.map((g) => (
				<fieldset
					key={g.title}
					className="card"
					style={{ display: "grid", gap: 12, margin: 0 }}
					disabled={readOnly}
				>
					<legend className="h2" style={{ padding: "0 6px", marginLeft: -6 }}>
						{g.title}
					</legend>
					{g.fields.map((f) => {
						const id = `d-${f.key}`;
						const common = {
							id,
							className: `input${f.type === "tel" ? " mono" : ""}`,
							placeholder: f.placeholder,
							value: values[f.key] ?? "",
							onBlur: () => save(f.key),
						};
						return (
							<div key={f.key}>
								<label className="label" htmlFor={id}>
									{f.label}
								</label>
								{f.type === "area" ? (
									<textarea
										{...common}
										onChange={(e) =>
											setValues({ ...values, [f.key]: e.target.value })
										}
									/>
								) : (
									<input
										{...common}
										type={f.type ?? "text"}
										inputMode={f.type === "tel" ? "tel" : undefined}
										onChange={(e) =>
											setValues({ ...values, [f.key]: e.target.value })
										}
									/>
								)}
								{f.hint && (
									<div className="cap" style={{ marginTop: 4 }}>
										{f.hint}
									</div>
								)}
							</div>
						);
					})}
				</fieldset>
			))}
			<fieldset
				className="card"
				style={{ display: "grid", gap: 10, margin: 0 }}
				disabled={readOnly}
			>
				<legend className="h2" style={{ padding: "0 6px", marginLeft: -6 }}>
					Rundown acara
				</legend>
				<div className="cap">
					Jam penting yang perlu diketahui crew, mis. kedatangan tamu atau sesi
					foto bersama.
				</div>
				{rows.map((r, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: baris rundown tanpa id; urutan = identitas.
					<div key={i} style={{ display: "flex", gap: 8 }}>
						<input
							className="input mono"
							style={{ width: 84, flex: "none" }}
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
						/>
						<input
							className="input"
							placeholder="mis. Tamu datang, booth mulai"
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
						/>
					</div>
				))}
				{rows.length < 30 && (
					<button
						type="button"
						className="chip"
						style={{ justifySelf: "start" }}
						onClick={() => setRows([...rows, { jam: "", acara: "" }])}
					>
						+ Tambah baris
					</button>
				)}
			</fieldset>
			{stageGroups && (
				<fieldset
					className="card"
					style={{ display: "grid", gap: 10, margin: 0 }}
					disabled={readOnly}
				>
					<legend className="h2" style={{ padding: "0 6px", marginLeft: -6 }}>
						Grup foto pelaminan
					</legend>
					<label className="cap" htmlFor="d-stage-groups">
						Urutan grup yang foto bersama di pelaminan, satu grup per baris.
						Fotografer memanggil sesuai urutan ini.
					</label>
					<textarea
						id="d-stage-groups"
						className="input"
						rows={6}
						placeholder={
							"Keluarga inti pengantin wanita\nKeluarga inti pengantin pria\nSahabat SMA"
						}
						value={groupsText}
						onChange={(e) => setGroupsText(e.target.value)}
						onBlur={() => save("stage_groups", parseStageGroups(groupsText))}
					/>
					<div className="cap mono">{groupCount} / 300 grup</div>
				</fieldset>
			)}
		</div>
	);
}
