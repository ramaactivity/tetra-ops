/**
 * Koreksi sekali jalan — talangan crew yang sudah dibayar di luar aplikasi.
 *
 * Temuan audit 2026-08-07: saldo 2-100 Hutang Crew Rp604.500 tidak muncul di
 * layar mana pun karena talangan crew tidak pernah tertaut ke crew manapun.
 * Owner mengonfirmasi: talangannya SUDAH diterima crew, dibayar dari Bank BCA
 * di luar aplikasi.
 *
 * Yang dikerjakan:
 *   A. reimbursement_amount Mou diisi sesuai talangan yang dia keluarkan —
 *      Yokke Rp157.000, Gratama Rp450.000. Ini yang membuat layar aplikasi
 *      cocok dengan jurnal (booked = payable), bukan sekadar buku besar.
 *   B. Jurnal pelunasan: Dr 2-100 Rp607.000 / Cr 1-110 Bank BCA — uang yang
 *      memang sudah keluar.
 *   C. Jurnal pembulatan bonus Kuku: Dr 5-204 Beban Fee Crew Bonus Rp2.500 /
 *      Cr 2-100. Owner sengaja membulatkan Rp47.500 jadi Rp50.000.
 *
 * Sesudahnya saldo 2-100 = Rp0.
 *
 * Pakai:
 *   npx tsx scripts/fix-crew-talangan-20260807.mts          → tampilkan rencana saja
 *   npx tsx scripts/fix-crew-talangan-20260807.mts --apply  → kerjakan
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");

const env = Object.fromEntries(
	readFileSync("./.env.local", "utf8")
		.split("\n")
		.filter((l) => l.includes("=") && !l.trim().startsWith("#"))
		.map((l) => {
			const i = l.indexOf("=");
			return [
				l.slice(0, i).trim(),
				l.slice(i + 1).trim().replace(/^["']|["']$/g, ""),
			];
		}),
) as Record<string, string>;

const sb = createClient(
	env.NEXT_PUBLIC_SUPABASE_URL,
	env.SUPABASE_SERVICE_ROLE_KEY,
	{ auth: { persistSession: false } },
);

const n = (v: unknown) => Number(v ?? 0);
const rp = (v: unknown) => `Rp${Math.round(n(v)).toLocaleString("id-ID")}`;

async function saldo(code: string): Promise<number> {
	let bal = 0;
	for (let from = 0; ; from += 1000) {
		const { data } = await sb
			.from("journal_lines")
			.select("debit_amount, credit_amount")
			.eq("account_code", code)
			.range(from, from + 999);
		const rows = data ?? [];
		for (const l of rows) bal += n(l.debit_amount) - n(l.credit_amount);
		if (rows.length < 1000) break;
	}
	return bal;
}

const TALANGAN = [
	{ project: "PRJ-20260722-3958", amount: 157_000 },
	{ project: "PRJ-20260731-36570", amount: 450_000 },
];
const BONUS_PEMBULATAN = 2_500;
const KAS = "1-110";

console.log(
	`saldo sebelum — 2-100 Hutang Crew ${rp(-(await saldo("2-100")))} · ${KAS} ${rp(await saldo(KAS))}\n`,
);

// ── A. Talangan menempel ke crew yang mengeluarkan ──────────────────────
console.log("A. Isi talangan di crew_assignments");
const targets: Array<{ id: string; name: string; project: string; amount: number }> = [];
for (const t of TALANGAN) {
	const { data: ev } = await sb
		.from("events")
		.select("id, client_name")
		.eq("project_id", t.project)
		.single();
	const { data: rk } = await sb
		.from("crew_rekap")
		.select("submitted_by")
		.eq("event_id", ev.id)
		.single();
	const { data: asg } = await sb
		.from("crew_assignments")
		.select(
			"id, reimbursement_amount, user:users!crew_assignments_user_id_fkey(full_name, nickname)",
		)
		.eq("event_id", ev.id)
		.eq("user_id", rk.submitted_by)
		.single();
	const u = Array.isArray(asg.user) ? asg.user[0] : asg.user;
	const name = u?.nickname?.trim() || u?.full_name || "crew";
	console.log(
		`   ${t.project} ${ev.client_name} → ${name}: talangan ${rp(asg.reimbursement_amount)} jadi ${rp(t.amount)}`,
	);
	targets.push({ id: asg.id, name, project: t.project, amount: t.amount });
}

// ── B & C. Jurnal koreksi ───────────────────────────────────────────────
const totalTalangan = TALANGAN.reduce((s, t) => s + t.amount, 0);
console.log("\nB. Jurnal pelunasan talangan");
console.log(`   Dr 2-100 Hutang Crew ${rp(totalTalangan)}`);
console.log(`      Cr ${KAS} Bank BCA ${rp(totalTalangan)}`);
console.log("\nC. Jurnal pembulatan bonus");
console.log(`   Dr 5-204 Beban Fee Crew - Bonus ${rp(BONUS_PEMBULATAN)}`);
console.log(`      Cr 2-100 Hutang Crew ${rp(BONUS_PEMBULATAN)}`);

if (!APPLY) {
	console.log("\n(rencana saja — jalankan lagi dengan --apply untuk mengerjakan)");
	process.exit(0);
}

// ── Kerjakan ────────────────────────────────────────────────────────────
console.log("\n— mengerjakan —");
const { data: owner } = await sb
	.from("users")
	.select("id")
	.eq("role", "super_admin")
	.limit(1)
	.single();

for (const t of targets) {
	const { error } = await sb
		.from("crew_assignments")
		.update({ reimbursement_amount: t.amount })
		.eq("id", t.id);
	console.log(
		error
			? `  talangan ${t.name} GAGAL: ${error.message}`
			: `  talangan ${t.name} (${t.project}) = ${rp(t.amount)}`,
	);
}

const today = new Date().toISOString().slice(0, 10);
const stamp = today.replace(/-/g, "");
const ref = (tag: string) =>
	`JE-${stamp}-${tag}${Math.floor(Math.random() * 0xffffff)
		.toString(16)
		.toUpperCase()
		.padStart(6, "0")}`;

async function postEntry(
	description: string,
	total: number,
	lines: Array<{ account: string; debit?: number; credit?: number; desc: string }>,
) {
	const { data: entry, error } = await sb
		.from("journal_entries")
		.insert({
			ref_id: ref("K"),
			entry_date: today,
			entry_type: "adjustment",
			description,
			source_type: "manual",
			total_amount: total,
			created_by: owner.id,
		})
		.select("id, ref_id")
		.single();
	if (error || !entry) {
		console.log(`  jurnal GAGAL: ${error?.message}`);
		return;
	}
	const { error: lineErr } = await sb.from("journal_lines").insert(
		lines.map((l, i) => ({
			entry_id: entry.id,
			account_code: l.account,
			debit_amount: l.debit ?? 0,
			credit_amount: l.credit ?? 0,
			description: l.desc,
			line_order: i + 1,
		})),
	);
	console.log(
		lineErr
			? `  baris jurnal GAGAL: ${lineErr.message}`
			: `  ${entry.ref_id} — ${description} (${rp(total)})`,
	);
}

await postEntry(
	"Koreksi: pelunasan talangan crew yang dibayar di luar aplikasi",
	totalTalangan,
	[
		{
			account: "2-100",
			debit: totalTalangan,
			desc: "Talangan crew lunas (Yokke + Gratama, dibayar via BCA di luar aplikasi)",
		},
		{ account: KAS, credit: totalTalangan, desc: "Uang keluar dari Bank BCA" },
	],
);

await postEntry(
	"Koreksi: pembulatan bonus talangan crew",
	BONUS_PEMBULATAN,
	[
		{
			account: "5-204",
			debit: BONUS_PEMBULATAN,
			desc: "Pembulatan talangan jadi bonus crew (Hafizh & Dinda)",
		},
		{
			account: "2-100",
			credit: BONUS_PEMBULATAN,
			desc: "Selisih pembulatan yang sudah dibayar",
		},
	],
);

const sisa = -(await saldo("2-100"));
console.log(
	`\nsaldo sesudah — 2-100 Hutang Crew ${rp(sisa)} · ${KAS} ${rp(await saldo(KAS))}`,
);
console.log(
	Math.abs(sisa) < 1
		? "✓ Hutang Crew bersih"
		: `✗ masih tersisa ${rp(sisa)} — periksa lagi`,
);
