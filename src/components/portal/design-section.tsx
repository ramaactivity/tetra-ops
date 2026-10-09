"use client";

import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
	addDesignFile,
	applyAutoTemplate,
	approveDesignVersion,
	commentDesign,
	requestDesignFileUpload,
	requestDesignRevision,
	saveDesignBrief,
	submitDesignBrief,
} from "@/lib/actions/portal-design";
import { compressImage } from "@/lib/crew/image-compression";
import type { Stage } from "@/lib/portal/design";
import type { DesignRequestView } from "@/lib/portal/design-server";
import { OwnDesignUpload } from "./own-design-upload";
import { Err } from "./verify-phone";

export type TemplateCard = {
	id: string;
	name: string;
	category: string | null;
	frame_size: string;
	orientation: string;
	url: string | null;
	/** Template Booth dengan teks native: nama & tanggal terisi otomatis, tanpa designer. */
	auto_text?: boolean;
	featured?: boolean;
};

const STAGE: Record<Stage, { label: string; bg: string; text: string }> = {
	brief: {
		label: "Menunggu brief",
		bg: "var(--peach)",
		text: "Pilih template, minta dibuatkan designer, atau unggah desainmu sendiri.",
	},
	dikerjakan: {
		label: "Sedang didesain",
		bg: "var(--sky)",
		text: "Designer kami sedang mengerjakan. Draf dikabari lewat WhatsApp.",
	},
	menunggu_review: {
		label: "Siap dicek",
		bg: "var(--butter)",
		text: "Draf baru sudah ada. Cek, lalu ACC atau minta revisi.",
	},
	revisi: {
		label: "Sedang direvisi",
		bg: "var(--sky)",
		text: "Revisi kamu sedang dikerjakan designer.",
	},
	acc: {
		label: "ACC",
		bg: "var(--mint-soft)",
		text: "Desain sudah disetujui. Terima kasih!",
	},
};

const WARNA = [
	"Putih & emas",
	"Hitam elegan",
	"Pastel",
	"Sage hijau",
	"Biru navy",
	"Merah marun",
];

/** Desain frame di portal klien (DR-031). Satu kartu per spot yang butuh desain. */
export function DesignSection({
	code,
	requests,
	templates,
	revisionLimit,
}: {
	code: string;
	requests: DesignRequestView[];
	templates: TemplateCard[];
	revisionLimit: number;
}) {
	return (
		<div style={{ display: "grid", gap: 14 }}>
			{requests.map((r) => (
				<DesignCard
					key={r.id}
					code={code}
					r={r}
					multi={requests.length > 1}
					templates={templates.filter(
						(t) => !r.size || t.frame_size === r.size,
					)}
					revisionLimit={revisionLimit}
				/>
			))}
		</div>
	);
}

