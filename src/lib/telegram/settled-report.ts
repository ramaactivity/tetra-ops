import { findCategory } from "@/lib/finance/quick-record-categories";
// Sengaja dari format.ts, bukan client.ts/digest.ts: keduanya ber-"server-only"
// dan menariknya ke sini membuat modul ini mustahil diuji.
import { dateLabel, rp, tgEscape } from "@/lib/telegram/format";

/**
 * Penyusun laporan "EVENT SETTLED" untuk grup Telegram owner.
 *
 * Sengaja modul murni (data → string, tanpa query/IO) supaya formatnya bisa
 * diperiksa & diubah tanpa menyentuh jalur pengiriman — dan supaya salah satu
 * angka yang hilang tidak pernah menggagalkan settle-nya.
 *
 * Grup owner-only (crew tidak di dalamnya), jadi biaya & laba aman ditampilkan.
 */

export type SettledReportInput = {
	clientName: string;
	eventDate: string | null;
	packageName: string | null;
	revenueNet: number;
	/** Laba versi settlement (belum termasuk pengeluaran/pemasukan lain). */
	netProfit: number;
	isLoss: boolean;
	remainingBalance: number;
	settlement: {
		hppTotal: number;
		opexTotal: number;
		feeCrew: number;
		transportKonsumsi: number;
		komisi: number;
		sinkingTotal: number;
		ownerPoolTotal: number;
		operatingCash: number;
	} | null;
	/** Jurnal kas manual yang tertaut event ini (pengeluaran/pemasukan lain). */
	manualEntries: Array<{ entryType: string; amount: number }>;
	/** Antrian yang berhasil/gagal diposting barusan. */
	postedQueue: Array<{
		kind: string;
		amount: number;
		categoryId: string | null;
		/** Keterangan yang diketik owner, mis. "Toll — BRI — Culture Fest 2026". */
		note: string | null;
		direction: string | null;
		postedRef: string | null;
		postError: string | null;
	}>;
	detailUrl: string | null;
};

/**
 * Nama pengeluaran/pemasukan lain untuk laporan.
 *
 * Empat baris "Pengeluaran lain" berturut-turut tidak memberi tahu apa pun ke
 * owner. Keterangannya sudah ada di antrian — bentuknya "<label> — <nama
 * klien>", jadi nama klien dibuang karena sudah tercetak di judul laporan.
 * Kalau keterangannya kosong, dipakai nama kategori Catat; kalau itu pun tidak
 * ada, baru jatuh ke label umum.
 */
function extraLabel(note: string | null, categoryId: string | null): string {
	const head = (note ?? "").split(" — ")[0].trim();
	if (head) return head;
	return findCategory(categoryId)?.label ?? "Pengeluaran lain";
}

export function buildSettledReport(input: SettledReportInput): string {
	const st = input.settlement;

	// Uang keluar/masuk lain dibukukan sebagai jurnal kas tersendiri, jadi tidak
	// tercermin di net_profit settlement — padahal tetap uang event ini.
	let extraOut = 0;
	let extraIn = 0;
	for (const e of input.manualEntries) {
		if (e.entryType === "expense") extraOut += e.amount;
		else extraIn += e.amount;
	}
	const finalProfit = input.netProfit - extraOut + extraIn;
	const finalMargin =
		input.revenueNet > 0
			? Math.round((finalProfit / input.revenueNet) * 100)
			: 0;

	const paidLines: string[] = [];
	const receivedLines: string[] = [];
	for (const q of input.postedQueue) {
		if (q.postError) continue;
		if (q.kind === "crew_fee") {
			paidLines.push(
				`   • Fee crew${q.postedRef ? ` (${tgEscape(q.postedRef)})` : ""} ${rp(q.amount)}`,
			);
		} else if (q.kind === "commission_sales") {
			paidLines.push(`   • Komisi sales ${rp(q.amount)}`);
		} else if (q.kind === "commission_partner") {
			paidLines.push(
				`   • Komisi ${tgEscape(q.categoryId ?? "mitra")} ${rp(q.amount)}`,
			);
		} else if (q.kind === "expense") {
			const line = `   • ${tgEscape(extraLabel(q.note, q.categoryId))} ${rp(q.amount)}`;
			// Kartu "Pemasukan / pengeluaran lain" bisa dua arah — uang masuk
			// jangan ikut nongkrong di bawah judul "Uang keluar".
			if (q.direction === "masuk") receivedLines.push(line);
			else paidLines.push(line);
		}
	}
	const failedCount = input.postedQueue.filter((q) => q.postError).length;

	const subtitle = [
		input.eventDate ? `📅 ${dateLabel(input.eventDate)}` : null,
		input.packageName ? tgEscape(input.packageName) : null,
	]
		.filter(Boolean)
		.join(" · ");

	const lines: Array<string | null> = [
		`${input.isLoss ? "🚨" : "✅"} <b>EVENT SETTLED — ${tgEscape(input.clientName)}</b>`,
		subtitle || null,
		"",
		`📈 Omzet ${rp(input.revenueNet)}`,
		st ? `📦 HPP ${rp(st.hppTotal)}` : null,
		st ? `🧾 Biaya operasional ${rp(st.opexTotal)}` : null,
		st && st.feeCrew > 0 ? `   • Fee crew ${rp(st.feeCrew)}` : null,
		st && st.transportKonsumsi > 0
			? `   • Transport & konsumsi ${rp(st.transportKonsumsi)}`
			: null,
		st && st.komisi > 0 ? `   • Komisi ${rp(st.komisi)}` : null,
		extraOut > 0 ? `➖ Pengeluaran lain ${rp(extraOut)}` : null,
		extraIn > 0 ? `➕ Pemasukan lain ${rp(extraIn)}` : null,
		`💰 <b>Laba akhir ${rp(finalProfit)}</b> (margin ${finalMargin}%)${
			input.isLoss ? " — RUGI, review settlement-nya" : ""
		}`,
	];

	if (st) {
		lines.push(
			"",
			"🏦 <b>Alokasi laba</b>",
			`   • Dana cadangan ${rp(st.sinkingTotal)}`,
			`   • Bagi hasil owner ${rp(st.ownerPoolTotal)}`,
			`   • Kas operasional ${rp(st.operatingCash)}`,
		);
	}
	if (paidLines.length > 0) {
		lines.push("", "💸 <b>Uang keluar saat settle</b>", ...paidLines);
	}
	if (receivedLines.length > 0) {
		lines.push("", "💵 <b>Uang masuk saat settle</b>", ...receivedLines);
	}
	if (failedCount > 0) {
		lines.push(
			`⚠️ ${failedCount} pembayaran gagal diposting — cek halaman rekap`,
		);
	}
	if (input.remainingBalance > 0) {
		lines.push(
			"",
			`🔔 <b>Sisa tagihan klien ${rp(input.remainingBalance)}</b> — belum lunas`,
		);
	}
	if (input.detailUrl) {
		lines.push("", `Detail: ${input.detailUrl}`);
	}

	return lines.filter((l) => l !== null).join("\n");
}
