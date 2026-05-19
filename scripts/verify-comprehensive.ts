/**
 * Phase 1.1 — Comprehensive DB verification.
 * Run: node --experimental-strip-types --env-file=.env.local --no-warnings scripts/verify-comprehensive.ts
 *
 * Maps spec naming → actual naming and verifies presence.
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
	console.error("❌ Missing env: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
	process.exit(1);
}
const sb = createClient(url, key, {
	auth: { persistSession: false, autoRefreshToken: false },
});

const c = {
	dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
	green: (s: string) => `\x1b[32m${s}\x1b[0m`,
	red: (s: string) => `\x1b[31m${s}\x1b[0m`,
	yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
	bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
	cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
};

// Mapping spec name → actual name
const TABLE_MAP: Array<{ specName: string; actualName: string; note?: string }> = [
	{ specName: "event_recaps", actualName: "crew_rekap", note: "Different name (Indonesian)" },
	{ specName: "event_recap_misc_expenses", actualName: "event_recap_misc_expenses" },
	{ specName: "event_recap_proofs", actualName: "event_recap_proofs" },
	{ specName: "audit_event_logs", actualName: "audit_log", note: "Different name (singular)" },
	{ specName: "chart_of_accounts", actualName: "chart_of_accounts" },
	{ specName: "frame_size_mapping", actualName: "frame_size_mapping" },
	{ specName: "package_items_mapping", actualName: "package_items_mapping" },
	{ specName: "inventory_movements", actualName: "stock_movements", note: "Different name" },
	{ specName: "crew_wages", actualName: "crew_assignments", note: "Different model — fee/bonus per assignment, not separate table" },
	{ specName: "finance_journals", actualName: "journal_entries", note: "Plus journal_lines for double-entry lines" },
	{ specName: "(extra) journal_lines", actualName: "journal_lines" },
	{ specName: "sinking_funds", actualName: "sinking_funds" },
	{ specName: "sinking_fund_allocations", actualName: "sinking_fund_movements", note: "Different name; deposits + withdrawals" },
	{ specName: "(extra) event_settlements", actualName: "event_settlements", note: "Snapshot table for closed settlements" },
	{ specName: "(extra) owner_earnings", actualName: "owner_earnings", note: "Owner pool earnings" },
];

const FUNCTION_MAP: Array<{ specName: string; actualName: string; note?: string }> = [
	{ specName: "event_recap_save_v3", actualName: "(N/A)", note: "Save handled by app-side submitRekap in src/lib/actions/rekap.ts" },
	{ specName: "event_recap_settle", actualName: "settle_event", note: "Different name; atomic RPC with full settlement flow" },
	{ specName: "event_recap_reopen", actualName: "reopen_settlement", note: "Different name; super_admin only" },
	{ specName: "calculate_recap_hpp", actualName: "calculate_recap_hpp" },
	{ specName: "calculate_recap_opex", actualName: "calculate_recap_opex" },
	{ specName: "event_recap_finalize", actualName: "(N/A)", note: "Combined into settle_event atomic flow" },
	{ specName: "recap_status_update", actualName: "(N/A)", note: "Handled via column update + audit_log; status enum exists" },
	{ specName: "can_transition_event_status", actualName: "(N/A)", note: "Validation embedded in settle_event/reopen_settlement" },
	{ specName: "notif_enqueue_owner", actualName: "(N/A)", note: "Not in scope; notifications outside settlement domain" },
	{ specName: "materialize_audit_diff", actualName: "(N/A)", note: "audit_log gets jsonb 'changes' directly" },
	{ specName: "(extra) generate_journal_reference", actualName: "generate_journal_reference" },
	{ specName: "(extra) _validate_recap_stock_sufficient", actualName: "_validate_recap_stock_sufficient" },
	{ specName: "(extra) _create_settlement_journal", actualName: "_create_settlement_journal" },
];

async function checkTable(name: string): Promise<{ exists: boolean; rows?: number; cols?: number; rls?: boolean }> {
	try {
		const { count, error } = await sb.from(name).select("*", { count: "exact", head: true });
		if (error) {
			if (error.message.includes("does not exist") || error.code === "PGRST205" || error.code === "42P01") {
				return { exists: false };
			}
			// RLS might block but table exists
			return { exists: true, rows: 0 };
		}
		return { exists: true, rows: count ?? 0 };
	} catch (_e) {
		return { exists: false };
	}
}

async function checkFunction(name: string, dummyArgs?: Record<string, unknown>): Promise<boolean> {
	if (name === "(N/A)") return false;
	try {
		// Try invoke with dummy args; we expect either success or specific argument error, NOT "not found"
		const { error } = await sb.rpc(name, dummyArgs ?? {});
		if (!error) return true;
		if (error.code === "PGRST202" || error.message.includes("Could not find the function")) {
			return false;
		}
		// Function exists but threw error (likely argument validation) — that's fine, exists
		return true;
	} catch (_e) {
		return false;
	}
}

async function main() {
	console.log(c.bold("\n📋 Phase 1.1 — Database Schema Verification\n"));
	console.log(c.dim("Maps spec naming → actual implementation\n"));

	// ============ TABLES ============
	console.log(c.bold(c.cyan("§ TABLES")));
	const tableResults: Array<{
		specName: string;
		actualName: string;
		exists: boolean;
		rows?: number;
		note?: string;
	}> = [];

	for (const t of TABLE_MAP) {
		if (t.actualName === "(N/A)") {
			tableResults.push({ ...t, exists: false });
			continue;
		}
		const r = await checkTable(t.actualName);
		tableResults.push({ ...t, exists: r.exists, rows: r.rows });
		const sym = r.exists ? c.green("✓") : c.red("✗");
		const ndisplay = r.exists ? `(${r.rows ?? "?"} rows)` : c.red("MISSING");
		const noteStr = t.note ? c.dim(` — ${t.note}`) : "";
		console.log(
			`  ${sym} ${t.specName.padEnd(35)} → ${t.actualName.padEnd(30)} ${ndisplay}${noteStr}`,
		);
	}

	// ============ FUNCTIONS ============
	console.log("\n" + c.bold(c.cyan("§ FUNCTIONS")));
	const fnResults: Array<{
		specName: string;
		actualName: string;
		exists: boolean;
		note?: string;
	}> = [];

	// First, generate_journal_reference is easy to test (no args required)
	const callableProbes: Record<string, Record<string, unknown> | undefined> = {
		generate_journal_reference: undefined, // accepts default CURRENT_DATE
		// For others, just check via pg_proc through SQL... but we don't have SQL exec.
		// Instead, try calling with no/invalid args — Supabase will return PGRST202 if function not found.
	};

	for (const f of FUNCTION_MAP) {
		if (f.actualName === "(N/A)") {
			fnResults.push({ ...f, exists: false });
			const sym = c.yellow("⊘");
			const noteStr = f.note ? c.dim(` — ${f.note}`) : "";
			console.log(`  ${sym} ${f.specName.padEnd(35)} → ${f.actualName}${noteStr}`);
			continue;
		}
		const exists = await checkFunction(f.actualName, callableProbes[f.actualName] ?? {});
		fnResults.push({ ...f, exists });
		const sym = exists ? c.green("✓") : c.red("✗");
		const noteStr = f.note ? c.dim(` — ${f.note}`) : "";
		console.log(
			`  ${sym} ${f.specName.padEnd(35)} → ${f.actualName.padEnd(35)}${exists ? "" : c.red(" MISSING")}${noteStr}`,
		);
	}

	// ============ Test specific function callable ============
	console.log("\n" + c.bold(c.cyan("§ FUNCTION CALLABILITY (smoke test)")));

	// generate_journal_reference — no args
	const { data: refData, error: refErr } = await sb.rpc("generate_journal_reference");
	if (refErr) console.log(`  ${c.red("✗")} generate_journal_reference: ${refErr.message}`);
	else console.log(`  ${c.green("✓")} generate_journal_reference() → ${refData}`);

	// calculate_recap_hpp — needs valid recap_id; we just test that function exists by passing fake UUID
	const fakeId = "00000000-0000-0000-0000-000000000000";
	const { error: hppErr } = await sb.rpc("calculate_recap_hpp", { p_recap_id: fakeId });
	if (hppErr?.code === "PGRST202") {
		console.log(`  ${c.red("✗")} calculate_recap_hpp() not found`);
	} else if (hppErr) {
		console.log(`  ${c.green("✓")} calculate_recap_hpp() exists (errored as expected with fake id: ${hppErr.message.split(".")[0]})`);
	} else {
		console.log(`  ${c.green("✓")} calculate_recap_hpp() callable`);
	}

	const { error: opexErr } = await sb.rpc("calculate_recap_opex", { p_recap_id: fakeId });
	if (opexErr?.code === "PGRST202") {
		console.log(`  ${c.red("✗")} calculate_recap_opex() not found`);
	} else if (opexErr) {
		console.log(`  ${c.green("✓")} calculate_recap_opex() exists (errored as expected with fake id: ${opexErr.message.split(".")[0]})`);
	} else {
		console.log(`  ${c.green("✓")} calculate_recap_opex() callable`);
	}

	// settle_event — same pattern
	const { error: settleErr } = await sb.rpc("settle_event", {
		p_event_id: fakeId,
		p_owner_user_id: fakeId,
		p_overrides: null,
	});
	if (settleErr?.code === "PGRST202") {
		console.log(`  ${c.red("✗")} settle_event() not found`);
	} else if (settleErr) {
		console.log(`  ${c.green("✓")} settle_event() exists (errored as expected with fake id: ${settleErr.message.split(".")[0]})`);
	} else {
		console.log(`  ${c.green("✓")} settle_event() callable`);
	}

	const { error: reopenErr } = await sb.rpc("reopen_settlement", {
		p_event_id: fakeId,
		p_owner_user_id: fakeId,
		p_reason: "test smoke",
	});
	if (reopenErr?.code === "PGRST202") {
		console.log(`  ${c.red("✗")} reopen_settlement() not found`);
	} else if (reopenErr) {
		console.log(`  ${c.green("✓")} reopen_settlement() exists (errored as expected with fake id: ${reopenErr.message.split(".")[0]})`);
	} else {
		console.log(`  ${c.green("✓")} reopen_settlement() callable`);
	}

	// _validate_recap_stock_sufficient
	const { error: validErr } = await sb.rpc("_validate_recap_stock_sufficient", { p_recap_id: fakeId });
	if (validErr?.code === "PGRST202") {
		console.log(`  ${c.red("✗")} _validate_recap_stock_sufficient() not found`);
	} else if (validErr) {
		console.log(`  ${c.green("✓")} _validate_recap_stock_sufficient() exists (errored as expected: ${validErr.message.split(".")[0]})`);
	} else {
		console.log(`  ${c.green("✓")} _validate_recap_stock_sufficient() callable`);
	}

	// ============ ROW COUNTS for context ============
	console.log("\n" + c.bold(c.cyan("§ ROW COUNTS (sample)")));
	for (const tbl of [
		"crew_rekap",
		"event_recap_proofs",
		"event_recap_misc_expenses",
		"event_settlements",
		"stock_movements",
		"journal_entries",
		"journal_lines",
		"sinking_funds",
		"sinking_fund_movements",
		"owner_earnings",
		"frame_size_mapping",
		"package_items_mapping",
		"chart_of_accounts",
	]) {
		const r = await checkTable(tbl);
		const rowStr = r.exists ? `${r.rows} rows` : c.red("MISSING");
		console.log(`  ${tbl.padEnd(32)} ${rowStr}`);
	}

	// ============ Summary for report ============
	console.log("\n" + c.bold(c.cyan("§ SUMMARY")));
	const missingTables = tableResults.filter((t) => !t.exists && t.actualName !== "(N/A)");
	const missingFns = fnResults.filter((f) => !f.exists && f.actualName !== "(N/A)");
	console.log(`  Tables expected: ${tableResults.length - tableResults.filter((t) => t.actualName === "(N/A)").length}`);
	console.log(`  Tables missing:  ${missingTables.length}`);
	console.log(`  Functions expected: ${fnResults.length - fnResults.filter((f) => f.actualName === "(N/A)").length}`);
	console.log(`  Functions missing:  ${missingFns.length}`);
	console.log(`  Spec→Actual N/A: ${tableResults.filter((t) => t.actualName === "(N/A)").length + fnResults.filter((f) => f.actualName === "(N/A)").length} (handled differently in our impl)`);

	if (missingTables.length === 0 && missingFns.length === 0) {
		console.log(c.bold(c.green("\n✅ All required tables & functions exist (under actual naming).")));
	} else {
		console.log(c.bold(c.red(`\n⚠️  ${missingTables.length} table(s) and ${missingFns.length} function(s) missing.`)));
	}

	// Output JSON for report generation
	console.log("\n" + c.bold(c.cyan("§ JSON OUTPUT (for report generation)")));
	console.log("==BEGIN_JSON==");
	console.log(
		JSON.stringify(
			{
				tables: tableResults,
				functions: fnResults,
				missingTables: missingTables.map((t) => t.specName),
				missingFunctions: missingFns.map((f) => f.specName),
			},
			null,
			2,
		),
	);
	console.log("==END_JSON==");
}

main().catch((err) => {
	console.error(c.red("\n❌ Unhandled error:"), err);
	process.exit(1);
});