function DesignCard({
	code,
	r,
	multi,
	templates,
	revisionLimit,
}: {
	code: string;
	r: DesignRequestView;
	multi: boolean;
	templates: TemplateCard[];
	revisionLimit: number;
}) {
	const router = useRouter();
	const [mode, setMode] = useState(r.mode);
	const [templateId, setTemplateId] = useState(r.template_id);
	const [brief, setBrief] = useState<Record<string, string>>(r.brief);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const st = STAGE[r.stage];
	const latest = r.versions[0];
	const chosen = templates.find((t) => t.id === templateId) ?? null;
	/** Template Booth teks-otomatis: tanpa antrean designer. */
	const auto = mode === "template" && !!chosen?.auto_text;

	async function persist(next: {
		mode?: typeof mode;
		templateId?: string | null;
		brief?: Record<string, string>;
	}) {
		const m = next.mode ?? mode;
		if (!m) return;
		const res = await saveDesignBrief(code, r.id, {
			mode: m,
			templateId: next.templateId === undefined ? templateId : next.templateId,
			brief: next.brief ?? brief,
		});
		if (!res.ok) setError(res.error);
	}

	async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
		setBusy(true);
		setError(null);
		const res = await fn();
		setBusy(false);
		if (!res.ok) return setError(res.error ?? "Gagal. Coba lagi, ya.");
		router.refresh();
	}

	return (
		<div className="card" style={{ display: "grid", gap: 12 }}>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					gap: 8,
				}}
			>
				<div className="h2">
					{multi ? `Booth ${r.spot_no}` : "Desain frame"}
					{r.size ? <span className="cap"> · {r.size}</span> : null}
				</div>
				<span className="pill" style={{ background: st.bg }}>
					{st.label}
				</span>
			</div>
			<p className="body">{st.text}</p>

			{r.stage === "brief" && (
				<>
					<div
						style={{
							display: "grid",
							gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
							gap: 8,
						}}
					>
						{(
							[
								["template", "Pilih template", "Teks acaramu langsung masuk"],
								["custom", "Dibuatkan designer", "Ceritakan konsepnya"],
								["upload", "Unggah desain sendiri", "Dari Canva / Photoshop"],
							] as const
						).map(([m, t, d]) => (
							<button
								key={m}
								type="button"
								className="opt"
								aria-pressed={mode === m}
								style={{ padding: "10px 12px", textAlign: "left" }}
								onClick={() => {
									setMode(m);
									persist({ mode: m });
								}}
							>
								<div style={{ fontWeight: 800, fontSize: 14 }}>{t}</div>
								<div className="cap">{d}</div>
							</button>
						))}
					</div>

					{mode === "template" &&
						(templates.length === 0 ? (
							<div className="note">
								Katalog template untuk ukuran ini belum tersedia. Pakai desain
								custom dulu, ya.
							</div>
						) : (
							<div
								style={{
									display: "grid",
									gridTemplateColumns: "repeat(2, minmax(0,1fr))",
									gap: 10,
								}}
							>
								{templates.map((t) => (
									<button
										key={t.id}
										type="button"
										className="opt"
										aria-pressed={templateId === t.id}
										style={{ padding: 8 }}
										onClick={() => {
											setTemplateId(t.id);
											persist({ templateId: t.id });
										}}
									>
										{t.url && (
											// biome-ignore lint/performance/noImgElement: signed URL privat, bukan aset next/image.
											<img
												src={t.url}
												alt={t.name}
												style={{
													width: "100%",
													borderRadius: 10,
													border: "1.5px solid var(--ink)",
													display: "block",
												}}
											/>
										)}
										<div
											style={{ fontWeight: 700, fontSize: 13, marginTop: 6 }}
										>
											{t.name}
										</div>
										<div className="cap">
											{[t.category, t.auto_text ? "Teks otomatis" : null]
												.filter(Boolean)
												.join(" · ")}
										</div>
									</button>
								))}
							</div>
						))}

					{mode === "upload" && (
						<OwnDesignUpload code={code} requestId={r.id} size={r.size} />
					)}

					{(mode === "template" || mode === "custom") && (
						<div style={{ display: "grid", gap: 10 }}>
							{auto && (
								<div
									className="note"
									style={{ background: "var(--mint-soft)" }}
								>
									Template ini mengisi teks otomatis. Tulis teksnya di bawah —
									langsung masuk ke frame tanpa menunggu designer.
								</div>
							)}
							{(
								[
									[
										"teks_frame",
										auto ? "Teks utama" : "Teks di frame",
										"mis. Rina & Dimas",
									],
									...(auto
										? ([
												[
													"subjudul",
													"Teks kecil (opsional)",
													"mis. The Wedding of",
												],
											] as const)
										: []),
									["tanggal_frame", "Tanggal di frame", "mis. 12.12.2026"],
									...(mode === "custom"
										? ([
												["tema", "Tema / gaya", "mis. rustic, minimalis"],
											] as const)
										: []),
								] as const
							).map(([k, label, ph]) => (
								<div key={k}>
									<label className="label" htmlFor={`b-${r.id}-${k}`}>
										{label}
									</label>
									<input
										id={`b-${r.id}-${k}`}
										className="input"
										placeholder={ph}
										value={brief[k] ?? ""}
										onChange={(e) =>
											setBrief({ ...brief, [k]: e.target.value })
										}
										onBlur={() => persist({})}
									/>
								</div>
							))}
							{mode === "custom" && (
								<div>
									<div className="label">Warna</div>
									<div
										style={{
											display: "flex",
											gap: 8,
											flexWrap: "wrap",
											marginBottom: 8,
										}}
									>
										{WARNA.map((w) => (
											<button
												key={w}
												type="button"
												className="chip"
												aria-pressed={brief.warna === w}
												onClick={() => {
													const next = { ...brief, warna: w };
													setBrief(next);
													persist({ brief: next });
												}}
											>
												{w}
											</button>
										))}
									</div>
									<input
										className="input"
										aria-label="Warna lain"
										placeholder="Atau tulis warnanya sendiri"
										value={brief.warna ?? ""}
										onChange={(e) =>
											setBrief({ ...brief, warna: e.target.value })
										}
										onBlur={() => persist({})}
									/>
								</div>
							)}
							{!auto && (
								<div>
									<label className="label" htmlFor={`b-${r.id}-catatan`}>
										Catatan untuk designer
									</label>
									<textarea
										id={`b-${r.id}-catatan`}
										className="input"
										placeholder="Hal lain yang perlu diketahui designer"
										value={brief.catatan ?? ""}
										onChange={(e) =>
											setBrief({ ...brief, catatan: e.target.value })
										}
										onBlur={() => persist({})}
									/>
								</div>
							)}
							{mode === "custom" && <FileUploads code={code} r={r} />}
							{error && <Err text={error} />}
							<button
								type="button"
								className="btn btn-primary btn-block"
								disabled={
									busy ||
									(mode === "template" && !templateId) ||
									(auto && !brief.teks_frame?.trim())
								}
								onClick={() =>
									run(async () => {
										await persist({});
										return auto
											? applyAutoTemplate(code, r.id)
											: submitDesignBrief(code, r.id);
									})
								}
							>
								{busy
									? "Mengirim…"
									: auto
										? "Pakai template ini"
										: "Kirim ke designer"}
							</button>
						</div>
					)}
				</>
			)}

			{r.stage === "acc" && !latest && chosen && (
				<div style={{ display: "grid", gap: 10 }}>
					<hr className="divider" style={{ margin: 0 }} />
					<div style={{ fontWeight: 800 }}>Template: {chosen.name}</div>
					{chosen.url && (
						// biome-ignore lint/performance/noImgElement: pratinjau template (URL eksternal/privat).
						<img
							src={chosen.url}
							alt={chosen.name}
							style={{
								width: "100%",
								maxWidth: 320,
								borderRadius: 12,
								border: "1.5px solid var(--ink)",
							}}
						/>
					)}
					<div className="note">
						Teks di frame: <b>{r.brief.teks_frame}</b>
						{r.brief.subjudul ? ` · ${r.brief.subjudul}` : ""}
						{r.brief.tanggal_frame ? ` · ${r.brief.tanggal_frame}` : ""}
					</div>
				</div>
			)}

			{latest && (
				<div style={{ display: "grid", gap: 10 }}>
					<hr className="divider" style={{ margin: 0 }} />
					<div style={{ display: "flex", justifyContent: "space-between" }}>
						<span style={{ fontWeight: 800 }}>Draf v{latest.version_no}</span>
						<span className="cap mono">
							{latest.source === "klien" ? "Desainmu · " : ""}
							{latest.frame_size} · {latest.width}×{latest.height}
						</span>
					</div>
					{latest.url && (
						<a href={latest.url} target="_blank" rel="noopener">
							{/* biome-ignore lint/performance/noImgElement: signed URL privat, bukan aset next/image. */}
							<img
								src={latest.url}
								alt={`Draf desain v${latest.version_no}`}
								style={{
									width: "100%",
									borderRadius: 12,
									border: "1.5px solid var(--ink)",
									display: "block",
									// Kotak foto transparan → tampil sebagai pola kotak-kotak.
									background:
										"repeating-conic-gradient(#efede8 0% 25%, #fff 0% 50%) 50% / 16px 16px",
								}}
							/>
						</a>
					)}
					{latest.note && (
						<div className="note">Catatan designer: {latest.note}</div>
					)}
					{r.stage === "menunggu_review" && (
						<Review
							code={code}
							r={r}
							versionId={latest.id}
							left={Math.max(0, revisionLimit - r.revision_count)}
							limit={revisionLimit}
						/>
					)}
				</div>
			)}

			{r.comments.length > 0 && (
				<div style={{ display: "grid", gap: 8 }}>
					<div className="label" style={{ margin: 0 }}>
						Komentar
					</div>
					{r.comments.map((c) => (
						<div
							key={c.id}
							className="note"
							style={{
								background: c.fromClient ? "#fff" : "var(--lavender)",
								borderStyle: c.is_revision_request ? "solid" : "dashed",
							}}
						>
							<div className="cap">
								{c.author}
								{c.is_revision_request ? " · minta revisi" : ""}
							</div>
							<div style={{ whiteSpace: "pre-wrap" }}>{c.body}</div>
						</div>
					))}
				</div>
			)}
			{r.stage !== "brief" && error && <Err text={error} />}
		</div>
	);
}

