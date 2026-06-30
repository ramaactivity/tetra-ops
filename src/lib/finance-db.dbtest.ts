/**
 * Integration test (READ-ONLY) untuk invariant settlement di DB nyata.
 *
 * Jalankan: `npm run test:db` (butuh kredensial Supabase di .env.local atau env).
 * Kalau kredensial tidak ada → semua di-skip (aman utk CI tanpa secret).
 *
 * Ini menguji OUTPUT settle_event di data produksi — tidak menulis apa pun, tapi
 * akan GAGAL kalau ada jurnal pincang, Hutang Crew minus, atau alokasi yang tidak
 * cocok. Melengkapi unit test (finance-math.test.ts) yang menguji fungsi pure.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

function loadCreds(): { url: string; key: string } | null {
	let url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	let key = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !key) {
		try {
			const here = dirname(fileURLToPath(import.meta.url));
			const env = Object.fromEntries(
				readFileSync(join(here, "..", "..", ".env.local"), "utf8")
					.split("\n")
					.filter((l) => l.includes("=") && !l.trim().startsWith("#"))
					.map((l) => {
						const i = l.indexOf("=");
						return [
							l.slice(0, i).trim(),
							l
								.slice(i + 1)
								.trim()
								.replace(/^["']|["']$/g, ""),
						];
					}),
			);
			url = url || env.NEXT_PUBLIC_SUPABASE_URL;
			key = key || env.SUPABASE_SERVICE_ROLE_KEY;
		} catch {
			/* no .env.local — leave undefined */
		}
	}
	return url && key ? { url, key } : null;
}

const creds = loadCreds();
const opts = creds
	? {}
	: {
			skip: "Supabase creds tidak ada (.env.local / env) — integration test di-skip",
		};
// sb hanya dipakai di dalam test yang TIDAK di-skip saat creds ada.
const sb = creds
	? createClient(creds.url, creds.key, { auth: { persistSession: false } })
	: (null as never);

const rp = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;

test(
	"setiap settlement: jurnal balance (Dr=Cr) & total cocok dgn breakdown",
	opts,
	async () => {
		const { data: settlements } = await sb
			.from("event_settlements")
			.select(
				"id, hpp_total, opex_total, sinking_total, owner_pool_total, journal_entry_id, is_reopened",
			)
			.eq("is_reopened", false);
		for (const s of settlements ?? []) {
			if (!s.journal_entry_id) continue;
			const { data: lines } = await sb
				.from("journal_lines")
				.select("debit_amount, credit_amount")
				.eq("entry_id", s.journal_entry_id);
			const dr = (lines ?? []).reduce(
				(a, l) => a + Number(l.debit_amount || 0),
				0,
			);
			const cr = (lines ?? []).reduce(
				(a, l) => a + Number(l.credit_amount || 0),
				0,
			);
			assert.equal(dr, cr, `settlement ${s.id}: Dr ${rp(dr)} != Cr ${rp(cr)}`);
			const expect =
				Number(s.hpp_total) +
				Number(s.opex_total) +
				Number(s.sinking_total) +
				Number(s.owner_pool_total);
			assert.equal(
				dr,
				expect,
				`settlement ${s.id}: jurnal ${rp(dr)} != hpp+opex+sinking+owner ${rp(expect)}`,
			);
		}
	},
);

test("GL global balanced (sum debit == sum credit)", opts, async () => {
	const { data: gl } = await sb
		.from("journal_lines")
		.select("debit_amount, credit_amount")
		.limit(100000);
	const dr = (gl ?? []).reduce((a, l) => a + Number(l.debit_amount || 0), 0);
	const cr = (gl ?? []).reduce((a, l) => a + Number(l.credit_amount || 0), 0);
	assert.equal(dr, cr, `GL global pincang: Dr ${rp(dr)} != Cr ${rp(cr)}`);
});

test(
	"alokasi sinking & owner pool per settlement cocok dgn ledger",
	opts,
	async () => {
		const { data: settlements } = await sb
			.from("event_settlements")
			.select("id, sinking_total, owner_pool_total")
			.eq("is_reopened", false);
		for (const s of settlements ?? []) {
			const { data: sink } = await sb
				.from("sinking_fund_movements")
				.select("amount")
				.eq("source_settlement_id", s.id)
				.eq("movement_type", "deposit");
			const sinkSum = (sink ?? []).reduce(
				(a, m) => a + Number(m.amount || 0),
				0,
			);
			assert.equal(
				sinkSum,
				Number(s.sinking_total),
				`settlement ${s.id}: sinking ${rp(sinkSum)} != ${rp(Number(s.sinking_total))}`,
			);

			const { data: own } = await sb
				.from("owner_earnings")
				.select("amount")
				.eq("source_settlement_id", s.id);
			const ownSum = (own ?? []).reduce((a, m) => a + Number(m.amount || 0), 0);
			assert.equal(
				ownSum,
				Number(s.owner_pool_total),
				`settlement ${s.id}: owner pool ${rp(ownSum)} != ${rp(Number(s.owner_pool_total))}`,
			);
		}
	},
);

test("Hutang Crew (2-100) tidak boleh minus", opts, async () => {
	const { data } = await sb
		.from("journal_lines")
		.select("debit_amount, credit_amount")
		.eq("account_code", "2-100");
	const bal = (data ?? []).reduce(
		(a, l) => a + Number(l.credit_amount || 0) - Number(l.debit_amount || 0),
		0,
	);
	assert.ok(
		bal >= 0,
		`Hutang Crew 2-100 minus: ${rp(bal)} — ada pembayaran tanpa akrual (gate jebol?)`,
	);
});
