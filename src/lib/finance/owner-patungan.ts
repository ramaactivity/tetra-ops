import "server-only";

import type { createClient } from "@/lib/supabase/server";

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Patungan owner — sebagian beban perusahaan ditanggung bersama oleh owner,
 * uangnya DIPOTONG dari bagi hasil (bukan transfer tunai).
 *
 * Contoh nyata: kost Rp800.000/bulan. Yang benar-benar jadi beban Tetra hanya
 * Rp400.000; sisanya patungan 4 owner @Rp100.000, dipotong dari jatah bagi
 * hasil masing-masing sebelum dibagikan.
 *
 * Jurnalnya:
 *     Dr 2-300 Hutang Bagi Hasil Owner   (jatah owner berkurang)
 *     Cr <akun beban>                    (beban perusahaan berkurang)
 * Kas TIDAK bergerak — memang tidak ada uang berpindah; owner "membayar"
 * dengan merelakan sebagian jatahnya.
 *
 * Sub-ledger owner_earnings ikut dicatat (earning_type='contribution', nilai
 * negatif) supaya invarian 2-300 == SUM(owner_earnings) tetap terjaga, dan
 * potongannya kelihatan terpisah dari "sudah diambil" di UI.
 *
 * Kalau owner justru TRANSFER TUNAI untuk patungan (bukan potong bagi hasil),
 * jangan pakai ini — pakai kategori "Patungan owner" di Catat transaksi yang
 * mendebit kas & mengkredit beban.
 */

export type PatunganResult =
	| { ok: true; total: number; owners: number; refId: string }
	| { ok: false; error: string };

function newRef(date: string): string {
	const stamp = date.replace(/-/g, "");
	const rand = Math.floor(Math.random() * 0xffffffff)
		.toString(16)
		.padStart(8, "0")
		.toUpperCase();
	return `JE-${stamp}-${rand}`;
}

export async function recordPatunganFromPool(
	supabase: ServerSupabase,
	input: {
		/** Akun beban yang ditanggung bersama (mis. 5-260 kost). */
		expenseCoa: string;
		/** Nominal per owner. */
		perOwner: number;
		/** Keterangan manusiawi, mis. "Patungan kost Agustus 2026". */
		description: string;
		date: string;
		actorProfileId: string;
		/** Bulan yang dibayar untuk beban rutin — ikut ke jurnal & sub-ledger. */
		periodMonth?: string | null;
	},
): Promise<PatunganResult> {
	const perOwner = Math.round(input.perOwner);
	if (perOwner <= 0) {
		return { ok: false, error: "Nominal patungan harus lebih dari 0" };
	}

	const { data: owners, error: ownerErr } = await supabase
		.from("users")
		.select("id, full_name")
		.eq("role", "owner")
		.eq("is_active", true)
		.order("full_name");
	if (ownerErr) return { ok: false, error: ownerErr.message };
	if (!owners || owners.length === 0) {
		return { ok: false, error: "Tidak ada owner aktif" };
	}

	const total = perOwner * owners.length;
	const refId = newRef(input.date);

	const { data: entry, error: entryErr } = await supabase
		.from("journal_entries")
		.insert({
			ref_id: refId,
			entry_date: input.date,
			entry_type: "adjustment",
			description: input.description,
			source_type: "owner_patungan",
			period_month: input.periodMonth ?? null,
			total_amount: total,
			created_by: input.actorProfileId,
		})
		.select("id")
		.single();
	if (entryErr || !entry) {
		return {
			ok: false,
			error: `Gagal catat jurnal: ${entryErr?.message ?? "unknown"}`,
		};
	}

	const { error: linesErr } = await supabase.from("journal_lines").insert([
		{
			entry_id: entry.id,
			account_code: "2-300",
			debit_amount: total,
			credit_amount: 0,
			description: `Patungan ${owners.length} owner @${perOwner.toLocaleString("id-ID")} — dipotong dari bagi hasil`,
			line_order: 1,
		},
		{
			entry_id: entry.id,
			account_code: input.expenseCoa,
			debit_amount: 0,
			credit_amount: total,
			description: "Beban ditanggung patungan owner",
			line_order: 2,
		},
	]);
	if (linesErr) {
		await supabase.from("journal_entries").delete().eq("id", entry.id);
		return { ok: false, error: `Gagal catat jurnal: ${linesErr.message}` };
	}

	// Sub-ledger: potongan per owner. period_month = bulan patungan supaya
	// laporan per periode ikut benar (trigger mengisi otomatis dari created_at,
	// jadi di-set eksplisit di sini).
	// Periode sub-ledger mengikuti bulan yang DIBAYAR kalau ada (kost Agustus
	// yang dibayar September tetap masuk periode Agustus); kalau tidak, pakai
	// bulan transaksinya.
	const period = input.periodMonth ?? `${input.date.slice(0, 7)}-01`;
	const { error: oeErr } = await supabase.from("owner_earnings").insert(
		owners.map((o) => ({
			owner_user_id: o.id as string,
			earning_type: "contribution",
			amount: -perOwner,
			period_month: period,
			description: input.description,
			performed_by: input.actorProfileId,
		})),
	);
	if (oeErr) {
		await supabase.from("journal_lines").delete().eq("entry_id", entry.id);
		await supabase.from("journal_entries").delete().eq("id", entry.id);
		return { ok: false, error: `Gagal catat potongan owner: ${oeErr.message}` };
	}

	return { ok: true, total, owners: owners.length, refId };
}
