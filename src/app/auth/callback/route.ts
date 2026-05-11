import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
	const { searchParams, origin } = new URL(request.url);
	const code = searchParams.get("code");

	// When Supabase fails the upstream Google handshake (e.g. provider has
	// stale client_secret, redirect URI mismatch, user denies consent), it
	// redirects here with `error` / `error_description` instead of `code`.
	// Surface the upstream reason so the login screen can show something
	// more useful than a generic "no auth code".
	const upstreamError = searchParams.get("error");
	const upstreamErrorDesc = searchParams.get("error_description");
	if (upstreamError || !code) {
		console.error("[auth/callback] OAuth failed:", {
			upstreamError,
			upstreamErrorDesc,
		});
		const params = new URLSearchParams();
		params.set("error", upstreamError ?? "no_code");
		if (upstreamErrorDesc) params.set("detail", upstreamErrorDesc);
		return NextResponse.redirect(`${origin}/login?${params.toString()}`);
	}

	const supabase = await createClient();
	const { error } = await supabase.auth.exchangeCodeForSession(code);
	if (error) {
		console.error("[auth/callback] exchangeCodeForSession failed:", error);
		const params = new URLSearchParams();
		params.set("error", "auth_failed");
		params.set("detail", error.message);
		return NextResponse.redirect(`${origin}/login?${params.toString()}`);
	}

	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) {
		return NextResponse.redirect(`${origin}/login?error=auth_failed`);
	}

	const admin = createAdminClient();
	const fallbackName =
		(user.user_metadata?.full_name as string | undefined) ??
		(user.user_metadata?.name as string | undefined) ??
		user.email ??
		"Unnamed User";
	const normalizedEmail = (user.email ?? "").toLowerCase();

	// Run invitation lookup + existing-user lookup in parallel — both
	// independent and small (single-row indexed reads).
	const [invitationResult, existingResult] = await Promise.all([
		normalizedEmail
			? admin
					.from("crew_invitations")
					.select(
						"id, full_name, nickname, phone_wa, tier, default_fee_override, notes",
					)
					.eq("email", normalizedEmail)
					.is("accepted_at", null)
					.maybeSingle()
			: Promise.resolve({ data: null }),
		admin
			.from("users")
			.select("id, role, phone_wa")
			.eq("id", user.id)
			.maybeSingle(),
	]);

	const invitation = invitationResult.data;
	const existing = existingResult.data;

	// Determine the row to upsert
	const baseRow = {
		id: user.id,
		email: user.email,
		joined_date: new Date().toISOString().split("T")[0],
		is_active: true,
	};

	let userRow: Record<string, unknown>;
	if (invitation) {
		// Brand new sign-in matched to an invitation → auto-promote to crew
		userRow = {
			...baseRow,
			full_name: invitation.full_name,
			nickname: invitation.nickname,
			phone_wa: invitation.phone_wa,
			role: "crew",
			tier: invitation.tier,
			default_fee_override: invitation.default_fee_override,
			notes: invitation.notes,
		};
	} else if (existing) {
		// Existing user signing in again — DO NOT overwrite their fields.
		// We just need the upsert to pass FK validation; ignoreDuplicates
		// stops Supabase from overwriting role/tier/etc. on every login.
		userRow = baseRow;
	} else {
		// New self-register — pending_approval, no nickname/phone yet
		userRow = {
			...baseRow,
			full_name: fallbackName,
			role: "pending_approval",
		};
	}

	// Run user upsert + invitation accept in parallel when applicable.
	// Wrap supabase builders in Promise.resolve so TypeScript recognizes
	// them as actual promises (they're PromiseLike "thenables").
	const writes: PromiseLike<unknown>[] = [
		admin
			.from("users")
			.upsert(userRow, { onConflict: "id", ignoreDuplicates: !!existing }),
	];
	if (invitation) {
		writes.push(
			admin
				.from("crew_invitations")
				.update({
					accepted_at: new Date().toISOString(),
					accepted_user_id: user.id,
				})
				.eq("id", invitation.id),
		);
	}
	await Promise.all(writes);

	// Compute final destination — skip the /home dispatch hop.
	const role = invitation
		? "crew"
		: existing?.role ?? "pending_approval";
	const phoneCompleted = invitation
		? !!invitation.phone_wa
		: !!existing?.phone_wa;

	let destination: string;
	if (role === "super_admin" || role === "owner") {
		destination = "/dashboard";
	} else if (role === "crew" && !phoneCompleted) {
		// Crew (via invitation w/o phone_wa) still need to complete profile
		destination = "/onboarding";
	} else if (role === "crew") {
		destination = "/crew";
	} else if (role === "pending_approval" && !phoneCompleted) {
		destination = "/onboarding";
	} else {
		destination = "/pending";
	}

	return NextResponse.redirect(`${origin}${destination}`);
}
