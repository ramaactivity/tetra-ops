/**
 * promote-to-owner.ts
 *
 * Promote user dengan email tertentu ke role 'owner'. Idempotent — kalau
 * sudah owner, no-op. Kalau belum sign in pernah, akan error & instruct
 * user untuk sign-in dulu.
 *
 * Usage:
 *   node --experimental-strip-types --env-file=.env.local --no-warnings \
 *     scripts/promote-to-owner.ts <email> [--name "Full Name"]
 *
 * Example:
 *   node --experimental-strip-types --env-file=.env.local --no-warnings \
 *     scripts/promote-to-owner.ts rama.activity98@gmail.com --name "Rama"
 */

import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const email = args[0];
const nameIdx = args.indexOf("--name");
const fullName = nameIdx >= 0 ? args[nameIdx + 1] : null;

if (!email || !email.includes("@")) {
	console.error("Usage: ... promote-to-owner.ts <email> [--name 'Full Name']");
	process.exit(1);
}

const sb = createClient(
	process.env.NEXT_PUBLIC_SUPABASE_URL!,
	process.env.SUPABASE_SERVICE_ROLE_KEY!,
	{ auth: { persistSession: false, autoRefreshToken: false } },
);

async function main() {
	const normalized = email.toLowerCase();

	// 1. Cek auth.users via admin API (users table mungkin belum populated)
	const { data: authList, error: authErr } = await sb.auth.admin.listUsers({
		perPage: 1000,
	});
	if (authErr) throw new Error(`listUsers fail: ${authErr.message}`);
	const authUser = authList.users.find(
		(u) => (u.email ?? "").toLowerCase() === normalized,
	);

	if (!authUser) {
		console.error(
			`\n❌ Email ${email} BELUM pernah sign in via Google.\n` +
				`   → Minta user buka https://tetra-ops-lac.vercel.app/login dan sign in dulu.\n` +
				`   → Setelah login (boleh stuck di /pending), re-run script ini.\n`,
		);
		process.exit(1);
	}

	console.log(`✓ Found auth user: ${authUser.id}`);

	// 2. Lookup public.users row
	const { data: appUser } = await sb
		.from("users")
		.select("id, email, full_name, role, is_active")
		.eq("id", authUser.id)
		.maybeSingle();

	const updateData: Record<string, unknown> = {
		role: "owner",
		is_active: true,
	};
	if (fullName) updateData.full_name = fullName;

	if (appUser) {
		if (appUser.role === "owner") {
			console.log(`ℹ Sudah role=owner. No-op. (full_name="${appUser.full_name}")`);
			return;
		}
		const { error: updErr } = await sb
			.from("users")
			.update(updateData)
			.eq("id", authUser.id);
		if (updErr) throw new Error(`update fail: ${updErr.message}`);
		console.log(
			`✓ Promoted ${email} dari role=${appUser.role} → owner` +
				(fullName ? ` (name set ke "${fullName}")` : ""),
		);
	} else {
		// Auth user ada tapi public.users belum di-create (rare — biasanya auth
		// callback handle ini). Insert sekaligus dengan role owner.
		const { error: insErr } = await sb.from("users").insert({
			id: authUser.id,
			email: authUser.email,
			full_name: fullName ?? authUser.user_metadata?.full_name ?? email,
			role: "owner",
			joined_date: new Date().toISOString().split("T")[0],
			is_active: true,
		});
		if (insErr) throw new Error(`insert fail: ${insErr.message}`);
		console.log(`✓ Created users row + assigned role=owner untuk ${email}`);
	}

	console.log(`\nDone. User bisa refresh app sekarang.`);
}

main().catch((e) => {
	console.error("Error:", e.message);
	process.exit(1);
});