function Review({
	code,
	r,
	versionId,
	left,
	limit,
}: {
	code: string;
	r: DesignRequestView;
	versionId: string;
	left: number;
	limit: number;
}) {
	const router = useRouter();
	const [text, setText] = useState("");
	const [confirmAcc, setConfirmAcc] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [msg, setMsg] = useState<string | null>(null);

	async function go(
		fn: () => Promise<{ ok: boolean; error?: string; eventApproved?: boolean }>,
	) {
		setBusy(true);
		setError(null);
		const res = await fn();
		setBusy(false);
		if (!res.ok) return setError(res.error ?? "Gagal. Coba lagi, ya.");
		if (res.eventApproved === false)
			setMsg(
				"ACC tersimpan. Admin akan mengecek ukuran frame sebelum desain dikunci.",
			);
		setText("");
		router.refresh();
	}

	return (
		<div style={{ display: "grid", gap: 10 }}>
			<textarea
				className="input"
				aria-label="Komentar"
				placeholder="Tulis komentar atau apa yang perlu diubah"
				value={text}
				maxLength={2000}
				onChange={(e) => setText(e.target.value)}
			/>
			<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
				<button
					type="button"
					className="chip"
					disabled={busy || !text.trim()}
					onClick={() =>
						go(() => commentDesign(code, r.id, { versionId, body: text }))
					}
				>
					Kirim komentar
				</button>
				<button
					type="button"
					className="chip"
					disabled={busy || !text.trim() || left <= 0}
					onClick={() =>
						go(() =>
							requestDesignRevision(code, r.id, { versionId, body: text }),
						)
					}
				>
					Minta revisi · sisa {left}/{limit}
				</button>
			</div>
			{left <= 0 && (
				<div className="cap">
					Jatah revisi habis. Untuk revisi tambahan, hubungi admin lewat
					WhatsApp.
				</div>
			)}
			{!confirmAcc ? (
				<button
					type="button"
					className="btn btn-primary btn-block"
					disabled={busy}
					onClick={() => setConfirmAcc(true)}
				>
					ACC desain ini
				</button>
			) : (
				<div
					className="note"
					style={{ background: "var(--mint-soft)", display: "grid", gap: 10 }}
				>
					<span>
						Setelah ACC, desain ini yang dicetak di acara kamu. Yakin?
					</span>
					<div style={{ display: "flex", gap: 10 }}>
						<button
							type="button"
							className="btn btn-primary"
							disabled={busy}
							onClick={() =>
								go(() => approveDesignVersion(code, r.id, versionId))
							}
						>
							{busy ? "Menyimpan…" : "Ya, ACC"}
						</button>
						<button
							type="button"
							className="link cap"
							onClick={() => setConfirmAcc(false)}
						>
							Batal
						</button>
					</div>
				</div>
			)}
			{msg && <div className="note">{msg}</div>}
			{error && <Err text={error} />}
		</div>
	);
}

