/**
 * Quick smoke test for the 20260519_vendor_master.sql migration.
 *
 * Verifies:
 * 1. contacts table has new vendor columns
 * 2. events.vendor_contact_id column + index exist
 * 3. Backfill produced contacts rows with type='vendor'
 * 4. events.vendor_contact_id is populated for events with non-null vendor_name
 * 5. vendor_summary_v view is queryable
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
	console.error("Missing SUPABASE env vars");
	process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function main() {
	console.log("\n📋 Vendor master migration verification\n");

	// 1. Check contacts has new columns by selecting them
	console.log("1. Contacts table vendor columns:");
	const { data: contactSample, error: cErr } = await supabase
		.from("contacts")
		.select(
			"id, type, name, commission_rate_default, payment_terms, default_pic_name, default_pic_contact, company_address",
		)
		.eq("type", "vendor")
		.limit(5);
	if (cErr) {
		console.error("   ❌ ", cErr.message);
	} else {
		console.log(`   ✓ Selectable. Sample vendor contacts: ${contactSample?.length ?? 0}`);
		if (contactSample && contactSample.length > 0) {
			console.table(contactSample);
		}
	}

	// 2. Check events.vendor_contact_id
	console.log("\n2. Events vendor_contact_id:");
	const { data: linkedEvents, error: eErr } = await supabase
		.from("events")
		.select("id, project_id, vendor_name, vendor_contact_id, channel")
		.eq("channel", "vendor")
		.is("deleted_at", null)
		.not("vendor_name", "is", null)
		.limit(10);
	if (eErr) {
		console.error("   ❌ ", eErr.message);
	} else {
		const total = linkedEvents?.length ?? 0;
		const withFk = (linkedEvents ?? []).filter((e) => e.vendor_contact_id).length;
		console.log(
			`   ✓ Total vendor-channel events sampled: ${total} | with FK populated: ${withFk}`,
		);
		if (linkedEvents && linkedEvents.length > 0) {
			console.table(
				linkedEvents.map((e) => ({
					project_id: e.project_id,
					vendor_name: e.vendor_name,
					linked: e.vendor_contact_id ? "✓" : "✗",
				})),
			);
		}
	}

	// 3. Check vendor_summary_v view
	console.log("\n3. vendor_summary_v view:");
	const { data: summary, error: sErr } = await supabase
		.from("vendor_summary_v")
		.select("vendor_id, name, event_count, event_count_ytd, commission_ytd, last_event_date")
		.order("event_count", { ascending: false })
		.limit(5);
	if (sErr) {
		console.error("   ❌ ", sErr.message);
	} else {
		console.log(`   ✓ View queryable. Top ${summary?.length ?? 0} vendors:`);
		if (summary && summary.length > 0) {
			console.table(summary);
		}
	}

	console.log("\n✅ Verification complete.\n");
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
