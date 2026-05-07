import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
	const { searchParams, origin } = new URL(request.url);
	const code = searchParams.get("code");
	const next = searchParams.get("next") ?? "/";

	if (!code) {
		return NextResponse.redirect(`${origin}/login?error=no_code`);
	}

	const supabase = await createClient();
	const { error } = await supabase.auth.exchangeCodeForSession(code);
	if (error) {
		return NextResponse.redirect(`${origin}/login?error=auth_failed`);
	}

	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (user) {
		const admin = createAdminClient();
		const fullName =
			(user.user_metadata?.full_name as string | undefined) ??
			(user.user_metadata?.name as string | undefined) ??
			user.email ??
			"Unnamed User";

		// Check if this email has a pending crew invitation. If yes, the
		// invitation provides full_name + tier + role=crew so they skip the
		// pending_approval review step entirely.
		const normalizedEmail = (user.email ?? "").toLowerCase();
		const { data: invitation } = normalizedEmail
			? await admin
					.from("crew_invitations")
					.select(
						"id, full_name, nickname, phone_wa, tier, default_fee_override, notes, accepted_at",
					)
					.eq("email", normalizedEmail)
					.is("accepted_at", null)
					.maybeSingle()
			: { data: null };

		const userRow: Record<string, unknown> = invitation
			? {
					id: user.id,
					email: user.email,
					full_name: invitation.full_name,
					nickname: invitation.nickname,
					phone_wa: invitation.phone_wa,
					role: "crew",
					tier: invitation.tier,
					default_fee_override: invitation.default_fee_override,
					notes: invitation.notes,
					joined_date: new Date().toISOString().split("T")[0],
					is_active: true,
				}
			: {
					id: user.id,
					email: user.email,
					full_name: fullName,
					role: "pending_approval",
					joined_date: new Date().toISOString().split("T")[0],
					is_active: true,
				};

		await admin
			.from("users")
			.upsert(userRow, { onConflict: "id", ignoreDuplicates: true });

		// Mark invitation accepted (after user upsert so FK is valid)
		if (invitation) {
			await admin
				.from("crew_invitations")
				.update({
					accepted_at: new Date().toISOString(),
					accepted_user_id: user.id,
				})
				.eq("id", invitation.id);
		}
	}

	return NextResponse.redirect(`${origin}${next}`);
}