function FileUploads({ code, r }: { code: string; r: DesignRequestView }) {
	const router = useRouter();
	const [busy, setBusy] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	async function upload(kind: "referensi" | "logo", file: File) {
		setBusy(kind);
		setError(null);
		try {
			const f =
				kind === "logo"
					? file
					: await compressImage(file, { targetMaxBytes: 3 * 1024 * 1024 });
			const up = await requestDesignFileUpload(code, r.id, {
				type: f.type,
				size: f.size,
			});
			if (!up.ok) throw new Error(up.error);
			const put = await fetch(up.uploadUrl, {
				method: "PUT",
				body: f,
				headers: { "content-type": f.type },
			});
			if (!put.ok) throw new Error("Upload gagal. Cek koneksi lalu coba lagi.");
			const res = await addDesignFile(code, r.id, {
				kind,
				path: up.path,
				name: file.name,
			});
			if (!res.ok) throw new Error(res.error);
			router.refresh();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Upload gagal.");
		}
		setBusy(null);
	}

	return (
		<div style={{ display: "grid", gap: 8 }}>
			<div className="label" style={{ margin: 0 }}>
				Referensi & logo
			</div>
			{r.files.map((f) => (
				<a
					key={f.id}
					href={f.url ?? "#"}
					target="_blank"
					rel="noopener"
					className="cap"
					style={{ color: "var(--ink)" }}
				>
					{f.kind === "logo" ? "Logo" : "Referensi"}: {f.file_name ?? "file"}
				</a>
			))}
			<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
				{(["referensi", "logo"] as const).map((k) => (
					<label key={k} className="chip" style={{ cursor: "pointer" }}>
						<Upload size={15} />{" "}
						{busy === k
							? "Mengunggah…"
							: k === "logo"
								? "Unggah logo"
								: "Unggah referensi"}
						<input
							type="file"
							accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
							style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
							disabled={!!busy}
							onChange={(e) => {
								const f = e.target.files?.[0];
								if (f) upload(k, f);
								e.target.value = "";
							}}
						/>
					</label>
				))}
			</div>
			{error && <Err text={error} />}
		</div>
	);
}
