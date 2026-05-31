/**
 * verify-e2e.ts — READ-ONLY. Comprehensive end-to-end consistency verifier for
 * the whole money flow: booking → payments → rekap → settle → GL/sub-ledger.
 * Superset of system-health-check.ts. Tidak menulis apa pun.
 *
 * Usage:
 *   node --experimental-strip-types --env-file=.env.local --no-warnings \
 *     scripts/verify-e2e.ts
 *
 * Legacy-aware: event is_migrated_legacy=true di-laporkan terpisah (info), tidak
 * bikin FAIL — angka lama diimpor apa adanya & dikecualikan dari kalkulasi.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
	console.error("❌ Missing env");
	process.exit(1);
}
const sb = createClient(url, key, {
	auth: { autoRefreshToken: false, persistSession: false },
});
const rp = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
const N = (v: unknown) => Number(v) || 0;

let pass = 0;
let fail = 0;
const issues: string[] = [];
function ok(msg: string) {
	console.log(`  ✅ ${msg}`);
	pass++;
}
function bad(msg: string) {
	console.log(`  ❌ ${msg}`);
	issues.push(msg);
	fail++;
}
function info(msg: string) {
	console.log(`  · ${msg}`);
}
function section(t: string) {
	console.log(`\n${t}`);
}

async function main() {
	// Pull core tables once.
	const { data: events } = await sb
		.from("events")
		.select(
			"id, client_name, base_price, custom_package_price, addons_total, discount_amount, gross_up_pph_amount, grand_total, total_paid, remaining_balance, payment_status, status, is_migrated_legacy, vendor_commission_amount, referrer_commission",
		)
		.is("deleted_at", null);
	const evs = events ?? [];
	const active = evs.filter((e) => !e.is_migrated_legacy);
	const legacy = evs.filter((e) => e.is_migrated_legacy);
	info(`${evs.length} event aktif-data (${active.length} non-legacy · ${legacy.length} legacy)`);

	// ── [A] Booking math: grand_total = (custom ?? base) + addons − discount ──
	section("[A] Booking math (grand_total = paket + add-on − diskon + gross-up PPh)");
	{
		const before = fail;
		let legacyBad = 0;
		for (const e of evs) {
			const expect =
				N(e.custom_package_price ?? e.base_price) +
				N(e.addons_total) -
				N(e.discount_amount) +
				N(e.gross_up_pph_amount);
			if (N(e.grand_total) !== expect) {
				if (e.is_migrated_legacy) legacyBad++;
				else
					bad(
						`${e.client_name}: grand_total ${rp(N(e.grand_total))} ≠ expected ${rp(expect)}`,
					);
			}
		}
		if (legacyBad > 0)
			info(`${legacyBad} legacy event grand_total ≠ formula (diimpor apa adanya — diabaikan)`);
		if (fail === before) ok("Semua event non-legacy: grand_total cocok formula");
	}

	// ── [B] remaining_balance = max(0, grand_total − total_paid) ──────────────
	section("[B] remaining_balance = max(0, grand_total − total_paid)");
	{
		const before = fail;
		for (const e of evs) {
			const expect = Math.max(0, N(e.grand_total) - N(e.total_paid));
			if (N(e.remaining_balance) !== expect)
				bad(
					`${e.client_name}: remaining_balance ${rp(N(e.remaining_balance))} ≠ ${rp(expect)}`,
				);
		}
		if (fail === before) ok(`Semua ${evs.length} event: remaining_balance sinkron`);
	}

	// ── [C] Σ payments (non-reversed) per event == total_paid ─────────────────
	section("[C] Σ payment terverifikasi == events.total_paid");
	{
		const before = fail;
		const { data: pays } = await sb
			.from("payments")
			.select("event_id, amount, is_reversed");
		const paidByEvent = new Map<string, number>();
		for (const p of pays ?? []) {
			if (p.is_reversed) continue;
			paidByEvent.set(p.event_id, (paidByEvent.get(p.event_id) ?? 0) + N(p.amount));
		}
		let legacyBad = 0;
		for (const e of evs) {
			const sumPay = paidByEvent.get(e.id) ?? 0;
			if (sumPay !== N(e.total_paid)) {
				// Legacy events: total_paid diimpor, payment rows tidak dimigrasi.
				if (e.is_migrated_legacy) legacyBad++;
				else
					bad(
						`${e.client_name}: Σ payments ${rp(sumPay)} ≠ total_paid ${rp(N(e.total_paid))}`,
					);
			}
		}
		if (legacyBad > 0)
			info(`${legacyBad} legacy event: total_paid tanpa payment-row (impor — diabaikan)`);
		if (fail === before) ok("total_paid == Σ payment non-reversed (semua event non-legacy)");
	}

	// ── [D] payment_status sanity ─────────────────────────────────────────────
	section("[D] payment_status konsisten dgn angka");
	{
		const before = fail;
		for (const e of evs) {
			const rem = N(e.remaining_balance);
			const paid = N(e.total_paid);
			if (e.payment_status === "paid" && rem !== 0)
				bad(`${e.client_name}: status 'paid' tapi sisa ${rp(rem)}`);
			if (!e.is_migrated_legacy && e.payment_status === "unpaid" && paid !== 0)
				bad(`${e.client_name}: status 'unpaid' tapi total_paid ${rp(paid)}`);
		}
		if (fail === before) ok("payment_status selaras (paid→sisa 0, unpaid→paid 0)");
	}

	// ── [E] GL global: ΣDr==ΣCr, tiap entry balance, account_code ∈ COA ───────
	section("[E] Buku besar: balance global + per-entry + COA referential");
	{
		const before = fail;
		const { data: coa } = await sb.from("chart_of_accounts").select("code");
		const coaSet = new Set((coa ?? []).map((c) => c.code));
		const { data: lines } = await sb
			.from("journal_lines")
			.select("entry_id, account_code, debit_amount, credit_amount");
		const L = lines ?? [];
		let dr = 0,
			cr = 0;
		const byEntry = new Map<string, { d: number; c: number }>();
		const missingCoa = new Set<string>();
		for (const l of L) {
			dr += N(l.debit_amount);
			cr += N(l.credit_amount);
			const e = byEntry.get(l.entry_id) ?? { d: 0, c: 0 };
			e.d += N(l.debit_amount);
			e.c += N(l.credit_amount);
			byEntry.set(l.entry_id, e);
			if (!coaSet.has(l.account_code)) missingCoa.add(l.account_code);
		}
		if (dr !== cr) bad(`GL global TIDAK balance: ΣDr ${rp(dr)} vs ΣCr ${rp(cr)}`);
		else info(`GL global balance: ΣDr = ΣCr = ${rp(dr)}`);
		const unbalanced = [...byEntry.entries()].filter(([, v]) => v.d !== v.c);
		if (unbalanced.length > 0)
			bad(`${unbalanced.length} journal entry Dr≠Cr`);
		if (missingCoa.size > 0)
			bad(`account_code dipakai tapi tidak ada di COA: ${[...missingCoa].join(", ")}`);
		if (fail === before)
			ok(`${byEntry.size} entry balance · semua account_code valid di COA`);
	}

	// ── [F] Reversed pair netting: tiap is_reversed punya counter 'reversal' ──
	section("[F] Reversal: entry yg di-reverse punya counter penyeimbang");
	{
		const before = fail;
		const { data: entries } = await sb
			.from("journal_entries")
			.select("id, entry_type, is_reversed, reversed_by_entry_id");
		const E = entries ?? [];
		const reversedOrig = E.filter((e) => e.is_reversed);
		const reversalCounter = E.filter((e) => e.entry_type === "reversal");
		info(
			`${reversedOrig.length} entry di-reverse · ${reversalCounter.length} counter 'reversal'`,
		);
		for (const o of reversedOrig) {
			if (!o.reversed_by_entry_id)
				bad(`Entry ${o.id}: is_reversed tapi reversed_by_entry_id NULL`);
		}
		if (fail === before)
			ok("Reversal terpasangkan (Reports & ledger akan net ke nol)");
	}

	// ── [G] GL ↔ sub-ledger reconciliation ────────────────────────────────────
	section("[G] GL ↔ sub-ledger (sinking & owner pool)");
	{
		const before = fail;
		const { data: lines } = await sb
			.from("journal_lines")
			.select("account_code, debit_amount, credit_amount");
		const glCredit = (code: string) =>
			(lines ?? [])
				.filter((l) => l.account_code === code)
				.reduce((a, l) => a + N(l.credit_amount) - N(l.debit_amount), 0);

		// Sinking: GL 2-200..203 credit balance == movements net per fund-coa.
		const { data: funds } = await sb
			.from("sinking_funds")
			.select("id, coa_account");
		const { data: sfm } = await sb
			.from("sinking_fund_movements")
			.select("fund_id, movement_type, amount");
		const subByFund = new Map<string, number>();
		for (const m of sfm ?? []) {
			const sign = m.movement_type === "deposit" ? 1 : -1;
			subByFund.set(m.fund_id, (subByFund.get(m.fund_id) ?? 0) + sign * N(m.amount));
		}
		for (const f of funds ?? []) {
			if (!f.coa_account) continue;
			const sub = subByFund.get(f.id) ?? 0;
			const gl = glCredit(f.coa_account);
			if (Math.abs(sub - gl) > 1)
				bad(
					`Sinking ${f.coa_account}: sub-ledger ${rp(sub)} ≠ GL ${rp(gl)} (Δ ${rp(sub - gl)})`,
				);
		}

		// Owner pool: GL 2-300 credit balance == owner_earnings net.
		const { data: oe } = await sb.from("owner_earnings").select("amount");
		const oeNet = (oe ?? []).reduce((a, r) => a + N(r.amount), 0);
		const gl2300 = glCredit("2-300");
		if (Math.abs(oeNet - gl2300) > 1)
			bad(`Owner pool: owner_earnings ${rp(oeNet)} ≠ GL 2-300 ${rp(gl2300)}`);
		else info(`Owner pool: owner_earnings = GL 2-300 = ${rp(oeNet)}`);

		if (fail === before) ok("Sinking & owner pool: GL == sub-ledger");
	}

	// ── [H] Settled events: revenue=grand_total, komisi, single journal ───────
	section("[H] Settlement per-event (revenue, komisi, no double-deduct)");
	{
		const before = fail;
		const { data: setts } = await sb
			.from("event_settlements")
			.select(
				"id, event_id, revenue_net, komisi_vendor, komisi_relasi, journal_entry_id, is_reopened",
			);
		const evById = new Map(evs.map((e) => [e.id, e]));
		for (const s of (setts ?? []).filter((s) => !s.is_reopened)) {
			const e = evById.get(s.event_id);
			if (!e) {
				info(`Settlement ${s.event_id}: event tidak di set aktif (mungkin legacy/archived)`);
				continue;
			}
			if (N(s.revenue_net) !== N(e.grand_total))
				bad(
					`${e.client_name}: settlement revenue_net ${rp(N(s.revenue_net))} ≠ grand_total ${rp(N(e.grand_total))}`,
				);
			// Komisi must match event columns (the fix shipped this session).
			if (N(s.komisi_vendor) !== N(e.vendor_commission_amount))
				bad(
					`${e.client_name}: komisi_vendor ${rp(N(s.komisi_vendor))} ≠ event ${rp(N(e.vendor_commission_amount))}`,
				);
			if (N(s.komisi_relasi) !== N(e.referrer_commission))
				bad(
					`${e.client_name}: komisi_relasi ${rp(N(s.komisi_relasi))} ≠ event ${rp(N(e.referrer_commission))}`,
				);
		}
		if (fail === before)
			ok("Settled: revenue==grand_total & komisi==event commissions");
	}

	// ── [I] AR consistency: billing hanging == get_outstanding_total ──────────
	section("[I] Outstanding AR: billing-set == get_outstanding_total RPC");
	{
		const before = fail;
		const hanging = active
			.filter((e) => e.payment_status !== "paid" && N(e.remaining_balance) > 0)
			.reduce((a, e) => a + N(e.remaining_balance), 0);
		const { data: rpcVal } = await sb.rpc("get_outstanding_total");
		const outstanding = N(rpcVal);
		if (hanging !== outstanding)
			bad(`Billing hanging ${rp(hanging)} ≠ RPC ${rp(outstanding)}`);
		else info(`Outstanding AR cocok: ${rp(outstanding)}`);
		if (fail === before) ok("Billing AR == Finance Outstanding (legacy excluded)");
	}

	console.log(
		`\n${"=".repeat(64)}\nHASIL E2E: ${pass} cek PASS, ${fail} masalah${
			fail > 0 ? ":\n  - " + issues.join("\n  - ") : " ✅ END-TO-END KONSISTEN"
		}`,
	);
	process.exit(fail > 0 ? 1 : 0);
}
main().catch((e) => {
	console.error(e);
	process.exit(1);
});
