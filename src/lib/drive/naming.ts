/**
 * naming.ts — Penamaan file nota di Google Drive (auto-rename).
 *
 * Tujuan: nama file selalu rapi & deskriptif (tanggal, jenis transaksi, klien,
 * nominal) sehingga mudah dicari/ditracking di Drive — apa pun nama file asli
 * yang di-upload (screenshot, IMG_1234, dsb selalu diganti).
 *
 * Modul biasa (BUKAN "use server" / "server-only") supaya bisa di-import dari
 * route handler maupun util lain tanpa batasan. Tidak ada side-effect.
 */

/** Buang karakter ilegal Drive + rapikan whitespace, lalu potong panjang. */
export function safeSegment(raw: string, maxLen = 60): string {
	return raw
		.replace(/[\\/:*?"<>|]/g, "")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, maxLen);
}

/** ISO → `YYYY-MM-DD` (atau null kalau tak valid). */
export function formatPaymentDate(iso: string | null): string | null {
	if (!iso) return null;
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return null;
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

export const MONTHS_ID = [
	"Januari",
	"Februari",
	"Maret",
	"April",
	"Mei",
	"Juni",
	"Juli",
	"Agustus",
	"September",
	"Oktober",
	"November",
	"Desember",
] as const;

/** Tanggal Indonesia readable, mis. "9 Mei 2026". */
export function humanDateID(iso: string | null): string | null {
	if (!iso) return null;
	const d = new Date(`${iso}T00:00:00`);
	if (Number.isNaN(d.getTime())) return null;
	return `${d.getDate()} ${MONTHS_ID[d.getMonth()]} ${d.getFullYear()}`;
}

export const PAYMENT_TYPE_LABEL: Record<string, string> = {
	dp: "DP",
	partial: "Partial",
	pelunasan: "Pelunasan",
};

/** `Rp1.500.000` (id-ID). Kosong kalau amount falsy/<=0. */
function rupiahSuffix(amount: number | null): string | null {
	if (!amount || amount <= 0) return null;
	return `Rp${amount.toLocaleString("id-ID")}`;
}

function hhmmssNow(): string {
	const now = new Date();
	return (
		String(now.getHours()).padStart(2, "0") +
		String(now.getMinutes()).padStart(2, "0") +
		String(now.getSeconds()).padStart(2, "0")
	);
}

/** Gabung bagian non-kosong dengan " - ", potong total, tempel ekstensi. */
function joinName(
	parts: Array<string | null | undefined>,
	ext: string,
): string {
	const name = parts.filter(Boolean).join(" - ").slice(0, 180).trim();
	return `${name}.${ext}`;
}

/**
 * Bukti pembayaran klien:
 *   `{PRJ-ID} - {DP|Pelunasan Rp...} - {Klien} - {YYYY-MM-DD}.{ext}`
 */
export function buildPaymentProofName(
	meta: {
		projectId: string;
		clientName: string;
		paymentType: string | null;
		paymentDate: string | null;
		amount: number | null;
	},
	ext: string,
): string {
	const typeLabel = meta.paymentType
		? PAYMENT_TYPE_LABEL[meta.paymentType.toLowerCase()]
		: null;
	let middle = typeLabel ?? "Pembayaran";
	const rp = rupiahSuffix(meta.amount);
	if (rp) middle += ` ${rp}`;

	return joinName(
		[
			safeSegment(meta.projectId, 30),
			safeSegment(middle, 60),
			meta.clientName ? safeSegment(meta.clientName, 50) : null,
			formatPaymentDate(meta.paymentDate),
		],
		ext,
	);
}

/**
 * Bukti transfer fee crew (owner bayar crew):
 *   `{PRJ-ID} - Fee Crew - {Nama} ({peran}) - {YYYY-MM-DD} - {Rp...}.{ext}`
 * Pakai nama + peran crew supaya ketahuan dibayar ke siapa (bukan nama klien event).
 */
export function buildCrewFeeName(
	meta: {
		projectId: string;
		crewName: string | null;
		role: string | null;
		paymentDate: string | null;
		amount: number | null;
	},
	ext: string,
): string {
	const who = meta.crewName ? safeSegment(meta.crewName, 40) : null;
	const role = meta.role ? safeSegment(meta.role.replace(/_/g, " "), 24) : null;
	const whoRole = who ? (role ? `${who} (${role})` : who) : role;
	return joinName(
		[
			safeSegment(meta.projectId, 30),
			"Fee Crew",
			whoRole,
			formatPaymentDate(meta.paymentDate),
			rupiahSuffix(meta.amount),
		],
		ext,
	);
}

/**
 * Bukti transfer komisi (sales Tetra / vendor / relasi):
 *   `{PRJ-ID} - Komisi {jenis} - {Nama} - {YYYY-MM-DD} - {Rp...}.{ext}`
 * Pakai nama penerima, bukan nama klien — biar jelas komisinya ke siapa.
 */
export function buildCommissionProofName(
	meta: {
		projectId: string;
		kind: string | null;
		payeeName: string | null;
		paymentDate: string | null;
		amount: number | null;
	},
	ext: string,
): string {
	const kindLabel = meta.kind
		? { vendor: "Vendor", relasi: "Relasi", sales: "Sales" }[
				meta.kind.toLowerCase()
			]
		: null;
	return joinName(
		[
			safeSegment(meta.projectId, 30),
			kindLabel ? `Komisi ${kindLabel}` : "Komisi",
			meta.payeeName ? safeSegment(meta.payeeName, 40) : null,
			formatPaymentDate(meta.paymentDate),
			rupiahSuffix(meta.amount),
		],
		ext,
	);
}

/**
 * Bukti rekap crew:
 *   `{PRJ-ID} - REKAP - {YYYY-MM-DD} - {seq}.{ext}`
 * seq dari client (counter multi-file); fallback HHMMSS supaya unik.
 */
export function buildRekapProofName(
	meta: { projectId: string; eventDate: string | null; seq: string | null },
	ext: string,
): string {
	const dateStr =
		formatPaymentDate(meta.eventDate) ??
		formatPaymentDate(new Date().toISOString());
	const seqClean = meta.seq?.replace(/\D/g, "").padStart(2, "0").slice(0, 4);
	const tail = seqClean && seqClean !== "00" ? seqClean : hhmmssNow();
	return joinName(
		[safeSegment(meta.projectId, 30), "REKAP", dateStr, tail],
		ext,
	);
}

/**
 * Bukti transport crew (sewa mobil / gocar / bensin):
 *   `{PRJ-ID} - TRANSPORT - {berangkat|pulang} - {YYYY-MM-DD}.{ext}`
 */
export function buildTransportProofName(
	meta: { projectId: string; eventDate: string | null; leg: string | null },
	ext: string,
): string {
	const legRaw = meta.leg ? meta.leg.toLowerCase() : "";
	const leg = ["berangkat", "pulang"].includes(legRaw) ? legRaw : null;
	const dateStr =
		formatPaymentDate(meta.eventDate) ??
		formatPaymentDate(new Date().toISOString());
	return joinName(
		[
			safeSegment(meta.projectId, 30),
			"TRANSPORT",
			leg ? safeSegment(leg, 20) : null,
			dateStr,
			leg ? null : hhmmssNow(),
		],
		ext,
	);
}

/**
 * File design:
 *   `{Klien} - Design - {d Month yyyy} - {nama asli}.{ext}`
 */
export function buildDesignName(
	meta: {
		clientName: string;
		eventDate: string | null;
		originalName: string | null;
	},
	ext: string,
): string {
	const baseOriginal = safeSegment(
		meta.originalName?.replace(/\.[^.]+$/, "") || "design",
		60,
	);
	return joinName(
		[
			safeSegment(meta.clientName || "Event", 50),
			"Design",
			humanDateID(meta.eventDate),
			baseOriginal,
		],
		ext,
	);
}

/**
 * Fallback generik (kind tak dikenal):
 *   `{PRJ-ID} - {nama asli/timestamp}.{ext}`
 */
export function buildGenericName(
	meta: { projectId: string; originalName: string | null },
	ext: string,
): string {
	const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
	const baseOriginal = safeSegment(
		meta.originalName?.replace(/\.[^.]+$/, "") || `upload-${ts}`,
		120,
	);
	return joinName([safeSegment(meta.projectId, 30), baseOriginal], ext);
}

/**
 * Nota manual (di-upload owner, bukan dari sistem). Tanggal di depan supaya
 * urut kronologis di folder bulanan Drive & gampang dicari:
 *   `{YYYY-MM-DD} - {Kategori} - {Deskripsi} - {Rp...}.{ext}`
 * Tanggal pakai nota_date kalau ada, kalau tidak pakai tanggal upload.
 */
export function buildManualNotaName(
	meta: {
		category: string;
		description: string;
		notaDate: string | null;
		amount: number | null;
		uploadDate?: Date;
	},
	ext: string,
): string {
	const dateStr =
		formatPaymentDate(meta.notaDate) ??
		formatPaymentDate((meta.uploadDate ?? new Date()).toISOString()) ??
		"";
	return joinName(
		[
			dateStr,
			safeSegment(meta.category, 40),
			meta.description ? safeSegment(meta.description, 70) : null,
			rupiahSuffix(meta.amount),
		],
		ext,
	);
}
