import assert from "node:assert/strict";
import { test } from "node:test";
import {
	pemegangUangJalan,
	syncCrewReimbursement,
	talanganPerCrew,
} from "./reimbursement";

const rekap = {
	transport_cost: 50_500,
	bensin_cost: 0,
	toll_cost: 0,
	parking_cost: 0,
	konsumsi_cost: 30_000,
	lainnya_items: [
		{ note: "Pulsa", amount: 15_000, paid_by: "crew" },
		{ note: "Parkir mall", amount: 5_000, paid_by: "fikri" },
		{ note: "Bensin owner", amount: 9_000, paid_by: "owner" },
	],
	expense_paid_by: { transport: "fahmi", konsumsi: "crew" },
	submitted_by: "fikri",
	uj_terima: 105_000,
	uj_holder: "fahmi",
};

test("biaya tanpa penalang jatuh ke pemegang uang jalan (sama dengan form crew)", () => {
	const holder = pemegangUangJalan(rekap, ["fahmi"]);
	assert.equal(holder, "fahmi");
	assert.deepEqual(talanganPerCrew(rekap, holder), {
		byUser: { fahmi: 95_500, fikri: 5_000 },
		tanpaPenalang: 0,
	});
	// Tanpa uang jalan: tetap "belum dipilih".
	assert.equal(pemegangUangJalan({ uj_terima: 0 }, []), null);
	assert.equal(talanganPerCrew(rekap, null).tanpaPenalang, 45_000);
});

/** Supabase palsu secukupnya untuk syncCrewReimbursement. */
function fakeDb(tables: Record<string, Array<Record<string, unknown>>>) {
	return {
		tables,
		from(t: string) {
			const rows = tables[t] ?? [];
			let patch: Record<string, unknown> | null = null;
			const q = {
				select: () => q,
				update: (v: Record<string, unknown>) => {
					patch = v;
					return q;
				},
				eq: (col: string, val: unknown) => {
					if (patch) {
						for (const r of rows) if (r[col] === val) Object.assign(r, patch);
						return Promise.resolve({ error: null });
					}
					return Object.assign(Promise.resolve({ data: rows }), {
						maybeSingle: () => Promise.resolve({ data: rows[0] ?? null }),
					});
				},
			};
			return q;
		},
	};
}

test("settle: reimbursement per penalang — pemegang uang jalan dapat bagiannya, bukan semua ke yang submit", async () => {
	const db = fakeDb({
		crew_rekap: [rekap],
		uang_jalan: [{ user_id: "fahmi", kind: "beri", is_reversed: false }],
		crew_assignments: [
			{
				id: "a1",
				user_id: "fahmi",
				role_in_event: "lead",
				reimbursement_amount: 0,
				is_paid: false,
			},
			{
				id: "a2",
				user_id: "fikri",
				role_in_event: "asisten",
				reimbursement_amount: 0,
				is_paid: false,
			},
		],
	});
	const res = await syncCrewReimbursement(db as never, "ev");
	assert.deepEqual(res, { expected: 100_500, before: 0, after: 100_500 });
	assert.deepEqual(
		db.tables.crew_assignments.map((a) => a.reimbursement_amount),
		[95_500, 5_000],
	);
	// Idempoten.
	assert.deepEqual(await syncCrewReimbursement(db as never, "ev"), {
		expected: 100_500,
		before: 100_500,
		after: 100_500,
	});
});
