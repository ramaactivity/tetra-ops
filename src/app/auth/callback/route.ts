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

		await admin.from("users").upsert(
			{
				id: user.id,
				email: user.email,
				full_name: fullName,
				role: "pending_approval",
				joined_date: new Date().toISOString().split("T")[0],
				is_active: true,
			},
			{ onConflict: "id", ignoreDuplicates: true },
		);
	}

	return NextResponse.redirect(`${origin}${next}`);
}
