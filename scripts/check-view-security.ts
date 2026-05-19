import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
	process.env.NEXT_PUBLIC_SUPABASE_URL!,
	process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
	// Check security_invoker via pg_views + reloptions on pg_class
	const { data, error } = await supabase.rpc("admin_exec_sql", {
		p_sql: `
			SELECT
				c.relname AS view_name,
				c.relkind,
				c.reloptions,
				pg_catalog.has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_can_select,
				pg_catalog.has_table_privilege('anon', c.oid, 'SELECT') AS anon_can_select
			FROM pg_class c
			WHERE c.relname = 'vendor_summary_v';
		`,
	});

	if (error) {
		console.error("RPC error:", error.message);
		return;
	}
	console.log("View metadata:");
	console.log(JSON.stringify(data, null, 2));

	// Test: query view as authenticated user (no service role)
	const userClient = createClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL!,
		process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
			process.env.SUPABASE_SERVICE_ROLE_KEY!,
		{
			auth: { persistSession: false },
		},
	);
	const { data: viewData, error: viewError } = await userClient
		.from("vendor_summary_v")
		.select("vendor_id, name, event_count")
		.limit(2);

	console.log("\nView query result (via anon key):");
	if (viewError) console.error("Error:", viewError);
	else console.log(viewData);
}

main().catch(console.error);
